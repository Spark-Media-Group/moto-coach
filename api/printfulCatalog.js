import { applyCors } from './_utils/cors';

const PRINTFUL_API_BASE = 'https://api.printful.com/v2';
const STORE_LIST_ENDPOINT = `${PRINTFUL_API_BASE}/stores`;
const STORE_PRODUCTS_ENDPOINT = (storeId) => `${STORE_LIST_ENDPOINT}/${encodeURIComponent(storeId)}/products`;

const DEFAULT_STORE_NAME = 'Personal Orders';

function normaliseRegionName(region) {
    if (!region || typeof region !== 'string') {
        return null;
    }

    const trimmed = region.trim();
    if (!trimmed) {
        return null;
    }

    return trimmed.toLowerCase();
}

const DEFAULT_SELLING_REGION_NAME = normaliseRegionName(process.env.PRINTFUL_SELLING_REGION_NAME)
    || normaliseRegionName(process.env.PRINTFUL_SELLING_REGION)
    || 'worldwide';

function parseNumber(value) {
    const numeric = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(numeric) ? numeric : null;
}

async function fetchFromPrintful(apiKey, url, options = {}) {
    const { headers: extraHeaders, storeId, ...fetchOptions } = options;

    const headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...extraHeaders
    };

    if (storeId) {
        headers['X-PF-Store-Id'] = storeId;
    }

    const response = await fetch(url, { ...fetchOptions, headers });
    let data = null;

    try {
        data = await response.json();
    } catch (error) {
        data = null;
    }

    if (!response.ok) {
        const error = new Error(`Printful request failed with status ${response.status}`);
        error.status = response.status;
        error.body = data;
        throw error;
    }

    return data;
}

const STORE_CACHE = {
    resolved: false,
    value: null
};

async function resolveStoreContext(apiKey) {
    const explicitId = process.env.PRINTFUL_STORE_ID?.trim();
    const explicitName = process.env.PRINTFUL_STORE_NAME?.trim();

    if (explicitId) {
        const context = {
            id: explicitId,
            name: explicitName || null,
            source: 'env-id',
            sellingRegion: DEFAULT_SELLING_REGION_NAME
        };

        const cached = STORE_CACHE.value;
        if (!STORE_CACHE.resolved
            || cached?.source !== 'env-id'
            || cached?.id !== context.id
            || cached?.name !== context.name
            || cached?.sellingRegion !== context.sellingRegion) {
            STORE_CACHE.resolved = true;
            STORE_CACHE.value = context;
        }

        return STORE_CACHE.value;
    }

    if (STORE_CACHE.resolved) {
        return STORE_CACHE.value;
    }

    try {
        const storesResponse = await fetchFromPrintful(apiKey, STORE_LIST_ENDPOINT);
        const rawStores = storesResponse?.data
            ?? storesResponse?.result
            ?? storesResponse?.stores
            ?? storesResponse?.result?.items
            ?? null;

        let stores = [];

        if (Array.isArray(rawStores)) {
            stores = rawStores;
        } else if (rawStores && typeof rawStores === 'object') {
            if (Array.isArray(rawStores.items)) {
                stores = rawStores.items;
            } else if (Array.isArray(rawStores.result)) {
                stores = rawStores.result;
            } else if (Array.isArray(rawStores.sync_stores)) {
                stores = rawStores.sync_stores;
            } else {
                stores = [rawStores];
            }
        }

        if (stores.length === 1) {
            const store = stores[0];
            const context = {
                id: store.id || store.store_id || null,
                name: store.name || explicitName || null,
                source: 'api-single',
                sellingRegion: normaliseRegionName(
                    store.selling_region_name
                    || store.default_selling_region
                    || store.selling_region
                ) || DEFAULT_SELLING_REGION_NAME
            };
            STORE_CACHE.resolved = true;
            STORE_CACHE.value = context;
            return context;
        }

        console.warn('Printful: ambiguous or empty store list response', storesResponse);
        const fallbackContext = {
            id: null,
            name: explicitName || DEFAULT_STORE_NAME,
            source: 'fallback',
            sellingRegion: DEFAULT_SELLING_REGION_NAME
        };
        STORE_CACHE.resolved = false;
        STORE_CACHE.value = fallbackContext;
        return fallbackContext;
    } catch (error) {
        console.warn('Printful: failed to resolve store context (api error)', error);
        STORE_CACHE.resolved = false;
        STORE_CACHE.value = {
            id: null,
            name: explicitName || DEFAULT_STORE_NAME,
            source: 'error',
            sellingRegion: DEFAULT_SELLING_REGION_NAME
        };
        return STORE_CACHE.value;
    }
}

function extractProductSummaries(listResponse) {
    if (!listResponse) {
        return [];
    }

    if (Array.isArray(listResponse.result)) {
        return listResponse.result;
    }

    if (Array.isArray(listResponse.result?.sync_products)) {
        return listResponse.result.sync_products;
    }

    if (Array.isArray(listResponse.sync_products)) {
        return listResponse.sync_products;
    }

    if (Array.isArray(listResponse.result?.items)) {
        return listResponse.result.items;
    }

    return [];
}

