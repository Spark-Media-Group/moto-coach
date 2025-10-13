# ⚠️ CART REFRESH REQUIRED

## Why?
We fixed how variant IDs are stored to properly support real-time shipping calculations and Printful order creation. The old cart data has incorrect variant IDs that won't work with the fixed code.

## What's the Error?
If you see errors like:
- `"Variant with ID: 5008952971 does not exist"`
- `"Invalid variant ID: 5008952970"`

This means your cart has old data with the wrong variant ID format.

## How to Fix (Choose ONE method):

### Method 1: Clear Cart via Browser Console (Easiest)
1. Open browser console (F12)
2. Paste this code and press Enter:
```javascript
sessionStorage.removeItem('motocoach_shop_cart');
sessionStorage.removeItem('motocoach_checkout');
localStorage.removeItem('motocoach_shop_cart');
localStorage.removeItem('motocoach_checkout');
location.reload();
```
3. Cart will be empty - re-add your products

### Method 2: Manual Clear
1. Go to `/shop` page
2. Remove all items from cart (click X on each item)
3. Clear browser cache:
   - Chrome: Ctrl+Shift+Delete → Check "Cached images and files" → Clear
   - Firefox: Ctrl+Shift+Delete → Check "Cache" → Clear
4. Refresh the page (F5)
5. Re-add products to cart

### Method 3: Private/Incognito Window
1. Open a private/incognito browser window
2. Go to your shop page
3. Add products to cart
4. Proceed to checkout
5. This will use fresh data without old cached IDs

## What Changed?

### Before (WRONG):
- `printfulVariantId` = Sync variant ID (5008952970) ❌
- `catalogVariantId` = Product variant ID (16709) ❌

### After (CORRECT):
- `printfulVariantId` = Product variant ID (16709) ✅ Used for shipping rates
- `catalogVariantId` = Sync variant ID (5008952970) ✅ Used for orders

## Verification
After clearing cart and re-adding products, check browser console for:
```
📦 Line item for shipping:
  printfulVariantId: 16709
  catalogVariantId: 5008952970
```

The `printfulVariantId` should be a smaller number (like 16709), and `catalogVariantId` should be larger (like 5008952970).

## Still Having Issues?

If you still see errors after clearing the cart:
1. Check that you're using the latest deployed code
2. Verify `PRINTFUL_API_KEY` environment variable is set
3. Check browser console for the detailed logs we added
4. Share the console logs for debugging

## For Developers

The variant ID mapping is in:
- **API**: `/api/printfulCatalog.js` (lines 938-952)
- **Cart**: `/scripts/shop.js` (lines 820-840)
- **Shipping**: `/scripts/checkout.js` `fetchPrintfulShippingRates()` function
- **Orders**: `/scripts/checkout.js` `extractPrintfulItemFromLine()` function
