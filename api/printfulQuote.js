import { applyCors } from './_utils/cors';
import {
    PRINTFUL_ORDERS_ENDPOINT,
    buildPrintfulOptions,
    callPrintful,
    extractOrderData,
    extractOrderId,
    waitForOrderCosts
} from './_utils/printful';

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

async function deleteDraftOrder(orderId, apiKey, storeId) {
    try {
        await fetch(`${PRINTFUL_ORDERS_ENDPOINT}/${encodeURIComponent(orderId)}`, buildPrintfulOptions('DELETE', apiKey, { storeId }));
    } catch (error) {
        console.warn('Printful quote: failed to delete draft', orderId, error);
    }
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
        const createUrl = new URL(PRINTFUL_ORDERS_ENDPOINT);
        createUrl.searchParams.set('confirm', 'false');

        if (!orderPayload.items && Array.isArray(orderPayload.order_items)) {
            orderPayload.items = orderPayload.order_items;
        }

        const createResponse = await callPrintful(createUrl.toString(), {
            method: 'POST',
            apiKey,
            body: orderPayload,
            storeId
        });

        const orderId = extractOrderId(createResponse);
        if (!orderId) {
            return res.status(502).json({
                error: 'Unable to determine Printful order ID from response',
                details: createResponse
            });
        }

        let calculatedOrder;
        try {
            const { order } = await waitForOrderCosts(orderId, apiKey, { storeId });
            calculatedOrder = order;
        } catch (pollError) {
            await deleteDraftOrder(orderId, apiKey, storeId);

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

        await deleteDraftOrder(orderId, apiKey, storeId);

        return res.status(200).json({
            success: true,
            costs: calculatedOrder?.costs || null,
            retail_costs: calculatedOrder?.retail_costs || null,
            shipping: calculatedOrder?.shipping || null,
            currency: calculatedOrder?.retail_costs?.currency || calculatedOrder?.costs?.currency || null,
            quote: extractOrderData(calculatedOrder)
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
