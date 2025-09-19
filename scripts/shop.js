// Shopify Storefront API Configuration
const SHOPIFY_CONFIG = {
    endpoint: null, // Will be loaded from API
    storefrontToken: null // Will be loaded from API
};

// Global variables
let allProducts = [];
let filteredProducts = [];
let currentCategory = { kind: 'all', id: 'all', label: 'All Products' };

// New state for two-row filtering
let selectedParentId = 'all';
let selectedLeafId = null;

// Helper function to create full category path from ancestors + name
function categoryFullPath(cat) {
    if (!cat) return null;
    const parts = [...(cat.ancestors?.map(a => a.name) || []), cat.name];
    return parts.join(' > ');
}

// Helper function to get just the leaf category name
function categoryLeafName(cat) {
    if (!cat) return null;
    return cat.name; // leaf label
}

// Helper function to get parent category from ancestors
function categoryParent(cat) {
    if (!cat) return null;
    // If there are ancestors, the "parent row" should use the top-most displayed in Shopify's UI
    // Using the first ancestor gives us a stable "section" chip.
    const p = cat.ancestors && cat.ancestors.length ? cat.ancestors[0] : cat;
    return { id: p.id, name: p.name };
}

// Helper to determine the best category label for display purposes
function categoryDisplayLabel(productNode) {
    if (!productNode) return 'General';

    const category = productNode.category;
    if (category) {
        const parent = categoryParent(category);
        if (parent?.id && parent.id !== category.id && parent.name) {
            return parent.name;
        }
        if (category.name) {
            return category.name;
        }
    }

    const productType = (productNode.productType || '').trim();
    return productType || 'General';
}

// Helper function to compute pricing from all variants
function computeProductPricing(variants) {
    if (!variants || variants.length === 0) {
        return {
            price: { amount: '0', currencyCode: 'AUD' },
            compareAtPrice: null,
            hasMultiplePrices: false
        };
    }

    // Get all available variants with prices
    const availableVariants = variants.filter(v => v.availableForSale && v.price);
    const priceVariants = availableVariants.length > 0 ? availableVariants : variants.filter(v => v.price);
    
    if (priceVariants.length === 0) {
        return {
            price: { amount: '0', currencyCode: 'AUD' },
            compareAtPrice: null,
            hasMultiplePrices: false
        };
    }

    // Find min and max prices
    const prices = priceVariants.map(v => parseFloat(v.price.amount));
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    
    // Find the variant with min price for currency/compareAt info
    const minVariant = priceVariants.find(v => parseFloat(v.price.amount) === minPrice);
    
    return {
        price: minVariant.price,
        compareAtPrice: minVariant.compareAtPrice,
        hasMultiplePrices: minPrice !== maxPrice,
        priceRange: { min: minPrice, max: maxPrice }
    };
}

// Helper function to format money using proper Intl formatting
function formatMoney(price, showFrom = false) {
    if (!price || !price.amount) return '$0.00';
    
    const formatter = new Intl.NumberFormat('en-AU', {
        style: 'currency',
        currency: price.currencyCode || 'AUD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    
    const formattedPrice = formatter.format(parseFloat(price.amount));
    return showFrom ? `From ${formattedPrice}` : formattedPrice;
}

// Helper function to count products for a given filter
function countProductsForFilter(parentId, leafId = null) {
    if (parentId === 'all' && !leafId) {
        return allProducts.length;
    } else if (leafId) {
        // Leaf chosen: exact match on product.category.id
        return allProducts.filter(p => p.category?.id === leafId).length;
    } else {
        // Parent chosen: include any product whose category is the parent
        // OR whose category has that parent in its ancestors
        return allProducts.filter(p => {
            const cat = p.category;
            if (!cat?.id) return false;
            if (cat.id === parentId) return true;
            return (cat.ancestors || []).some(a => a.id === parentId);
        }).length;
    }
}

// Update results count display (supports inline version)
function updateResultsCount() {
    const total = allProducts.length;
    const filtered = filteredProducts.length;

    // Legacy container text (if still present)
    if (resultsText) {
        const legacyText = (filtered === total)
            ? `Showing all ${total} products`
            : `Showing ${filtered} of ${total} products`;
        resultsText.textContent = legacyText;
    }

    // Inline compact count
    const inlineEl = document.getElementById('results-inline');
    if (inlineEl) {
        const inlineText = (filtered === total)
            ? `All products (${total})`
            : `${filtered} of ${total}`;
        inlineEl.textContent = inlineText;
        if (filtered === total) inlineEl.classList.remove('active'); else inlineEl.classList.add('active');
    }
}

// Helper function to detect trivial single-variant products with Shopify's default "Title" option
function isDefaultTitleOnly(product) {
    // No options at all → trivial
    if (!product.options || product.options.length === 0) return true;

    // All options are the Shopify stub "Title" with only "Default Title"
    const allStub = product.options.every(o =>
        o?.name?.toLowerCase() === 'title' &&
        Array.isArray(o.values) &&
        o.values.length === 1 &&
        (o.values[0] || '').toLowerCase() === 'default title'
    );

    // Also treat as trivial if there's exactly one variant
    const singleVariant = Array.isArray(product.variants) && product.variants.length === 1;

    return allStub || singleVariant;
}

// GraphQL Queries
const SIMPLE_TEST_QUERY = `
    query GetProductsSimple($first: Int!) {
        products(first: $first) {
            edges {
                node {
                    id
                    title
                }
            }
        }
    }
`;

const PRODUCTS_QUERY = `
    query GetProducts($first: Int!) {
        products(first: $first) {
            edges {
                node {
                    id
                    title
                    description
                    handle
                    availableForSale
                    productType
                    tags
                    category {
                        id
                        name
                        ancestors { id name }
                    }
                    collections(first: 5) {
                        edges {
                            node {
                                id
                                title
                                handle
                            }
                        }
                    }
                    options {
                        id
                        name
                        values
                    }
                    variants(first: 10) {
                        edges {
                            node {
                                id
                                title
                                availableForSale
                                price {
                                    amount
                                    currencyCode
                                }
                                compareAtPrice {
                                    amount
                                    currencyCode
                                }
                                selectedOptions {
                                    name
                                    value
                                }
                            }
                        }
                    }
                    images(first: 5) {
                        edges {
                            node {
                                url
                                altText
                                width
                                height
                            }
                        }
                    }
                }
            }
        }
    }
`;

// DOM Elements
const loadingState = document.getElementById('loading-state');
const errorState = document.getElementById('error-state');
const shopControls = document.getElementById('shop-controls');
const productsGrid = document.getElementById('products-grid');
const emptyState = document.getElementById('empty-state');
const resultsCount = document.getElementById('results-count'); // legacy (removed in inline design)
const resultsText = document.getElementById('results-text');   // legacy (removed in inline design)
const sortSelect = document.getElementById('sort-select');
const productModal = document.getElementById('product-modal');

// Initialize the shop when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeShop();
});

