import { applyCors } from './_utils/cors';

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
const SHOPIFY_ADMIN_API_VERSION = '2025-07';

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

function safeJsonParse(text) {
    if (!text) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch (error) {
        return text;
    }
}

function buildShopifyPayload(body) {
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
        first_name: shippingAddress.firstName || customer.firstName || undefined,
        last_name: shippingAddress.lastName || customer.lastName || undefined,
        address1: shippingAddress.address1 || undefined,
        address2: shippingAddress.address2 || undefined,
        city: shippingAddress.city || undefined,
        province: shippingAddress.state || undefined,
        zip: shippingAddress.postalCode || undefined,
        country: shippingAddress.country || 'Australia',
        country_code: shippingAddress.countryCode || undefined,
        phone: shippingAddress.phone || customer.phone || undefined
    };

    const billingPayload = {
        first_name: customer.firstName || shippingAddress.firstName || undefined,
        last_name: customer.lastName || shippingAddress.lastName || undefined,
        address1: shippingAddress.address1 || undefined,
        address2: shippingAddress.address2 || undefined,
        city: shippingAddress.city || undefined,
        province: shippingAddress.state || undefined,
        zip: shippingAddress.postalCode || undefined,
        country: shippingAddress.country || 'Australia',
        country_code: shippingAddress.countryCode || undefined,
        phone: customer.phone || shippingAddress.phone || undefined
    };

    const orderNote = `Stripe ${paymentIntentId}${cartId ? ` · cart ${cartId}` : ''}`;

    return {
        orderPayload: {
            order: {
                email: customer.email,
                phone: customer.phone || undefined,
                send_receipt: false,
                send_fulfillment_receipt: false,
                financial_status: 'paid',
                currency,
                tags: ['Moto Coach', 'Stripe Payment'],
                source_name: 'moto-coach-stripe',
                note: orderNote,
                shipping_address: shippingPayload,
                billing_address: billingPayload,
                line_items: processedLineItems
            }
        },
        transactionPayload: {
            transaction: {
                kind: 'sale',
                status: 'success',
                gateway: 'external',
                amount: orderAmount.toFixed(2),
                currency,
                authorization: paymentIntentId
            }
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
        console.warn('Checkout: Missing Shopify admin credentials – returning manual fulfilment fallback');
        return res.status(200).json({
            success: false,
            message: 'Payment received! Our team will finalise your order in Shopify as soon as admin access is configured.'
        });
    }

    let shopHost;
    try {
        const urlString = SHOPIFY_STORE_URL.startsWith('http') ? SHOPIFY_STORE_URL : `https://${SHOPIFY_STORE_URL}`;
        shopHost = new URL(urlString).host;
    } catch (error) {
        console.error('Checkout: Invalid SHOPIFY_STORE_URL configured', error);
        return res.status(500).json({ error: 'Shopify store URL misconfiguration. Use your myshopify.com domain.' });
    }

    if (!shopHost.endsWith('.myshopify.com')) {
        console.error('Checkout: Admin API must use {shop}.myshopify.com, got:', shopHost);
        return res.status(500).json({ error: 'Shopify store URL misconfiguration. Use your myshopify.com domain.' });
    }

    const adminBase = `https://${shopHost}`;

    try {

        const payload = buildShopifyPayload(req.body);
        if (payload.error) {
            return res.status(400).json({ error: payload.error });
        }

        const ordersEndpoint = `${adminBase}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/orders.json`;
        const createResponse = await fetch(ordersEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': SHOPIFY_ADMIN_ACCESS_TOKEN
            },
            body: JSON.stringify(payload.orderPayload)
        });

        const createBodyText = await createResponse.text();
        const orderData = safeJsonParse(createBodyText);
        const order = orderData && typeof orderData === 'object' ? orderData.order : undefined;

        if (!createResponse.ok) {
            console.error('Checkout: Shopify order creation failed', createResponse.status, orderData);
            return res.status(createResponse.status).json({
                error: 'Failed to create Shopify order',
                details: orderData
            });
        }

        console.info('Checkout: Shopify order created', {
            host: shopHost,
            status: createResponse.status,
            id: order?.id,
            name: order?.name,
            gid: order?.admin_graphql_api_id,
            adminUrl: order?.id ? `${adminBase}/admin/orders/${order.id}` : undefined
        });

        if (!order?.id) {
            console.error('Checkout: Shopify order response missing id', orderData);
            return res.status(502).json({ error: 'Shopify order response was incomplete', details: orderData });
        }

        const transactionsEndpoint = `${adminBase}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/orders/${order.id}/transactions.json`;
        const transactionResponse = await fetch(transactionsEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': SHOPIFY_ADMIN_ACCESS_TOKEN
            },
            body: JSON.stringify(payload.transactionPayload)
        });

        const transactionBodyText = await transactionResponse.text();
        const transactionData = safeJsonParse(transactionBodyText);

        if (!transactionResponse.ok) {
            console.error('Checkout: Shopify transaction recording failed', transactionResponse.status, {
                host: shopHost,
                orderId: order.id,
                details: transactionData
            });
        } else {
            console.info('Checkout: Shopify transaction recorded', {
                host: shopHost,
                status: transactionResponse.status,
                orderId: order.id,
                transactionId: transactionData && typeof transactionData === 'object' ? transactionData?.transaction?.id : undefined
            });
        }

        return res.status(200).json({
            success: true,
            orderId: order?.id,
            orderName: order?.name,
            orderNumber: order?.order_number,
            orderStatusUrl: order?.order_status_url,
            adminUrl: order?.id ? `${adminBase}/admin/orders/${order.id}` : undefined,
            transactionRecorded: transactionResponse.ok,
            transactionStatus: transactionResponse.status,
            transactionDetails: transactionResponse.ok ? undefined : transactionData
        });
    } catch (error) {
        console.error('Checkout: Unexpected error creating Shopify order', error);
        return res.status(500).json({ error: 'Unexpected server error' });
    }
}
