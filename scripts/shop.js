(function () {
    'use strict';

    const CHECKOUT_STORAGE_KEY = 'motocoach_checkout';
    const CART_STORAGE_KEY = 'motocoach_shop_cart';
    const DEFAULT_CURRENCY = 'AUD';

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
            const priceRange = product.priceRange || { min: 0, max: 0, currency: state.currency };
            const priceLabel = priceRange.hasMultiplePrices
                ? formatCurrency(priceRange.min, priceRange.currency, { prefixFrom: true })
                : formatCurrency(priceRange.min, priceRange.currency);

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

    function buildImageGallery(product) {
        const images = product.images && product.images.length > 0 ? product.images : [
            { url: product.thumbnailUrl, altText: product.name }
        ].filter(image => image.url);

        if (images.length === 0) {
            return '<div class="no-image">No image available</div>';
        }

        if (images.length === 1) {
            return `
                <img id="modal-main-image" src="${images[0].url}" alt="${images[0].altText || product.name}" loading="lazy">
            `;
        }

        const thumbnails = images.map((image, index) => `
            <button class="thumbnail ${index === 0 ? 'active' : ''}" data-index="${index}" type="button">
                <img src="${image.url}" alt="${image.altText || product.name}" loading="lazy">
            </button>
        `).join('');

        return `
            <div class="modal-gallery">
                <div class="main-image-container">
                    <button class="gallery-nav gallery-prev" data-direction="-1" type="button" aria-label="Previous image">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                        </svg>
                    </button>
                    <img id="modal-main-image" src="${images[0].url}" alt="${images[0].altText || product.name}" loading="lazy">
                    <button class="gallery-nav gallery-next" data-direction="1" type="button" aria-label="Next image">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                        </svg>
                    </button>
                </div>
                <div class="image-thumbnails">${thumbnails}</div>
            </div>
        `;
    }

    function buildVariantSelection(product, variants) {
        const availableVariants = variants.filter(variant => variant.isEnabled !== false && variant.catalogVariantId);

        if (availableVariants.length <= 1) {
            currentVariant = availableVariants[0] || null;
            return '';
        }

        const options = availableVariants.map(variant => `
            <option value="${variant.id}">${variant.optionLabel || variant.name || 'Variant'}</option>
        `).join('');

        return `
            <div class="variant-selection">
                <label for="variant-select">Select Variant</label>
                <select id="variant-select" class="variant-select">
                    ${options}
                </select>
            </div>
        `;
    }

    function buildQuantitySelector() {
        return `
            <div class="quantity-section">
                <label for="product-quantity">Quantity</label>
                <div class="quantity-controls">
                    <button type="button" class="quantity-btn" data-quantity="-1">-</button>
                    <input type="number" id="product-quantity" class="quantity-input" value="1" min="1" max="10">
                    <button type="button" class="quantity-btn" data-quantity="1">+</button>
                </div>
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
        currentImageIndex = 0;

        const price = currentVariant?.retailPrice ?? product.priceRange?.min ?? 0;
        const priceCurrency = currentVariant?.currency || product.currency || state.currency;
        const gallery = buildImageGallery(product);
        const variantSelect = buildVariantSelection(product, variants);
        const quantitySection = buildQuantitySelector();

        const description = product.description
            ? product.description.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
            : 'No description available.';

        const modalContent = `
            <div class="modal-product">
                <div class="modal-image">${gallery}</div>
                <div class="modal-info">
                    <h2>${product.name}</h2>
                    <div id="modal-price-display" class="product-price">
                        <span class="price-current">${formatCurrency(price, priceCurrency)}</span>
                    </div>
                    <div class="product-description">${description}</div>
                    ${variantSelect}
                    ${quantitySection}
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
                setActiveImage(index);
            });
        });

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
                }
            });
            if (currentVariant) {
                variantSelect.value = currentVariant.id;
            }
        }

        const quantityButtons = modalBody.querySelectorAll('.quantity-btn');
        const quantityInput = modalBody.querySelector('#product-quantity');

        quantityButtons.forEach(button => {
            button.addEventListener('click', () => {
                const delta = parseInt(button.getAttribute('data-quantity'), 10);
                const currentValue = parseInt(quantityInput.value, 10) || 1;
                const min = parseInt(quantityInput.min, 10) || 1;
                const max = parseInt(quantityInput.max, 10) || 10;
                const next = Math.min(Math.max(currentValue + delta, min), max);
                quantityInput.value = String(next);
            });
        });

        quantityInput.addEventListener('change', () => {
            const value = parseInt(quantityInput.value, 10);
            const min = parseInt(quantityInput.min, 10) || 1;
            const max = parseInt(quantityInput.max, 10) || 10;
            if (!Number.isFinite(value) || value < min) {
                quantityInput.value = String(min);
            } else if (value > max) {
                quantityInput.value = String(max);
            }
        });

        const addToCartButton = modalBody.querySelector('#modal-add-cart-btn');
        if (addToCartButton) {
            addToCartButton.addEventListener('click', () => {
                const quantity = parseInt(quantityInput.value, 10) || 1;
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
        const priceDisplay = modalBody.querySelector('#modal-price-display');
        if (!priceDisplay || !currentVariant) {
            return;
        }
        const currency = currentVariant.currency || currentModalProduct?.currency || state.currency;
        priceDisplay.innerHTML = `<span class="price-current">${formatCurrency(currentVariant.retailPrice, currency)}</span>`;
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

    function navigateGallery(direction) {
        if (!currentModalProduct) {
            return;
        }

        const images = currentModalProduct.images && currentModalProduct.images.length > 0
            ? currentModalProduct.images
            : [
                { url: currentModalProduct.thumbnailUrl, altText: currentModalProduct.name }
            ].filter(image => image.url);

        if (images.length <= 1) {
            return;
        }

        currentImageIndex += direction;
        if (currentImageIndex < 0) {
            currentImageIndex = images.length - 1;
        } else if (currentImageIndex >= images.length) {
            currentImageIndex = 0;
        }

        updateGalleryDisplay(images);
    }

    function setActiveImage(index) {
        if (!currentModalProduct) {
            return;
        }

        const images = currentModalProduct.images && currentModalProduct.images.length > 0
            ? currentModalProduct.images
            : [
                { url: currentModalProduct.thumbnailUrl, altText: currentModalProduct.name }
            ].filter(image => image.url);

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

    function addItemToCart(product, variant, quantity) {
        const existing = state.cart.find(item => item.variantId === variant.id);
        const price = Number.isFinite(variant.retailPrice) ? variant.retailPrice : product.priceRange?.min || 0;
        const currency = variant.currency || product.currency || state.currency || DEFAULT_CURRENCY;
        const image = variant.imageUrl || product.thumbnailUrl || (product.images && product.images[0]?.url) || null;

        if (existing) {
            existing.quantity += quantity;
        } else {
            state.cart.push({
                productId: product.id,
                productName: product.name,
                variantId: variant.id,
                catalogVariantId: variant.catalogVariantId,
                quantity,
                price,
                currency,
                image,
                variantName: variant.optionLabel || variant.name || 'Variant',
                printfulVariantId: variant.printfulVariantId
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
        const subtotal = state.cart.reduce((total, item) => total + item.price * item.quantity, 0);
        const totalQuantity = state.cart.reduce((total, item) => total + item.quantity, 0);
        const currency = state.cart[0]?.currency || state.currency || DEFAULT_CURRENCY;

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

        cartItemsContainer.innerHTML = state.cart.map(item => `
            <div class="cart-item" data-variant-id="${item.variantId}">
                <div class="cart-item-image">
                    ${item.image ? `<img src="${item.image}" alt="${item.productName}">` : '<div class="no-image">No Image</div>'}
                </div>
                <div class="cart-item-info">
                    <div class="cart-item-title">${item.productName}</div>
                    <div class="variant-title">${item.variantName}</div>
                    <div class="cart-item-price">${formatCurrency(item.price, item.currency)}</div>
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
        `).join('');

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
            printful: {
                catalogVariantId: item.catalogVariantId,
                variantId: item.printfulVariantId || item.catalogVariantId,
                variantName: item.variantName
            }
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
            return parsed.filter(item => item && item.variantId && item.catalogVariantId);
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

    function initialiseShop() {
        showLoadingState();

        state.cart = loadCartFromStorage();
        updateCartUI();

        fetchPrintfulCatalog()
            .then(products => {
                state.products = products;
                state.currency = products[0]?.currency || DEFAULT_CURRENCY;
                state.categories = deriveCategories(products);
                renderCategoryFilters();
                applyFilters();
                restoreSortSelection();
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