// Initialize shop functionality
async function initializeShop() {
    try {
        showLoadingState();
        
        // Load shop configuration first
        await loadShopConfig();
        
        await fetchProducts();
        setupFilters();
        setupSorting();
        renderProducts();
        showShopContent();
    } catch (error) {
        console.error('Shop initialization error:', error);
        showErrorState();
    }
}

// Load shop configuration from API
async function loadShopConfig() {
    try {
        console.log('Loading shop configuration...');
        const response = await fetch('/api/shop?action=config');
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Config API error: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        console.log('Config response:', data);
        
        if (data.success) {
            SHOPIFY_CONFIG.storefrontToken = data.data.storefrontToken;
            SHOPIFY_CONFIG.endpoint = data.data.storeUrl + "/api/2025-07/graphql.json";
            console.log('Configuration loaded successfully:', {
                hasToken: !!SHOPIFY_CONFIG.storefrontToken,
                tokenPrefix: SHOPIFY_CONFIG.storefrontToken?.substring(0, 10) + '...',
                endpoint: SHOPIFY_CONFIG.endpoint
            });
        } else {
            throw new Error('Failed to load shop configuration: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error loading shop config:', error);
        throw error;
    }
}

// Fetch products from Shopify Storefront API
async function fetchProducts() {
    try {
        console.log('Fetching products with config:', {
            endpoint: SHOPIFY_CONFIG.endpoint,
            hasToken: !!SHOPIFY_CONFIG.storefrontToken,
            tokenLength: SHOPIFY_CONFIG.storefrontToken?.length || 0
        });
        
        // First try a simple test query to validate connection
        console.log('Testing Shopify connection with simple query...');
        const testResponse = await fetch(SHOPIFY_CONFIG.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Storefront-Access-Token': SHOPIFY_CONFIG.storefrontToken
            },
            body: JSON.stringify({
                query: SIMPLE_TEST_QUERY,
                variables: { first: 1 }
            })
        });

        if (!testResponse.ok) {
            const errorText = await testResponse.text();
            console.error('Test query failed:', errorText);
            throw new Error(`Test query failed - HTTP ${testResponse.status}: ${testResponse.statusText} — ${errorText}`);
        }
        
        const testData = await testResponse.json();
        if (testData.errors) {
            console.error('Test query GraphQL errors:', testData.errors);
            throw new Error('Test query GraphQL errors: ' + JSON.stringify(testData.errors));
        }
        
        console.log('Test query successful, fetching full product data...');
        
        // Now fetch the full product data
        const response = await fetch(SHOPIFY_CONFIG.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Storefront-Access-Token': SHOPIFY_CONFIG.storefrontToken
            },
            body: JSON.stringify({
                query: PRODUCTS_QUERY,
                variables: { first: 50 } // Adjust based on your product count
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${response.statusText} — ${errorText}`);
        }

        const data = await response.json();

        if (data.errors) {
            throw new Error('GraphQL errors: ' + JSON.stringify(data.errors));
        }

        // Process and store products
        allProducts = data.data.products.edges.map(edge => {
            const variants = edge.node.variants.edges.map(variantEdge => variantEdge.node);
            return {
                id: edge.node.id,
                title: edge.node.title,
                description: edge.node.description,
                handle: edge.node.handle,
                availableForSale: edge.node.availableForSale,
                productType: edge.node.productType || 'General',
                category: edge.node.category,
                categoryLabel: categoryDisplayLabel(edge.node),
                tags: edge.node.tags || [],
                collections: edge.node.collections.edges.map(collectionEdge => collectionEdge.node),
                options: edge.node.options || [],
                variants: variants,
                images: edge.node.images.edges.map(imageEdge => imageEdge.node),
                ...computeProductPricing(variants)
            };
        });

        filteredProducts = [...allProducts];
        
    } catch (error) {
        console.error('Error fetching products:', error);
        throw error;
    }
}

// Setup category filters
function setupFilters() {
    // Build Parent → Leaves map from product.category
    const parents = new Map();        // parentId -> { id, name }
    const leavesByParent = new Map(); // parentId -> Map(leafId -> leafName)

    for (const p of allProducts) {
        const cat = p.category;
        if (!cat?.id) continue;

        const parent = categoryParent(cat);
        if (!parent?.id) continue;

        if (!parents.has(parent.id)) parents.set(parent.id, parent);
        if (!leavesByParent.has(parent.id)) leavesByParent.set(parent.id, new Map());

        // leaf = the product's own category
        leavesByParent.get(parent.id).set(cat.id, cat.name);
    }

    // Render Row 1: parent chips
    const parentFilters = document.getElementById('parent-filters');
    const parentItems = [
        { id: 'all', name: 'All Products' },
        ...[...parents.values()].sort((a,b) => a.name.localeCompare(b.name))
    ];
    parentFilters.innerHTML = parentItems.map(p => {
        const count = countProductsForFilter(p.id);
        const isActive = p.id === selectedParentId;
        return `
            <button class="filter-btn ${isActive ? 'active' : ''}"
                    data-parent-id="${p.id}"
                    aria-pressed="${isActive}"
                    title="${p.name}">
                ${p.name} (${count})
            </button>
        `;
    }).join('');

    // Clicks on Row 1
    parentFilters.addEventListener('click', (e) => {
        const btn = e.target.closest('.filter-btn');
        if (!btn) return;
        selectedParentId = btn.dataset.parentId;
        selectedLeafId = null; // reset leaf when parent changes
        // toggle active classes and aria-pressed
        parentFilters.querySelectorAll('.filter-btn').forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        renderLeafRow(leavesByParent);
        filterProducts();
    });

    // Initial leaf row render
    renderLeafRow(leavesByParent);
}


// Row 2: render leaves for the chosen parent (or all, grouped)
function renderLeafRow(leavesByParent) {
    const leafFilters = document.getElementById('leaf-filters');

    // Hide the entire leaf row when in default 'all' state
    if (selectedParentId === 'all') {
        leafFilters.classList.remove('enter');
        leafFilters.classList.add('hidden');
        leafFilters.innerHTML = '';
        return;
    }

    // We have a parent selected: show container with animation
    leafFilters.classList.remove('hidden');
    // force reflow to restart animation if needed
    void leafFilters.offsetWidth;
    leafFilters.classList.add('enter');

    const m = leavesByParent.get(selectedParentId) || new Map();
    const leaves = [...m.entries()].sort((a,b) => a[1].localeCompare(b[1]));
    const parentName = [...allProducts].find(p => p.category?.id === selectedParentId)?.category?.name ||
                      [...allProducts].find(p => p.category?.ancestors?.some(a => a.id === selectedParentId))?.category?.ancestors?.find(a => a.id === selectedParentId)?.name ||
                      'Parent';

    // Cap leaves, add More… expander if necessary
    const MAX_VISIBLE = 6; // includes the "All in" chip? We'll keep All chip separate
    let expanded = leafFilters.dataset.expanded === 'true';

    const allInParentChip = `
        <button class="filter-btn ${!selectedLeafId ? 'active' : ''}"
                data-leaf-id=""
                aria-pressed="${!selectedLeafId}"
                title="Show all products in ${parentName}">
            All in ${parentName} (${countProductsForFilter(selectedParentId)})
        </button>
    `;

    let visibleLeaves = leaves;
    let overflowLeaves = [];
    if (leaves.length > MAX_VISIBLE && !expanded) {
        visibleLeaves = leaves.slice(0, MAX_VISIBLE - 1); // leave room for More…
        overflowLeaves = leaves.slice(MAX_VISIBLE - 1);
    }

    const leafChipsHtml = visibleLeaves.map(([id, name]) => {
        const count = countProductsForFilter(selectedParentId, id);
        const isActive = id === selectedLeafId;
        return `
            <button class="filter-btn ${isActive ? 'active' : ''}"
                    data-leaf-id="${id}" 
                    aria-pressed="${isActive}"
                    title="${name}">
                ${name} (${count})
            </button>
        `;
    }).join('');

    const moreChip = (!expanded && overflowLeaves.length) ? `
        <button class="filter-btn more-chip" data-more="true" aria-expanded="false" title="Show more categories">
            More… (${overflowLeaves.length})
        </button>
    ` : '';

    const overflowHtml = (expanded ? overflowLeaves : []).map(([id, name]) => {
        const count = countProductsForFilter(selectedParentId, id);
        const isActive = id === selectedLeafId;
        return `
            <button class="filter-btn ${isActive ? 'active' : ''}"
                    data-leaf-id="${id}" 
                    aria-pressed="${isActive}"
                    title="${name}">
                ${name} (${count})
            </button>
        `;
    }).join('');

    leafFilters.innerHTML = allInParentChip + leafChipsHtml + moreChip + overflowHtml;

    // Click handling
    leafFilters.onclick = (e) => {
        const moreBtn = e.target.closest('[data-more]');
        if (moreBtn) {
            leafFilters.dataset.expanded = 'true';
            renderLeafRow(leavesByParent);
            return;
        }
        const btn = e.target.closest('.filter-btn');
        if (!btn || btn.hasAttribute('data-more')) return;
        const clickedId = btn.dataset.leafId;
        selectedLeafId = (selectedLeafId === clickedId) ? null : clickedId;

        leafFilters.querySelectorAll('.filter-btn').forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-pressed', 'false');
        });
        if (selectedLeafId) {
            btn.classList.add('active');
            btn.setAttribute('aria-pressed', 'true');
        } else {
            const allInParentBtn = leafFilters.querySelector('[data-leaf-id=""]');
            if (allInParentBtn) {
                allInParentBtn.classList.add('active');
                allInParentBtn.setAttribute('aria-pressed', 'true');
            }
        }
        filterProducts();
    };
}

// Setup sorting functionality
function setupSorting() {
    sortSelect.addEventListener('change', (e) => {
        sortProducts(e.target.value);
    });
}

// Filter products by category
function filterProducts() {
    // Nothing selected → show all
    if (selectedParentId === 'all' && !selectedLeafId) {
        filteredProducts = [...allProducts];
    } else if (selectedLeafId) {
        // Leaf chosen: exact match on product.category.id
        filteredProducts = allProducts.filter(p => p.category?.id === selectedLeafId);
    } else {
        // Parent chosen: include any product whose category is the parent
        // OR whose category has that parent in its ancestors
        filteredProducts = allProducts.filter(p => {
            const cat = p.category;
            if (!cat?.id) return false;
            if (cat.id === selectedParentId) return true;
            return (cat.ancestors || []).some(a => a.id === selectedParentId);
        });
    }

    // keep your sorting behavior
    sortProducts(sortSelect.value);

    renderActiveFilterBreadcrumbs();
}

function renderActiveFilterBreadcrumbs() {
    const container = document.getElementById('active-filter-breadcrumbs');
    if (!container) return;
    const hasParent = selectedParentId !== 'all';
    const hasLeaf = !!selectedLeafId;
    if (!hasParent && !hasLeaf) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    let parentName = '';
    if (hasParent) {
        parentName = [...allProducts].find(p => p.category?.id === selectedParentId)?.category?.name ||
                     [...allProducts].find(p => p.category?.ancestors?.some(a => a.id === selectedParentId))?.category?.ancestors?.find(a => a.id === selectedParentId)?.name || 'Category';
    }
    let leafName = '';
    if (hasLeaf) {
        const prodWithLeaf = allProducts.find(p => p.category?.id === selectedLeafId);
        leafName = prodWithLeaf?.category?.name || 'Subcategory';
    }

    const parts = [];
    if (hasParent) {
        parts.push(`<button data-bc="parent"><span class="x">×</span>${parentName}</button>`);
    }
    if (hasLeaf) {
        parts.push(`<button data-bc="leaf"><span class="x">×</span>${leafName}</button>`);
    }

    container.innerHTML = `<span class="crumb-label">Active:</span> ${parts.join('')}`;
    container.style.display = 'flex';

    container.onclick = (e) => {
        const btn = e.target.closest('button[data-bc]');
        if (!btn) return;
        const type = btn.getAttribute('data-bc');
        if (type === 'leaf') {
            selectedLeafId = null;
        } else if (type === 'parent') {
            selectedParentId = 'all';
            selectedLeafId = null;
            // reset expanded state
            const lf = document.getElementById('leaf-filters');
            if (lf) lf.dataset.expanded = 'false';
        }
        setupFilters();
        filterProducts();
    };
}

// Sort products
function sortProducts(sortBy) {
    switch (sortBy) {
        case 'title-asc':
            filteredProducts.sort((a, b) => a.title.localeCompare(b.title));
            break;
        case 'title-desc':
            filteredProducts.sort((a, b) => b.title.localeCompare(a.title));
            break;
        case 'price-asc':
            filteredProducts.sort((a, b) => parseFloat(a.price.amount) - parseFloat(b.price.amount));
            break;
        case 'price-desc':
            filteredProducts.sort((a, b) => parseFloat(b.price.amount) - parseFloat(a.price.amount));
            break;
    }
    
    renderProducts();
}

// Render products to the grid
function renderProducts() {
    // Update results count
    updateResultsCount();
    
    if (filteredProducts.length === 0) {
        showEmptyState();
        return;
    }

    // Hide empty state and show products
    emptyState.style.display = 'none';
    productsGrid.style.display = 'grid';
    if (resultsCount) resultsCount.style.display = 'block';

    const productsHTML = filteredProducts.map(product => createProductCard(product)).join('');
    productsGrid.innerHTML = productsHTML;
    
    // Add click listeners to product cards
    document.querySelectorAll('.product-card').forEach(card => {
        card.addEventListener('click', () => {
            const productId = card.dataset.productId;
            const product = allProducts.find(p => p.id === productId);
            if (product) {
                openProductModal(product);
            }
        });
    });
}

// Create HTML for a product card
function createProductCard(product) {
    const primaryImage = product.images[0];
    const price = parseFloat(product.price.amount);
    const compareAtPrice = product.compareAtPrice ? parseFloat(product.compareAtPrice.amount) : null;
    const isOnSale = compareAtPrice && compareAtPrice > price;
    
    return `
        <div class="product-card" data-product-id="${product.id}">
            <div class="product-image">
                ${primaryImage ? 
                    `<img src="${primaryImage.url}" alt="${primaryImage.altText || product.title}" loading="lazy">` :
                    `<div class="no-image">No Image</div>`
                }
                ${isOnSale ? '<div class="sale-badge">Sale</div>' : ''}
                ${!product.availableForSale ? '<div class="product-sold-out-badge">Sold Out</div>' : ''}
            </div>
            <div class="product-info">
                <h3 class="product-title">${product.title}</h3>
                <div class="product-price">
                    <span class="price-current">${formatMoney(product.price, product.hasMultiplePrices)}</span>
                    ${isOnSale ?
                        `<span class="price-original">${formatMoney(product.compareAtPrice)}</span>` :
                        ''
                    }
                </div>
                <div class="product-type">${product.categoryLabel || 'General'}</div>
            </div>
        </div>
    `;
}

// Open product modal with details
function openProductModal(product) {
    const modalBody = document.getElementById('modal-body');
    const price = parseFloat(product.price.amount);
    const compareAtPrice = product.compareAtPrice ? parseFloat(product.compareAtPrice.amount) : null;
    const isOnSale = compareAtPrice && compareAtPrice > price;
    
    // Create image gallery HTML
    const createImageGallery = () => {
        if (product.images.length === 0) {
            return '<div class="no-image">No Image Available</div>';
        }
        
        if (product.images.length === 1) {
            return `<img id="modal-main-image" src="${product.images[0].url}" alt="${product.images[0].altText || product.title}" loading="lazy">`;
        }
        
        return `
            <div class="modal-gallery">
                <div class="main-image-container">
                    <button class="gallery-nav gallery-prev" onclick="navigateGallery(-1)" aria-label="Previous image">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
                        </svg>
                    </button>
                    <img id="modal-main-image" src="${product.images[0].url}" alt="${product.images[0].altText || product.title}" loading="lazy">
                    <button class="gallery-nav gallery-next" onclick="navigateGallery(1)" aria-label="Next image">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
                        </svg>
                    </button>
                </div>
                <div class="image-thumbnails">
                    ${product.images.map((image, index) => `
                        <button class="thumbnail ${index === 0 ? 'active' : ''}" 
                                onclick="setActiveImage(${index})" 
                                data-index="${index}">
                            <img src="${image.url}" alt="${image.altText || product.title}" loading="lazy">
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
    };
    
    // Create variant selection HTML
    const createVariantSelection = () => {
        // Hide variant UI when Shopify returns the stub option ("Title" → "Default Title")
        if (isDefaultTitleOnly(product)) return '';

        // Show only real options (skip "Title" / "Default Title")
        const realOptions = (product.options || []).filter(o => {
            const name = (o.name || '').toLowerCase();
            const values = Array.isArray(o.values) ? o.values.map(v => (v || '').toLowerCase()) : [];
            const isStub = name === 'title' && values.length === 1 && values[0] === 'default title';
            return !isStub;
        });
        if (realOptions.length === 0) return '';
        
        return `
            <div class="variant-selection">
                <h4>Select Options</h4>
                ${realOptions.map(option => `
                    <div class="variant-option">
                        <label for="option-${option.name.toLowerCase()}">${option.name}:</label>
                        <select id="option-${option.name.toLowerCase()}" class="variant-select" data-option-name="${option.name}">
                            <option value="">Select ${option.name}</option>
                            ${option.values.map(value => `
                                <option value="${value}">${value}</option>
                            `).join('')}
                        </select>
                    </div>
                `).join('')}
                
                <div class="quantity-section">
                    <label for="product-quantity">Quantity:</label>
                    <div class="quantity-controls">
                        <button type="button" id="quantity-decrease" class="quantity-btn">-</button>
                        <input type="number" id="product-quantity" value="1" min="1" max="10" class="quantity-input">
                        <button type="button" id="quantity-increase" class="quantity-btn">+</button>
                    </div>
                </div>
            </div>
        `;
    };

    modalBody.innerHTML = `
        <div class="modal-product">
            <div class="modal-image">
                ${createImageGallery()}
            </div>
            <div class="modal-info">
                <h2>${product.title}</h2>
                <div id="modal-price-display" class="product-price">
                    <span class="price-current">${formatMoney(product.price, product.hasMultiplePrices)}</span>
                    ${isOnSale ? 
                        `<span class="price-original">${formatMoney(product.compareAtPrice)}</span>` : 
                        ''
                    }
                </div>
                <div class="product-description">
                    ${product.description || 'No description available.'}
                </div>
                ${createVariantSelection()}
                <div class="availability-info">
                    <span class="spec-label">Availability:</span>
                    <span class="spec-value" id="availability-status">${product.availableForSale ? 'In Stock' : 'Sold Out'}</span>
                </div>
                <div class="modal-actions">
                    <button id="modal-add-cart-btn" class="btn-add-cart" ${!product.availableForSale ? 'disabled' : ''}>
                        ${product.availableForSale ? 'Add to Cart' : 'Sold Out'}
                    </button>
                    <button class="btn-continue-shopping" onclick="closeProductModal()">Continue Shopping</button>
                </div>
            </div>
        </div>
    `;
    
    // Store current product and gallery state
    window.currentModalProduct = product;
    window.currentImageIndex = 0;
    window.selectedVariant = null;
    
    // Auto-select variant for trivial cases or setup variant selection
    let selectedVariantId = null;
    
    if (isDefaultTitleOnly(product)) {
        // Auto-select the only variant for products with stub options
        selectedVariantId = product.variants[0]?.id || null;
        window.selectedVariant = product.variants[0];
        setupAddToCartButton();
    } else if (product.options && product.options.length > 0) {
        // Setup variant selection for products with real options
        setupVariantSelection();
        
        // Attach change listeners to compute selectedVariantId
        document.querySelectorAll('.variant-select').forEach(sel => {
            sel.addEventListener('change', () => {
                const chosen = [...document.querySelectorAll('.variant-select')].map(s => ({
                    name: s.dataset.optionName,
                    value: s.value
                }));
                // Find variant whose selectedOptions match chosen
                const match = product.variants.find(v =>
                    (v.selectedOptions || []).every(so =>
                        chosen.some(c => c.name === so.name && c.value === so.value)
                    )
                );
                selectedVariantId = match?.id || null;
                window.selectedVariant = match || null;
                setupAddToCartButton();
            });
        });
    } else {
        // Fallback: if no options, use the first variant as selected
        window.selectedVariant = product.variants[0];
        setupAddToCartButton();
    }
    
    productModal.style.display = 'block';
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
    
    // Reset modal scroll position to top
    const modalContent = document.querySelector('.modal-content');
    if (modalContent) {
        modalContent.scrollTop = 0;
    }
}

// Close product modal
function closeProductModal() {
    productModal.style.display = 'none';
    document.body.style.overflow = 'auto'; // Restore scrolling
    
    // Clean up gallery state
    window.currentModalProduct = null;
    window.currentImageIndex = 0;
    window.selectedVariant = null;
}

// Setup variant selection functionality
function setupVariantSelection() {
    const variantSelects = document.querySelectorAll('.variant-select');
    
    // Add event listeners to all variant selects
    variantSelects.forEach(select => {
        select.addEventListener('change', updateSelectedVariant);
    });
    
    // Setup quantity controls
    setupQuantityControls();
    
    // Initialize with first available variant if possible
    updateSelectedVariant();
    setupAddToCartButton();
}

// Setup quantity controls
function setupQuantityControls() {
    const quantityInput = document.getElementById('product-quantity');
    const decreaseBtn = document.getElementById('quantity-decrease');
    const increaseBtn = document.getElementById('quantity-increase');
    
    if (!quantityInput || !decreaseBtn || !increaseBtn) return;
    
    decreaseBtn.addEventListener('click', () => {
        const currentValue = parseInt(quantityInput.value);
        if (currentValue > 1) {
            quantityInput.value = currentValue - 1;
        }
    });
    
    increaseBtn.addEventListener('click', () => {
        const currentValue = parseInt(quantityInput.value);
        const maxValue = parseInt(quantityInput.max);
        if (currentValue < maxValue) {
            quantityInput.value = currentValue + 1;
        }
    });
    
    // Ensure valid input
    quantityInput.addEventListener('change', () => {
        const value = parseInt(quantityInput.value);
        const min = parseInt(quantityInput.min);
        const max = parseInt(quantityInput.max);
        
        if (isNaN(value) || value < min) {
            quantityInput.value = min;
        } else if (value > max) {
            quantityInput.value = max;
        }
    });
}

// Update selected variant based on current option selections
function updateSelectedVariant() {
    const product = window.currentModalProduct;
    if (!product || !product.variants) return;
    
    const variantSelects = document.querySelectorAll('.variant-select');
    const selectedOptions = {};
    
    // Get current selections
    variantSelects.forEach(select => {
        const optionName = select.dataset.optionName;
        const selectedValue = select.value;
        if (selectedValue) {
            selectedOptions[optionName] = selectedValue;
        }
    });
    
    // Find matching variant
    const matchingVariant = product.variants.find(variant => {
        // Check if all selected options match this variant's selectedOptions
        return Object.keys(selectedOptions).every(optionName => {
            const variantOption = variant.selectedOptions.find(opt => opt.name === optionName);
            return variantOption && variantOption.value === selectedOptions[optionName];
        }) && Object.keys(selectedOptions).length === variant.selectedOptions.length;
    });
    
    window.selectedVariant = matchingVariant;
    
    // Update UI based on selected variant
    updateVariantUI();
}

// Update UI elements based on selected variant
function updateVariantUI() {
    const priceDisplay = document.getElementById('modal-price-display');
    const availabilityStatus = document.getElementById('availability-status');
    const addToCartBtn = document.getElementById('modal-add-cart-btn');
    
    if (!window.selectedVariant) {
        // No valid variant selected
        addToCartBtn.disabled = true;
        addToCartBtn.textContent = 'Please select options';
        availabilityStatus.textContent = 'Select options';
        return;
    }
    
    const variant = window.selectedVariant;
    const price = parseFloat(variant.price.amount);
    const compareAtPrice = variant.compareAtPrice ? parseFloat(variant.compareAtPrice.amount) : null;
    const isOnSale = compareAtPrice && compareAtPrice > price;
    
    // Update price display
    priceDisplay.innerHTML = `
        <span class="price-current">$${price.toFixed(2)}</span>
        ${isOnSale ? 
            `<span class="price-original">$${compareAtPrice.toFixed(2)}</span>` : 
            ''
        }
    `;
    
    // Update availability and button
    if (variant.availableForSale) {
        availabilityStatus.textContent = 'In Stock';
        addToCartBtn.disabled = false;
        addToCartBtn.textContent = 'Add to Cart';
    } else {
        availabilityStatus.textContent = 'Sold Out';
        addToCartBtn.disabled = true;
        addToCartBtn.textContent = 'Sold Out';
    }
}

// Setup add to cart button functionality
function setupAddToCartButton() {
    const addToCartBtn = document.getElementById('modal-add-cart-btn');
    
    addToCartBtn.addEventListener('click', () => {
        if (window.selectedVariant && window.selectedVariant.availableForSale) {
            const quantityInput = document.getElementById('product-quantity');
            const quantity = quantityInput ? parseInt(quantityInput.value) : 1;
            addToCart(window.selectedVariant.id, quantity);
        }
    });
}

// Gallery navigation functions
function navigateGallery(direction) {
    if (!window.currentModalProduct || window.currentModalProduct.images.length <= 1) return;
    
    const images = window.currentModalProduct.images;
    window.currentImageIndex += direction;
    
    // Loop around if needed
    if (window.currentImageIndex < 0) {
        window.currentImageIndex = images.length - 1;
    } else if (window.currentImageIndex >= images.length) {
        window.currentImageIndex = 0;
    }
    
    updateGalleryDisplay();
}

function setActiveImage(index) {
    if (!window.currentModalProduct || index < 0 || index >= window.currentModalProduct.images.length) return;
    
    window.currentImageIndex = index;
    updateGalleryDisplay();
}

function updateGalleryDisplay() {
    if (!window.currentModalProduct) return;
    
    const images = window.currentModalProduct.images;
    const currentImage = images[window.currentImageIndex];
    
    // Update main image
    const mainImage = document.getElementById('modal-main-image');
    if (mainImage) {
        mainImage.src = currentImage.url;
        mainImage.alt = currentImage.altText || window.currentModalProduct.title;
    }
    
    // Update thumbnail states
    const thumbnails = document.querySelectorAll('.thumbnail');
    thumbnails.forEach((thumb, index) => {
        thumb.classList.toggle('active', index === window.currentImageIndex);
    });
}

// Handle purchase - redirect to Shopify product page
function handlePurchase(productId) {
    const product = allProducts.find(p => p.id === productId);
    if (product) {
        // Redirect to Shopify product page
        window.open(`https://spark-sandbox.myshopify.com/products/${product.handle}`, '_blank');
    }
}

// Contact about specific product
function contactAboutProduct(productTitle) {
    // Redirect to contact page with product info
    const subject = encodeURIComponent(`Inquiry about ${productTitle}`);
    window.location.href = `contact.html?subject=${subject}`;
}

// State management functions
function showLoadingState() {
    loadingState.style.display = 'block';
    errorState.style.display = 'none';
    shopControls.style.display = 'none';
    productsGrid.style.display = 'none';
    emptyState.style.display = 'none';
}

function showErrorState() {
    loadingState.style.display = 'none';
    errorState.style.display = 'block';
    shopControls.style.display = 'none';
    productsGrid.style.display = 'none';
    emptyState.style.display = 'none';
}

function showShopContent() {
    loadingState.style.display = 'none';
    errorState.style.display = 'none';
    shopControls.style.display = 'flex';
    productsGrid.style.display = 'grid';
    emptyState.style.display = 'none';
}

function showEmptyState() {
    loadingState.style.display = 'none';
    errorState.style.display = 'none';
    shopControls.style.display = 'flex';
    productsGrid.style.display = 'none';
    if (resultsCount) resultsCount.style.display = 'none';
    emptyState.style.display = 'block';
    
    // Update empty state message based on current filters
    updateEmptyStateMessage();
}

// Update empty state message with helpful suggestions
function updateEmptyStateMessage() {
    const emptyTitle = document.querySelector('#empty-state h2');
    const emptyText = document.querySelector('#empty-state p');
    const emptyButton = document.querySelector('#empty-state .btn-primary');
    
    if (selectedParentId === 'all' && !selectedLeafId) {
        // No filters applied but no products found
        if (emptyTitle) emptyTitle.textContent = 'No products available';
        if (emptyText) emptyText.textContent = 'We\'re currently updating our inventory. Please check back soon!';
        if (emptyButton) emptyButton.textContent = 'Refresh Page';
    } else {
        // Filters applied but no matches
        let filterDescription = '';
        if (selectedLeafId) {
            const leafBtn = document.querySelector(`[data-leaf-id="${selectedLeafId}"]`);
            filterDescription = leafBtn ? leafBtn.textContent.replace(/\s*\(\d+\)/, '') : 'this category';
        } else {
            const parentBtn = document.querySelector(`[data-parent-id="${selectedParentId}"]`);
            filterDescription = parentBtn ? parentBtn.textContent.replace(/\s*\(\d+\)/, '') : 'this category';
        }
        
        if (emptyTitle) emptyTitle.textContent = `No products found in ${filterDescription}`;
        if (emptyText) emptyText.textContent = 'Try selecting a different category or clearing your filters to see more products.';
        if (emptyButton) {
            emptyButton.textContent = 'Clear Filters';
            emptyButton.onclick = () => {
                selectedParentId = 'all';
                selectedLeafId = null;
                
                // Update UI to reflect cleared filters
                document.querySelectorAll('.filter-btn').forEach(btn => {
                    btn.classList.remove('active');
                    btn.setAttribute('aria-pressed', 'false');
                });
                
                const allBtn = document.querySelector('[data-parent-id="all"]');
                if (allBtn) {
                    allBtn.classList.add('active');
                    allBtn.setAttribute('aria-pressed', 'true');
                }
                
                // Re-render filters and products
                filterProducts();
            };
        }
    }
}

// Close modal when clicking outside
window.addEventListener('click', (e) => {
    if (e.target === productModal) {
        closeProductModal();
    }
});

// Close modal with Escape key and add gallery keyboard navigation
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && productModal.style.display === 'block') {
        closeProductModal();
    }
    
    // Gallery navigation with arrow keys
    if (productModal.style.display === 'block' && window.currentModalProduct) {
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            navigateGallery(-1);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            navigateGallery(1);
        }
    }
});

