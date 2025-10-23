import { applyCors } from './_utils/cors';
import {
    PRINTFUL_ORDER_ESTIMATE_COSTS_ENDPOINT,
    callPrintful
} from './_utils/printful';
import { prepareOrderPayload } from './_utils/printful-order.js';

function parseRequestBody(req) {
    if (!req) {
        return null;
    }

    if (req.body && typeof req.body === 'object') {
        return req.body;
    }

    if (typeof req.body === 'string' && req.body.trim()) {
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

    const items = Array.isArray(payload.items) ? payload.items : payload.order_items;
    if (!Array.isArray(items) || items.length === 0) {
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
    const validationError = validateOrderPayload(orderPayload);

    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    const storeId = process.env.PRINTFUL_STORE_ID?.trim() || undefined;

    try {
        await prepareOrderPayload(orderPayload, { apiKey, storeId });

        if (!orderPayload.items && Array.isArray(orderPayload.order_items)) {
            orderPayload.items = orderPayload.order_items;
        }

        if (!orderPayload.source) {
            orderPayload.source = 'catalog';
        }

        const estimateResponse = await callPrintful(PRINTFUL_ORDER_ESTIMATE_COSTS_ENDPOINT, {
            method: 'POST',
            apiKey,
            body: orderPayload,
            storeId
        });

        const result = estimateResponse?.result && typeof estimateResponse.result === 'object'
            ? estimateResponse.result
            : estimateResponse;
        return res.status(200).json({
            success: true,
            costs: result?.costs || null,
            retail_costs: result?.retail_costs || null,
            shipping: result?.shipping || null,
            currency: result?.retail_costs?.currency
                || result?.costs?.currency
                || orderPayload?.retail_costs?.currency
                || orderPayload?.currency
                || null,
            quote: result
        });
    } catch (error) {
        console.error('Error generating Printful quote:', error);

        const status = error.status && Number.isInteger(error.status) ? error.status : 500;
        return res.status(status).json({
            error: 'Failed to generate Printful quote',
            details: error.body || error.message
        });
    }
}
