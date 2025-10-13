import { callPrintful } from './printful.js';

const PRINTFUL_API_BASE = 'https://api.printful.com';
const CATALOG_PRODUCT_ENDPOINT = (productId) => `${PRINTFUL_API_BASE}/v2/catalog-products/${encodeURIComponent(productId)}`;
const CATALOG_VARIANT_ENDPOINT = (variantId) => `${PRINTFUL_API_BASE}/v2/catalog-variants/${encodeURIComponent(variantId)}`;

const variantConfigCache = new Map();

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

function sanitiseOrderLayers(layers) {
    if (!Array.isArray(layers)) {
        return [];
    }

    return layers
        .map(layer => {
            if (!layer || typeof layer !== 'object') {
                return null;
            }

            const payload = {
                type: typeof layer.type === 'string' && layer.type.trim() ? layer.type.trim() : 'file'
            };

            if (layer.file_id || layer.fileId) {
                payload.file_id = layer.file_id || layer.fileId;
            }

            const url = layer.url || layer.preview_url || layer.thumbnail_url;
            if (url) {
                payload.url = url;
            }

            if (!payload.file_id && !payload.url) {
                return null;
            }

            return payload;
        })
        .filter(Boolean);
}

function sanitiseOrderFiles(files) {
    if (!Array.isArray(files)) {
        return [];
    }

    return files
        .map(file => {
            if (!file || typeof file !== 'object') {
                return null;
            }

            const type = typeof file.type === 'string' && file.type.trim()
                ? file.type.trim()
                : typeof file.placement === 'string' && file.placement.trim()
                    ? file.placement.trim()
                    : null;

            const payload = {
                type,
                placement: typeof file.placement === 'string' && file.placement.trim() ? file.placement.trim() : null,
                technique: normaliseTechniqueValue(file.technique)
            };

            if (Array.isArray(file.options) && !payload.technique) {
                const techniqueOption = file.options.find(opt => opt?.id === 'technique' && typeof opt?.value === 'string');
                if (techniqueOption) {
                    payload.technique = normaliseTechniqueValue(techniqueOption.value);
                }
            }

            if (file.file_id || file.id) {
                payload.file_id = file.file_id || file.id;
            }

            const url = file.url || file.preview_url || file.thumbnail_url;
            if (url) {
                payload.url = url;
            }

            if (!payload.file_id && !payload.url) {
                return null;
            }

            return payload;
        })
        .filter(Boolean);
}

function sanitiseOrderPlacements(placements) {
    if (!Array.isArray(placements)) {
        return [];
    }

    return placements
        .map(entry => {
            if (!entry || typeof entry !== 'object') {
                return null;
            }

            const placementValue = typeof entry.placement === 'string' && entry.placement.trim()
                ? entry.placement.trim()
                : typeof entry.type === 'string' && entry.type.trim()
                    ? entry.type.trim()
                    : null;

            if (!placementValue) {
                return null;
            }

            const techniqueCandidates = new Set();
            collectTechniqueValues(techniqueCandidates, entry.technique);
            collectTechniqueValues(techniqueCandidates, entry.techniques);
            collectTechniqueValues(techniqueCandidates, entry.defaultTechnique);

            const layers = sanitiseOrderLayers(entry.layers);

            return {
                placement: placementValue,
                canonical: canonicalPlacement(placementValue),
                technique: normaliseTechniqueValue(entry.technique),
                techniques: Array.from(techniqueCandidates).map(normaliseTechniqueValue).filter(Boolean),
                layers
            };
        })
        .filter(Boolean);
}

