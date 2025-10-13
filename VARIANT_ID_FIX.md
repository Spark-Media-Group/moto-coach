# Printful Variant ID Issue - FIXED ✅

## Problem Summary
Order creation was failing with error:
```
Variant with ID: 5008952970 does not exist.
```

## Root Cause
Printful uses **TWO different variant ID types** that must be used in different contexts:

### 1. **Sync Variant ID** (e.g., 5008952970)
- Retrieved from: `variant.id` in `/store/products/{id}` API response
- Used for: Creating orders via the Sync Product API (`/store/orders`)
- Example: Circle ornament sync ID = **5008952970**

### 2. **Catalog Variant ID** (e.g., 23133)
- Retrieved from: `variant.variant_id` in `/store/products/{id}` API response  
- Used for: V2 Catalog API lookups (`/v2/catalog-variants/{id}`)
- Example: Circle ornament catalog ID = **23133**

## The Bug
The code had **variable name mismatches** in `api/_utils/printful-order.js`:

```javascript
// Line 746: Defined configVariantId
const configVariantId = configVariantCandidates...

// Line 759: Used WRONG variable name (variantId doesn't exist!)
if (variantId && apiKey) {  // ❌ UNDEFINED - should be configVariantId
```

This caused:
1. The variant config lookup to be skipped (since `variantId` was undefined)
2. The order creation to use **sync variant ID (5008952970)** with the **V2 Catalog API**
3. Printful rejected it because V2 API expects **catalog variant ID (23133)**

## The Fix

### 1. Fixed variable name in `api/_utils/printful-order.js`
**Lines 759-766:**
```javascript
// BEFORE (WRONG)
if (variantId && apiKey) {
    const cacheKey = `${storeId || 'default'}:${variantId}`;
    ...
    config = await fetchVariantConfig(variantId, apiKey, storeId);
}

// AFTER (CORRECT)
if (configVariantId && apiKey) {
    const cacheKey = `${storeId || 'default'}:${configVariantId}`;
    ...
    config = await fetchVariantConfig(configVariantId, apiKey, storeId);
}
```

**Line 772:**
```javascript
// BEFORE (WRONG)
const wrapped = new Error(`Failed to prepare Printful order item${variantId ? ` for variant ${variantId}` : ''}: ${error.message}`);

// AFTER (CORRECT)
const wrapped = new Error(`Failed to prepare Printful order item${configVariantId ? ` for variant ${configVariantId}` : ''}: ${error.message}`);
```

### 2. Pass both IDs from checkout in `scripts/checkout.js`
**Lines 1415-1456:**
```javascript
// Extract BOTH variant IDs from cart line item
const syncVariantCandidates = [
    line.printfulCatalogVariantId,  // Sync ID (5008952970)
    line.printful?.catalogVariantId,
    line.catalogVariantId,
    line.metadata?.printfulCatalogVariantId
].map(parsePositiveNumber).filter(Boolean);

const catalogVariantCandidates = [
    line.printfulVariantId,          // Catalog ID (23133)
    line.printful?.variantId,
    line.metadata?.printfulVariantId
].map(parsePositiveNumber).filter(Boolean);

const catalogVariantId = syncVariantCandidates[0];  // For order creation
const printfulVariantId = catalogVariantCandidates[0];  // For V2 API lookup

// Include BOTH in the item payload
const item = {
    source: 'catalog',
    catalog_variant_id: catalogVariantId,     // 5008952970 (sync ID)
    printfulVariantId: printfulVariantId,     // 23133 (catalog ID)
    quantity,
    // ...
};
```

## Verification

### Ornament Variant IDs (Product ID: 395875939)
From Printful API `/store/products/395875939`:

| Name | Sync ID (for orders) | Catalog ID (for V2 API) |
|------|---------------------|------------------------|
| Circle | **5008952970** | **23133** |
| Heart | **5008952971** | **23144** |
| Snowflake | **5008952972** | **23155** |
| Star | **5008952973** | **23151** |

### Trucker Cap Variant IDs (Product ID: 395880870)
From Printful API `/store/products/395880870`:

| Name | Sync ID (for orders) | Catalog ID (for V2 API) |
|------|---------------------|------------------------|
| Charcoal/Black | **5009006162** | **16709** |
| Brown/Khaki | **5009006163** | **8749** |
| Dark Heather Gray | **5009006164** | **20391** |
| Heather/Black | **5009006165** | **16710** |
| Heather Grey/White | **5009006166** | **22454** |
| White | **5009006167** | **8746** |

## Flow After Fix

1. **Cart stores both IDs** (from `shop.js`):
   - `printfulCatalogVariantId` = sync ID (5008952970)
   - `printfulVariantId` = catalog ID (23133)

2. **Checkout extracts both IDs** (from `checkout.js`):
   - `catalog_variant_id` = 5008952970 (for order creation)
   - `printfulVariantId` = 23133 (for config lookup)

3. **Order preparation uses correct ID** (from `printful-order.js`):
   - Looks up config with **catalog ID 23133** via V2 API ✅
   - Creates order with **sync ID 5008952970** ✅

## Test
Try checking out with a Circle ornament now - it should work! 🎉

The error "Variant with ID: 5008952970 does not exist" should be gone because we're now using the correct catalog ID (23133) for the V2 API lookup.