// ========== CART FUNCTIONALITY ==========

// Cart-related variables
let currentCart = null;
let cartItems = [];

// GraphQL mutations for cart operations
const CART_CREATE = `
    mutation CreateCart($lines: [CartLineInput!]) {
        cartCreate(input: { lines: $lines }) {
            cart {
                id
                checkoutUrl
                totalQuantity
                lines(first: 50) {
                    edges {
                        node {
                            id
                            quantity
                            merchandise {
                                ... on ProductVariant {
                                    id
                                    title
                                    price {
                                        amount
                                        currencyCode
                                    }
                                    product {
                                        title
                                        handle
                                        images(first: 1) {
                                            edges {
                                                node {
                                                    url
                                                    altText
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                cost {
                    totalAmount {
                        amount
                        currencyCode
                    }
                }
            }
            userErrors { 
                field 
                message 
            }
        }
    }
`;

const CART_LINES_ADD = `
    mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
        cartLinesAdd(cartId: $cartId, lines: $lines) {
            cart {
                id
                checkoutUrl
                totalQuantity
                lines(first: 50) {
                    edges {
                        node {
                            id
                            quantity
                            merchandise {
                                ... on ProductVariant {
                                    id
                                    title
                                    price {
                                        amount
                                        currencyCode
                                    }
                                    product {
                                        title
                                        handle
                                        images(first: 1) {
                                            edges {
                                                node {
                                                    url
                                                    altText
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                cost {
                    totalAmount {
                        amount
                        currencyCode
                    }
                }
            }
            userErrors { 
                field 
                message 
            }
        }
    }
`;

