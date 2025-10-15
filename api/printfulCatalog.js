import { applyCors } from './_utils/cors';

const PRINTFUL_API_BASE = 'https://api.printful.com';
const SYNC_PRODUCTS_ENDPOINT = `${PRINTFUL_API_BASE}/sync/products`;
const SYNC_PRODUCT_ENDPOINT = (productId) => `${SYNC_PRODUCTS_ENDPOINT}/${encodeURIComponent(productId)}`;
const CATALOG_PRODUCT_ENDPOINT = (productId) => `${PRINTFUL_API_BASE}/v2/catalog-products/${encodeURIComponent(productId)}`;
const CATALOG_VARIANT_ENDPOINT = (variantId) => `${PRINTFUL_API_BASE}/v2/catalog-variants/${encodeURIComponent(variantId)}`;

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

function normalisePlacementValue(value) {
    if (!value || typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    const lowered = trimmed.toLowerCase().replace(/[\s-]+/g, '_');

    if (lowered === 'front') {
        return 'front_large';
    }

    if (lowered === 'back') {
        return 'back_large';
    }

    return lowered;
}

function deriveTechnique(file) {
    if (!file || typeof file !== 'object') {
        return null;
    }

    if (typeof file.technique === 'string' && file.technique.trim()) {
        return file.technique.trim();
    }

    if (Array.isArray(file.options)) {
        const option = file.options.find(opt => opt?.id === 'technique' && typeof opt?.value === 'string');
        if (option) {
            return option.value.trim();
        }
    }

    return null;
}

function derivePlacementFromFile(file) {
    if (!file || typeof file !== 'object') {
        return null;
    }

    if (typeof file.placement === 'string' && file.placement.trim()) {
        return normalisePlacementValue(file.placement);
    }

    if (Array.isArray(file.options)) {
        const placementOption = file.options.find(opt => opt?.id === 'placement' && typeof opt?.value === 'string');
        if (placementOption) {
            return normalisePlacementValue(placementOption.value);
        }
    }

    if (typeof file.type === 'string' && file.type.trim()) {
        const typeLower = file.type.trim().toLowerCase();
        if (typeLower !== 'preview' && typeLower !== 'default') {
            return normalisePlacementValue(file.type);
        }
    }

    return null;
}

function extractOrderFilePayload(file, placementHint = null) {
    if (!file || typeof file !== 'object') {
        return null;
    }

    const placement = placementHint || derivePlacementFromFile(file);
    let type = placement
        || (typeof file.placement === 'string' ? normalisePlacementValue(file.placement) : null)
        || (typeof file.type === 'string' ? normalisePlacementValue(file.type) : null);

    if (!type && typeof file.type === 'string') {
        const fallbackType = file.type.trim().toLowerCase();
        if (fallbackType && fallbackType !== 'preview') {
            type = fallbackType === 'default' ? null : fallbackType;
        }
    }

    if (!type) {
        type = 'front_large';
    }

    const filePayload = { type };

    if (typeof file.id === 'number' || typeof file.id === 'string') {
        filePayload.file_id = file.id;
    } else if (typeof file.file_id === 'number' || typeof file.file_id === 'string') {
        filePayload.file_id = file.file_id;
    }

    const url = file.url || file.preview_url || file.thumbnail_url;
    if (url) {
        filePayload.url = url;
    }

    if (!filePayload.file_id && !filePayload.url) {
        return null;
    }

    return filePayload;
}

function canonicalPlacement(value) {
    if (!value || typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    return trimmed.toLowerCase().replace(/[\s-]+/g, '_');
}

function normaliseTechniqueValue(value) {
    if (!value || typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    return trimmed.toLowerCase();
}

function collectTechniqueValues(targetSet, source) {
    if (!source) {
        return;
    }

    if (Array.isArray(source)) {
        source.forEach(item => collectTechniqueValues(targetSet, item));
        return;
    }

    const value = normaliseTechniqueValue(source);
    if (value) {
        targetSet.add(value);
    }
}

function normalisePlacementDefinition(entry) {
    if (!entry) {
        return null;
    }

    if (entry.__normalisedPlacement) {
        return entry;
    }

    let placement = null;

    if (typeof entry === 'string') {
        placement = entry.trim();
    } else if (typeof entry === 'object') {
        const candidates = [
            entry.placement,
            entry.id,
            entry.name,
            entry.value,
            entry.type
        ];

        for (const candidate of candidates) {
            if (typeof candidate === 'string' && candidate.trim()) {
                placement = candidate.trim();
                break;
            }
        }
    }

    if (!placement) {
        return null;
    }

    const canonical = canonicalPlacement(placement) || placement.trim().toLowerCase();
    const techniques = new Set();

    if (typeof entry === 'object' && entry) {
        collectTechniqueValues(techniques, entry.technique);
        collectTechniqueValues(techniques, entry.techniques);
        collectTechniqueValues(techniques, entry.supported_techniques);
        collectTechniqueValues(techniques, entry.supportedTechniques);
        collectTechniqueValues(techniques, entry.allowed_techniques);
        collectTechniqueValues(techniques, entry.allowedTechniques);
        collectTechniqueValues(techniques, entry.available_techniques);
        collectTechniqueValues(techniques, entry.availableTechniques);

        if (Array.isArray(entry.layers)) {
            entry.layers.forEach(layer => {
                if (layer && typeof layer === 'object') {
                    collectTechniqueValues(techniques, layer.technique);
                    collectTechniqueValues(techniques, layer.techniques);
                }
            });
        }
    }

    return {
        placement,
        canonical,
        techniques: Array.from(techniques),
        raw: entry,
        __normalisedPlacement: true
    };
}

function ensurePlacementEntry(value) {
    if (!value) {
        return null;
    }

    if (value.__normalisedPlacement) {
        return value;
    }

    return normalisePlacementDefinition(value);
}

function pickTechniqueForEntry(entry, fallback = null) {
    const normalised = ensurePlacementEntry(entry);

    if (!normalised) {
        return fallback;
    }

    const techniques = Array.isArray(normalised.techniques) ? normalised.techniques : [];

    for (const technique of techniques) {
        if (typeof technique === 'string' && technique.trim()) {
            return technique.trim();
        }
    }

    return fallback;
}

function buildAllowedPlacementMap(placements = []) {
    const map = new Map();

    placements.forEach((entry) => {
        const normalised = ensurePlacementEntry(entry);

        if (!normalised || typeof normalised.placement !== 'string') {
            return;
        }

        const canonical = normalised.canonical || canonicalPlacement(normalised.placement);
        if (!canonical) {
            return;
        }

        if (!map.has(canonical)) {
            map.set(canonical, normalised);
        }

        if (canonical.endsWith('_large')) {
            const reduced = canonical.replace(/_large$/, '');
            if (reduced && !map.has(reduced)) {
                map.set(reduced, normalised);
            }
        } else {
            const expanded = `${canonical}_large`;
            if (!map.has(expanded)) {
                map.set(expanded, normalised);
            }
        }
    });

    return map;
}

function pickFirstAllowedPlacement(placements = []) {
    if (!Array.isArray(placements)) {
        return null;
    }

    for (const placement of placements) {
        const normalised = ensurePlacementEntry(placement);
        if (normalised && typeof normalised.placement === 'string' && normalised.placement.trim()) {
            return normalised;
        }
    }

    return null;
}

function alignPlacementToAllowed(placement, allowedMap, fallbackPlacement = null) {
    const fallbackEntry = ensurePlacementEntry(fallbackPlacement);

    if (!allowedMap || !(allowedMap instanceof Map) || allowedMap.size === 0) {
        return ensurePlacementEntry(placement) || fallbackEntry || null;
    }

    if (placement && typeof placement === 'object' && placement.__normalisedPlacement) {
        const canonical = placement.canonical || canonicalPlacement(placement.placement);
        if (canonical && allowedMap.has(canonical)) {
            return allowedMap.get(canonical);
        }
        return placement;
    }

    const canonical = canonicalPlacement(placement);

    if (canonical && allowedMap.has(canonical)) {
        return allowedMap.get(canonical);
    }

    if (canonical && canonical.endsWith('_large')) {
        const reduced = canonical.replace(/_large$/, '');
        if (allowedMap.has(reduced)) {
            return allowedMap.get(reduced);
        }
    }

    if (canonical) {
        const expanded = `${canonical}_large`;
        if (allowedMap.has(expanded)) {
            return allowedMap.get(expanded);
        }
    }

    return fallbackEntry || ensurePlacementEntry(placement) || null;
}

function buildVariantFulfilmentData(variant, allowedPlacements = []) {
    const files = Array.isArray(variant?.files) ? variant.files : [];
    const placementsMap = new Map();
    let filesForOrder = [];
    const allowedEntries = Array.isArray(allowedPlacements)
        ? allowedPlacements.map(entry => ensurePlacementEntry(entry)).filter(Boolean)
        : [];
    const allowedMap = buildAllowedPlacementMap(allowedEntries);
    const firstAllowedPlacement = pickFirstAllowedPlacement(allowedEntries);
    const baseTechnique = pickTechniqueForEntry(firstAllowedPlacement, null);

    files.forEach(file => {
        const derivedPlacement = derivePlacementFromFile(file);
        const placementEntry = alignPlacementToAllowed(
            derivedPlacement,
            allowedMap,
            firstAllowedPlacement
        );
        const placementValue = placementEntry?.placement
            || derivedPlacement
            || firstAllowedPlacement?.placement
            || null;
        const technique = deriveTechnique(file)
            || pickTechniqueForEntry(placementEntry, null)
            || baseTechnique
            || null;
        const orderFile = extractOrderFilePayload(file, placementValue);

        if (orderFile) {
            filesForOrder.push(orderFile);
        }

        if (!placementValue) {
            return;
        }

        const key = placementEntry?.canonical || canonicalPlacement(placementValue) || placementValue;
        if (!placementsMap.has(key)) {
            placementsMap.set(key, {
                placement: placementValue,
                placementEntry,
                technique,
                techniques: Array.isArray(placementEntry?.techniques) ? placementEntry.techniques : [],
                layers: []
            });
        }

        const placementRecord = placementsMap.get(key);

        if (!placementRecord.placement && placementValue) {
            placementRecord.placement = placementValue;
        }
        if (!placementRecord.placementEntry && placementEntry) {
            placementRecord.placementEntry = placementEntry;
        }
        if (!placementRecord.technique && technique) {
            placementRecord.technique = technique;
        }
        if (Array.isArray(placementEntry?.techniques) && placementEntry.techniques.length) {
            placementRecord.techniques = Array.from(new Set([
                ...(placementRecord.techniques || []),
                ...placementEntry.techniques
            ]));
        }

        const layer = { type: 'file' };
        if (typeof file.id === 'number' || typeof file.id === 'string') {
            layer.file_id = file.id;
        } else if (typeof file.file_id === 'number' || typeof file.file_id === 'string') {
            layer.file_id = file.file_id;
        }

        const url = file.url || file.preview_url || file.thumbnail_url;
        if (url) {
            layer.url = url;
        }

        if (!layer.file_id && !layer.url) {
            return;
        }

        placementRecord.layers.push(layer);
    });

    let placements = Array.from(placementsMap.values())
        .map(entry => {
            const resolvedEntry = entry.placementEntry
                || alignPlacementToAllowed(entry.placement, allowedMap, firstAllowedPlacement)
                || firstAllowedPlacement
                || ensurePlacementEntry(entry.placement);

            const placementValue = resolvedEntry?.placement
                || entry.placement
                || firstAllowedPlacement?.placement
                || null;

            const resolvedTechnique = entry.technique
                || pickTechniqueForEntry(entry.placementEntry, null)
                || pickTechniqueForEntry(resolvedEntry, null)
                || baseTechnique
                || null;

            const techniqueOptions = Array.from(new Set([
                ...(entry.techniques || []),
                ...(resolvedEntry?.techniques || []),
                resolvedTechnique
            ].filter(Boolean)));

            return {
                placement: placementValue,
                technique: resolvedTechnique || null,
                techniques: techniqueOptions,
                layers: (entry.layers || []).filter(layer => layer && (layer.file_id || layer.url))
            };
        })
        .filter(entry => entry.placement && entry.layers.length > 0);

    if (placements.length === 0 && filesForOrder.length > 0) {
        const initialFileType = normalisePlacementValue(filesForOrder[0]?.type) || filesForOrder[0]?.type;
        const fallbackEntry = alignPlacementToAllowed(
            initialFileType,
            allowedMap,
            firstAllowedPlacement || initialFileType || 'front_large'
        ) || ensurePlacementEntry(initialFileType) || firstAllowedPlacement || ensurePlacementEntry('front_large');
        const fallbackPlacementValue = fallbackEntry?.placement || firstAllowedPlacement?.placement || 'front_large';
        const fallbackTechnique = pickTechniqueForEntry(fallbackEntry, baseTechnique) || baseTechnique || null;
        const fallbackLayers = filesForOrder
            .map(file => ({
                type: 'file',
                file_id: file.file_id || undefined,
                url: file.url || undefined
            }))
            .filter(layer => layer.file_id || layer.url);

        if (fallbackLayers.length > 0) {
            const fallbackTechniqueOptions = Array.from(new Set([
                ...(fallbackEntry?.techniques || []),
                fallbackTechnique
            ].filter(Boolean)));

            placements = [
                {
                    placement: fallbackPlacementValue,
                    technique: fallbackTechnique || null,
                    techniques: fallbackTechniqueOptions,
                    layers: fallbackLayers
                }
            ];
        }

        filesForOrder = filesForOrder.map(file => {
            const aligned = alignPlacementToAllowed(
                normalisePlacementValue(file.type) || file.type,
                allowedMap,
                fallbackEntry
            );
            const typeValue = aligned?.placement || fallbackPlacementValue;
            return {
                ...file,
                type: typeValue
            };
        });
    }

    const uniqueFiles = [];
    const seenFileKeys = new Set();
    filesForOrder.forEach(file => {
        if (!file) {
            return;
        }

        const alignedEntry = alignPlacementToAllowed(
            file.type,
            allowedMap,
            firstAllowedPlacement || file.type
        );
        const typeValue = alignedEntry?.placement
            || (typeof file.type === 'string' ? file.type : null)
            || firstAllowedPlacement?.placement
            || null;

        if (!typeValue) {
            return;
        }

        const key = `${typeValue}|${file.file_id || file.url || ''}`;
        if (seenFileKeys.has(key)) {
            return;
        }
        seenFileKeys.add(key);

        uniqueFiles.push({
            ...file,
            type: typeValue
        });
    });

    const techniqueSet = new Set();
    placements.forEach(entry => {
        if (entry.technique) {
            techniqueSet.add(entry.technique);
        }
        (entry.techniques || []).forEach(tech => {
            if (typeof tech === 'string' && tech.trim()) {
                techniqueSet.add(tech.trim());
            }
        });
    });

    if (baseTechnique) {
        techniqueSet.add(baseTechnique);
    }

    let defaultTechnique = baseTechnique || placements[0]?.technique || null;

    if (!defaultTechnique && techniqueSet.size > 0) {
        defaultTechnique = Array.from(techniqueSet)[0];
    }

    if (!defaultTechnique) {
        defaultTechnique = 'dtg';
    }

    if (!techniqueSet.has(defaultTechnique)) {
        techniqueSet.add(defaultTechnique);
    }

    const availableTechniques = Array.from(techniqueSet);

    placements = placements.map(entry => ({
        ...entry,
        technique: entry.technique || defaultTechnique,
        techniques: entry.techniques && entry.techniques.length
            ? Array.from(new Set([...entry.techniques, entry.technique || defaultTechnique].filter(Boolean)))
            : [entry.technique || defaultTechnique]
    }));

    return {
        placements,
        files: uniqueFiles,
        defaultTechnique,
        availableTechniques
    };
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

const PRODUCT_PLACEMENT_CACHE = new Map();
const VARIANT_PRODUCT_CACHE = new Map();

async function fetchCatalogPlacementsForProduct(apiKey, storeId, catalogProductId) {
    const idPart = catalogProductId ? String(catalogProductId) : '';
    const cacheKey = storeId ? `${storeId}:${idPart}` : idPart;

    if (!cacheKey) {
        return [];
    }

    if (PRODUCT_PLACEMENT_CACHE.has(cacheKey)) {
        return PRODUCT_PLACEMENT_CACHE.get(cacheKey);
    }

    try {
        const response = await fetchFromPrintful(
            apiKey,
            CATALOG_PRODUCT_ENDPOINT(idPart),
            storeId ? { storeId } : undefined
        );

        const placementsSource = Array.isArray(response?.data?.placements)
            ? response.data.placements
            : Array.isArray(response?.result?.placements)
                ? response.result.placements
                : [];

        const placements = placementsSource
            .map(entry => normalisePlacementDefinition(entry))
            .filter(Boolean);

        PRODUCT_PLACEMENT_CACHE.set(cacheKey, placements);
        return placements;
    } catch (error) {
        console.warn('Printful: failed to fetch catalog product placements', cacheKey, error);
        PRODUCT_PLACEMENT_CACHE.set(cacheKey, []);
        return [];
    }
}

function extractCatalogProductIdFromVariant(variant) {
    if (!variant) {
        return null;
    }

    const candidates = [
        variant.catalog_product_id,
        variant.product?.product_id,
        variant.product?.id,
        variant.product_id,
        variant.catalog_product?.id,
        variant.catalog_product?.product_id
    ];

    for (const value of candidates) {
        if (value == null) {
            continue;
        }
        const str = String(value).trim();
        if (str) {
            return str;
        }
    }

    return null;
}

async function resolveCatalogProductIdForVariant(apiKey, storeId, variant, catalogVariantId) {
    const idPart = catalogVariantId ? String(catalogVariantId) : '';
    const cacheKey = storeId ? `${storeId}:${idPart}` : idPart;

    if (!cacheKey) {
        return null;
    }

    if (VARIANT_PRODUCT_CACHE.has(cacheKey)) {
        return VARIANT_PRODUCT_CACHE.get(cacheKey);
    }

    const directId = extractCatalogProductIdFromVariant(variant);
    if (directId) {
        VARIANT_PRODUCT_CACHE.set(cacheKey, directId);
        return directId;
    }

    try {
        const response = await fetchFromPrintful(
            apiKey,
            CATALOG_VARIANT_ENDPOINT(idPart),
            storeId ? { storeId } : undefined
        );

        let productId = response?.data?.product?.id
            || response?.data?.product_id
            || response?.data?.product_details?.id
            || response?.data?.product_details?.product_id
            || null;

        if (!productId && typeof response?.data?.product_details?.href === 'string') {
            const match = response.data.product_details.href.match(/catalog-products\/(\d+)/);
            if (match && match[1]) {
                productId = match[1];
            }
        }

        if (productId) {
            VARIANT_PRODUCT_CACHE.set(cacheKey, String(productId));
            return String(productId);
        }

        VARIANT_PRODUCT_CACHE.set(cacheKey, null);
        return null;
    } catch (error) {
        console.warn('Printful: failed to resolve catalog product id for variant', cacheKey, error);
        VARIANT_PRODUCT_CACHE.set(cacheKey, null);
        return null;
    }
}

function normaliseVariantPlacementKey(value) {
    if (value == null) {
        return null;
    }

    const str = String(value).trim();
    return str || null;
}

async function resolveVariantPlacements(apiKey, storeId, detail) {
    const result = detail?.result ?? detail ?? {};
    const variants = Array.isArray(result.sync_variants)
        ? result.sync_variants
        : Array.isArray(result.variants)
            ? result.variants
            : Array.isArray(result.product?.variants)
                ? result.product.variants
                : [];

    const placementMap = new Map();

    for (const variant of variants) {
        if (!variant) {
            continue;
        }

        const candidateIds = [
            normaliseVariantPlacementKey(variant.catalog_variant_id),
            normaliseVariantPlacementKey(variant.variant_id),
            normaliseVariantPlacementKey(variant.catalog_variant?.id),
            normaliseVariantPlacementKey(variant.product?.variant_id),
            normaliseVariantPlacementKey(variant.id),
            normaliseVariantPlacementKey(variant.product_variant_id)
        ].filter(Boolean);

        if (candidateIds.length === 0) {
            continue;
        }

        let catalogProductId = extractCatalogProductIdFromVariant(variant);

        if (!catalogProductId) {
            catalogProductId = await resolveCatalogProductIdForVariant(
                apiKey,
                storeId,
                variant,
                candidateIds[0]
            );
        }

        let allowedPlacements = [];

        if (catalogProductId) {
            const productPlacements = await fetchCatalogPlacementsForProduct(apiKey, storeId, catalogProductId);
            if (productPlacements.length > 0) {
                allowedPlacements = [...productPlacements];
                placementMap.set(`product:${catalogProductId}`, productPlacements);
            }
        }

        const placementsFromVariant = Array.isArray(variant.product?.placements)
            ? variant.product.placements
            : Array.isArray(variant.placements)
                ? variant.placements
                : [];

        const normalisedVariantPlacements = placementsFromVariant
            .map(entry => normalisePlacementDefinition(entry))
            .filter(Boolean);

        if (normalisedVariantPlacements.length > 0) {
            if (allowedPlacements.length === 0) {
                allowedPlacements = [...normalisedVariantPlacements];
            } else {
                const existingKeys = new Set(
                    allowedPlacements
                        .map(entry => entry?.canonical || canonicalPlacement(entry?.placement) || entry?.placement)
                        .filter(Boolean)
                );

                normalisedVariantPlacements.forEach(entry => {
                    const key = entry?.canonical || canonicalPlacement(entry?.placement) || entry?.placement;
                    if (key && !existingKeys.has(key)) {
                        allowedPlacements = [...allowedPlacements, entry];
                        existingKeys.add(key);
                    }
                });
            }
        }

        const variantKey = candidateIds.find(id => id != null);

        if (variantKey) {
            placementMap.set(variantKey, allowedPlacements);
        }

        if (catalogProductId && !placementMap.has(`product:${catalogProductId}`)) {
            placementMap.set(`product:${catalogProductId}`, allowedPlacements);
        }
    }

    return placementMap;
}

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

    const listUrl = new URL(SYNC_PRODUCTS_ENDPOINT);
    listUrl.searchParams.set('limit', String(limit));
    listUrl.searchParams.set('offset', '0');

    const listResponse = await fetchFromPrintful(apiKey, listUrl.toString(), {
        storeId: storeContext.id
    });

    const rawItems = Array.isArray(listResponse?.result?.items)
        ? listResponse.result.items
        : Array.isArray(listResponse?.result)
            ? listResponse.result
            : [];

    const summaries = rawItems.map((product) => {
        const productData = product.product || product.sync_product || {};

        return {
            id: product.id ?? product.sync_product_id ?? productData?.id ?? null,
            external_id: product.external_id ?? productData?.external_id ?? null,
            name: product.name || productData?.name || 'Untitled product',
            description: productData?.description || '',
            thumbnail_url: product.thumbnail_url || productData?.thumbnail_url || null,
            tags: Array.isArray(productData?.tags) ? productData.tags : [],
            product: productData?.product || productData || null
        };
    });

    return { summaries };
}

function normaliseVariant(variant, productName, options = {}) {
    if (!variant) {
        return null;
    }

    // printfulVariantId should be the actual Printful product catalog variant ID (e.g., 16709)
    // This is what the shipping rates API expects
    const printfulVariantId = variant.variant_id ?? variant.product_variant_id ?? variant.id ?? null;
    
    // catalogVariantId is the sync product variant ID (e.g., 5008952970)
    // This is used for creating orders via the sync product API
    const catalogVariantId = variant.id
        ?? variant.catalog_variant_id
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
    
    // Create a cleaner option label by removing product name prefix
    // e.g., "Trucker Cap / Brown/ Khaki" -> "Brown/ Khaki"
    let optionLabel = name || `Variant ${catalogVariantId || printfulVariantId || ''}`.trim();
    if (productName && optionLabel.startsWith(productName)) {
        // Remove product name and any following separator (/, -, |, etc.)
        optionLabel = optionLabel.substring(productName.length).replace(/^[\s\-\/\|]+/, '').trim();
    }
    // If we end up with an empty label after removal, use the full name
    if (!optionLabel || optionLabel.length === 0) {
        optionLabel = name || `Variant ${catalogVariantId || printfulVariantId || ''}`.trim();
    }

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

    // CRITICAL: Prefer catalog_variant mockup image (color-specific) over sync product files (shared)
    const catalogVariantImages = [];
    if (variant.catalog_variant) {
        const cv = variant.catalog_variant;
        // Catalog variant has color-specific mockup
        if (cv.mockup_url) {
            catalogVariantImages.push({ preview_url: cv.mockup_url });
        }
        if (cv.image_url) {
            catalogVariantImages.push({ preview_url: cv.image_url });
        }
        if (cv.image) {
            catalogVariantImages.push({ preview_url: cv.image });
        }
    }

    const imageCandidates = [...catalogVariantImages, ...fileCandidates, ...imageArray, ...singleImages];
    
    // DEBUG: Log what we're finding for images
    if (productName && productName.includes('Trucker')) {
        console.log('[DEBUG normalizeVariant] Trucker Cap variant:', {
            name: variant.name,
            catalogVariantId: variant.catalog_variant?.id,
            hasCatalogImages: catalogVariantImages.length,
            hasFiles: fileCandidates.length,
            hasImages: imageArray.length,
            hasSingleImages: singleImages.length,
            firstCatalogImage: catalogVariantImages[0]?.preview_url,
            firstFile: fileCandidates[0]?.preview_url,
            variantKeys: Object.keys(variant).slice(0, 15)
        });
    }
    
    const primaryImage = imageCandidates.find(file => file?.preview_url)
        || imageCandidates.find(file => file?.thumbnail_url)
        || imageCandidates.find(file => file?.url)
        || null;

    const allImageUrls = imageCandidates
        .map(file => file?.preview_url || file?.thumbnail_url || file?.url)
        .filter(url => typeof url === 'string' && url.trim().length > 0);

    const allowedPlacements = options?.placementResolver
        ? options.placementResolver(variant, catalogVariantId, printfulVariantId)
        : [];

    const fulfilmentData = buildVariantFulfilmentData(variant, allowedPlacements);

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
        placements: fulfilmentData.placements,
        orderFiles: fulfilmentData.files,
        defaultTechnique: fulfilmentData.defaultTechnique || null,
        availableTechniques: fulfilmentData.availableTechniques || [],
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

function normaliseProduct(summary, detail, options = {}) {
    const detailResult = detail?.result ?? detail ?? {};
    const product = detailResult.product || detailResult.sync_product || detailResult || summary || {};
    const variantsSource = detailResult.variants
        || detailResult.sync_variants
        || detailResult.product?.variants
        || [];

    const placementMap = options?.variantPlacements instanceof Map
        ? options.variantPlacements
        : new Map(Array.isArray(options?.variantPlacements)
            ? options.variantPlacements
            : []);

    const placementResolver = (variant, catalogVariantId, printfulVariantId) => {
        const candidateIds = [
            catalogVariantId,
            printfulVariantId,
            variant?.catalog_variant?.id,
            variant?.product?.variant_id,
            variant?.id,
            variant?.product_variant_id
        ].map(value => (value == null ? null : String(value).trim())).filter(Boolean);

        const productId = extractCatalogProductIdFromVariant(variant);

        if (productId && placementMap.has(`product:${productId}`)) {
            const placements = placementMap.get(`product:${productId}`);
            if (Array.isArray(placements) && placements.length > 0) {
                return placements;
            }
        }

        for (const id of candidateIds) {
            if (id && placementMap.has(id)) {
                const placements = placementMap.get(id);
                if (Array.isArray(placements) && placements.length > 0) {
                    return placements;
                }
            }
        }

        if (productId && placementMap.has(`product:${productId}`)) {
            return placementMap.get(`product:${productId}`) || [];
        }

        return [];
    };

    const variants = variantsSource
        .map(variant => normaliseVariant(
            variant,
            product.name || summary?.name || 'Product',
            { placementResolver }
        ))
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
                const productId = getSummaryId(summary);

                if (!productId) {
                    throw new Error('Product summary missing identifier');
                }

                const detail = await fetchFromPrintful(
                    apiKey,
                    SYNC_PRODUCT_ENDPOINT(productId),
                    { storeId: storeContext.id }
                );

                const variantPlacements = await resolveVariantPlacements(
                    apiKey,
                    storeContext.id,
                    detail
                );

                return { detail, variantPlacements };
            })
        );

        const products = [];
        const errors = [];

        detailResults.forEach((result, index) => {
            const summary = productSummaries[index];

            if (result.status === 'fulfilled') {
                products.push(normaliseProduct(summary, result.value.detail, {
                    variantPlacements: result.value.variantPlacements
                }));
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
