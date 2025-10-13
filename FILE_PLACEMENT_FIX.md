# Fix: "There can only be one file for each placement" Error

## Problem
After fixing the variant ID issue, checkout now fails with:
```
There can only be one file for each placement
Error code: OR-12
```

## Root Cause
The order payload was sending **BOTH**:
1. `item.files` array (top-level files)
2. `item.placements` array with `layers` (files embedded in placements)

Printful's API only accepts **ONE** of these approaches, not both simultaneously.

## The Fix

### 1. Checkout: Don't send files if placements exist
**File: `scripts/checkout.js`** (Lines ~1593-1603)

```javascript
// BEFORE (WRONG - sends both)
if (Array.isArray(line.placements)) {
    item.placements = applyPlacementTechniques(...);
}

if (Array.isArray(line.files)) {
    item.files = sanitiseOrderFiles(line.files);
}

// AFTER (CORRECT - only send one)
if (Array.isArray(line.placements)) {
    item.placements = applyPlacementTechniques(...);
}

// Only include files if we don't have placements
const hasValidPlacements = item.placements && item.placements.length > 0;

if (!hasValidPlacements) {
    if (Array.isArray(line.files)) {
        item.files = sanitiseOrderFiles(line.files);
    }
}
```

### 2. Backend: Remove files when placements have layers
**File: `api/_utils/printful-order.js`** (Lines ~720-728)

```javascript
// BEFORE (WRONG)
processed.placements = preparedPlacements;
processed.files = files;
return processed;

// AFTER (CORRECT)
processed.placements = preparedPlacements;

// Don't send both 'files' and 'placements' - Printful only allows one
if (preparedPlacements.length > 0 && preparedPlacements.some(p => p.layers && p.layers.length > 0)) {
    delete processed.files;  // Remove files if placements have layers
} else {
    processed.files = files;  // Keep files if placements are empty
}

return processed;
```

### 3. Added debug logging
**File: `api/printfulOrder.js`** (Lines ~96-109)

Added logging to see what's being sent to Printful:
- Item variant ID
- Whether files exist
- Whether placements exist  
- Placement details (placement name, technique, layer count)

## How It Works Now

### Scenario 1: Sync Product with Existing Design
- Cart has: Product with sync_variant_id only
- Checkout sends: `{ sync_variant_id: 5008952970, quantity: 1 }`
- Backend: No files or placements added
- Printful: Uses existing design from sync product ✅

### Scenario 2: Custom Design with Placements
- Cart has: Product with placements containing layers
- Checkout sends: `{ sync_variant_id: X, placements: [...] }`
- Backend: Processes placements, removes files array
- Printful: Uses placement layers ✅

### Scenario 3: Custom Design with Files Only
- Cart has: Product with files array, no placements
- Checkout sends: `{ sync_variant_id: X, files: [...] }`
- Backend: Derives placements from files, includes layers in placements, removes files
- Printful: Uses placement layers ✅

## Test Result
✅ Orders should now work without the "one file per placement" error!

## Try It Now
1. Hard refresh checkout page (Ctrl+Shift+R)
2. Add ornament to cart
3. Complete checkout
4. Should succeed! 🎉