function derivePlacementsFromFiles(files, defaultTechnique = null) {
    if (!Array.isArray(files) || files.length === 0) {
        return [];
    }

    const placementsMap = new Map();

    files.forEach(file => {
        if (!file || typeof file !== 'object') {
            return;
        }

        const placementValue = typeof file.type === 'string' && file.type.trim()
            ? file.type.trim()
            : typeof file.placement === 'string' && file.placement.trim()
                ? file.placement.trim()
                : null;

        if (!placementValue) {
            return;
        }

        if (!placementsMap.has(placementValue)) {
            placementsMap.set(placementValue, {
                placement: placementValue,
                canonical: canonicalPlacement(placementValue),
                technique: normaliseTechniqueValue(file.technique) || defaultTechnique || null,
                techniques: [],
                layers: []
            });
        }

        const placementEntry = placementsMap.get(placementValue);
        const layer = {
            type: 'file'
        };

        if (file.file_id) {
            layer.file_id = file.file_id;
        }
        if (file.url) {
            layer.url = file.url;
        }

        if (!layer.file_id && !layer.url) {
            return;
        }

        placementEntry.layers.push(layer);
    });

    return Array.from(placementsMap.values());
}

function extractDataBlock(response) {
    if (!response || typeof response !== 'object') {
        return null;
    }

    if (response.data && typeof response.data === 'object' && !Array.isArray(response.data)) {
        return response.data;
    }

    if (response.result && typeof response.result === 'object' && !Array.isArray(response.result)) {
        return response.result;
    }

    return response;
}

function buildVariantConfig(variantData, productData) {
    const placementCandidates = [];
    const variantPlacements = Array.isArray(variantData?.placement_dimensions)
        ? variantData.placement_dimensions
        : [];

    variantPlacements.forEach(dim => {
        if (!dim || typeof dim !== 'object' || typeof dim.placement !== 'string') {
            return;
        }
        placementCandidates.push({
            placement: dim.placement
        });
    });

    const techniqueKeysSet = new Set();
    const productTechniques = Array.isArray(productData?.techniques) ? productData.techniques : [];

    productTechniques.forEach(technique => {
        if (!technique || typeof technique !== 'object') {
            return;
        }

        const techniqueKey = normaliseTechniqueValue(technique.key || technique.technique);
        if (techniqueKey) {
            techniqueKeysSet.add(techniqueKey);
        }

        const associatedFiles = Array.isArray(technique.associated_files) ? technique.associated_files : [];
        associatedFiles.forEach(file => {
            if (!file || typeof file !== 'object' || typeof file.placement !== 'string') {
                return;
            }

            placementCandidates.push({
                placement: file.placement,
                technique: techniqueKey,
                techniques: [techniqueKey]
            });
        });
    });

    const allowedMap = buildAllowedPlacementMap(placementCandidates);
    const uniquePlacements = [];
    const seenCanonical = new Set();

    allowedMap.forEach(entry => {
        if (!entry || typeof entry !== 'object') {
            return;
        }

        const canonical = entry.canonical || canonicalPlacement(entry.placement);
        if (canonical && !seenCanonical.has(canonical)) {
            seenCanonical.add(canonical);
            uniquePlacements.push(entry);
        }
    });

    const defaultPlacement = pickFirstAllowedPlacement(uniquePlacements);
    const techniqueKeys = Array.from(techniqueKeysSet);
    const defaultTechnique = pickTechniqueForEntry(defaultPlacement, techniqueKeys[0] || null)
        || techniqueKeys[0]
        || null;

    uniquePlacements.forEach(entry => {
        if (!entry || typeof entry !== 'object') {
            return;
        }
        if (!Array.isArray(entry.techniques) || entry.techniques.length === 0) {
            entry.techniques = [...techniqueKeys];
        }
    });

    return {
        allowedPlacements: uniquePlacements,
        allowedMap,
        defaultPlacement,
        defaultTechnique,
        allowedTechniques: techniqueKeys
    };
}