const CART_LINES_UPDATE = `
    mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
        cartLinesUpdate(cartId: $cartId, lines: $lines) {
            cart {
                id
                totalQuantity
                lines(first: 50) {
                    edges {
                        node {
                            id
                            quantity
                            merchandise {
                                ... on ProductVariant {
                                    id
                                    title
                                    price {
                                        amount
                                        currencyCode
                                    }
                                    product {
                                        title
                                        handle
                                        images(first: 1) {
                                            edges {
                                                node {
                                                    url
                                                    altText
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                cost {
                    totalAmount {
                        amount
                        currencyCode
                    }
                }
            }
            userErrors { 
                field 
                message 
            }
        }
    }
`;

const CART_LINES_REMOVE = `
    mutation CartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
        cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
            cart {
                id
                totalQuantity
                lines(first: 50) {
                    edges {
                        node {
                            id
                            quantity
                            merchandise {
                                ... on ProductVariant {
                                    id
                                    title
                                    price {
                                        amount
                                        currencyCode
                                    }
                                    product {
                                        title
                                        handle
                                        images(first: 1) {
                                            edges {
                                                node {
                                                    url
                                                    altText
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                cost {
                    totalAmount {
                        amount
                        currencyCode
                    }
                }
            }
            userErrors { 
                field 
                message 
            }
        }
    }
`;

