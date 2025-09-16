// Shopify API endpoint for server-side operations
// This handles operations that require the Admin API or private operations

import { applyCors } from './_utils/cors';

const SHOPIFY_CONFIG = {
    store: process.env.SHOPIFY_STORE_URL || 'https://spark-sandbox.myshopify.com',
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecret: process.env.SHOPIFY_API_SECRET_KEY,
    storefrontToken: process.env.SHOPIFY_STOREFRONT_API_TOKEN
};

export default async function handler(req, res) {
    const cors = applyCors(req, res, {
        methods: ['GET', 'POST', 'OPTIONS'],
        headers: ['Content-Type', 'X-App-Key', 'X-Requested-With']
    });

    if (cors.handled) {
        return;
    }

    // Input validation for action parameter
    const { action } = req.query;
    const validActions = ['products', 'product', 'collections', 'search', 'config'];
    
    if (!action || !validActions.includes(action)) {
        return res.status(400).json({ 
            error: 'Invalid action. Supported actions: products, product, collections, search, config' 
        });
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
            case 'config':
                return await getConfig(req, res);
            default:
                return res.status(400).json({ 
                    error: 'Invalid action. Supported actions: products, product, collections, search, config' 
                });
        }
    } catch (error) {
        console.error('Shopify API Error:', error);
        return res.status(500).json({ 
            error: 'Internal server error'
        });
    }
}

// Get public configuration (storefront token, etc.)
async function getConfig(req, res) {
    try {
        // Validate required environment variables
        if (!SHOPIFY_CONFIG.storefrontToken) {
            console.error('Missing SHOPIFY_STOREFRONT_API_TOKEN environment variable');
            return res.status(500).json({
                success: false,
                error: 'Server configuration error: Missing Shopify storefront token'
            });
        }
        
        if (!SHOPIFY_CONFIG.store) {
            console.error('Missing SHOPIFY_STORE_URL environment variable');
            return res.status(500).json({
                success: false,
                error: 'Server configuration error: Missing Shopify store URL'
            });
        }
        
        return res.status(200).json({
            success: true,
            data: {
                storefrontToken: SHOPIFY_CONFIG.storefrontToken,
                storeUrl: SHOPIFY_CONFIG.store
            }
        });
    } catch (error) {
        console.error('Error getting shop config:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to get configuration'
        });
    }
}

// Get all products (uses Storefront API for public data)
async function getProducts(req, res) {
    const limitParam = req.query.limit || 50;
    const sortKey = req.query.sortKey || 'TITLE';
    const reverse = req.query.reverse || false;
    
    // Input validation
    const limit = Math.min(Math.max(Number(limitParam), 1), 250); // Cap at 250, min 1
    if (Number.isNaN(limit)) {
        return res.status(400).json({ error: 'Invalid limit parameter' });
    }
    
    const validSortKeys = ['TITLE', 'CREATED_AT', 'UPDATED_AT', 'PRICE', 'PRODUCT_TYPE'];
    if (!validSortKeys.includes(sortKey)) {
        return res.status(400).json({ error: 'Invalid sortKey parameter' });
    }

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
                    first: limit,
                    sortKey,
                    reverse: reverse === 'true'
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Shopify API error ${response.status}:`, errorText);
            throw new Error(`HTTP ${response.status}: ${response.statusText} — ${errorText}`);
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
    const { query: searchQuery } = req.query;
    const limitParam = req.query.limit || 20;

    if (!searchQuery || typeof searchQuery !== 'string' || searchQuery.trim().length === 0) {
        return res.status(400).json({
            success: false,
            error: 'Search query is required'
        });
    }
    
    // Input validation
    const limit = Math.min(Math.max(Number(limitParam), 1), 100); // Cap at 100 for search
    if (Number.isNaN(limit)) {
        return res.status(400).json({ error: 'Invalid limit parameter' });
    }
    
    // Sanitize search query (basic protection)
    const sanitizedQuery = searchQuery.trim().slice(0, 100); // Limit length

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
                    query: sanitizedQuery,
                    first: limit
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
            query: sanitizedQuery
        });

    } catch (error) {
        console.error('Error searching products:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}