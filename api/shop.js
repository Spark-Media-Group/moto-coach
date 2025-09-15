// Shopify API endpoint for server-side operations
// This handles operations that require the Admin API or private operations

const SHOPIFY_CONFIG = {
    store: process.env.SHOPIFY_STORE_URL || 'https://spark-sandbox.myshopify.com',
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecret: process.env.SHOPIFY_API_SECRET_KEY,
    storefrontToken: process.env.SHOPIFY_STOREFRONT_API_TOKEN
};

export default async function handler(req, res) {
    // Set CORS headers for cross-origin requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const { action } = req.query;

        switch (action) {
            case 'products':
                return await getProducts(req, res);
            case 'product':
                return await getProduct(req, res);
            case 'collections':
                return await getCollections(req, res);
            case 'search':
                return await searchProducts(req, res);
            default:
                return res.status(400).json({ 
                    error: 'Invalid action. Supported actions: products, product, collections, search' 
                });
        }
    } catch (error) {
        console.error('Shopify API Error:', error);
        return res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
}

// Get all products (uses Storefront API for public data)
async function getProducts(req, res) {
    const { limit = 50, sortKey = 'TITLE', reverse = false } = req.query;

    const query = `
        query GetProducts($first: Int!, $sortKey: ProductSortKeys!, $reverse: Boolean!) {
            products(first: $first, sortKey: $sortKey, reverse: $reverse) {
                pageInfo {
                    hasNextPage
                    hasPreviousPage
                }
                edges {
                    node {
                        id
                        title
                        description
                        handle
                        availableForSale
                        productType
                        tags
                        createdAt
                        updatedAt
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
                        images(first: 10) {
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

    try {
        const response = await fetch(`${SHOPIFY_CONFIG.store}/api/2025-07/graphql.json`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Storefront-Access-Token': SHOPIFY_CONFIG.storefrontToken
            },
            body: JSON.stringify({
                query,
                variables: {
                    first: parseInt(limit),
                    sortKey,
                    reverse: reverse === 'true'
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

        return res.status(200).json({
            success: true,
            data: data.data.products
        });

    } catch (error) {
        console.error('Error fetching products:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

// Get single product by handle or ID
async function getProduct(req, res) {
    const { handle, id } = req.query;

    if (!handle && !id) {
        return res.status(400).json({
            success: false,
            error: 'Product handle or ID is required'
        });
    }

    const query = handle ? `
        query GetProductByHandle($handle: String!) {
            productByHandle(handle: $handle) {
                id
                title
                description
                handle
                availableForSale
                productType
                tags
                options {
                    id
                    name
                    values
                }
                variants(first: 20) {
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
                images(first: 10) {
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
    ` : `
        query GetProductById($id: ID!) {
            product(id: $id) {
                id
                title
                description
                handle
                availableForSale
                productType
                tags
                options {
                    id
                    name
                    values
                }
                variants(first: 20) {
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
                images(first: 10) {
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
    `;

    try {
        const response = await fetch(`${SHOPIFY_CONFIG.store}/api/2025-07/graphql.json`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Storefront-Access-Token': SHOPIFY_CONFIG.storefrontToken
            },
            body: JSON.stringify({
                query,
                variables: handle ? { handle } : { id }
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.errors) {
            throw new Error('GraphQL errors: ' + JSON.stringify(data.errors));
        }

        const product = handle ? data.data.productByHandle : data.data.product;

        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }

        return res.status(200).json({
            success: true,
            data: product
        });

    } catch (error) {
        console.error('Error fetching product:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

// Get collections
async function getCollections(req, res) {
    const { limit = 10 } = req.query;

    const query = `
        query GetCollections($first: Int!) {
            collections(first: $first) {
                edges {
                    node {
                        id
                        title
                        description
                        handle
                        image {
                            url
                            altText
                        }
                        products(first: 5) {
                            edges {
                                node {
                                    id
                                    title
                                    handle
                                }
                            }
                        }
                    }
                }
            }
        }
    `;

    try {
        const response = await fetch(`${SHOPIFY_CONFIG.store}/api/2025-07/graphql.json`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Storefront-Access-Token': SHOPIFY_CONFIG.storefrontToken
            },
            body: JSON.stringify({
                query,
                variables: { first: parseInt(limit) }
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.errors) {
            throw new Error('GraphQL errors: ' + JSON.stringify(data.errors));
        }

        return res.status(200).json({
            success: true,
            data: data.data.collections
        });

    } catch (error) {
        console.error('Error fetching collections:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

// Search products
async function searchProducts(req, res) {
    const { query: searchQuery, limit = 20 } = req.query;

    if (!searchQuery) {
        return res.status(400).json({
            success: false,
            error: 'Search query is required'
        });
    }

    const query = `
        query SearchProducts($query: String!, $first: Int!) {
            products(first: $first, query: $query) {
                edges {
                    node {
                        id
                        title
                        description
                        handle
                        availableForSale
                        productType
                        variants(first: 1) {
                            edges {
                                node {
                                    id
                                    price {
                                        amount
                                        currencyCode
                                    }
                                }
                            }
                        }
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
    `;

    try {
        const response = await fetch(`${SHOPIFY_CONFIG.store}/api/2025-07/graphql.json`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Storefront-Access-Token': SHOPIFY_CONFIG.storefrontToken
            },
            body: JSON.stringify({
                query,
                variables: {
                    query: searchQuery,
                    first: parseInt(limit)
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

        return res.status(200).json({
            success: true,
            data: data.data.products,
            query: searchQuery
        });

    } catch (error) {
        console.error('Error searching products:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}