// Initialize cart on page load
async function initializeCart() {
    // Just update the UI - cart will be loaded when needed
    updateCartUI();
}

// Add to cart function
async function addToCart(variantId, quantity = 1) {
    try {
        // Find the product that contains this variant
        let product = null;
        let selectedVariant = null;
        
        for (const p of allProducts) {
            const variant = p.variants.find(v => v.id === variantId);
            if (variant) {
                product = p;
                selectedVariant = variant;
                break;
            }
        }
        
        if (!product || !selectedVariant) {
            throw new Error('Product variant not found');
        }

        if (!selectedVariant.availableForSale) {
            alert('This product is currently sold out');
            return;
        }

        // Show loading state
        const addToCartBtns = document.querySelectorAll('.btn-add-cart');
        addToCartBtns.forEach(btn => {
            btn.disabled = true;
            btn.textContent = 'Adding...';
        });

        if (currentCart) {
            // Add to existing cart
            await addItemsToCart(currentCart.id, [{ 
                merchandiseId: variantId, 
                quantity: quantity 
            }]);
        } else {
            // Create new cart with item
            await createCart([{ 
                merchandiseId: variantId, 
                quantity: quantity 
            }]);
        }

        // Success feedback
        addToCartBtns.forEach(btn => {
            btn.textContent = 'Added!';
            setTimeout(() => {
                btn.disabled = false;
                btn.textContent = 'Add to Cart';
            }, 1500);
        });

        // Close modal and show cart
        closeProductModal();
        toggleCart();

    } catch (error) {
        console.error('Error adding to cart:', error);
        alert('Error adding item to cart: ' + error.message);
        
        // Reset buttons
        const addToCartBtns = document.querySelectorAll('.btn-add-cart');
        addToCartBtns.forEach(btn => {
            btn.disabled = false;
            btn.textContent = 'Add to Cart';
        });
    }
}

