export const PRINTFUL_API_BASE = 'https://api.printful.com';
export const PRINTFUL_ORDERS_ENDPOINT = `${PRINTFUL_API_BASE}/v2/orders`;
export const PRINTFUL_ORDER_ESTIMATION_ENDPOINT = `${PRINTFUL_API_BASE}/v2/order-estimation-tasks`;

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

function coerceTaskCandidate(candidate) {
    if (!candidate) {
        return null;
    }

    if (Array.isArray(candidate)) {
        return candidate.length > 0 ? candidate[0] : null;
    }

    if (typeof candidate === 'object') {
        return candidate;
    }

    return null;
}

export function extractEstimationTask(response) {
    if (!response || typeof response !== 'object') {
        return null;
    }

    const candidates = [
        response.data,
        response.result,
        response.task,
        response.tasks,
        response.data?.task,
        response.data?.tasks,
        response.result?.task,
        response.result?.tasks
    ];

    for (const candidate of candidates) {
        const task = coerceTaskCandidate(candidate);
        if (task && typeof task === 'object') {
            return task;
        }
    }

    return null;
}

export function extractEstimationTaskId(response) {
    const task = extractEstimationTask(response);

    if (!task || typeof task !== 'object') {
        return null;
    }

    if (task.id) {
        return task.id;
    }

    if (task.task_id) {
        return task.task_id;
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

export async function waitForOrderCosts(orderId, apiKey, { storeId, intervalMs = 2000, timeoutMs = 90000 } = {}) {
    if (!orderId) {
        throw new Error('Order ID is required to poll Printful costs');
    }

    const resolvedStoreId = resolveStoreId(storeId);
    const startedAt = Date.now();
    let attempts = 0;

    while (Date.now() - startedAt < timeoutMs) {
        attempts++;
        
        try {
            const orderResponse = await callPrintful(`${PRINTFUL_ORDERS_ENDPOINT}/${encodeURIComponent(orderId)}`, {
                apiKey,
                storeId: resolvedStoreId
            });

            const order = extractOrderData(orderResponse) || {};
            const costStatus = getCalculationStatus(order.costs) || 'unknown';
            const retailStatus = getCalculationStatus(order.retail_costs) || costStatus;

            console.log(`[waitForOrderCosts] Attempt ${attempts}: costStatus=${costStatus}, retailStatus=${retailStatus}`);

            if (costStatus === 'failed' || retailStatus === 'failed') {
                const error = new Error('Printful cost calculation failed');
                error.status = 502;
                error.body = orderResponse;
                throw error;
            }

            if (costStatus === 'calculated' && retailStatus === 'calculated') {
                console.log(`[waitForOrderCosts] Success after ${attempts} attempts, ${Date.now() - startedAt}ms`);
                return { order, raw: orderResponse };
            }

            // If we have costs but not retail_costs, accept it
            if (costStatus === 'calculated' && order.costs) {
                console.log(`[waitForOrderCosts] Accepting order with calculated costs (retail status: ${retailStatus})`);
                return { order, raw: orderResponse };
            }
        } catch (pollError) {
            console.error(`[waitForOrderCosts] Polling error on attempt ${attempts}:`, pollError);
            // If it's a 404, the order might not exist yet, keep trying
            if (pollError.status !== 404) {
                throw pollError;
            }
        }

        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    const timeoutError = new Error(`Timed out waiting for Printful cost calculations after ${attempts} attempts`);
    timeoutError.status = 504;
    throw timeoutError;
}

function getEstimationStatus(task) {
    if (!task || typeof task !== 'object') {
        return null;
    }

    const status = typeof task.status === 'string'
        ? task.status
        : typeof task.state === 'string'
            ? task.state
            : null;

    return status ? status.toLowerCase() : null;
}

export async function waitForOrderEstimation(taskId, apiKey, { storeId, intervalMs = 1500, timeoutMs = 45000 } = {}) {
    if (!taskId) {
        throw new Error('Estimation task ID is required to poll Printful quotes');
    }

    const resolvedStoreId = resolveStoreId(storeId);
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        const queryUrl = new URL(PRINTFUL_ORDER_ESTIMATION_ENDPOINT);
        queryUrl.searchParams.set('id', taskId);

        const response = await callPrintful(queryUrl.toString(), {
            apiKey,
            storeId: resolvedStoreId
        });

        const task = extractEstimationTask(response) || {};
        const status = getEstimationStatus(task) || 'unknown';

        if (status === 'failed') {
            const error = new Error('Printful order estimation failed');
            error.status = 502;
            error.body = response;
            throw error;
        }

        if (status === 'completed') {
            return { task, raw: response };
        }

        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    const timeoutError = new Error('Timed out waiting for Printful order estimation');
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
