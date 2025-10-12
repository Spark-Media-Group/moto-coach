import { applyCors } from './_utils/cors';

const PRINTFUL_API_URL = 'https://api.printful.com/v2/orders';

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

async function callPrintful(endpoint, options = {}) {
    const response = await fetch(endpoint, options);
    let data;

    try {
        data = await response.json();
    } catch (error) {
        data = null;
    }

    if (!response.ok) {
        const error = new Error('Printful API request failed');
        error.status = response.status;
        error.body = data;
        throw error;
    }

    return data;
}

function buildFetchOptions(method, apiKey, body) {
    const headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
    };

    const storeId = process.env.PRINTFUL_STORE_ID?.trim();
    if (storeId) {
        headers['X-PF-Store-Id'] = storeId;
    }

    const options = { method, headers };

    if (typeof body !== 'undefined') {
        options.body = JSON.stringify(body);
    }

    return options;
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
    const validationError = validateOrderPayload(orderPayload);

    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    try {
        const createUrl = new URL(PRINTFUL_API_URL);
        createUrl.searchParams.set('confirm', 'false');

        if (!orderPayload.items && Array.isArray(orderPayload.order_items)) {
            orderPayload.items = orderPayload.order_items;
        }

        const createResponse = await callPrintful(
            createUrl.toString(),
            buildFetchOptions('POST', apiKey, orderPayload)
        );

        const orderId = createResponse?.result?.id || createResponse?.result?.order?.id;

        if (!orderId) {
            return res.status(502).json({
                error: 'Unable to determine Printful order ID from response',
                details: createResponse
            });
        }

        const confirmResponse = await callPrintful(
            `${PRINTFUL_API_URL}/${orderId}/confirm`,
            buildFetchOptions('POST', apiKey)
        );

        return res.status(200).json({
            success: true,
            draft: createResponse?.result || createResponse,
            order: confirmResponse?.result || confirmResponse
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