// Create new cart
async function createCart(lines) {
    const response = await fetch(SHOPIFY_CONFIG.endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Storefront-Access-Token': SHOPIFY_CONFIG.storefrontToken
        },
        body: JSON.stringify({
            query: CART_CREATE,
            variables: { lines }
        })
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.errors) {
        throw new Error('GraphQL errors: ' + JSON.stringify(data.errors));
    }

    const userErrors = data.data?.cartCreate?.userErrors;
    if (userErrors?.length) {
        throw new Error(userErrors.map(e => e.message).join('; '));
    }

    currentCart = data.data.cartCreate.cart;
    localStorage.setItem('motocoach_cartId', currentCart.id);
    updateCartUI();
    
    return currentCart;
}

// Add items to existing cart
async function addItemsToCart(cartId, lines) {
    const response = await fetch(SHOPIFY_CONFIG.endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Storefront-Access-Token': SHOPIFY_CONFIG.storefrontToken
        },
        body: JSON.stringify({
            query: CART_LINES_ADD,
            variables: { cartId, lines }
        })
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.errors) {
        throw new Error('GraphQL errors: ' + JSON.stringify(data.errors));
    }

    const userErrors = data.data?.cartLinesAdd?.userErrors;
    if (userErrors?.length) {
        throw new Error(userErrors.map(e => e.message).join('; '));
    }

    currentCart = data.data.cartLinesAdd.cart;
    updateCartUI();
    
    return currentCart;
}

