import { Resend } from 'resend';
import { applyCors } from './_utils/cors';
import {
    PRINTFUL_ORDERS_ENDPOINT,
    callPrintful,
    extractOrderData,
    extractOrderId,
    waitForOrderCosts
} from './_utils/printful';
import { prepareOrderPayload } from './_utils/printful-order.js';

const PRINTFUL_API_URL = PRINTFUL_ORDERS_ENDPOINT;

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? require('stripe')(stripeSecretKey) : null;

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

const LOGO_URL = 'https://motocoach.com.au/images/tall-logo-black.png';
const SAFE_URL_PROTOCOLS = new Set(['https:', 'data:']);

const HTML_ESCAPE_LOOKUP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
};

function escapeHtml(value) {
    if (value === null || value === undefined) {
        return '';
    }

    return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPE_LOOKUP[char] || char);
}

function toSafeString(value) {
    if (value === null || value === undefined) {
        return '';
    }
    return String(value).trim();
}

function parseCurrencyValue(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }

    const numericValue = Number.parseFloat(String(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(numericValue) ? numericValue : null;
}

function formatCurrency(amount, currency = 'AUD') {
    const numeric = parseCurrencyValue(amount);
    if (numeric === null) {
        return '';
    }

    const currencyCode = typeof currency === 'string' && currency.trim()
        ? currency.trim().toUpperCase()
        : 'AUD';

    return new Intl.NumberFormat('en-AU', {
        style: 'currency',
        currency: currencyCode
    }).format(numeric);
}

function sanitiseEmailImageUrl(url) {
    if (!url) {
        return '';
    }

    const value = String(url).trim();
    if (!value) {
        return '';
    }

    if (value.startsWith('data:image/')) {
        return value;
    }

    try {
        const parsed = new URL(value);
        if (SAFE_URL_PROTOCOLS.has(parsed.protocol) && parsed.hostname) {
            return parsed.href;
        }
    } catch (error) {
        return '';
    }

    return '';
}

function sanitiseEmailLinkUrl(url) {
    if (!url) {
        return '';
    }

    const value = String(url).trim();
    if (!value) {
        return '';
    }

    try {
        const parsed = new URL(value);
        if (parsed.protocol === 'https:' && parsed.hostname) {
            return parsed.href;
        }
    } catch (error) {
        return '';
    }

    return '';
}

function formatAustralianTimestamp(dateInput = new Date()) {
    let date = dateInput;

    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        if (typeof dateInput === 'number') {
            // Printful timestamps are seconds; assume milliseconds if large
            const multiplier = dateInput > 1e12 ? 1 : 1000;
            date = new Date(dateInput * multiplier);
        } else if (typeof dateInput === 'string') {
            const trimmed = dateInput.trim();
            if (/^\d+$/.test(trimmed)) {
                const numeric = Number.parseInt(trimmed, 10);
                const multiplier = trimmed.length > 12 ? 1 : 1000;
                date = new Date(numeric * multiplier);
            } else {
                date = new Date(trimmed);
            }
        }
    }

    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return '';
    }

    const formatter = new Intl.DateTimeFormat('en-AU', {
        timeZone: 'Australia/Sydney',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    return formatter.format(date).replace(', ', ' ');
}

function buildShippingAddressLines(recipient = {}, emailContext = {}) {
    const name = recipient.name
        || `${emailContext?.customer?.firstName || ''} ${emailContext?.customer?.lastName || ''}`.trim();

    const lines = [
        toSafeString(name),
        toSafeString(recipient.address1 || emailContext?.shippingAddress?.address1),
        toSafeString(recipient.address2 || emailContext?.shippingAddress?.address2),
        toSafeString(recipient.city || emailContext?.shippingAddress?.city),
        toSafeString(recipient.state_code || recipient.state_name || emailContext?.shippingAddress?.state),
        toSafeString(recipient.zip || emailContext?.shippingAddress?.postalCode),
        toSafeString(recipient.country_code || emailContext?.shippingAddress?.country)
    ].filter(Boolean);

    return lines;
}

function buildOrderItemsForEmail(orderPayload, emailContext, currency) {
    const items = [];

    const contextItems = Array.isArray(emailContext?.items) ? emailContext.items : [];
    const payloadItems = Array.isArray(orderPayload?.items)
        ? orderPayload.items
        : Array.isArray(orderPayload?.order_items)
            ? orderPayload.order_items
            : [];

    const maxLength = Math.max(contextItems.length, payloadItems.length);

    for (let index = 0; index < maxLength; index += 1) {
        const contextItem = contextItems[index] || {};
        const payloadItem = payloadItems[index] || {};

        const quantity = Number(contextItem.quantity ?? payloadItem.quantity ?? 0) || 0;
        if (quantity <= 0) {
            continue;
        }

        const unitPrice = parseCurrencyValue(contextItem.unitPrice ?? payloadItem.retail_price);
        const itemCurrency = (contextItem.currency
            || payloadItem.retail_currency
            || currency
            || 'AUD').toUpperCase();

        const fallbackTotal = parseCurrencyValue(contextItem.retailPrice);
        const totalPrice = unitPrice != null
            ? unitPrice * quantity
            : fallbackTotal != null
                ? fallbackTotal
                : null;

        items.push({
            name: toSafeString(contextItem.productName || payloadItem.name || 'Item'),
            variant: toSafeString(contextItem.variantName || ''),
            quantity,
            unitPrice,
            totalPrice,
            currency: itemCurrency,
            imageUrl: sanitiseEmailImageUrl(contextItem.imageUrl),
            imageAlt: escapeHtml(contextItem.imageAlt || contextItem.productName || payloadItem.name || 'Product')
        });
    }

    return items;
}

function buildPriceTotals(order, calculatedOrder, orderPayload, emailContext) {
    const totalsSource = order?.retail_costs
        || calculatedOrder?.retail_costs
        || orderPayload?.retail_costs
        || orderPayload?.costs
        || emailContext?.totals
        || {};

    const currency = (totalsSource.currency
        || orderPayload?.retail_costs?.currency
        || emailContext?.currency
        || 'AUD').toUpperCase();

    const subtotal = parseCurrencyValue(totalsSource.subtotal ?? emailContext?.totals?.subtotal);
    const shipping = parseCurrencyValue(totalsSource.shipping ?? emailContext?.totals?.shipping);
    const tax = parseCurrencyValue(totalsSource.tax ?? emailContext?.totals?.tax);
    const total = parseCurrencyValue(totalsSource.total ?? emailContext?.totals?.total);

    return { currency, subtotal, shipping, tax, total };
}

function buildPriceBreakdownHtml(totals) {
    const rows = [];

    if (totals.subtotal != null) {
        rows.push({ label: 'Subtotal', value: formatCurrency(totals.subtotal, totals.currency) });
    }
    if (totals.shipping != null) {
        rows.push({ label: 'Shipping', value: formatCurrency(totals.shipping, totals.currency) });
    }
    if (totals.tax != null) {
        rows.push({ label: 'Tax', value: formatCurrency(totals.tax, totals.currency) });
    }
    if (totals.total != null) {
        rows.push({ label: 'Total Paid', value: formatCurrency(totals.total, totals.currency), emphasized: true });
    }

    return rows.map(row => `
        <tr>
            <td style="padding:8px 0; font-size:14px; color:#374151; ${row.emphasized ? 'font-weight:600;' : ''}">
                ${escapeHtml(row.label)}
            </td>
            <td style="padding:8px 0; font-size:14px; color:#111827; text-align:right; ${row.emphasized ? 'font-weight:700;' : ''}">
                ${escapeHtml(row.value)}
            </td>
        </tr>
    `).join('');
}

function buildPriceBreakdownText(totals) {
    const lines = [];

    if (totals.subtotal != null) {
        lines.push(`Subtotal: ${formatCurrency(totals.subtotal, totals.currency)}`);
    }
    if (totals.shipping != null) {
        lines.push(`Shipping: ${formatCurrency(totals.shipping, totals.currency)}`);
    }
    if (totals.tax != null) {
        lines.push(`Tax: ${formatCurrency(totals.tax, totals.currency)}`);
    }
    if (totals.total != null) {
        lines.push(`Total Paid: ${formatCurrency(totals.total, totals.currency)}`);
    }

    return lines;
}

async function fetchPaymentIntentDetails(paymentIntentId) {
    if (!paymentIntentId || !stripe) {
        return null;
    }

    try {
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
            expand: ['latest_charge']
        });

        const charge = paymentIntent?.latest_charge
            ? paymentIntent.latest_charge
            : paymentIntent?.charges?.data?.[0];

        const cardDetails = charge?.payment_method_details?.card
            || paymentIntent?.payment_method?.card
            || null;

        const brand = cardDetails?.brand ? toSafeString(cardDetails.brand).toUpperCase() : null;
        const last4 = cardDetails?.last4 ? toSafeString(cardDetails.last4) : null;

        const amount = charge?.amount
            ?? paymentIntent?.amount_received
            ?? paymentIntent?.amount;

        const currency = charge?.currency || paymentIntent?.currency || 'aud';

        const receiptUrl = toSafeString(charge?.receipt_url || '');
        const status = toSafeString(paymentIntent?.status || charge?.status || 'succeeded');
        const created = charge?.created
            ? new Date(charge.created * 1000).toISOString()
            : paymentIntent?.created
                ? new Date(paymentIntent.created * 1000).toISOString()
                : null;

        return {
            paymentIntentId,
            brand,
            last4,
            amount: typeof amount === 'number' ? amount / 100 : null,
            currency: currency ? currency.toUpperCase() : 'AUD',
            receiptUrl,
            status,
            createdAt: created
        };
    } catch (error) {
        console.error('Failed to retrieve payment intent for order confirmation email:', paymentIntentId, error);
        return null;
    }
}