async function fetchVariantConfig(variantId, apiKey, storeId) {
    if (!variantId || !apiKey) {
        return null;
    }

    const cacheKey = `${storeId || 'default'}:${variantId}`;
    if (variantConfigCache.has(cacheKey)) {
        return variantConfigCache.get(cacheKey);
    }

    let variantData = null;
    try {
        const variantResponse = await callPrintful(CATALOG_VARIANT_ENDPOINT(variantId), {
            apiKey,
            storeId
        });
        variantData = extractDataBlock(variantResponse);
    } catch (error) {
        console.warn('Printful: failed to fetch catalog variant', variantId, error);
        variantConfigCache.set(cacheKey, null);
        return null;
    }

    if (!variantData) {
        variantConfigCache.set(cacheKey, null);
        return null;
    }

    let productData = null;
    if (variantData.catalog_product_id) {
        try {
            const productResponse = await callPrintful(CATALOG_PRODUCT_ENDPOINT(variantData.catalog_product_id), {
                apiKey,
                storeId
            });
            productData = extractDataBlock(productResponse);
        } catch (error) {
            console.warn('Printful: failed to fetch catalog product', variantData.catalog_product_id, error);
        }
    }

    const config = buildVariantConfig(variantData, productData);
    variantConfigCache.set(cacheKey, config);
    return config;
}

function layersFromFiles(files) {
    return files
        .map(file => {
            if (!file || typeof file !== 'object') {
                return null;
            }
            const layer = { type: 'file' };
            if (file.file_id) {
                layer.file_id = file.file_id;
            }
            if (file.url) {
                layer.url = file.url;
            }
            return (layer.file_id || layer.url) ? layer : null;
        })
        .filter(Boolean);
}

function assignLayersToPlacement(entry, files, fallbackLayers, index) {
    let layers = sanitiseOrderLayers(entry.layers);

    if (layers.length > 0) {
        return layers;
    }

    if (!Array.isArray(files) || files.length === 0) {
        return fallbackLayers;
    }

    const canonical = entry.canonical || canonicalPlacement(entry.placement);
    const byPlacement = files
        .filter(file => {
            const fileCanonical = canonicalPlacement(file.type || file.placement || null);
            if (!canonical || !fileCanonical) {
                return false;
            }
            if (fileCanonical === canonical) {
                return true;
            }
            if (fileCanonical.endsWith('_large') && fileCanonical.replace(/_large$/, '') === canonical) {
                return true;
            }
            if (canonical.endsWith('_large') && canonical.replace(/_large$/, '') === fileCanonical) {
                return true;
            }
            return false;
        })
        .map(file => {
            const layer = { type: 'file' };
            if (file.file_id) {
                layer.file_id = file.file_id;
            }
            if (file.url) {
                layer.url = file.url;
            }
            return (layer.file_id || layer.url) ? layer : null;
        })
        .filter(Boolean);

    if (byPlacement.length > 0) {
        return byPlacement;
    }

    if (index === 0 && fallbackLayers.length > 0) {
        return fallbackLayers;
    }

    return [];
}

