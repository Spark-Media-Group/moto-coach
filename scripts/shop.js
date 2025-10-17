(function () {
    'use strict';

    const CHECKOUT_STORAGE_KEY = 'motocoach_checkout';
    const CART_STORAGE_KEY = 'motocoach_shop_cart';
    const CURRENCY_STORAGE_KEY = 'motocoach_currency';
    const DEFAULT_CURRENCY = 'AUD';

    // Exchange rates (base: AUD)
    // These should ideally be fetched from an API, but for now we'll use static rates
    const EXCHANGE_RATES = {
        'AUD': 1.0,
        'USD': 0.65,
        'NZD': 1.08,
        'EUR': 0.60,
        'GBP': 0.51
    };

    const state = {
        products: [],
        filteredProducts: [],
        categories: [],
        selectedCategory: 'all',
        sortBy: 'title-asc',
        cart: [],
        currency: DEFAULT_CURRENCY
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
        const numeric = typeof amount === 'number' ? amount : parseFloat(amount);
        if (!Number.isFinite(numeric)) {
            return `${currency} 0.00`;
        }

        try {
            const formatted = numeric.toLocaleString('en-AU', {
                style: 'currency',
                currency,
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
            if (prefixFrom) {
                return `From ${formatted}`;
            }
            return formatted;
        } catch (error) {
            console.warn('Shop: Unable to format currency', error);
            return `${currency} ${numeric.toFixed(2)}`;
        }
    }

    // Convert price from AUD to target currency
    function convertPrice(audPrice, targetCurrency = state.currency) {
        const rate = EXCHANGE_RATES[targetCurrency] || 1.0;
        return audPrice * rate;
    }

    // Save currency preference to localStorage
    function saveCurrencyPreference(currency) {
        try {
            localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
        } catch (e) {
            console.warn('Unable to save currency preference:', e);
        }
    }

    // Load currency preference from localStorage
    function loadCurrencyPreference() {
        try {
            const saved = localStorage.getItem(CURRENCY_STORAGE_KEY);
            return saved || DEFAULT_CURRENCY;
        } catch (e) {
            return DEFAULT_CURRENCY;
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
            
            // Convert price from AUD to selected currency
            const convertedMinPrice = convertPrice(priceRange.min, state.currency);
            const convertedMaxPrice = convertPrice(priceRange.max, state.currency);
            
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

    function buildImageGallery(product, variant = null) {
        // DEBUG: Log variant data
        console.log('[DEBUG buildImageGallery] Product:', product.name);
        console.log('[DEBUG buildImageGallery] First 3 variants:', product.variants?.slice(0, 3).map(v => ({
            id: v.id,
            name: v.optionLabel || v.name,
            imageUrl: v.imageUrl,
            hasImageUrl: !!v.imageUrl
        })));
        
        // Collect ALL UNIQUE COLOR VARIANT IMAGES (deduplicated by image URL)
        const variants = product.variants || [];
        let colorVariants = [];
        
        variants.forEach(v => {
            if (v.imageUrl) {
                // Check if we already have this image (same color, different size)
                const exists = colorVariants.some(cv => cv.imageUrl === v.imageUrl);
                if (!exists) {
                    colorVariants.push(v);
                }
            }
        });
        
        console.log('[DEBUG buildImageGallery] Found', colorVariants.length, 'unique color variants');
        
        // Build images array with variant metadata for color selection
        let images = colorVariants.map(v => ({
            url: v.imageUrl,
            altText: `${product.name} - ${v.optionLabel || v.name || 'Variant'}`,
            variantId: v.id,
            baseVariant: v // Store reference to select this color
        }));
        
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

        let html = `
            <div class="modal-gallery">
                <div class="main-image-container">
                    <img id="modal-main-image" src="${mainImage.url}" alt="${mainImage.altText || product.name}">
                    ${showNav ? `
                        <button class="gallery-nav gallery-prev" aria-label="Previous color">‹</button>
                        <button class="gallery-nav gallery-next" aria-label="Next color">›</button>
                    ` : ''}
                </div>
                
                ${images.length > 1 ? `
                    <div class="selected-variant-label">
                        <strong>CHOOSE YOUR VARIANT</strong>
                        <span class="variant-label-text" id="selected-color-name">${mainImage.baseVariant?.optionLabel || mainImage.baseVariant?.name || 'Select Color'}</span>
                    </div>
                ` : ''}
        `;

        if (images.length > 1) {
            html += '<div class="image-thumbnails">';
            images.forEach((image, index) => {
                const isActive = index === activeIndex ? 'active' : '';
                html += `
                    <button class="thumbnail ${isActive}" data-index="${index}" data-variant-id="${image.variantId || ''}" aria-label="Select color variant">
                        <img src="${image.url}" alt="${image.altText || `${product.name} color ${index + 1}`}">
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
        let html = '<div class="size-section">';
        html += '<label for="size-select">Choose Size</label>';
        html += '<select id="size-select" class="size-select">';

        sizesForCurrentColor.forEach((variant) => {
            const selected = currentVariant && currentVariant.id === variant.id ? 'selected' : '';
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

    function openProductModal(product) {
        currentModalProduct = product;
        const variants = product.variants || [];
        currentVariant = variants.find(variant => variant.id === product.defaultVariantId)
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

        const price = currentVariant?.retailPrice ?? product.priceRange?.min ?? 0;
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
                const index = parseInt(button.getAttribute('data-index'), 10);
                const variantId = button.getAttribute('data-variant-id');
                
                // Update the active thumbnail visual
                thumbnailButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                // Update main image
                setActiveImage(index);
                
                // Update the variant label text
                const colorNameElement = document.getElementById('selected-color-name');
                if (colorNameElement && currentModalProduct) {
                    const variants = currentModalProduct.variants || [];
                    const clickedVariant = variants.find(v => v.id === variantId);
                    if (clickedVariant) {
                        colorNameElement.textContent = clickedVariant.optionLabel || clickedVariant.name || 'Variant';
                    }
                }
                
                // CRITICAL: If clicking a color thumbnail, switch to a variant with that color
                if (variantId && currentModalProduct) {
                    const variants = currentModalProduct.variants || [];
                    const clickedVariant = variants.find(v => v.id === variantId);
                    
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
                        updateModalPrice();
                        updateVariantAvailability();
                        
                        // Rebuild the size dropdown for the new color
                        updateSizeDropdown();
                    }
                }
            });
        });

        // Handle size dropdown changes
        const handleSizeChange = () => {
            const sizeSelect = modalBody.querySelector('#size-select');
            if (sizeSelect) {
                const selectedId = sizeSelect.value;
                const variants = currentModalProduct?.variants || [];
                const selectedVariant = variants.find(variant => variant.id === selectedId);
                if (selectedVariant) {
                    currentVariant = selectedVariant;
                    updateModalPrice();
                    updateVariantAvailability();
                }
            }
        };

        const sizeSelect = modalBody.querySelector('#size-select');
        if (sizeSelect) {
            sizeSelect.addEventListener('change', handleSizeChange);
        }

        // Keep old variant-select for products without sizes
        const variantSelect = modalBody.querySelector('#variant-select');
        if (variantSelect) {
            variantSelect.addEventListener('change', () => {
                const selectedId = variantSelect.value;
                const variants = currentModalProduct?.variants || [];
                const selectedVariant = variants.find(variant => variant.id === selectedId);
                if (selectedVariant) {
                    currentVariant = selectedVariant;
                    updateModalPrice();
                    updateVariantAvailability();
                    updateModalGallery();
                }
            });
            if (currentVariant) {
                variantSelect.value = currentVariant.id;
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
        const currency = currentVariant.currency || currentModalProduct?.currency || state.currency;
        const priceHTML = `<span class="price-current">${formatCurrency(currentVariant.retailPrice, currency)}</span>`;
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

    function updateSizeDropdown() {
        const variantContainer = modalBody.querySelector('.modal-variant-selection');
        if (variantContainer && currentModalProduct) {
            const variants = currentModalProduct.variants || [];
            const variantHTML = buildVariantSelection(currentModalProduct, variants);
            
            if (variantHTML) {
                variantContainer.outerHTML = variantHTML;
                
                // Re-attach size dropdown listener
                const sizeSelect = modalBody.querySelector('#size-select');
                if (sizeSelect) {
                    sizeSelect.addEventListener('change', () => {
                        const selectedId = sizeSelect.value;
                        const selectedVariant = variants.find(v => v.id === selectedId);
                        if (selectedVariant) {
                            currentVariant = selectedVariant;
                            updateModalPrice();
                            updateVariantAvailability();
                        }
                    });
                }
            }
        }
    }

    function navigateGallery(direction) {
        if (!currentModalProduct) {
            return;
        }

        // Get all unique color variant images (same as buildImageGallery logic)
        const variants = currentModalProduct.variants || [];
        let colorVariants = [];
        
        variants.forEach(v => {
            if (v.imageUrl) {
                const exists = colorVariants.some(cv => cv.imageUrl === v.imageUrl);
                if (!exists) {
                    colorVariants.push(v);
                }
            }
        });
        
        let images = colorVariants.map(v => ({
            url: v.imageUrl,
            altText: `${currentModalProduct.name} - ${v.optionLabel || v.name || 'Variant'}`,
            variantId: v.id,
            baseVariant: v
        }));
        
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

        // Switch to the new color variant
        const newImage = images[currentImageIndex];
        if (newImage.baseVariant) {
            // Find variant with same color, preferring current size
            const sameColorVariants = variants.filter(v => v.imageUrl === newImage.url);
            let newVariant = newImage.baseVariant;
            
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
            updateModalPrice();
            updateVariantAvailability();
            updateSizeDropdown();
        }

        updateGalleryDisplay(images);
    }

    function setActiveImage(index) {
        if (!currentModalProduct) {
            return;
        }

        // Get all unique color variant images (same as buildImageGallery logic)
        const variants = currentModalProduct.variants || [];
        let colorVariants = [];
        
        variants.forEach(v => {
            if (v.imageUrl) {
                const exists = colorVariants.some(cv => cv.imageUrl === v.imageUrl);
                if (!exists) {
                    colorVariants.push(v);
                }
            }
        });
        
        let images = colorVariants.map(v => ({
            url: v.imageUrl,
            altText: `${currentModalProduct.name} - ${v.optionLabel || v.name || 'Variant'}`,
            variantId: v.id,
            baseVariant: v
        }));
        
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
        const existing = state.cart.find(item => item.variantId === variant.id);
        const price = Number.isFinite(variant.retailPrice) ? variant.retailPrice : product.priceRange?.min || 0;
        const currency = variant.currency || product.currency || state.currency || DEFAULT_CURRENCY;
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
                variantId: variant.id,
                catalogVariantId: variant.catalogVariantId,
                quantity,
                price,
                currency,
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
        state.cart = state.cart.filter(item => item.variantId !== variantId);
        persistCart();
        updateCartUI();
    }

    function updateCartItemQuantity(variantId, quantity) {
        const item = state.cart.find(cartItem => cartItem.variantId === variantId);
        if (!item) {
            return;
        }

        item.quantity = Math.max(1, quantity);
        persistCart();
        updateCartUI();
    }

    function calculateCartTotals() {
        // Calculate subtotal in AUD first, then convert to selected currency
        const subtotalAUD = state.cart.reduce((total, item) => total + item.price * item.quantity, 0);
        const subtotal = convertPrice(subtotalAUD, state.currency);
        const totalQuantity = state.cart.reduce((total, item) => total + item.quantity, 0);

        return { subtotal, totalQuantity, currency: state.currency };
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
            // Convert item price to selected currency
            const convertedPrice = convertPrice(item.price, state.currency);
            
            return `
            <div class="cart-item" data-variant-id="${item.variantId}">
                <div class="cart-item-image">
                    ${item.image ? `<img src="${item.image}" alt="${item.productName}">` : '<div class="no-image">No Image</div>'}
                </div>
                <div class="cart-item-info">
                    <div class="cart-item-title">${item.productName}</div>
                    <div class="variant-title">${item.variantName}</div>
                    <div class="cart-item-price">${formatCurrency(convertedPrice, state.currency)}</div>
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
                const item = state.cart.find(cartItem => cartItem.variantId === variantId);
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
                currencyCode: item.currency || currency
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
                .map(item => ({
                    ...item,
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
                }));
        } catch (error) {
            console.warn('Shop: Unable to read stored cart', error);
            return [];
        }
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

        // Handle currency change
        currencySelect.addEventListener('change', event => {
            const newCurrency = event.target.value;
            state.currency = newCurrency;
            saveCurrencyPreference(newCurrency);
            
            // Re-render products with new currency
            renderProducts(state.filteredProducts);
            updateCartUI();
            
            // Update modal if open
            if (currentModalProduct && productModal && productModal.classList.contains('active')) {
                const priceDisplay = document.getElementById('modal-price-display');
                if (priceDisplay && currentVariant) {
                    const convertedPrice = convertPrice(currentVariant.retailPrice, newCurrency);
                    priceDisplay.innerHTML = `<span class="price-current">${formatCurrency(convertedPrice, newCurrency)}</span>`;
                }
            }
        });
    }

    function initialiseShop() {
        showLoadingState();

        state.cart = loadCartFromStorage();
        updateCartUI();

        fetchPrintfulCatalog()
            .then(products => {
                state.products = products;
                // Don't override currency with Printful's currency, use user preference
                const savedCurrency = loadCurrencyPreference();
                state.currency = savedCurrency;
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