function buildPaymentDetailsHtml(paymentDetails, totals) {
    if (!paymentDetails) {
        return '';
    }

    const lines = [];

    if (paymentDetails.brand || paymentDetails.last4) {
        const method = [paymentDetails.brand, paymentDetails.last4 ? `ending in ${paymentDetails.last4}` : null]
            .filter(Boolean)
            .join(' ');
        lines.push(`<li style="margin-bottom:4px;">${escapeHtml(method)}</li>`);
    }

    if (paymentDetails.amount != null) {
        lines.push(`<li style="margin-bottom:4px;">Amount: ${escapeHtml(formatCurrency(paymentDetails.amount, paymentDetails.currency || totals.currency))}</li>`);
    } else if (totals.total != null) {
        lines.push(`<li style="margin-bottom:4px;">Amount: ${escapeHtml(formatCurrency(totals.total, totals.currency))}</li>`);
    }

    if (paymentDetails.status) {
        lines.push(`<li style="margin-bottom:4px;">Status: ${escapeHtml(paymentDetails.status)}</li>`);
    }

    const receiptLink = sanitiseEmailLinkUrl(paymentDetails.receiptUrl);
    if (receiptLink) {
        lines.push(`<li style="margin-bottom:4px;">Receipt: <a href="${receiptLink}" style="color:#2563eb; text-decoration:none;">Download receipt</a></li>`);
    }

    if (!lines.length) {
        return '';
    }

    return `
        <ul style="margin:0; padding-left:18px; color:#374151; font-size:14px;">
            ${lines.join('')}
        </ul>
    `;
}

