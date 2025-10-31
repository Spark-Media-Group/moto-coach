(function () {
    'use strict';

    const CHECKOUT_STORAGE_KEY = 'motocoach_checkout';
    const CART_STORAGE_KEY = 'motocoach_shop_cart';
    const CURRENCY_STORAGE_KEY = 'motocoach_currency';
    const EXCHANGE_RATES_STORAGE_KEY = 'motocoach_exchange_rates';
    const DEFAULT_CURRENCY = 'AUD';

    // Fallback exchange rates (used if API fails)
    const FALLBACK_EXCHANGE_RATES = {
        AUD: 1.0,
        USD: 0.65
    };

    const SUPPORTED_CURRENCIES = ['AUD', 'USD'];

    // Current exchange rates (will be updated from Stripe API)
    let EXCHANGE_RATES = { ...FALLBACK_EXCHANGE_RATES };

    const state = {
        products: [],
        filteredProducts: [],
        categories: [],
        selectedCategory: 'all',
        sortBy: 'title-asc',
        cart: [],
        currency: DEFAULT_CURRENCY,
        exchangeRatesLoaded: false
    };

    const loadingState = document.getElementById('loading-state');
    const errorState = document.getElementById('error-state');
    const shopControls = document.getElementById('shop-controls');
    const productsGrid = document.getElementById('products-grid');
    const emptyState = document.getElementById('empty-state');
    const sortSelect = document.getElementById('sort-select');
    const parentFilters = document.getElementById('parent-filters');
    const leafFilters = document.getElementById('leaf-filters');
    const productModal = document.getElementById('product-modal');
    const modalBody = document.getElementById('modal-body');
    const cartCount = document.getElementById('cart-count');
    const cartSidebar = document.getElementById('cart-sidebar');
    const cartOverlay = document.getElementById('cart-overlay');
    const cartItemsContainer = document.getElementById('cart-items');
    const cartEmptyState = document.getElementById('cart-empty');
    const cartFooter = document.getElementById('cart-footer');
    const cartSubtotal = document.getElementById('cart-subtotal');

    let currentModalProduct = null;
    let currentVariant = null;
    let currentImageIndex = 0;

    function formatCurrency(amount, currency = state.currency || DEFAULT_CURRENCY, { prefixFrom = false } = {}) {
        const numeric = toNumeric(amount, NaN);
        const currencyCode = typeof currency === 'string' ? currency.toUpperCase() : DEFAULT_CURRENCY;
        const safeCurrency = currencyCode || DEFAULT_CURRENCY;

        if (!Number.isFinite(numeric)) {
            return `${safeCurrency} 0.00`;
        }

        try {
            const formatted = new Intl.NumberFormat('en-AU', {
                style: 'currency',
                currency: safeCurrency,
                currencyDisplay: 'code',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(numeric);

            return prefixFrom ? `From ${formatted}` : formatted;
        } catch (error) {
            console.warn('Shop: Unable to format currency', error);
            return `${safeCurrency} ${numeric.toFixed(2)}`;
        }
    }

    function toNumeric(value, fallback = 0) {
        if (typeof value === 'number') {
            return Number.isFinite(value) ? value : fallback;
        }
        const parsed = typeof value === 'string' ? parseFloat(value) : NaN;
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function normaliseCurrencyCode(currency) {
        return typeof currency === 'string' ? currency.toUpperCase() : '';
    }

    function ensureSupportedCurrency(currency) {
        const code = normaliseCurrencyCode(currency);
        return SUPPORTED_CURRENCIES.includes(code) ? code : DEFAULT_CURRENCY;
    }

    function getExchangeRate(currency) {
        const code = normaliseCurrencyCode(currency) || DEFAULT_CURRENCY;
        return EXCHANGE_RATES[code] || 1.0;
    }

    // Convert price from AUD to target currency
    function convertPrice(audPrice, targetCurrency = state.currency) {
        const target = normaliseCurrencyCode(targetCurrency) || DEFAULT_CURRENCY;
        if (target === 'AUD') {
            return audPrice;
        }
        const rate = getExchangeRate(target);
        return audPrice * rate;
    }

    function convertToAud(amount, sourceCurrency) {
        const source = normaliseCurrencyCode(sourceCurrency) || DEFAULT_CURRENCY;
        if (source === 'AUD') {
            return amount;
        }
        const rate = getExchangeRate(source);
        if (!rate) {
            return amount;
        }
        return amount / rate;
    }

    function resolveStoredBasePrice(item, fallback = 0) {
        const baseFromStorage = item ? toNumeric(item.basePriceAud, NaN) : NaN;
        if (Number.isFinite(baseFromStorage)) {
            return baseFromStorage;
        }

        const priceAud = item ? toNumeric(item.priceAud, NaN) : NaN;
        if (Number.isFinite(priceAud)) {
            return priceAud;
        }

        const storedPrice = item ? toNumeric(item.price, NaN) : NaN;
        if (Number.isFinite(storedPrice)) {
            const sourceCurrency = item && item.currency ? item.currency : DEFAULT_CURRENCY;
            const audPrice = convertToAud(storedPrice, sourceCurrency);
            if (Number.isFinite(audPrice)) {
                return audPrice;
            }
        }
        return fallback;
    }

    // Save currency preference to localStorage
    function saveCurrencyPreference(currency) {
        const normalised = ensureSupportedCurrency(currency);
        try {
            localStorage.setItem(CURRENCY_STORAGE_KEY, normalised);
        } catch (e) {
            console.warn('Unable to save currency preference:', e);
        }
    }

    // Load currency preference from localStorage
    function loadCurrencyPreference() {
        try {
            const saved = localStorage.getItem(CURRENCY_STORAGE_KEY);
            return ensureSupportedCurrency(saved || DEFAULT_CURRENCY);
        } catch (e) {
            return DEFAULT_CURRENCY;
        }
    }

    // Fetch live exchange rates from Stripe
    async function fetchExchangeRates() {
        try {
            console.log('[Exchange Rates] Fetching live rates from Stripe...');
            
            const response = await fetch('/api/stripe-exchange-rates', {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch exchange rates: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.rates) {
                EXCHANGE_RATES = data.rates;

                // Update any existing cart items using the latest rates
                repriceCart(state.currency);

                // Cache the rates with timestamp
                try {
                    localStorage.setItem(EXCHANGE_RATES_STORAGE_KEY, JSON.stringify({
                        rates: data.rates,
                        timestamp: Date.now()
                    }));
                } catch (e) {
                    console.warn('[Exchange Rates] Unable to cache rates:', e);
                }
                
                console.log('[Exchange Rates] Successfully loaded:', {
                    cached: data.cached,
                    rates: EXCHANGE_RATES
                });
                
                state.exchangeRatesLoaded = true;
                return true;
            } else {
                throw new Error('Invalid rates data received');
            }
        } catch (error) {
            console.error('[Exchange Rates] Error fetching rates:', error);
            
            // Try to load from cache
            try {
                const cached = localStorage.getItem(EXCHANGE_RATES_STORAGE_KEY);
                if (cached) {
                    const { rates, timestamp } = JSON.parse(cached);
                    const age = Date.now() - timestamp;
                    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
                    
                    if (age < maxAge) {
                        EXCHANGE_RATES = rates;
                        console.log('[Exchange Rates] Using cached rates (age: ' + Math.round(age / 1000 / 60) + ' minutes)');
                        state.exchangeRatesLoaded = true;
                        repriceCart(state.currency);
                        return true;
                    }
                }
            } catch (e) {
                console.warn('[Exchange Rates] Unable to load cached rates:', e);
            }
            
            // Fall back to static rates
            EXCHANGE_RATES = { ...FALLBACK_EXCHANGE_RATES };
            console.log('[Exchange Rates] Using fallback rates');
            state.exchangeRatesLoaded = false;
            repriceCart(state.currency);
            return false;
        }
    }

    function showLoadingState() {
        if (loadingState) loadingState.style.display = 'block';
        if (errorState) errorState.style.display = 'none';
        if (shopControls) shopControls.style.display = 'none';
        if (productsGrid) productsGrid.style.display = 'none';
        if (emptyState) emptyState.style.display = 'none';
    }

    function showErrorState() {
        if (loadingState) loadingState.style.display = 'none';
        if (errorState) errorState.style.display = 'block';
        if (shopControls) shopControls.style.display = 'none';
        if (productsGrid) productsGrid.style.display = 'none';
        if (emptyState) emptyState.style.display = 'none';
    }

    function showShopContent() {
        if (loadingState) loadingState.style.display = 'none';
        if (errorState) errorState.style.display = 'none';
        if (shopControls) shopControls.style.display = 'flex';
        if (productsGrid) productsGrid.style.display = 'grid';
        if (emptyState) emptyState.style.display = 'none';
    }

    function showEmptyState() {
        if (loadingState) loadingState.style.display = 'none';
        if (errorState) errorState.style.display = 'none';
        if (shopControls) shopControls.style.display = 'flex';
        if (productsGrid) productsGrid.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
    }

    async function fetchPrintfulCatalog() {
        const response = await fetch('/api/printfulCatalog?includeDetails=true', {
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Catalog request failed: ${response.status} ${errorText}`);
        }

        const json = await response.json();
        if (!json || !Array.isArray(json.products)) {
            throw new Error('Catalog response missing products array');
        }

        return json.products;
    }

    function deriveCategories(products) {
        const categoryMap = new Map();

        products.forEach(product => {
            const name = product.categoryName || (Array.isArray(product.tags) && product.tags[0]) || 'General';
            if (!categoryMap.has(name)) {
                categoryMap.set(name, {
                    id: name.toLowerCase().replace(/[^a-z0-9]+/gi, '-'),
                    name,
                    count: 0
                });
            }
            categoryMap.get(name).count += 1;
            product.categoryLabel = name;
        });

        return [
            { id: 'all', name: 'All Products', count: products.length },
            ...Array.from(categoryMap.values()).sort((a, b) => a.name.localeCompare(b.name))
        ];
    }

    function applyFilters() {
        const selected = state.selectedCategory;
        const filtered = selected === 'all'
            ? state.products.slice()
            : state.products.filter(product => product.categoryLabel === selected);

        state.filteredProducts = filtered;
        applySorting(state.sortBy);
    }

    function applySorting(sortBy) {
        state.sortBy = sortBy;
        const products = state.filteredProducts;

        const compareByName = (a, b) => a.name.localeCompare(b.name);
        const compareByPrice = (a, b) => {
            const priceA = a.priceRange?.min ?? 0;
            const priceB = b.priceRange?.min ?? 0;
            return priceA - priceB;
        };

        switch (sortBy) {
            case 'title-desc':
                products.sort((a, b) => compareByName(b, a));
                break;
            case 'price-asc':
                products.sort(compareByPrice);
                break;
            case 'price-desc':
                products.sort((a, b) => compareByPrice(b, a));
                break;
            case 'title-asc':
            default:
                products.sort(compareByName);
        }

        renderProducts();
    }

    function renderCategoryFilters() {
        if (!parentFilters) {
            return;
        }

        parentFilters.innerHTML = state.categories.map(category => {
            const isActive = category.name === state.selectedCategory || (category.id === 'all' && state.selectedCategory === 'all');
            return `
                <button class="filter-btn ${isActive ? 'active' : ''}" data-category="${category.name}">
                    ${category.name} (${category.count})
                </button>
            `;
        }).join('');

        parentFilters.addEventListener('click', event => {
            const button = event.target.closest('button[data-category]');
            if (!button) {
                return;
            }

            const selected = button.getAttribute('data-category');
            state.selectedCategory = selected === 'All Products' ? 'all' : selected;

            parentFilters.querySelectorAll('button').forEach(btn => {
                btn.classList.toggle('active', btn === button);
            });

            applyFilters();
        });

        if (leafFilters) {
            leafFilters.innerHTML = '';
            leafFilters.classList.add('hidden');
        }
    }

    function renderProducts() {
        if (!productsGrid) {
            return;
        }

        if (state.filteredProducts.length === 0) {
            productsGrid.innerHTML = '';
            showEmptyState();
            return;
        }

        const cards = state.filteredProducts.map(product => {
            const image = product.images?.[0]?.url || product.thumbnailUrl || 'images/long-logo.png';
            const priceRange = product.priceRange || { min: 0, max: 0, currency: 'AUD' };

            const minPriceAud = toNumeric(priceRange.min, 0);
            const maxPriceAud = toNumeric(priceRange.max, minPriceAud);

            // Convert price from AUD to selected currency
            const convertedMinPrice = convertPrice(minPriceAud, state.currency);
            const convertedMaxPrice = convertPrice(maxPriceAud, state.currency);
            
            const priceLabel = priceRange.hasMultiplePrices
                ? formatCurrency(convertedMinPrice, state.currency, { prefixFrom: true })
                : formatCurrency(convertedMinPrice, state.currency);

            return `
                <div class="product-card" data-product-id="${product.id}">
                    <div class="product-image">
                        <img src="${image}" alt="${product.name}" loading="lazy">
                    </div>
                    <div class="product-info">
                        <h3 class="product-title">${product.name}</h3>
                        <div class="product-price">
                            <span class="price-current">${priceLabel}</span>
                        </div>
                        <div class="product-type">${product.categoryLabel || 'General'}</div>
                    </div>
                </div>
            `;
        }).join('');

        productsGrid.innerHTML = cards;
        showShopContent();

        productsGrid.querySelectorAll('.product-card').forEach(card => {
            card.addEventListener('click', () => {
                const productId = card.getAttribute('data-product-id');
                const product = state.products.find(item => item.id === productId);
                if (product) {
                    openProductModal(product);
                }
            });
        });
    }

    function extractColorName(label) {
        if (!label || typeof label !== 'string') {
            return '';
        }

        const parts = label.split('/');
        return parts[0].trim();
    }

    function getVariantColorName(variant) {
        if (!variant) {
            return '';
        }

        const label = variant.optionLabel || variant.name || '';
        return extractColorName(label) || label;
    }

    function areVariantIdsEqual(a, b) {
        if (a == null || b == null) {
            return false;
        }

        return String(a) === String(b);
    }

    function findVariantById(variantId, variants = null) {
        if (variantId == null) {
            return null;
        }

        const list = Array.isArray(variants) ? variants : (currentModalProduct?.variants || []);
        if (!list.length) {
            return null;
        }

        const target = String(variantId);
        return list.find(variant => areVariantIdsEqual(variant.id, target)) || null;
    }

    function buildImageGallery(product, variant = null) {
        // DEBUG: Log variant data
        console.log('[DEBUG buildImageGallery] Product:', product.name);
        console.log('[DEBUG buildImageGallery] Current variant:', variant ? {
            id: variant.id,
            name: variant.optionLabel || variant.name,
            imageUrl: variant.imageUrl,
            imageUrls: variant.imageUrls,
            mockupCount: (variant.imageUrls || []).length
        } : 'none');

        const variants = product.variants || [];

        // MAIN GALLERY: Show ALL mockups for the CURRENT variant only
        let mockupImages = [];
        if (variant && variant.imageUrls && variant.imageUrls.length > 0) {
            mockupImages = variant.imageUrls.map((url, index) => ({
                url: url,
                altText: `${product.name} - ${getVariantColorName(variant)} - View ${index + 1}`,
                variantId: variant.id,
                baseVariant: variant,
                isMockup: true
            }));
        } else if (variant && variant.imageUrl) {
            mockupImages = [{
                url: variant.imageUrl,
                altText: `${product.name} - ${getVariantColorName(variant)}`,
                variantId: variant.id,
                baseVariant: variant,
                isMockup: true
            }];
        }

        console.log('[DEBUG buildImageGallery] Found', mockupImages.length, 'mockup images for current variant');

        let images = mockupImages;
        
        // Fallback to product images if no variant images
        if (images.length === 0 && product.images && product.images.length > 0) {
            console.log('[DEBUG buildImageGallery] Using product.images fallback');
            images = product.images.map(img => ({...img, variantId: null, baseVariant: null}));
        } else if (images.length === 0 && product.thumbnailUrl) {
            console.log('[DEBUG buildImageGallery] Using product.thumbnailUrl fallback:', product.thumbnailUrl);
            images = [{ url: product.thumbnailUrl, altText: product.name, variantId: null, baseVariant: null }];
        }
        
        images = images.filter(image => image.url);

        if (images.length === 0) {
            return `
                <div class="modal-gallery">
                    <div class="main-image-container">
                        <div style="padding: 60px; text-align: center; color: #999;">No image available</div>
                    </div>
                </div>
            `;
        }

        // Find active image index based on current variant
        let activeIndex = 0;
        if (variant && variant.imageUrl) {
            const foundIndex = images.findIndex(img => img.url === variant.imageUrl);
            if (foundIndex >= 0) {
                activeIndex = foundIndex;
            }
        }
        currentImageIndex = activeIndex;

        const mainImage = images[activeIndex];
        const showNav = images.length > 1;

        // Build color variant thumbnails (one per unique color)
        const colorVariants = [];
        const seenColors = new Set();
        variants.forEach(v => {
            if (v.imageUrl && !seenColors.has(v.imageUrl)) {
                seenColors.add(v.imageUrl);
                colorVariants.push(v);
            }
        });

        const showColorThumbnails = colorVariants.length > 1;

        let html = `
            <div class="modal-gallery">
                <div class="main-image-container">
                    <img id="modal-main-image" src="${mainImage.url}" alt="${mainImage.altText || product.name}">
                    ${showNav ? `
                        <button class="gallery-nav gallery-prev" data-direction="-1" aria-label="Previous mockup">‹</button>
                        <button class="gallery-nav gallery-next" data-direction="1" aria-label="Next mockup">›</button>
                    ` : ''}
                </div>

                ${showColorThumbnails ? `
                    <div class="selected-variant-label">
                        <strong>CHOOSE YOUR VARIANT</strong>
                        <span class="variant-label-text" id="selected-color-name">${getVariantColorName(variant) || 'Select Color'}</span>
                    </div>
                ` : ''}
        `;

        // Show color variant thumbnails (not mockup thumbnails)
        if (showColorThumbnails) {
            html += '<div class="image-thumbnails">';
            colorVariants.forEach((colorVariant) => {
                const isActive = variant && areVariantIdsEqual(colorVariant.id, variant.id) ? 'active' : '';
                html += `
                    <button class="thumbnail ${isActive}" data-variant-id="${colorVariant.id}" aria-label="Select ${getVariantColorName(colorVariant)}">
                        <img src="${colorVariant.imageUrl}" alt="${getVariantColorName(colorVariant)}">
                    </button>
                `;
            });
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    function buildVariantSelection(product, variants) {
        if (!variants || variants.length === 0) {
            return '';
        }

        const inStock = variants.filter(v => v.availability && v.availability > 0);
        const availableVariants = inStock.length > 0 ? inStock : variants;

        if (availableVariants.length === 1) {
            currentVariant = availableVariants[0];
            return '';
        }

        // Group variants by color (imageUrl)
        const colorGroups = new Map();
        availableVariants.forEach(v => {
            const colorKey = v.imageUrl || 'no-image';
            if (!colorGroups.has(colorKey)) {
                colorGroups.set(colorKey, []);
            }
            colorGroups.get(colorKey).push(v);
        });

        console.log('[DEBUG buildVariantSelection] Color groups:', colorGroups.size);

        // If only one variant per color = no sizes, just color selection via carousel
        const hasSizes = Array.from(colorGroups.values()).some(group => group.length > 1);
        
        console.log('[DEBUG buildVariantSelection] Has sizes:', hasSizes);

        if (!hasSizes) {
            // No sizes - carousel handles all selection
            return '';
        }

        // Build size dropdown for CURRENT COLOR
        const currentColorKey = currentVariant ? (currentVariant.imageUrl || 'no-image') : null;
        const sizesForCurrentColor = currentColorKey ? (colorGroups.get(currentColorKey) || []) : [];

        console.log('[DEBUG buildVariantSelection] Sizes for current color:', sizesForCurrentColor.length);

        if (sizesForCurrentColor.length <= 1) {
            return ''; // Only one size for this color
        }

        // Build size-only dropdown
        let html = '<div class="modal-variant-selection size-section">';
        html += '<label for="size-select">Choose Size</label>';
        html += '<select id="size-select" class="size-select">';

        sizesForCurrentColor.forEach((variant) => {
            const selected = currentVariant && areVariantIdsEqual(currentVariant.id, variant.id) ? 'selected' : '';
            // Try to extract size from variant name
            const label = variant.optionLabel || variant.name || '';
            // If label has "/", take part after it, otherwise use full label
            const sizePart = label.includes('/') ? label.split('/').pop().trim() : label;
            html += `<option value="${variant.id}" ${selected}>${sizePart}</option>`;
        });

        html += '</select></div>';
        return html;
    }

    function buildQuantitySelector() {
        return `
            <div class="quantity-section">
                <label for="product-quantity">Quantity</label>
                <select id="product-quantity" class="quantity-select">
                    <option value="1" selected>1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                    <option value="6">6</option>
                    <option value="7">7</option>
                    <option value="8">8</option>
                    <option value="9">9</option>
                    <option value="10">10</option>
                </select>
            </div>
        `;
    }

    function attachSizeSelectListener() {
        const sizeSelect = modalBody.querySelector('#size-select');
        if (!sizeSelect) {
            return;
        }

        if (currentVariant?.id != null) {
            sizeSelect.value = String(currentVariant.id);
        }

        sizeSelect.addEventListener('change', () => {
            const variants = currentModalProduct?.variants || [];
            const selectedVariant = findVariantById(sizeSelect.value, variants);

            if (selectedVariant) {
                currentVariant = selectedVariant;
                updateModalPrice();
                updateVariantAvailability();
            }
        });
    }

    function openProductModal(product) {
        currentModalProduct = product;
        const variants = product.variants || [];
        currentVariant = variants.find(variant => areVariantIdsEqual(variant.id, product.defaultVariantId))
            || variants.find(variant => variant.isEnabled !== false)
            || variants[0]
            || null;
        
        // Set currentImageIndex to match the selected variant's image
        currentImageIndex = 0;
        if (currentVariant && currentVariant.imageUrl) {
            // Build a temporary images array to find the index
            const variantImages = [];
            variants.forEach(v => {
                if (v.imageUrl && !variantImages.some(img => img === v.imageUrl)) {
                    variantImages.push(v.imageUrl);
                }
            });
            const foundIndex = variantImages.findIndex(url => url === currentVariant.imageUrl);
            if (foundIndex >= 0) {
                currentImageIndex = foundIndex;
            }
        }

        const price = toNumeric(currentVariant?.retailPrice, toNumeric(product.priceRange?.min, 0));
        // Convert price from AUD to selected currency
        const convertedPrice = convertPrice(price, state.currency);
        const gallery = buildImageGallery(product, currentVariant);
        const variantSelect = buildVariantSelection(product, variants);
        const quantitySection = buildQuantitySelector();
        const hasSizeSelection = typeof variantSelect === 'string' && variantSelect.trim().length > 0;
        const sizeQuantityClasses = `size-quantity-container${hasSizeSelection ? ' has-sizes' : ''}`;

        const description = product.description
            ? product.description.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
            : 'No description available.';

        const modalContent = `
            <div class="modal-product">
                <div class="modal-mobile-header">
                    <h2 class="modal-mobile-title">${product.name}</h2>
                    <div id="modal-price-display-mobile" class="product-price">
                        <span class="price-current">${formatCurrency(convertedPrice, state.currency)}</span>
                    </div>
                </div>
                <div class="modal-image">${gallery}</div>
                <div class="modal-info">
                    <h2>${product.name}</h2>
                    <div id="modal-price-display" class="product-price">
                        <span class="price-current">${formatCurrency(convertedPrice, state.currency)}</span>
                    </div>
                    <div class="product-description">${description}</div>
                    <div class="${sizeQuantityClasses}">
                        ${hasSizeSelection ? variantSelect : ''}
                        ${quantitySection}
                    </div>
                    <div class="availability-info">
                        <span class="spec-label">Availability:</span>
                        <span class="spec-value" id="availability-status">${currentVariant?.isEnabled === false ? 'Unavailable' : 'In Stock'}</span>
                    </div>
                    <div class="modal-actions">
                        <button id="modal-add-cart-btn" class="btn-add-cart" ${currentVariant?.isEnabled === false ? 'disabled' : ''}>Add to Cart</button>
                        <button type="button" class="btn-continue-shopping" id="modal-continue-shopping">Continue Shopping</button>
                    </div>
                </div>
            </div>
        `;

        modalBody.innerHTML = modalContent;
        productModal.style.display = 'block';
        document.body.style.overflow = 'hidden';

        setupModalInteractions(product);
    }

    function closeProductModal() {
        productModal.style.display = 'none';
        document.body.style.overflow = 'auto';
        modalBody.innerHTML = '';
        currentModalProduct = null;
        currentVariant = null;
        currentImageIndex = 0;
    }

    function setupModalInteractions(product) {
        const galleryNavButtons = modalBody.querySelectorAll('.gallery-nav');
        galleryNavButtons.forEach(button => {
            button.addEventListener('click', () => {
                const direction = parseInt(button.getAttribute('data-direction'), 10);
                navigateGallery(direction);
            });
        });

        const thumbnailButtons = modalBody.querySelectorAll('.thumbnail');
        thumbnailButtons.forEach(button => {
            button.addEventListener('click', () => {
                const variantId = button.getAttribute('data-variant-id');

                // Switch to the selected color variant
                if (variantId && currentModalProduct) {
                    const variants = currentModalProduct.variants || [];
                    const clickedVariant = variants.find(v => areVariantIdsEqual(v.id, variantId));

                    if (clickedVariant) {
                        // Find variant with same color (imageUrl) as clicked thumbnail
                        // Prefer same size as current, or first available size
                        const sameColorVariants = variants.filter(v => v.imageUrl === clickedVariant.imageUrl);

                        let newVariant = clickedVariant;

                        // Try to keep the same size if it exists for this color
                        if (currentVariant && currentVariant.optionLabel && currentVariant.optionLabel.includes('/')) {
                            const currentSize = currentVariant.optionLabel.split('/').pop().trim();
                            const matchingSize = sameColorVariants.find(v => {
                                const label = v.optionLabel || '';
                                return label.includes('/') && label.split('/').pop().trim() === currentSize;
                            });
                            if (matchingSize) {
                                newVariant = matchingSize;
                            }
                        }

                        currentVariant = newVariant;
                        currentImageIndex = 0; // Reset to first mockup of new color

                        // Rebuild the gallery with new variant's mockups
                        rebuildModalGallery();

                        updateModalPrice();
                        updateVariantAvailability();
                        updateSizeDropdown();
                    }
                }
            });
        });

        // Handle size dropdown changes
        attachSizeSelectListener();

        // Keep old variant-select for products without sizes
        const variantSelect = modalBody.querySelector('#variant-select');
        if (variantSelect) {
            variantSelect.addEventListener('change', () => {
                const selectedId = variantSelect.value;
                const variants = currentModalProduct?.variants || [];
                const selectedVariant = findVariantById(selectedId, variants);
                if (selectedVariant) {
                    currentVariant = selectedVariant;
                    updateModalPrice();
                    updateVariantAvailability();
                    updateModalGallery();
                }
            });
            if (currentVariant) {
                variantSelect.value = String(currentVariant.id);
            }
        }

        const quantitySelect = modalBody.querySelector('#product-quantity');

        const addToCartButton = modalBody.querySelector('#modal-add-cart-btn');
        if (addToCartButton) {
            addToCartButton.addEventListener('click', () => {
                const quantity = parseInt(quantitySelect.value, 10) || 1;
                if (!currentVariant || currentVariant.isEnabled === false) {
                    return;
                }
                addItemToCart(product, currentVariant, quantity);
                closeProductModal();
                openCart();
            });
        }

        const continueButton = modalBody.querySelector('#modal-continue-shopping');
        if (continueButton) {
            continueButton.addEventListener('click', closeProductModal);
        }
    }

    function updateModalPrice() {
        const priceDisplays = [
            modalBody.querySelector('#modal-price-display'),
            modalBody.querySelector('#modal-price-display-mobile')
        ].filter(Boolean);
        if (priceDisplays.length === 0 || !currentVariant) {
            return;
        }
        const fallbackPrice = toNumeric(currentModalProduct?.priceRange?.min, 0);
        const basePriceAud = toNumeric(currentVariant.retailPrice, fallbackPrice);
        const currency = ensureSupportedCurrency(state.currency);
        const convertedPrice = convertPrice(basePriceAud, currency);
        const priceHTML = `<span class="price-current">${formatCurrency(convertedPrice, currency)}</span>`;
        priceDisplays.forEach(display => {
            display.innerHTML = priceHTML;
        });
    }

    function updateVariantAvailability() {
        const availability = modalBody.querySelector('#availability-status');
        const addToCartButton = modalBody.querySelector('#modal-add-cart-btn');
        if (!availability || !addToCartButton) {
            return;
        }

        if (!currentVariant || currentVariant.isEnabled === false || !currentVariant.catalogVariantId) {
            availability.textContent = 'Unavailable';
            addToCartButton.disabled = true;
            return;
        }

        availability.textContent = 'In Stock';
        addToCartButton.disabled = false;
    }

    function updateModalGallery() {
        const galleryContainer = modalBody.querySelector('.modal-left');
        if (galleryContainer && currentModalProduct) {
            const galleryHTML = buildImageGallery(currentModalProduct, currentVariant);
            galleryContainer.innerHTML = galleryHTML;
        }
    }

    function rebuildModalGallery() {
        const galleryContainer = modalBody.querySelector('.modal-gallery');
        if (galleryContainer && currentModalProduct) {
            const galleryHTML = buildImageGallery(currentModalProduct, currentVariant);
            galleryContainer.outerHTML = galleryHTML;

            // Re-attach event listeners for the new gallery
            const galleryNavButtons = modalBody.querySelectorAll('.gallery-nav');
            galleryNavButtons.forEach(button => {
                button.addEventListener('click', () => {
                    const direction = parseInt(button.getAttribute('data-direction'), 10);
                    navigateGallery(direction);
                });
            });

            const thumbnailButtons = modalBody.querySelectorAll('.thumbnail');
            thumbnailButtons.forEach(button => {
                button.addEventListener('click', () => {
                    const variantId = button.getAttribute('data-variant-id');

                    if (variantId && currentModalProduct) {
                        const variants = currentModalProduct.variants || [];
                        const clickedVariant = variants.find(v => areVariantIdsEqual(v.id, variantId));

                        if (clickedVariant) {
                            const sameColorVariants = variants.filter(v => v.imageUrl === clickedVariant.imageUrl);
                            let newVariant = clickedVariant;

                            if (currentVariant && currentVariant.optionLabel && currentVariant.optionLabel.includes('/')) {
                                const currentSize = currentVariant.optionLabel.split('/').pop().trim();
                                const matchingSize = sameColorVariants.find(v => {
                                    const label = v.optionLabel || '';
                                    return label.includes('/') && label.split('/').pop().trim() === currentSize;
                                });
                                if (matchingSize) {
                                    newVariant = matchingSize;
                                }
                            }

                            currentVariant = newVariant;
                            currentImageIndex = 0;

                            rebuildModalGallery();
                            updateModalPrice();
                            updateVariantAvailability();
                            updateSizeDropdown();
                        }
                    }
                });
            });
        }
    }

    function updateSizeDropdown() {
        if (!currentModalProduct) {
            return;
        }

        const variants = currentModalProduct.variants || [];
        const variantHTML = buildVariantSelection(currentModalProduct, variants);
        const hasContent = typeof variantHTML === 'string' && variantHTML.trim().length > 0;

        const variantContainer = modalBody.querySelector('.modal-variant-selection');
        if (!variantContainer) {
            if (!hasContent) {
                return;
            }

            const containerParent = modalBody.querySelector('.size-quantity-container');
            if (!containerParent) {
                return;
            }

            containerParent.insertAdjacentHTML('afterbegin', variantHTML);
            attachSizeSelectListener();
            return;
        }

        if (!hasContent) {
            variantContainer.innerHTML = '';
            return;
        }

        variantContainer.outerHTML = variantHTML;
        attachSizeSelectListener();
    }

    function navigateGallery(direction) {
        if (!currentModalProduct || !currentVariant) {
            return;
        }

        // Get mockup images for CURRENT variant only
        let images = [];
        if (currentVariant.imageUrls && currentVariant.imageUrls.length > 0) {
            images = currentVariant.imageUrls.map((url, index) => ({
                url: url,
                altText: `${currentModalProduct.name} - ${getVariantColorName(currentVariant)} - View ${index + 1}`,
                variantId: currentVariant.id,
                baseVariant: currentVariant
            }));
        } else if (currentVariant.imageUrl) {
            images = [{
                url: currentVariant.imageUrl,
                altText: `${currentModalProduct.name} - ${getVariantColorName(currentVariant)}`,
                variantId: currentVariant.id,
                baseVariant: currentVariant
            }];
        }
        
        if (images.length === 0 && currentModalProduct.images && currentModalProduct.images.length > 0) {
            images = currentModalProduct.images.map(img => ({...img, variantId: null, baseVariant: null}));
        } else if (images.length === 0 && currentModalProduct.thumbnailUrl) {
            images = [{ url: currentModalProduct.thumbnailUrl, altText: currentModalProduct.name, variantId: null, baseVariant: null }];
        }
        
        images = images.filter(image => image.url);

        if (images.length <= 1) {
            return;
        }

        currentImageIndex += direction;
        if (currentImageIndex < 0) {
            currentImageIndex = images.length - 1;
        } else if (currentImageIndex >= images.length) {
            currentImageIndex = 0;
        }

        // Just update the image display (no variant switching)
        updateGalleryDisplay(images);
    }

    function setActiveImage(index) {
        if (!currentModalProduct) {
            return;
        }

        // Get ALL unique images from all variants (same logic as buildImageGallery)
        const variants = currentModalProduct.variants || [];
        let images = [];
        let seenUrls = new Set();

        variants.forEach(v => {
            const mockups = v.imageUrls && v.imageUrls.length > 0 ? v.imageUrls : (v.imageUrl ? [v.imageUrl] : []);

            mockups.forEach(mockupUrl => {
                if (mockupUrl && !seenUrls.has(mockupUrl)) {
                    seenUrls.add(mockupUrl);
                    images.push({
                        url: mockupUrl,
                        altText: `${currentModalProduct.name} - ${getVariantColorName(v) || 'Variant'}`,
                        variantId: v.id,
                        baseVariant: v
                    });
                }
            });
        });
        
        if (images.length === 0 && currentModalProduct.images && currentModalProduct.images.length > 0) {
            images = currentModalProduct.images.map(img => ({...img, variantId: null, baseVariant: null}));
        } else if (images.length === 0 && currentModalProduct.thumbnailUrl) {
            images = [{ url: currentModalProduct.thumbnailUrl, altText: currentModalProduct.name, variantId: null, baseVariant: null }];
        }
        
        images = images.filter(image => image.url);

        if (index < 0 || index >= images.length) {
            return;
        }

        currentImageIndex = index;
        updateGalleryDisplay(images);
    }

    function updateGalleryDisplay(images) {
        const mainImage = modalBody.querySelector('#modal-main-image');
        const thumbnails = modalBody.querySelectorAll('.thumbnail');
        const image = images[currentImageIndex];

        if (mainImage && image) {
            mainImage.src = image.url;
            mainImage.alt = image.altText || currentModalProduct?.name || 'Product image';
        }

        if (image) {
            const colorNameElement = modalBody.querySelector('#selected-color-name');
            if (colorNameElement) {
                colorNameElement.textContent = getVariantColorName(image.baseVariant) || colorNameElement.textContent || 'Variant';
            }
        }

        thumbnails.forEach((thumb, index) => {
            thumb.classList.toggle('active', index === currentImageIndex);
        });
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

        if (lowered === 'default' || lowered === 'preview') {
            return null;
        }
        return lowered;
    }

    function sanitisePlacementLayers(placements) {
        if (!Array.isArray(placements)) {
            return [];
        }

        return placements
            .filter(entry => entry && typeof entry === 'object' && (typeof entry.placement === 'string' || typeof entry.type === 'string'))
            .map(entry => {
                const placement = normalisePlacementValue(entry.placement)
                    || normalisePlacementValue(entry.type)
                    || (typeof entry.placement === 'string' ? entry.placement.trim() : null)
                    || (typeof entry.type === 'string' ? entry.type.trim() : null);

                const layers = Array.isArray(entry.layers)
                    ? entry.layers
                        .filter(layer => layer && typeof layer === 'object' && (layer.file_id || layer.id || layer.url))
                        .map(layer => ({
                            type: layer.type || 'file',
                            file_id: layer.file_id || layer.id || undefined,
                            url: layer.url || layer.preview_url || layer.thumbnail_url || undefined
                        }))
                    : [];

                const techniqueCandidates = [];

                if (typeof entry.technique === 'string' && entry.technique.trim()) {
                    techniqueCandidates.push(entry.technique.trim());
                }

                if (Array.isArray(entry.techniques)) {
                    entry.techniques.forEach(tech => {
                        if (typeof tech === 'string' && tech.trim()) {
                            techniqueCandidates.push(tech.trim());
                        }
                    });
                }

                if (typeof entry.defaultTechnique === 'string' && entry.defaultTechnique.trim()) {
                    techniqueCandidates.push(entry.defaultTechnique.trim());
                }

                const uniqueTechniques = Array.from(new Set(techniqueCandidates));
                const technique = uniqueTechniques[0] || null;

                const payload = {
                    placement,
                    technique,
                    layers
                };

                if (uniqueTechniques.length > 0) {
                    payload.techniques = uniqueTechniques;
                }

                return payload;
            })
            .filter(entry => entry.placement && entry.layers.length > 0);
    }

    function sanitiseOrderFiles(files) {
        if (!Array.isArray(files)) {
            return [];
        }

        return files
            .filter(file => file && typeof file === 'object' && typeof file.type === 'string')
            .map(file => {
                const placement = normalisePlacementValue(file.placement)
                    || normalisePlacementValue(file.type)
                    || (typeof file.type === 'string' ? file.type.trim().toLowerCase() : null)
                    || 'front';

                const url = file.url || file.preview_url || file.thumbnail_url;

                return {
                    type: placement,
                    file_id: file.file_id || file.id || undefined,
                    url: url || undefined
                };
            })
            .filter(file => file.type && (file.file_id || file.url));
    }

    function addItemToCart(product, variant, quantity) {
        const variantKey = String(variant.id);
        const existing = state.cart.find(item => String(item.variantId) === variantKey);
        
        // Store price in the CURRENT DISPLAY CURRENCY that the customer is shopping in
        // This currency will be passed to Printful for quote and Stripe for payment
        const basePriceAud = toNumeric(variant.retailPrice, toNumeric(product.priceRange?.min, 0));
        const currency = ensureSupportedCurrency(state.currency);
        const price = convertPrice(basePriceAud, currency);
        
        const image = variant.imageUrl || product.thumbnailUrl || (product.images && product.images[0]?.url) || null;
        const placements = sanitisePlacementLayers(variant.placements);
        const orderFiles = sanitiseOrderFiles(variant.orderFiles);
        const defaultTechnique = typeof variant.defaultTechnique === 'string' && variant.defaultTechnique.trim()
            ? variant.defaultTechnique.trim()
            : null;
        const availableTechniques = Array.isArray(variant.availableTechniques)
            ? Array.from(new Set(variant.availableTechniques.filter(tech => typeof tech === 'string' && tech.trim()).map(tech => tech.trim())))
            : [];

        if (existing) {
            existing.quantity += quantity;
            existing.basePriceAud = toNumeric(existing.basePriceAud, basePriceAud);
            existing.currency = currency;
            existing.price = convertPrice(existing.basePriceAud, currency);
            if (!existing.placements?.length && placements.length) {
                existing.placements = placements;
            }
            if (!existing.orderFiles?.length && orderFiles.length) {
                existing.orderFiles = orderFiles;
            }
            if (!existing.defaultTechnique && defaultTechnique) {
                existing.defaultTechnique = defaultTechnique;
            }
            if ((!existing.availableTechniques || existing.availableTechniques.length === 0) && availableTechniques.length > 0) {
                existing.availableTechniques = availableTechniques;
            }
        } else {
            state.cart.push({
                productId: product.id,
                productName: product.name,
                productPrintfulId: product.printfulId || null,
                variantId: variantKey,
                catalogVariantId: variant.catalogVariantId,
                quantity,
                basePriceAud,
                price, // Store in customer's chosen currency
                currency, // Store customer's chosen currency
                image,
                variantName: variant.optionLabel || variant.name || 'Variant',
                printfulVariantId: variant.printfulVariantId,
                placements,
                orderFiles,
                defaultTechnique,
                availableTechniques
            });
        }

        persistCart();
        updateCartUI();
    }

    function removeCartItem(variantId) {
        state.cart = state.cart.filter(item => String(item.variantId) !== String(variantId));
        persistCart();
        updateCartUI();
    }

    function updateCartItemQuantity(variantId, quantity) {
        const item = state.cart.find(cartItem => String(cartItem.variantId) === String(variantId));
        if (!item) {
            return;
        }

        item.quantity = Math.max(1, quantity);
        persistCart();
        updateCartUI();
    }

    function calculateCartTotals() {
        // Cart items are already stored in the customer's chosen currency
        // Just sum them up directly (no conversion needed)
        const subtotal = state.cart.reduce((total, item) => total + item.price * item.quantity, 0);
        const totalQuantity = state.cart.reduce((total, item) => total + item.quantity, 0);
        
        // Use currency from first cart item, or current state currency
        const currency = ensureSupportedCurrency(state.cart.length > 0
            ? state.cart[0].currency
            : state.currency);

        return { subtotal, totalQuantity, currency };
    }

    function updateCartUI() {
        if (!cartItemsContainer || !cartCount || !cartEmptyState || !cartFooter) {
            return;
        }

        const { subtotal, totalQuantity, currency } = calculateCartTotals();

        cartCount.textContent = String(totalQuantity);

        if (state.cart.length === 0) {
            cartItemsContainer.innerHTML = '';
            cartEmptyState.style.display = 'block';
            cartFooter.style.display = 'none';
            if (cartSubtotal) {
                cartSubtotal.textContent = formatCurrency(0, currency);
            }
            return;
        }

        cartEmptyState.style.display = 'none';
        cartFooter.style.display = 'block';

        cartItemsContainer.innerHTML = state.cart.map(item => {
            // Item price is already in the customer's chosen currency (stored when added to cart)
            // Use item.currency to show the correct currency symbol
            const itemCurrency = ensureSupportedCurrency(item.currency || state.currency);

            return `
            <div class="cart-item" data-variant-id="${item.variantId}">
                <div class="cart-item-image">
                    ${item.image ? `<img src="${item.image}" alt="${item.productName}">` : '<div class="no-image">No Image</div>'}
                </div>
                <div class="cart-item-info">
                    <div class="cart-item-title">${item.productName}</div>
                    <div class="variant-title">${item.variantName}</div>
                    <div class="cart-item-price">${formatCurrency(item.price, itemCurrency)}</div>
                </div>
                <div class="cart-item-controls">
                    <div class="quantity-controls">
                        <button type="button" class="cart-qty" data-variant="${item.variantId}" data-adjust="-1">-</button>
                        <span>${item.quantity}</span>
                        <button type="button" class="cart-qty" data-variant="${item.variantId}" data-adjust="1">+</button>
                    </div>
                    <button type="button" class="remove-item" data-remove="${item.variantId}">×</button>
                </div>
            </div>
            `;
        }).join('');

        if (cartSubtotal) {
            cartSubtotal.textContent = formatCurrency(subtotal, currency);
        }

        cartItemsContainer.querySelectorAll('.cart-qty').forEach(button => {
            button.addEventListener('click', () => {
                const variantId = button.getAttribute('data-variant');
                const adjust = parseInt(button.getAttribute('data-adjust'), 10);
                const item = state.cart.find(cartItem => String(cartItem.variantId) === String(variantId));
                if (!item) {
                    return;
                }
                updateCartItemQuantity(variantId, item.quantity + adjust);
            });
        });

        cartItemsContainer.querySelectorAll('.remove-item').forEach(button => {
            button.addEventListener('click', () => {
                const variantId = button.getAttribute('data-remove');
                removeCartItem(variantId);
            });
        });
    }

    function persistCart() {
        try {
            sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state.cart));
        } catch (error) {
            console.warn('Shop: Unable to persist cart storage', error);
        }

        persistCheckoutSummary();
    }

    function persistCheckoutSummary() {
        const { subtotal, totalQuantity, currency } = calculateCartTotals();
        const lines = state.cart.map(item => ({
            id: item.variantId,
            quantity: item.quantity,
            title: item.productName,
            variantTitle: item.variantName,
            price: {
                amount: (item.price ?? 0).toFixed(2),
                currencyCode: ensureSupportedCurrency(item.currency || currency)
            },
            image: item.image ? { url: item.image, altText: `${item.productName} - ${item.variantName}` } : null,
            printfulCatalogVariantId: item.catalogVariantId,
            printfulVariantId: item.printfulVariantId,
            catalogVariantId: item.catalogVariantId,
            defaultTechnique: item.defaultTechnique || null,
            availableTechniques: item.availableTechniques && item.availableTechniques.length ? item.availableTechniques : [],
            printful: {
                catalogVariantId: item.catalogVariantId,
                variantId: item.printfulVariantId || item.catalogVariantId,
                variantName: item.variantName,
                productId: item.productPrintfulId || null,
                placements: item.placements && item.placements.length ? item.placements : undefined,
                files: item.orderFiles && item.orderFiles.length ? item.orderFiles : undefined,
                defaultTechnique: item.defaultTechnique || undefined,
                availableTechniques: item.availableTechniques && item.availableTechniques.length ? item.availableTechniques : undefined
            },
            placements: item.placements && item.placements.length ? item.placements : undefined,
            files: item.orderFiles && item.orderFiles.length ? item.orderFiles : undefined
        }));

        const summary = {
            cartId: 'printful_local_cart',
            totalQuantity,
            cost: {
                subtotalAmount: { amount: subtotal.toFixed(2), currencyCode: currency },
                totalAmount: { amount: subtotal.toFixed(2), currencyCode: currency }
            },
            lines,
            updatedAt: new Date().toISOString()
        };

        try {
            sessionStorage.setItem(CHECKOUT_STORAGE_KEY, JSON.stringify(summary));
        } catch (error) {
            console.warn('Shop: Unable to persist checkout summary', error);
        }
    }

    function loadCartFromStorage() {
        try {
            const stored = sessionStorage.getItem(CART_STORAGE_KEY);
            if (!stored) {
                return [];
            }
            const parsed = JSON.parse(stored);
            if (!Array.isArray(parsed)) {
                return [];
            }
            return parsed
                .filter(item => item && item.variantId && item.catalogVariantId)
                .map(item => {
                    const currency = ensureSupportedCurrency(item.currency || DEFAULT_CURRENCY);
                    const basePriceAud = resolveStoredBasePrice(item);
                    const price = convertPrice(basePriceAud, currency);

                    return {
                        ...item,
                        basePriceAud,
                        price,
                        currency,
                        variantId: String(item.variantId),
                        placements: sanitisePlacementLayers(item.placements),
                        orderFiles: sanitiseOrderFiles(item.orderFiles),
                        defaultTechnique: typeof item.defaultTechnique === 'string' && item.defaultTechnique.trim()
                            ? item.defaultTechnique.trim()
                            : null,
                        availableTechniques: Array.isArray(item.availableTechniques)
                            ? Array.from(new Set(item.availableTechniques
                                .filter(tech => typeof tech === 'string' && tech.trim())
                                .map(tech => tech.trim())))
                            : []
                    };
                });
        } catch (error) {
            console.warn('Shop: Unable to read stored cart', error);
            return [];
        }
    }

    function repriceCart(targetCurrency) {
        if (!Array.isArray(state.cart) || state.cart.length === 0) {
            persistCart();
            updateCartUI();
            return;
        }

        const currency = ensureSupportedCurrency(targetCurrency);

        state.cart = state.cart.map(item => {
            const basePriceAud = resolveStoredBasePrice(item, item.basePriceAud ?? 0);
            const price = convertPrice(basePriceAud, currency);

            return {
                ...item,
                basePriceAud,
                price,
                currency
            };
        });

        persistCart();
        updateCartUI();
    }

    function toggleCart(forceOpen = null) {
        if (!cartSidebar || !cartOverlay) {
            return;
        }

        const isOpen = cartSidebar.classList.contains('open');
        const shouldOpen = forceOpen === null ? !isOpen : forceOpen;

        if (shouldOpen) {
            cartSidebar.classList.add('open');
            cartOverlay.style.display = 'block';
            document.body.style.overflow = 'hidden';
        } else {
            cartSidebar.classList.remove('open');
            cartOverlay.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    }

    function openCart() {
        toggleCart(true);
    }

    function proceedToCheckout() {
        if (state.cart.length === 0) {
            alert('Add items to your cart before proceeding to checkout.');
            return;
        }

        persistCheckoutSummary();
        window.location.href = '/checkout.html';
    }

    function restoreSortSelection() {
        if (!sortSelect) {
            return;
        }

        sortSelect.value = state.sortBy;
        sortSelect.addEventListener('change', event => {
            applySorting(event.target.value);
        });
    }

    function initialiseCurrencySelector() {
        const currencySelect = document.getElementById('currency-select');
        if (!currencySelect) {
            return;
        }

        // Load saved currency preference
        const savedCurrency = loadCurrencyPreference();
        state.currency = savedCurrency;
        currencySelect.value = savedCurrency;
        repriceCart(state.currency);

        // Handle currency change
        currencySelect.addEventListener('change', event => {
            const newCurrency = ensureSupportedCurrency(event.target.value);
            if (newCurrency !== event.target.value) {
                event.target.value = newCurrency;
            }

            state.currency = newCurrency;
            saveCurrencyPreference(newCurrency);

            repriceCart(newCurrency);

            // Re-render products with new currency
            renderProducts(state.filteredProducts);

            // Update modal if open
            updateModalPrice();
        });
    }

    function initialiseShop() {
        showLoadingState();

        state.currency = loadCurrencyPreference();
        state.cart = loadCartFromStorage();
        repriceCart(state.currency);

        // Fetch exchange rates first, then load products
        fetchExchangeRates()
            .then(() => {
                return fetchPrintfulCatalog();
            })
            .then(products => {
                state.products = products;
                state.categories = deriveCategories(products);
                renderCategoryFilters();
                applyFilters();
                restoreSortSelection();
                initialiseCurrencySelector();
            })
            .catch(error => {
                console.error('Shop: Failed to load catalog', error);
                showErrorState();
            });
    }

    document.addEventListener('DOMContentLoaded', initialiseShop);

    window.toggleCart = toggleCart;
    window.proceedToCheckout = proceedToCheckout;
    window.closeProductModal = closeProductModal;

    cartOverlay?.addEventListener('click', () => toggleCart(false));
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && productModal?.style.display === 'block') {
            closeProductModal();
        }
    });

    productModal?.addEventListener('click', event => {
        if (event.target.classList.contains('modal-overlay')) {
            closeProductModal();
        }
    });
})();