// Update cart item quantity
async function updateCartItemQuantity(lineId, quantity) {
    if (!currentCart) return;

    try {
        const response = await fetch(SHOPIFY_CONFIG.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Storefront-Access-Token': SHOPIFY_CONFIG.storefrontToken
            },
            body: JSON.stringify({
                query: CART_LINES_UPDATE,
                variables: { 
                    cartId: currentCart.id, 
                    lines: [{ id: lineId, quantity }] 
                }
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        if (data.errors) {
            throw new Error('GraphQL errors: ' + JSON.stringify(data.errors));
        }

        const userErrors = data.data?.cartLinesUpdate?.userErrors;
        if (userErrors?.length) {
            throw new Error(userErrors.map(e => e.message).join('; '));
        }

        currentCart = data.data.cartLinesUpdate.cart;
        updateCartUI();
        
    } catch (error) {
        console.error('Error updating cart:', error);
        alert('Error updating cart: ' + error.message);
    }
}

// Remove item from cart
async function removeCartItem(lineId) {
    if (!currentCart) return;

    try {
        const response = await fetch(SHOPIFY_CONFIG.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Storefront-Access-Token': SHOPIFY_CONFIG.storefrontToken
            },
            body: JSON.stringify({
                query: CART_LINES_REMOVE,
                variables: { 
                    cartId: currentCart.id, 
                    lineIds: [lineId] 
                }
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        if (data.errors) {
            throw new Error('GraphQL errors: ' + JSON.stringify(data.errors));
        }

        const userErrors = data.data?.cartLinesRemove?.userErrors;
        if (userErrors?.length) {
            throw new Error(userErrors.map(e => e.message).join('; '));
        }

        currentCart = data.data.cartLinesRemove.cart;
        updateCartUI();
        
    } catch (error) {
        console.error('Error removing cart item:', error);
        alert('Error removing item: ' + error.message);
    }
}

// Toggle cart sidebar
function toggleCart() {
    const cartSidebar = document.getElementById('cart-sidebar');
    const cartOverlay = document.getElementById('cart-overlay');
    
    if (cartSidebar.classList.contains('open')) {
        cartSidebar.classList.remove('open');
        cartOverlay.style.display = 'none';
        document.body.style.overflow = 'auto';
    } else {
        cartSidebar.classList.add('open');
        cartOverlay.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }
}

// Update cart UI
function updateCartUI() {
    const cartCount = document.getElementById('cart-count');
    const cartItems = document.getElementById('cart-items');
    const cartEmpty = document.getElementById('cart-empty');
    const cartFooter = document.getElementById('cart-footer');
    const cartSubtotal = document.getElementById('cart-subtotal');

    if (!currentCart || !currentCart.lines.edges.length) {
        // Empty cart
        cartCount.textContent = '0';
        cartItems.innerHTML = '';
        cartEmpty.style.display = 'block';
        cartFooter.style.display = 'none';
        return;
    }

    // Update cart count
    cartCount.textContent = currentCart.totalQuantity.toString();

    // Update cart items
    cartItems.innerHTML = currentCart.lines.edges.map(edge => {
        const line = edge.node;
        const variant = line.merchandise;
        const product = variant.product;
        const image = product.images.edges[0]?.node;
        
        return `
            <div class="cart-item" data-line-id="${line.id}">
                <div class="cart-item-image">
                    ${image ? 
                        `<img src="${image.url}" alt="${image.altText || product.title}">` :
                        `<div class="no-image">No Image</div>`
                    }
                </div>
                <div class="cart-item-info">
                    <div class="cart-item-title">${product.title}</div>
                    <div class="variant-title">${variant.title}</div>
                    <div class="cart-item-price">$${parseFloat(variant.price.amount).toFixed(2)}</div>
                </div>
                <div class="cart-item-controls">
                    <div class="quantity-controls">
                        <button onclick="updateCartItemQuantity('${line.id}', ${line.quantity - 1})" 
                                ${line.quantity <= 1 ? 'disabled' : ''}>-</button>
                        <span>${line.quantity}</span>
                        <button onclick="updateCartItemQuantity('${line.id}', ${line.quantity + 1})">+</button>
                    </div>
                    <button class="remove-item" onclick="removeCartItem('${line.id}')">×</button>
                </div>
            </div>
        `;
    }).join('');

    // Show items and footer
    cartEmpty.style.display = 'none';
    cartFooter.style.display = 'block';

    // Update subtotal
    if (currentCart.cost && currentCart.cost.totalAmount) {
        cartSubtotal.textContent = `$${parseFloat(currentCart.cost.totalAmount.amount).toFixed(2)} ${currentCart.cost.totalAmount.currencyCode}`;
    }
}

// Proceed to checkout
function proceedToCheckout() {
    if (currentCart && currentCart.checkoutUrl) {
        window.open(currentCart.checkoutUrl, '_blank');
    } else {
        alert('No items in cart');
    }
}

// Update selected variant in modal
// Initialize cart when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeCart();
});