import { applyCors } from './_utils/cors';

const PRINTFUL_API_BASE = 'https://api.printful.com/v2';
const CATALOG_PRODUCTS_ENDPOINT = `${PRINTFUL_API_BASE}/catalog-products`;
const CATALOG_PRODUCT_VARIANTS_ENDPOINT = (catalogProductId) => `${PRINTFUL_API_BASE}/catalog-products/${encodeURIComponent(catalogProductId)}/catalog-variants`;
const CATALOG_AVAILABILITY_ENDPOINT = (catalogProductId) => `${PRINTFUL_API_BASE}/catalog-products/${encodeURIComponent(catalogProductId)}/availability`;

const DEFAULT_STORE_NAME = 'Personal orders';

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

let STORE_CONTEXT_CACHE = null;

async function resolveStoreContext() {
    const storeId = process.env.PRINTFUL_STORE_ID?.trim();

    if (!storeId) {
        const error = new Error('Printful store ID is not defined in env');
        error.status = 500;
        throw error;
    }

    const storeName = process.env.PRINTFUL_STORE_NAME?.trim() || DEFAULT_STORE_NAME;

    if (STORE_CONTEXT_CACHE
        && STORE_CONTEXT_CACHE.id === storeId
        && STORE_CONTEXT_CACHE.name === storeName
        && STORE_CONTEXT_CACHE.sellingRegion === DEFAULT_SELLING_REGION_NAME) {
        return STORE_CONTEXT_CACHE;
    }

    STORE_CONTEXT_CACHE = {
        id: storeId,
        name: storeName,
        source: 'env',
        sellingRegion: DEFAULT_SELLING_REGION_NAME
    };

    return STORE_CONTEXT_CACHE;
}

async function fetchProductList(apiKey, storeContext, limit, sellingRegionName) {
    if (!storeContext?.id) {
        const error = new Error('Printful store context did not resolve an id');
        error.status = 502;
        throw error;
    }

    const listUrl = new URL(CATALOG_PRODUCTS_ENDPOINT);
    listUrl.searchParams.set('limit', String(limit));
    listUrl.searchParams.set('offset', '0');

    if (sellingRegionName) {
        listUrl.searchParams.set('selling_region_name', sellingRegionName);
    }

    const listResponse = await fetchFromPrintful(apiKey, listUrl.toString(), {
        storeId: storeContext.id
    });

    const rawData = listResponse?.data;
    const dataItems = Array.isArray(rawData?.items)
        ? rawData.items
        : Array.isArray(rawData)
            ? rawData
            : [];

    const summaries = dataItems.map((product) => ({
        id: product.id,
        name: product.name,
        description: product.description || '',
        thumbnail_url: product.image || product.thumbnail_url || null,
        tags: Array.isArray(product.tags) ? product.tags : [],
        product: {
            main_category: {
                name: product.main_category_name || product.type || null
            }
        }
    }));

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
        const storeContext = await resolveStoreContext();
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

        if (productSummaries.length === 0) {
            res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
            return res.status(200).json({
                success: true,
                products: [],
                store: responseStoreContext,
                debug: {
                    reason: 'PRINTFUL_NO_PRODUCTS',
                    message: 'Printful returned zero catalog products for the current store and selling region.',
                    sellingRegion: sellingRegionName,
                    storeId: storeContext.id
                }
            });
        }

        if (!includeDetails) {
            res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
            return res.status(200).json({
                success: true,
                products: productSummaries.map(summariseProduct).filter(Boolean),
                store: responseStoreContext
            });
        }

        const detailResults = await Promise.allSettled(
            productSummaries.map(async (summary) => {
                const catalogProductId = getSummaryId(summary);
                if (!catalogProductId) {
                    throw new Error('Product summary missing identifier');
                }

                const variantsUrl = new URL(CATALOG_PRODUCT_VARIANTS_ENDPOINT(catalogProductId));
                variantsUrl.searchParams.set('limit', '100');
                variantsUrl.searchParams.set('offset', '0');

                const availabilityUrl = new URL(CATALOG_AVAILABILITY_ENDPOINT(catalogProductId));
                if (sellingRegionName) {
                    availabilityUrl.searchParams.set('selling_region_name', sellingRegionName);
                }

                const [variantsRes, availabilityRes] = await Promise.all([
                    fetchFromPrintful(apiKey, variantsUrl.toString(), { storeId: storeContext.id }),
                    fetchFromPrintful(apiKey, availabilityUrl.toString(), { storeId: storeContext.id })
                ]);

                const variantsRaw = variantsRes?.data;
                const variants = Array.isArray(variantsRaw?.items)
                    ? variantsRaw.items
                    : Array.isArray(variantsRaw)
                        ? variantsRaw
                        : [];

                const availabilityRaw = availabilityRes?.data;
                const availability = Array.isArray(availabilityRaw?.items)
                    ? availabilityRaw.items
                    : Array.isArray(availabilityRaw)
                        ? availabilityRaw
                        : [];

                const fauxDetail = {
                    result: {
                        product: {
                            id: catalogProductId,
                            name: summary.name,
                            description: summary.description || '',
                            thumbnail_url: summary.thumbnail_url || null,
                            tags: summary.tags || [],
                            product: summary.product || null,
                            main_category_name: summary.product?.main_category?.name || null
                        },
                        variants: variants.map((variant) => {
                            const variantAvailability = availability.find((entry) => entry.catalog_variant_id === variant.id);
                            const availabilityEntries = Array.isArray(variantAvailability?.availability)
                                ? variantAvailability.availability
                                : [];
                            const isAvailable = availabilityEntries.length === 0
                                ? variantAvailability != null
                                : availabilityEntries.some((entry) => entry.status !== 'not_available');

                            const variantImages = [];
                            if (Array.isArray(variant.images)) {
                                variantImages.push(
                                    ...variant.images.map((image) => (typeof image === 'string' ? { preview_url: image } : image))
                                );
                            }
                            if (Array.isArray(variant.preview_images)) {
                                variantImages.push(
                                    ...variant.preview_images.map((image) => (typeof image === 'string' ? { preview_url: image } : image))
                                );
                            }

                            const singleImages = [variant.image, variant.default_image, variant.preview_image]
                                .filter(Boolean)
                                .map((image) => (typeof image === 'string' ? { preview_url: image } : image));

                            const defaultPrice = variant.default_price || variant.price || null;
                            const retailPrice = typeof defaultPrice === 'object' ? defaultPrice.amount : defaultPrice;

                            return {
                                id: variant.id,
                                catalog_variant_id: variant.id,
                                name: variant.name,
                                retail_price: retailPrice ?? variant.retail_price ?? null,
                                currency: (typeof defaultPrice === 'object' && defaultPrice.currency) || variant.currency || 'AUD',
                                images: [...variantImages, ...singleImages],
                                is_ignored: isAvailable ? false : true,
                                sku: variant.sku || null
                            };
                        })
                    }
                };

                return fauxDetail;
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
