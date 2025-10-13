import { applyCors } from './_utils/cors';
import {
    PRINTFUL_ORDER_ESTIMATION_ENDPOINT,
    callPrintful,
    extractEstimationTaskId,
    waitForOrderEstimation
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

        const createResponse = await callPrintful(PRINTFUL_ORDER_ESTIMATION_ENDPOINT, {
            method: 'POST',
            apiKey,
            body: orderPayload,
            storeId
        });

        const taskId = extractEstimationTaskId(createResponse);

        if (!taskId) {
            return res.status(502).json({
                error: 'Unable to determine Printful estimation task ID from response',
                details: createResponse
            });
        }

        let completedTask;

        try {
            const { task } = await waitForOrderEstimation(taskId, apiKey, { storeId });
            completedTask = task;
        } catch (pollError) {
            const status = pollError.status && Number.isInteger(pollError.status) ? pollError.status : 504;
            return res.status(status).json({
                error: status === 504
                    ? 'Printful cost calculation did not complete'
                    : 'Printful cost calculation failed',
                details: pollError.body || pollError.message
            });
        }

        return res.status(200).json({
            success: true,
            costs: completedTask?.costs || null,
            retail_costs: completedTask?.retail_costs || null,
            shipping: completedTask?.shipping || null,
            currency: completedTask?.retail_costs?.currency || completedTask?.costs?.currency || null,
            quote: completedTask
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