function buildPaymentDetailsText(paymentDetails, totals) {
    if (!paymentDetails) {
        return [];
    }

    const lines = [];

    if (paymentDetails.brand || paymentDetails.last4) {
        const method = [paymentDetails.brand, paymentDetails.last4 ? `ending in ${paymentDetails.last4}` : null]
            .filter(Boolean)
            .join(' ');
        if (method) {
            lines.push(`Payment Method: ${method}`);
        }
    }

    if (paymentDetails.amount != null) {
        lines.push(`Amount: ${formatCurrency(paymentDetails.amount, paymentDetails.currency || totals.currency)}`);
    } else if (totals.total != null) {
        lines.push(`Amount: ${formatCurrency(totals.total, totals.currency)}`);
    }

    if (paymentDetails.status) {
        lines.push(`Status: ${paymentDetails.status}`);
    }

    const receiptLink = sanitiseEmailLinkUrl(paymentDetails.receiptUrl);
    if (receiptLink) {
        lines.push(`Receipt: ${receiptLink}`);
    }

    return lines;
}

async function sendShopOrderConfirmationEmail({
    order,
    draft,
    calculatedOrder,
    orderPayload,
    emailContext,
    paymentDetails
}) {
    if (!resend) {
        return;
    }

    const recipientEmail = toSafeString(orderPayload?.recipient?.email || emailContext?.customer?.email);
    if (!recipientEmail) {
        console.warn('Skipping order confirmation email - no recipient email available');
        return;
    }

    const recipientName = toSafeString(orderPayload?.recipient?.name
        || `${emailContext?.customer?.firstName || ''} ${emailContext?.customer?.lastName || ''}`.trim());

    const orderIdentifier = toSafeString(order?.id || order?.order_id || draft?.id || draft?.order_id);
    const orderTimestamp = order?.created || draft?.created || emailContext?.generatedAt;
    const orderDateDisplay = formatAustralianTimestamp(orderTimestamp);
    const totals = buildPriceTotals(order, calculatedOrder, orderPayload, emailContext);
    const items = buildOrderItemsForEmail(orderPayload, emailContext, totals.currency);
    const shippingAddressLines = buildShippingAddressLines(orderPayload?.recipient, emailContext);
    const shippingMethod = toSafeString(order?.shipping || orderPayload?.shipping || emailContext?.shippingMethod || 'Standard');

    const paymentHtml = buildPaymentDetailsHtml(paymentDetails, totals);
    const paymentText = buildPaymentDetailsText(paymentDetails, totals);

    const itemsHtml = items.length
        ? items.map(item => `
            <tr>
                <td style="padding:12px 16px; border-bottom:1px solid #e5e7eb; display:flex; align-items:center; gap:12px;">
                    ${item.imageUrl ? `<img src="${item.imageUrl}" alt="${item.imageAlt}" style="width:56px; height:56px; object-fit:cover; border-radius:6px;">` : ''}
                    <div>
                        <div style="font-weight:600; color:#111827; font-size:14px;">${escapeHtml(item.name)}</div>
                        ${item.variant ? `<div style="color:#6b7280; font-size:13px;">${escapeHtml(item.variant)}</div>` : ''}
                    </div>
                </td>
                <td style="padding:12px 16px; border-bottom:1px solid #e5e7eb; color:#374151; font-size:14px; text-align:center;">${item.quantity}</td>
                <td style="padding:12px 16px; border-bottom:1px solid #e5e7eb; color:#111827; font-weight:600; font-size:14px; text-align:right;">
                    ${item.unitPrice != null ? escapeHtml(formatCurrency(item.unitPrice, item.currency)) : ''}
                </td>
                <td style="padding:12px 16px; border-bottom:1px solid #e5e7eb; color:#111827; font-weight:600; font-size:14px; text-align:right;">
                    ${item.totalPrice != null ? escapeHtml(formatCurrency(item.totalPrice, item.currency)) : ''}
                </td>
            </tr>
        `).join('')
        : `
            <tr>
                <td colspan="4" style="padding:16px; text-align:center; color:#6b7280; font-size:14px;">
                    Your order has been received. Item details will be available shortly.
                </td>
            </tr>
        `;

    const totalsHtml = buildPriceBreakdownHtml(totals);
    const totalsText = buildPriceBreakdownText(totals);

    const shippingHtml = shippingAddressLines.length
        ? `<p style="margin:0; color:#374151; font-size:14px;">${shippingAddressLines.map(escapeHtml).join('<br>')}</p>`
        : '<p style="margin:0; color:#374151; font-size:14px;">Shipping details are being finalised.</p>';

    const shippingText = shippingAddressLines.length ? shippingAddressLines : ['Shipping details are being finalised.'];

    const subjectLine = orderIdentifier
        ? `Moto Coach Order #${orderIdentifier} Confirmed`
        : 'Moto Coach Shop Order Confirmed';

    const htmlEmail = `
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f3f4f6; padding:24px 0;">
            <tr>
                <td align="center">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 10px 30px rgba(17,24,39,0.08);">
                        <tr>
                            <td style="padding:32px 32px 24px; text-align:center; background:linear-gradient(135deg, #111827, #1f2937);">
                                <img src="${LOGO_URL}" alt="Moto Coach" width="72" height="72" style="display:block; margin:0 auto 16px;">
                                <h1 style="margin:0; font-size:26px; font-weight:700; color:#000000;">Thank you for your purchase${recipientName ? `, ${escapeHtml(recipientName)}` : ''}!</h1>
                                <p style="margin:12px 0 0; color:#111827; font-size:15px;">
                                    ${orderIdentifier ? `Order #${escapeHtml(orderIdentifier)} confirmed${orderDateDisplay ? ` on ${escapeHtml(orderDateDisplay)}` : ''}.` : 'Your Moto Coach shop order has been confirmed.'}
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:24px 32px;">
                                <h2 style="margin:0 0 16px; font-size:18px; color:#111827;">Order Summary</h2>
                                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e5e7eb; border-radius:8px; overflow:hidden;">
                                    <thead>
                                        <tr style="background-color:#f9fafb;">
                                            <th align="left" style="padding:12px 16px; font-size:13px; color:#6b7280; text-transform:uppercase; letter-spacing:0.05em;">Item</th>
                                            <th align="center" style="padding:12px 16px; font-size:13px; color:#6b7280; text-transform:uppercase; letter-spacing:0.05em;">Qty</th>
                                            <th align="right" style="padding:12px 16px; font-size:13px; color:#6b7280; text-transform:uppercase; letter-spacing:0.05em;">Price</th>
                                            <th align="right" style="padding:12px 16px; font-size:13px; color:#6b7280; text-transform:uppercase; letter-spacing:0.05em;">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${itemsHtml}
                                    </tbody>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:0 32px 24px;">
                                <h2 style="margin:0 0 12px; font-size:18px; color:#111827;">Payment Details</h2>
                                ${paymentHtml || '<p style="margin:0; color:#374151; font-size:14px;">Payment has been received for your order.</p>'}
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:0 32px 24px;">
                                <h2 style="margin:0 0 12px; font-size:18px; color:#111827;">Price Breakdown</h2>
                                <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                                    ${totalsHtml || '<tr><td style="padding:8px 0; font-size:14px; color:#374151;">Pricing details will be shared once available.</td></tr>'}
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:0 32px 24px;">
                                <h2 style="margin:0 0 12px; font-size:18px; color:#111827;">Shipping To</h2>
                                ${shippingHtml}
                                ${shippingMethod ? `<p style="margin:8px 0 0; color:#6b7280; font-size:13px;">Shipping method: ${escapeHtml(shippingMethod)}</p>` : ''}
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:0 32px 32px;">
                                <div style="padding:16px; background-color:#f9fafb; border-radius:8px;">
                                    <p style="margin:0 0 8px; font-size:14px; color:#111827; font-weight:600;">What's next?</p>
                                    <p style="margin:0; font-size:14px; color:#374151;">We'll notify you as soon as your order ships. If you have any questions, reply to this email or contact <a href="mailto:leigh@motocoach.com.au" style="color:#2563eb; text-decoration:none;">leigh@motocoach.com.au</a>.</p>
                                </div>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:20px 24px; text-align:center; background-color:#111827; color:#f9fafb;">
                                <p style="margin:0 0 4px; font-size:12px; letter-spacing:0.08em; text-transform:uppercase;">Moto Coach Shop</p>
                                <p style="margin:0; font-size:12px; color:rgba(249,250,251,0.7);">Thank you for supporting Australian motocross coaching.</p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    `;

    const plainTextLines = [
        'Moto Coach Shop Order Confirmation',
        '',
        recipientName ? `Hi ${recipientName},` : 'Hi there,',
        '',
        orderIdentifier
            ? `Your order #${orderIdentifier} has been confirmed${orderDateDisplay ? ` on ${orderDateDisplay}` : ''}.`
            : 'Thank you for your purchase! Your order has been confirmed.',
        '',
        'Order Summary:',
        ...items.map(item => {
            const parts = [item.name];
            if (item.variant) {
                parts.push(`(${item.variant})`);
            }
            parts.push(`x${item.quantity}`);
            if (item.totalPrice != null) {
                parts.push(`– ${formatCurrency(item.totalPrice, item.currency)}`);
            }
            return `• ${parts.filter(Boolean).join(' ')}`;
        }),
        '',
        'Payment Details:',
        ...(paymentText.length ? paymentText : ['Payment received.']),
        '',
        'Price Breakdown:',
        ...totalsText,
        '',
        'Shipping To:',
        ...shippingText,
        '',
        shippingMethod ? `Shipping method: ${shippingMethod}` : null,
        '',
        'We will email you tracking information as soon as your order ships.',
        'Questions? Email leigh@motocoach.com.au',
        '',
        '---',
        'Moto Coach Shop'
    ].filter(Boolean);

    const plainTextMessage = plainTextLines.join('\n');

    try {
        const { error } = await resend.emails.send({
            from: 'Moto Coach <noreply@motocoach.com.au>',
            to: [recipientEmail],
            subject: subjectLine,
            html: htmlEmail,
            text: plainTextMessage
        });

        if (error) {
            console.error('Failed to send shop order confirmation email:', error);
        } else {
            console.log('Shop order confirmation email sent successfully (recipient redacted)');
        }
    } catch (error) {
        console.error('Unexpected error sending shop order confirmation email:', error);
    }
}