async function fetchProductList(apiKey, storeContext, limit, sellingRegionName) {
    if (!storeContext?.id) {
        const error = new Error('Printful store context did not resolve an id');
        error.status = 502;
        throw error;
    }

    const listUrl = new URL(STORE_PRODUCTS_ENDPOINT(storeContext.id));
    listUrl.searchParams.set('limit', String(limit));

    if (sellingRegionName) {
        listUrl.searchParams.set('selling_region_name', sellingRegionName);
    }

    const listResponse = await fetchFromPrintful(apiKey, listUrl.toString());
    const summaries = extractProductSummaries(listResponse);
    return { summaries };
}

function normaliseVariant(variant, productName) {
    if (!variant) {
        return null;
    }

    const printfulVariantId = variant.id ?? variant.product_variant_id ?? null;
    const catalogVariantId = variant.catalog_variant_id
        ?? variant.variant_id
        ?? variant.catalog_variant?.id
        ?? variant.product?.variant_id
        ?? null;

    const priceFromPrices = variant.prices?.retail?.amount
        ?? variant.prices?.default?.amount
        ?? variant.prices?.price
        ?? null;

    const retailPrice = parseNumber(
        variant.retail_price
        ?? variant.price
        ?? variant.default_price
        ?? priceFromPrices
    );

    const currency = variant.currency
        || variant.retail_currency
        || variant.prices?.retail?.currency
        || variant.prices?.default?.currency
        || 'AUD';
    const name = variant.name || variant.title || `Variant ${catalogVariantId || printfulVariantId || ''}`.trim();
    const optionLabel = name || `Variant ${catalogVariantId || printfulVariantId || ''}`.trim();

    const fileCandidates = Array.isArray(variant.files) ? variant.files : [];
    const imageArray = Array.isArray(variant.images)
        ? variant.images.map(image => (
            typeof image === 'string'
                ? { preview_url: image }
                : image
        ))
        : [];
    const singleImages = [variant.image, variant.default_image]
        .filter(Boolean)
        .map(url => ({ preview_url: url }));

    const imageCandidates = [...fileCandidates, ...imageArray, ...singleImages];
    const primaryImage = imageCandidates.find(file => file?.preview_url)
        || imageCandidates.find(file => file?.thumbnail_url)
        || imageCandidates.find(file => file?.url)
        || null;

    const allImageUrls = imageCandidates
        .map(file => file?.preview_url || file?.thumbnail_url || file?.url)
        .filter(url => typeof url === 'string' && url.trim().length > 0);

    return {
        id: `printful-variant-${printfulVariantId ?? catalogVariantId ?? name}`,
        printfulVariantId,
        catalogVariantId,
        name,
        optionLabel,
        sku: variant.sku || variant.external_id || null,
        retailPrice,
        currency,
        isEnabled: variant.is_ignored === true ? false : true,
        imageUrl: primaryImage?.preview_url || primaryImage?.thumbnail_url || primaryImage?.url || null,
        imageUrls: Array.from(new Set(allImageUrls)),
        rawName: name,
        attributes: {
            size: variant.size || variant.option_values?.size || null,
            color: variant.color || variant.option_values?.color || null
        },
        productName
    };
}

function computePriceRange(variants) {
    const prices = variants
        .map(variant => parseNumber(variant?.retailPrice))
        .filter(price => price != null);

    if (prices.length === 0) {
        return {
            min: 0,
            max: 0,
            currency: 'AUD',
            hasMultiplePrices: false
        };
    }

    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const currency = variants.find(variant => variant?.currency)?.currency || 'AUD';

    return {
        min,
        max,
        currency,
        hasMultiplePrices: min !== max
    };
}

function collectImages(product, variants) {
    const images = new Map();

    const addImage = (url, altText) => {
        if (!url || typeof url !== 'string') {
            return;
        }
        const trimmed = url.trim();
        if (!trimmed) {
            return;
        }
        if (!images.has(trimmed)) {
            images.set(trimmed, altText || product.name || 'Product image');
        }
    };

    addImage(product.thumbnail_url, product.name);
    addImage(product.preview_image, product.name);

    if (Array.isArray(product.preview_images)) {
        product.preview_images.forEach(image => {
            if (typeof image === 'string') {
                addImage(image, product.name);
            } else if (image) {
                addImage(image.preview_url || image.url, product.name);
            }
        });
    }

    variants.forEach(variant => {
        if (!variant) {
            return;
        }
        addImage(variant.imageUrl, `${product.name || 'Product'} - ${variant.optionLabel || variant.name || ''}`.trim());
        (variant.imageUrls || []).forEach(url => addImage(url, `${product.name || 'Product'} preview`));
    });

    return Array.from(images.entries()).map(([url, altText]) => ({ url, altText }));
}

function deriveCategory(product) {
    if (!product) {
        return null;
    }

    const categoryName = product.product?.main_category?.name
        || product.product?.product_type
        || product.main_category_name
        || product.product_type
        || null;

    if (!categoryName && Array.isArray(product.tags) && product.tags.length > 0) {
        return {
            id: product.tags[0],
            name: product.tags[0]
        };
    }

    if (!categoryName) {
        return null;
    }

    return {
        id: categoryName.toLowerCase().replace(/\s+/g, '-'),
        name: categoryName
    };
}