function processOrderItem(item, config) {
    const processed = { ...item };
    const files = sanitiseOrderFiles(item.files || processed.files || []);
    const fallbackLayers = layersFromFiles(files);

    if (!processed.source) {
        processed.source = 'catalog';
    }

    let placements = sanitiseOrderPlacements(item.placements || processed.placements || []);
    if (!placements.length && files.length > 0) {
        placements = derivePlacementsFromFiles(files, config?.defaultTechnique || null);
    }

    if ((!placements || placements.length === 0) && config?.defaultPlacement) {
        placements = [{
            placement: config.defaultPlacement.placement,
            canonical: canonicalPlacement(config.defaultPlacement.placement),
            technique: config.defaultTechnique,
            techniques: config.allowedTechniques || [],
            layers: []
        }];
    }

    if (!placements || placements.length === 0) {
        throw new Error('Unable to determine Printful placements for order item');
    }

    const allowedMap = config?.allowedMap instanceof Map ? config.allowedMap : new Map();
    const defaultPlacement = config?.defaultPlacement || null;
    const defaultTechnique = normaliseTechniqueValue(config?.defaultTechnique)
        || (config?.allowedTechniques?.length ? config.allowedTechniques[0] : null)
        || null;

    const preparedPlacements = placements
        .map((entry, index) => {
            const placementEntry = alignPlacementToAllowed(entry, allowedMap, defaultPlacement);
            const placementValue = placementEntry?.placement || entry.placement || defaultPlacement?.placement;
            if (!placementValue) {
                return null;
            }

            const allowedTechniques = new Set(
                Array.isArray(placementEntry?.techniques)
                    ? placementEntry.techniques.map(normaliseTechniqueValue).filter(Boolean)
                    : []
            );

            let technique = normaliseTechniqueValue(entry.technique)
                || pickTechniqueForEntry(placementEntry, defaultTechnique)
                || defaultTechnique
                || null;

            if (allowedTechniques.size > 0 && (!technique || !allowedTechniques.has(technique))) {
                technique = allowedTechniques.values().next().value || technique;
            }

            if (!technique && config?.allowedTechniques?.length) {
                technique = config.allowedTechniques[0];
            }

            const layers = assignLayersToPlacement(
                {
                    ...entry,
                    placement: placementValue,
                    canonical: placementEntry?.canonical || entry.canonical
                },
                files,
                fallbackLayers,
                index
            );

            if (!layers.length || !technique) {
                return null;
            }

            return {
                placement: placementValue,
                technique,
                layers
            };
        })
        .filter(Boolean);

    if (!preparedPlacements.length) {
        if (defaultPlacement && fallbackLayers.length > 0) {
            const fallbackTechnique = defaultTechnique || 'dtg';
            preparedPlacements.push({
                placement: defaultPlacement.placement,
                technique: fallbackTechnique,
                layers: fallbackLayers
            });
        } else {
            throw new Error('Unable to build Printful placement payload for order item');
        }
    }

    processed.placements = preparedPlacements;
    
    // Don't send both 'files' and 'placements' - Printful only allows one
    // If we have placements with layers, remove the top-level files array
    if (preparedPlacements.length > 0 && preparedPlacements.some(p => p.layers && p.layers.length > 0)) {
        delete processed.files;
    } else {
        processed.files = files;
    }

    return processed;
}

export async function prepareOrderItems(orderItems, { apiKey, storeId } = {}) {
    if (!Array.isArray(orderItems) || orderItems.length === 0) {
        return [];
    }

    const preparedItems = [];
    const localCache = new Map();

    for (const item of orderItems) {
        if (!item || typeof item !== 'object') {
            continue;
        }

        // For fetching variant config, we need the CATALOG variant ID (e.g., 23133)
        // NOT the sync variant ID (e.g., 5008952970)
        // printfulVariantId contains the catalog ID
        const configVariantCandidates = [
            item.printfulVariantId,      // Catalog variant ID - correct for V2 API
            item.variant_id,             // Fallback
            item.variantId               // Fallback
        ];

        const configVariantId = configVariantCandidates
            .map(value => {
                if (value == null) {
                    return null;
                }
                const parsed = Number(value);
                return Number.isFinite(parsed) ? parsed : null;
            })
            .find(Boolean);

        let config = null;
        if (configVariantId && apiKey) {
            const cacheKey = `${storeId || 'default'}:${configVariantId}`;
            if (localCache.has(cacheKey)) {
                config = localCache.get(cacheKey);
            } else {
                config = await fetchVariantConfig(configVariantId, apiKey, storeId);
                localCache.set(cacheKey, config);
            }
        }

        try {
            preparedItems.push(processOrderItem(item, config));
        } catch (error) {
            const wrapped = new Error(`Failed to prepare Printful order item${configVariantId ? ` for variant ${configVariantId}` : ''}: ${error.message}`);
            wrapped.cause = error;
            throw wrapped;
        }
    }

    return preparedItems;
}

export async function prepareOrderPayload(payload, { apiKey, storeId } = {}) {
    if (!payload || typeof payload !== 'object') {
        return payload;
    }

    const items = Array.isArray(payload.items)
        ? payload.items
        : Array.isArray(payload.order_items)
            ? payload.order_items
            : [];

    if (!items.length) {
        return payload;
    }

    const preparedItems = await prepareOrderItems(items, { apiKey, storeId });
    payload.items = preparedItems;
    payload.order_items = preparedItems;

    return payload;
}
