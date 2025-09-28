import { applyCors } from './_utils/cors';

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;

function sanitiseCurrencyAmount(amount) {
    const value = typeof amount === 'number' ? amount : parseFloat(amount ?? '0');
    if (!Number.isFinite(value) || value <= 0) {
        return null;
    }
    return Math.round(value * 100) / 100;
}

function extractVariantId(merchandiseId) {
    if (!merchandiseId || typeof merchandiseId !== 'string') {
        return null;
    }
    const parts = merchandiseId.split('/');
    const idPart = parts[parts.length - 1];
    const numericId = Number(idPart);
    return Number.isFinite(numericId) ? numericId : null;
}

function buildOrderPayload(body) {
    const {
        cartId,
        paymentIntentId,
        amount,
        currency = 'AUD',
        customer = {},
        shippingAddress = {},
        lineItems = []
    } = body || {};

    if (!paymentIntentId) {
        return { error: 'Missing paymentIntentId' };
    }

    if (!Array.isArray(lineItems) || lineItems.length === 0) {
        return { error: 'No line items supplied' };
    }

    const orderAmount = sanitiseCurrencyAmount(amount);
    if (!orderAmount) {
        return { error: 'Invalid order amount' };
    }

    const processedLineItems = lineItems.map(item => {
        const quantity = Number(item.quantity) || 0;
        const price = sanitiseCurrencyAmount(item.price);
        const variantId = extractVariantId(item.merchandiseId);

        if (!variantId || quantity <= 0 || !price) {
            return null;
        }

        return {
            variant_id: variantId,
            quantity,
            price: price.toFixed(2),
            title: item.title || undefined,
            properties: item.variantTitle ? [
                { name: 'Variant', value: item.variantTitle }
            ] : undefined
        };
    }).filter(Boolean);

    if (processedLineItems.length === 0) {
        return { error: 'Line items are invalid' };
    }

    const shippingPayload = {
        first_name: shippingAddress.firstName || customer.firstName || '',
        last_name: shippingAddress.lastName || customer.lastName || '',
        address1: shippingAddress.address1 || '',
        address2: shippingAddress.address2 || '',
        city: shippingAddress.city || '',
        province: shippingAddress.state || '',
        zip: shippingAddress.postalCode || '',
        country: shippingAddress.country || 'Australia',
        phone: shippingAddress.phone || customer.phone || undefined
    };

    const billingPayload = {
        first_name: customer.firstName || shippingAddress.firstName || '',
        last_name: customer.lastName || shippingAddress.lastName || '',
        address1: shippingAddress.address1 || '',
        address2: shippingAddress.address2 || '',
        city: shippingAddress.city || '',
        province: shippingAddress.state || '',
        zip: shippingAddress.postalCode || '',
        country: shippingAddress.country || 'Australia',
        phone: customer.phone || shippingAddress.phone || undefined
    };

    return {
        order: {
            email: customer.email,
            phone: customer.phone || undefined,
            send_receipt: false,
            send_fulfillment_receipt: false,
            financial_status: 'paid',
            currency,
            total_price: orderAmount.toFixed(2),
            tags: ['Moto Coach', 'Stripe Payment'],
            source_name: 'moto-coach-stripe',
            note: `Stripe payment ${paymentIntentId}${cartId ? ` · cart ${cartId}` : ''}`,
            shipping_address: shippingPayload,
            billing_address: billingPayload,
            line_items: processedLineItems
        }
    };
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
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!SHOPIFY_STORE_URL || !SHOPIFY_ADMIN_ACCESS_TOKEN) {
        console.error('Checkout: Missing Shopify admin credentials');
        return res.status(500).json({ error: 'Server misconfiguration' });
    }

    try {
        const payload = buildOrderPayload(req.body);
        if (payload.error) {
            return res.status(400).json({ error: payload.error });
        }

        const adminEndpoint = `${SHOPIFY_STORE_URL.replace(/\/$/, '')}/admin/api/2024-10/orders.json`;
        const response = await fetch(adminEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': SHOPIFY_ADMIN_ACCESS_TOKEN
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Checkout: Shopify order creation failed', response.status, errorText);
            return res.status(response.status).json({
                error: 'Failed to create order with Shopify',
                details: errorText
            });
        }

        const data = await response.json();
        const order = data?.order;
        return res.status(200).json({
            success: true,
            orderId: order?.id,
            orderName: order?.name,
            orderNumber: order?.order_number,
            orderStatusUrl: order?.order_status_url
        });
    } catch (error) {
        console.error('Checkout: Unexpected error creating Shopify order', error);
        return res.status(500).json({ error: 'Unexpected server error' });
    }
}