function getSummaryId(summary) {
    if (!summary) {
        return null;
    }

    return summary.id
        ?? summary.product_id
        ?? summary.sync_product_id
        ?? summary.product?.id
        ?? summary.sync_product?.id
        ?? null;
}

function normaliseProduct(summary, detail) {
    const detailResult = detail?.result ?? detail ?? {};
    const product = detailResult.product || detailResult.sync_product || detailResult || summary || {};
    const variantsSource = detailResult.variants
        || detailResult.sync_variants
        || detailResult.product?.variants
        || [];

    const variants = variantsSource
        .map(variant => normaliseVariant(variant, product.name || summary?.name || 'Product'))
        .filter(Boolean);

    const priceRange = computePriceRange(variants);
    const images = collectImages(product, variants);

    const tags = Array.isArray(product.tags)
        ? product.tags
        : Array.isArray(summary?.tags)
            ? summary.tags
            : [];

    const category = deriveCategory(product) || deriveCategory(summary);

    return {
        id: `printful-product-${product.id ?? getSummaryId(summary) ?? Math.random().toString(36).slice(2)}`,
        printfulId: product.id ?? getSummaryId(summary) ?? null,
        externalId: product.external_id ?? summary?.external_id ?? null,
        name: product.name || summary?.name || 'Untitled product',
        description: product.description || summary?.description || '',
        thumbnailUrl: product.thumbnail_url || summary?.thumbnail_url || images[0]?.url || null,
        tags,
        category,
        categoryName: category?.name || tags[0] || 'General',
        variants,
        priceRange,
        currency: priceRange.currency,
        hasMultiplePrices: priceRange.hasMultiplePrices,
        images,
        defaultVariantId: variants[0]?.id || null
    };
}

function summariseProduct(summary) {
    if (!summary) {
        return null;
    }

    return {
        id: getSummaryId(summary),
        externalId: summary.external_id || null,
        name: summary.name || 'Untitled product',
        thumbnailUrl: summary.thumbnail_url || null,
        variants: summary.variants || summary.variant_count || null,
        synced: summary.synced || null
    };
}

export default async function handler(req, res) {
    const cors = applyCors(req, res, {
        methods: ['GET', 'OPTIONS']
    });

    if (cors.handled) {
        return;
    }

    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET, OPTIONS');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.PRINTFUL_API_KEY;

    if (!apiKey) {
        console.error('PRINTFUL_API_KEY is not configured');
        return res.status(500).json({ error: 'Printful API key is not configured' });
    }

    const includeDetails = req.query.includeDetails !== 'false';
    const limitParam = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 50;

    const queryRegion = normaliseRegionName(
        req.query.sellingRegion
        || req.query.selling_region
        || req.query.selling_region_name
        || req.query.region
    );

    try {
        const storeContext = await resolveStoreContext(apiKey);
        const sellingRegionName = queryRegion
            || storeContext?.sellingRegion
            || DEFAULT_SELLING_REGION_NAME;
        const { summaries: productSummaries } = await fetchProductList(
            apiKey,
            storeContext,
            limit,
            sellingRegionName
        );

        const responseStoreContext = storeContext
            ? { ...storeContext, sellingRegion: sellingRegionName }
            : { id: null, name: DEFAULT_STORE_NAME, source: 'default', sellingRegion: sellingRegionName };

        if (!includeDetails) {
            res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
            return res.status(200).json({
                success: true,
                products: productSummaries.map(summariseProduct).filter(Boolean),
                store: responseStoreContext
            });
        }

        const detailResults = await Promise.allSettled(
            productSummaries.map(summary => {
                const summaryId = getSummaryId(summary);
                if (!summaryId) {
                    return Promise.reject(new Error('Product summary missing identifier'));
                }

                const detailUrl = new URL(`${STORE_PRODUCTS_ENDPOINT(storeContext.id)}/${encodeURIComponent(summaryId)}`);
                if (sellingRegionName) {
                    detailUrl.searchParams.set('selling_region_name', sellingRegionName);
                }

                return fetchFromPrintful(apiKey, detailUrl.toString());
            })
        );

        const products = [];
        const errors = [];

        detailResults.forEach((result, index) => {
            const summary = productSummaries[index];

            if (result.status === 'fulfilled') {
                products.push(normaliseProduct(summary, result.value));
            } else {
                errors.push({
                    productId: getSummaryId(summary),
                    message: result.reason?.message || 'Failed to load product detail'
                });
            }
        });

        res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
        return res.status(errors.length > 0 ? 207 : 200).json({
            success: errors.length === 0,
            products,
            errors: errors.length ? errors : undefined,
            store: responseStoreContext
        });
    } catch (error) {
        console.error('Failed to fetch Printful catalog', error);
        const status = error.status && Number.isInteger(error.status) ? error.status : 502;
        return res.status(status).json({
            error: 'Failed to fetch Printful catalog',
            details: error.body || error.message
        });
    }
}
