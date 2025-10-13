# Printful Variant ID Issue - FIXED ✅

## Problem Summary
Order creation was failing with error:
```
Variant with ID: 5008952970 does not exist.
```

## Root Cause
**The code was using the WRONG API ENDPOINT!**

The application was calling **`/v2/orders`** (V2 API) but should have been calling **`/orders`** (V1 API).

### Why This Caused the Error:
1. **V2 Orders API** expects `catalog_variant_id` (catalog variant IDs like 23133)
2. **V1 Orders API** expects `sync_variant_id` (sync variant IDs like 5008952970)
3. Our code was sending `sync_variant_id: 5008952970` to the **V2 endpoint**
4. V2 API couldn't find a **catalog variant** with ID 5008952970 → "Variant does not exist" error

### The Secondary Issues:
Additionally, there were variable name bugs in the order preparation code that prevented variant config lookup from working correctly.

## The Fixes

### 1. **PRIMARY FIX**: Change API endpoint from V2 to V1
**File: `api/_utils/printful.js`** (Line 2)

```javascript
// BEFORE (WRONG)
export const PRINTFUL_ORDERS_ENDPOINT = `${PRINTFUL_API_BASE}/v2/orders`;

// AFTER (CORRECT)
export const PRINTFUL_ORDERS_ENDPOINT = `${PRINTFUL_API_BASE}/orders`;
```

### 2. Use `sync_variant_id` field name for V1 API
**File: `scripts/checkout.js`** (Lines ~1455-1461)

```javascript
// BEFORE (WRONG - used catalog_variant_id with V2)
const item = {
    source: 'catalog',
    catalog_variant_id: catalogVariantId,
    quantity,
    // ...
};

// AFTER (CORRECT - use sync_variant_id with V1)
const item = {
    sync_variant_id: catalogVariantId,  // Sync variant ID for V1 /orders API
    printfulVariantId: printfulVariantId,  // Catalog variant ID for config lookup
    quantity,
    // ...
};
```

### 3. Fixed variable name bugs in order preparation
**File: `api/_utils/printful-order.js`** (Lines 759-766, 772)

```javascript
// BEFORE (WRONG)
const configVariantId = configVariantCandidates...
// ... later:
if (variantId && apiKey) {  // ❌ variantId is undefined!
    config = await fetchVariantConfig(variantId, apiKey, storeId);
}

// AFTER (CORRECT)
const configVariantId = configVariantCandidates...
// ... later:
if (configVariantId && apiKey) {  // ✅ Use correct variable
    config = await fetchVariantConfig(configVariantId, apiKey, storeId);
}
```

### 4. Pass both IDs from checkout
**File: `scripts/checkout.js`** (Lines ~1415-1442)

Now extracts BOTH variant ID types:
- `catalogVariantId` → Sync ID (5008952970) for order submission
- `printfulVariantId` → Catalog ID (23133) for V2 config API lookups

## Verification - Test Order Created Successfully! ✅

### Response:
```json
{
  "code": 200,
  "result": {
    "id": 131247299,
    "status": "draft",
    "items": [
      {
        "id": 117515959,
        "variant_id": 23133,
        "sync_variant_id": 5008952970,
        "quantity": 1,
        "price": 7.58,
        "retail_price": "10.00",
        "name": "Double-sided ceramic ornaments / Circle"
      }
    ],
    "costs": {
      "currency": "USD",
      "subtotal": 7.58,
      "shipping": 5.69,
      "tax": 0.93,
      "total": 14.20
    }
  }
}
```

**✅ Order created successfully!** The sync variant ID (5008952970) was accepted by the V1 API.

## Understanding Printful's Two Variant ID Types

| ID Type | Example | Source API | Used For |
|---------|---------|------------|----------|
| **Sync Variant ID** | 5008952970 | `variant.id` from `/store/products` | V1 `/orders` API order creation |
| **Catalog Variant ID** | 23133 | `variant.variant_id` from `/store/products` | V2 `/catalog-variants` config lookups |

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
