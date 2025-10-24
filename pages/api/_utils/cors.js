const DEFAULT_ALLOWED_ORIGINS = [
    'https://motocoach.com.au',
    'https://www.motocoach.com.au',
    'https://sydneymotocoach.com',
    'https://www.sydneymotocoach.com',
    'https://smg-mc.vercel.app'
];

const DEFAULT_ALLOWED_ORIGIN_SET = new Set(DEFAULT_ALLOWED_ORIGINS);

function formatHeaderValue(value) {
    if (Array.isArray(value)) {
        return value
            .map(item => String(item).trim())
            .filter(Boolean)
            .join(', ');
    }

    return typeof value === 'string' ? value : String(value || '');
}

function appendVaryHeader(res, value) {
    const existing = typeof res.getHeader === 'function' ? res.getHeader('Vary') : undefined;
    if (!existing) {
        res.setHeader('Vary', value);
        return;
    }

    const existingValues = Array.isArray(existing)
        ? existing
        : String(existing)
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);

    const varySet = new Set(existingValues);
    for (const part of value.split(',').map(item => item.trim()).filter(Boolean)) {
        varySet.add(part);
    }

    res.setHeader('Vary', Array.from(varySet).join(', '));
}

function isPreviewOrigin(origin) {
    if (!origin) {
        return false;
    }

    try {
        const { hostname } = new URL(origin);
        return /\.vercel\.app$/i.test(hostname);
    } catch (error) {
        return false;
    }
}

function buildAllowedOriginSet(extraOrigins) {
    if (!extraOrigins) {
        return new Set(DEFAULT_ALLOWED_ORIGIN_SET);
    }

    const extras = Array.isArray(extraOrigins) ? extraOrigins : [extraOrigins];
    return new Set([
        ...DEFAULT_ALLOWED_ORIGIN_SET,
        ...extras.map(origin => String(origin).trim()).filter(Boolean)
    ]);
}

function evaluateOrigin(origin, options = {}) {
    const { extraOrigins, allowPreview = true } = options;
    const allowedOrigins = buildAllowedOriginSet(extraOrigins);

    if (!origin) {
        return {
            allowedOrigin: null,
            isAllowedOrigin: false,
            isPreviewOrigin: false
        };
    }

    if (allowedOrigins.has(origin)) {
        return {
            allowedOrigin: origin,
            isAllowedOrigin: true,
            isPreviewOrigin: false
        };
    }

    if (allowPreview && isPreviewOrigin(origin)) {
        return {
            allowedOrigin: origin,
            isAllowedOrigin: true,
            isPreviewOrigin: true
        };
    }

    return {
        allowedOrigin: null,
        isAllowedOrigin: false,
        isPreviewOrigin: false
    };
}

export function applyCors(req, res, options = {}) {
    const {
        methods = ['GET', 'POST', 'OPTIONS'],
        headers = ['Content-Type'],
        exposeHeaders,
        maxAge,
        allowCredentials = false,
        extraOrigins,
        allowPreview = true
    } = options;

    const origin = req.headers?.origin || '';
    const evaluation = evaluateOrigin(origin, { extraOrigins, allowPreview });

    if (evaluation.isAllowedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', evaluation.allowedOrigin);
        appendVaryHeader(res, 'Origin');
        if (allowCredentials) {
            res.setHeader('Access-Control-Allow-Credentials', 'true');
        }
    }

    res.setHeader('Access-Control-Allow-Methods', formatHeaderValue(methods));
    res.setHeader('Access-Control-Allow-Headers', formatHeaderValue(headers));

    if (exposeHeaders && exposeHeaders.length) {
        res.setHeader('Access-Control-Expose-Headers', formatHeaderValue(exposeHeaders));
    }

    if (typeof maxAge !== 'undefined') {
        res.setHeader('Access-Control-Max-Age', String(maxAge));
    }

    if (req.method === 'OPTIONS') {
        res.status(evaluation.isAllowedOrigin || !origin ? 200 : 403).end();
        return {
            handled: true,
            preflight: true,
            ...evaluation
        };
    }

    if (origin && !evaluation.isAllowedOrigin) {
        res.status(403).json({ error: 'Origin not allowed' });
        return {
            handled: true,
            preflight: false,
            ...evaluation
        };
    }

    return {
        handled: false,
        preflight: false,
        ...evaluation
    };
}

export function isOriginAllowed(origin, options = {}) {
    const evaluation = evaluateOrigin(origin, options);
    return evaluation.isAllowedOrigin;
}

export function isPreviewRequestOrigin(origin) {
    return isPreviewOrigin(origin);
}

export const ALLOWED_ORIGINS = [...DEFAULT_ALLOWED_ORIGINS];