function parseRequestBody(req) {
    if (!req) {
        return null;
    }

    if (req.body && typeof req.body === 'object') {
        return req.body;
    }

    if (typeof req.body === 'string' && req.body.trim().length > 0) {
        try {
            return JSON.parse(req.body);
        } catch (error) {
            return null;
        }
    }

    return null;
}

function validateOrderPayload(payload) {
    if (!payload || typeof payload !== 'object') {
        return 'Missing order payload';
    }

    if (!payload.recipient || typeof payload.recipient !== 'object') {
        return 'Missing recipient information';
    }

    const hasItems = Array.isArray(payload.items)
        ? payload.items.length > 0
        : Array.isArray(payload.order_items) && payload.order_items.length > 0;

    if (!hasItems) {
        return 'Order must include at least one item';
    }

    return null;
}

export default async function handler(req, res) {
    const cors = applyCors(req, res, {
        methods: ['POST', 'OPTIONS'],
        headers: ['Content-Type']
    });

    if (cors.handled) {
        return;
    }

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.PRINTFUL_API_KEY;

    if (!apiKey) {
        console.error('Printful API key is not configured');
        return res.status(500).json({ error: 'Printful API key is not configured' });
    }

    const orderPayload = parseRequestBody(req);
    const emailContext = orderPayload?.emailContext ? { ...orderPayload.emailContext } : null;
    if (orderPayload && 'emailContext' in orderPayload) {
        delete orderPayload.emailContext;
    }

    const validationError = validateOrderPayload(orderPayload);

    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    try {
        const storeId = process.env.PRINTFUL_STORE_ID?.trim() || undefined;
        const createUrl = new URL(PRINTFUL_API_URL);
        createUrl.searchParams.set('confirm', 'false');

        await prepareOrderPayload(orderPayload, { apiKey, storeId });

        if (!orderPayload.items && Array.isArray(orderPayload.order_items)) {
            orderPayload.items = orderPayload.order_items;
        }

        if (!orderPayload.source) {
            orderPayload.source = 'catalog';
        }

        // Debug log the prepared order items
        console.log('[printfulOrder] Prepared order items:', JSON.stringify(orderPayload.items?.map(item => ({
            sync_variant_id: item.sync_variant_id,
            quantity: item.quantity,
            hasFiles: !!item.files,
            fileCount: item.files?.length || 0,
            hasPlacements: !!item.placements,
            placementCount: item.placements?.length || 0,
            placements: item.placements?.map(p => ({
                placement: p.placement,
                technique: p.technique,
                layerCount: p.layers?.length || 0
            }))
        })), null, 2));

        const createResponse = await callPrintful(createUrl.toString(), {
            method: 'POST',
            apiKey,
            body: orderPayload,
            storeId
        });

        console.log('[printfulOrder] Draft order created successfully');

        const orderId = extractOrderId(createResponse);

        if (!orderId) {
            console.error('[printfulOrder] Could not extract order ID from response:', createResponse);
            return res.status(502).json({
                error: 'Unable to determine Printful order ID from response',
                details: createResponse
            });
        }

        // Check if the creation response already has costs calculated
        const createdOrder = extractOrderData(createResponse) || {};
        const hasCosts = createdOrder.costs && 
                        (createdOrder.costs.total != null || createdOrder.costs.subtotal != null);
        const hasRetailCosts = createdOrder.retail_costs && 
                              (createdOrder.retail_costs.total != null || createdOrder.retail_costs.subtotal != null);

        let calculatedOrder = createdOrder;

        // Only poll for costs if they weren't included in the creation response
        if (!hasCosts || !hasRetailCosts) {
            console.log(`[printfulOrder] Order ID: ${orderId}, waiting for cost calculation... (hasCosts: ${hasCosts}, hasRetailCosts: ${hasRetailCosts})`);
            
            try {
                const { order } = await waitForOrderCosts(orderId, apiKey, { storeId });
                calculatedOrder = order;
                console.log('[printfulOrder] Cost calculation completed successfully');
            } catch (pollError) {
                console.error('[printfulOrder] Cost calculation error:', pollError);
                
                // If we have costs from creation, use them even if polling failed
                if (hasCosts) {
                    console.log('[printfulOrder] Using costs from creation response despite polling error');
                    calculatedOrder = createdOrder;
                } else {
                    if (pollError.status) {
                        return res.status(pollError.status).json({
                            error: 'Printful cost calculation did not complete',
                            details: pollError.body || pollError.message
                        });
                    }

                    return res.status(504).json({
                        error: 'Printful cost calculation did not complete',
                        details: pollError.message
                    });
                }
            }
        } else {
            console.log('[printfulOrder] Costs already included in creation response, skipping polling');
            console.log('[printfulOrder] Costs:', JSON.stringify(createdOrder.costs));
            console.log('[printfulOrder] Retail costs:', JSON.stringify(createdOrder.retail_costs));
        }

        const confirmEndpoint = createResponse?._links?.order_confirmation?.href
            || createResponse?.data?._links?.order_confirmation?.href
            || calculatedOrder?._links?.order_confirmation?.href
            || `${PRINTFUL_API_URL}/${orderId}/confirm`;

        const confirmResponse = await callPrintful(confirmEndpoint, {
            method: 'POST',
            apiKey,
            storeId
        });

        const confirmedOrderData = extractOrderData(confirmResponse);
        const draftOrderData = extractOrderData(createResponse);
        const confirmedOrder = confirmedOrderData || {};
        const draftOrder = draftOrderData || {};
        const paymentIntentId = orderPayload?.metadata?.payment_intent_id
            || emailContext?.paymentIntentId
            || null;

        let paymentDetails = null;
        if (paymentIntentId) {
            paymentDetails = await fetchPaymentIntentDetails(paymentIntentId);
        }

        try {
            await sendShopOrderConfirmationEmail({
                order: confirmedOrder,
                draft: draftOrder,
                calculatedOrder,
                orderPayload,
                emailContext,
                paymentDetails
            });
        } catch (emailError) {
            console.error('Failed to queue shop order confirmation email:', emailError);
        }

        return res.status(200).json({
            success: true,
            draft: draftOrderData ?? createResponse,
            order: confirmedOrderData ?? confirmResponse,
            costs: calculatedOrder?.costs || null,
            retail_costs: calculatedOrder?.retail_costs || null
        });
    } catch (error) {
        console.error('Error processing Printful order:', error);

        const status = error.status && Number.isInteger(error.status) ? error.status : 500;
        return res.status(status).json({
            error: 'Failed to process Printful order',
            details: error.body || error.message
        });
    }
}
