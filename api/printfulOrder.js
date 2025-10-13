import { applyCors } from './_utils/cors';
import {
    PRINTFUL_ORDERS_ENDPOINT,
    buildPrintfulOptions,
    callPrintful,
    extractOrderData,
    extractOrderId,
    waitForOrderCosts
} from './_utils/printful';
import { prepareOrderPayload } from './_utils/printful-order.js';

const PRINTFUL_API_URL = PRINTFUL_ORDERS_ENDPOINT;

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

        console.log(`[printfulOrder] Extracted order ID: ${orderId}, waiting for cost calculation...`);

        let calculatedOrder;
        try {
            const { order } = await waitForOrderCosts(orderId, apiKey, { storeId });
            calculatedOrder = order;
            console.log('[printfulOrder] Cost calculation completed successfully');
        } catch (pollError) {
            console.error('[printfulOrder] Cost calculation error:', pollError);
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

        const confirmEndpoint = createResponse?._links?.order_confirmation?.href
            || createResponse?.data?._links?.order_confirmation?.href
            || calculatedOrder?._links?.order_confirmation?.href
            || `${PRINTFUL_API_URL}/${orderId}/confirm`;

        const confirmResponse = await callPrintful(confirmEndpoint, {
            method: 'POST',
            apiKey,
            storeId
        });

        return res.status(200).json({
            success: true,
            draft: extractOrderData(createResponse) || createResponse,
            order: extractOrderData(confirmResponse) || confirmResponse,
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
