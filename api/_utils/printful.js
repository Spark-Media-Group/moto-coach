export const PRINTFUL_API_BASE = 'https://api.printful.com';
export const PRINTFUL_ORDERS_ENDPOINT = `${PRINTFUL_API_BASE}/v2/orders`;

function resolveStoreId(explicit) {
    if (typeof explicit === 'string' && explicit.trim()) {
        return explicit.trim();
    }
    if (typeof process.env.PRINTFUL_STORE_ID === 'string' && process.env.PRINTFUL_STORE_ID.trim()) {
        return process.env.PRINTFUL_STORE_ID.trim();
    }
    return null;
}

export function buildPrintfulHeaders(apiKey, { json = true, storeId } = {}) {
    if (!apiKey) {
        throw new Error('Printful API key is required');
    }

    const headers = {
        'Authorization': `Bearer ${apiKey}`
    };

    if (json) {
        headers['Content-Type'] = 'application/json';
    }

    const resolvedStoreId = resolveStoreId(storeId);
    if (resolvedStoreId) {
        headers['X-PF-Store-Id'] = resolvedStoreId;
    }

    return headers;
}

export function buildPrintfulOptions(method, apiKey, { body, storeId, json = true } = {}) {
    const headers = buildPrintfulHeaders(apiKey, { json, storeId });
    const options = { method, headers };

    if (typeof body !== 'undefined') {
        options.body = json ? JSON.stringify(body) : body;
    }

    return options;
}

export async function callPrintful(endpoint, { method = 'GET', apiKey, body, storeId, json = true } = {}) {
    if (!endpoint) {
        throw new Error('Printful endpoint is required');
    }

    if (!apiKey) {
        throw new Error('Printful API key is required');
    }

    const response = await fetch(endpoint, buildPrintfulOptions(method, apiKey, { body, storeId, json }));

    let data = null;
    try {
        data = await response.json();
    } catch (error) {
        data = null;
    }

    if (!response.ok) {
        const apiError = new Error('Printful API request failed');
        apiError.status = response.status;
        apiError.body = data;
        throw apiError;
    }

    return data;
}

export function extractOrderData(response) {
    if (!response || typeof response !== 'object') {
        return null;
    }

    if (response.result?.order && typeof response.result.order === 'object') {
        return response.result.order;
    }

    if (response.result && typeof response.result === 'object' && !Array.isArray(response.result)) {
        return response.result;
    }

    if (response.data && typeof response.data === 'object') {
        return response.data;
    }

    return response;
}

export function extractOrderId(response) {
    const order = extractOrderData(response);
    if (!order || typeof order !== 'object') {
        return null;
    }

    if (order.id) {
        return order.id;
    }

    if (order.order_id) {
        return order.order_id;
    }

    if (response.result?.order?.id) {
        return response.result.order.id;
    }

    if (response.result?.id) {
        return response.result.id;
    }

    if (response.data?.id) {
        return response.data.id;
    }

    if (response.id) {
        return response.id;
    }

    return null;
}

function getCalculationStatus(costBlock) {
    if (!costBlock || typeof costBlock !== 'object') {
        return null;
    }

    const status = typeof costBlock.calculation_status === 'string'
        ? costBlock.calculation_status
        : typeof costBlock.status === 'string'
            ? costBlock.status
            : null;

    if (!status) {
        return null;
    }

    return status.toLowerCase();
}

export async function waitForOrderCosts(orderId, apiKey, { storeId, intervalMs = 1500, timeoutMs = 45000 } = {}) {
    if (!orderId) {
        throw new Error('Order ID is required to poll Printful costs');
    }

    const resolvedStoreId = resolveStoreId(storeId);
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        const orderResponse = await callPrintful(`${PRINTFUL_ORDERS_ENDPOINT}/${encodeURIComponent(orderId)}`, {
            apiKey,
            storeId: resolvedStoreId
        });

        const order = extractOrderData(orderResponse) || {};
        const costStatus = getCalculationStatus(order.costs) || 'unknown';
        const retailStatus = getCalculationStatus(order.retail_costs) || costStatus;

        if (costStatus === 'failed' || retailStatus === 'failed') {
            const error = new Error('Printful cost calculation failed');
            error.status = 502;
            error.body = orderResponse;
            throw error;
        }

        if (costStatus === 'calculated' && retailStatus === 'calculated') {
            return { order, raw: orderResponse };
        }

        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    const timeoutError = new Error('Timed out waiting for Printful cost calculations');
    timeoutError.status = 504;
    throw timeoutError;
}

export function parseMoney(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'string') {
        const parsed = parseFloat(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}
