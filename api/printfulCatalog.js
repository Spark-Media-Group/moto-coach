import { applyCors } from './_utils/cors';

const PRINTFUL_API_BASE = 'https://api.printful.com/v2';
const PRODUCT_LIST_ENDPOINT = `${PRINTFUL_API_BASE}/store/products`;

function parseNumber(value) {
    const numeric = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(numeric) ? numeric : null;
}

async function fetchFromPrintful(apiKey, url, options = {}) {
    const headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
    };

    const response = await fetch(url, { ...options, headers });
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

function normaliseVariant(variant, productName) {
    if (!variant) {
        return null;
    }

    const printfulVariantId = variant.id ?? null;
    const catalogVariantId = variant.catalog_variant_id
        ?? variant.variant_id
        ?? variant.product?.variant_id
        ?? null;

    const retailPrice = parseNumber(variant.retail_price ?? variant.price);
    const currency = variant.currency || variant.retail_currency || 'AUD';
    const name = variant.name || variant.title || `Variant ${catalogVariantId || printfulVariantId || ''}`.trim();
    const optionLabel = name || `Variant ${catalogVariantId || printfulVariantId || ''}`.trim();

    const imageCandidates = Array.isArray(variant.files) ? variant.files : [];
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

function normaliseProduct(summary, detail) {
    const product = detail?.result?.sync_product || detail?.sync_product || summary || {};
    const variantsSource = detail?.result?.sync_variants || detail?.sync_variants || [];

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
        id: `printful-product-${product.id ?? summary?.id ?? Math.random().toString(36).slice(2)}`,
        printfulId: product.id ?? summary?.id ?? null,
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
        id: summary.id,
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

    try {
        const listUrl = new URL(PRODUCT_LIST_ENDPOINT);
        listUrl.searchParams.set('limit', String(limit));

        const listResponse = await fetchFromPrintful(apiKey, listUrl.toString());
        const productSummaries = Array.isArray(listResponse?.result)
            ? listResponse.result
            : Array.isArray(listResponse?.result?.sync_products)
                ? listResponse.result.sync_products
                : [];

        if (!includeDetails) {
            res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
            return res.status(200).json({
                success: true,
                products: productSummaries.map(summariseProduct).filter(Boolean)
            });
        }

        const detailResults = await Promise.allSettled(
            productSummaries.map(summary =>
                fetchFromPrintful(apiKey, `${PRODUCT_LIST_ENDPOINT}/${summary.id}`)
            )
        );

        const products = [];
        const errors = [];

        detailResults.forEach((result, index) => {
            const summary = productSummaries[index];

            if (result.status === 'fulfilled') {
                products.push(normaliseProduct(summary, result.value));
            } else {
                errors.push({
                    productId: summary?.id || null,
                    message: result.reason?.message || 'Failed to load product detail'
                });
            }
        });

        res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
        return res.status(errors.length > 0 ? 207 : 200).json({
            success: errors.length === 0,
            products,
            errors: errors.length ? errors : undefined
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
