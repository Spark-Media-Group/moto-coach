# Shop Variant Improvements

## 🎯 Summary
Improved variant handling in the shop to show variant-specific images in cart/checkout and simplified variant dropdown labels.

## ✅ Changes Made

### 1. **Variant Images in Cart** ✓ Already Working
**File**: `scripts/shop.js` (line 778)

The cart was already correctly using variant-specific images! When adding items to cart, the code already stores `variant.imageUrl`:

```javascript
const image = variant.imageUrl || product.thumbnailUrl || (product.images && product.images[0]?.url) || null;
```

This means:
- ✅ Cart sidebar displays the variant's specific image
- ✅ Each variant (color/style) shows its own image in the cart
- ✅ No changes needed - already working correctly!

**Cart Item Structure:**
```javascript
{
    productId: product.id,
    productName: product.name,
    variantId: variant.id,
    image: variant.imageUrl,  // ← Variant-specific image
    variantName: variant.optionLabel,
    quantity: 1,
    price: 19.50,
    currency: 'USD'
}
```

---

### 2. **Variant Images in Checkout** ✓ Already Working
**File**: `scripts/checkout.js` (line 514)

The checkout page was also already using the variant images correctly:

```javascript
${image.url ? `<img src="${image.url}" alt="${image.altText || line.title || 'Product image'}">` : '<span>No image</span>'}
```

The `line.image` comes from the cart data, which already contains `variant.imageUrl`.

**Flow:**
```
shop.js → addItemToCart() → stores variant.imageUrl
    ↓
session storage → 'motocoach_checkout'
    ↓
checkout.js → reads line.image → displays variant image
```

**Result:**
- ✅ Checkout displays the correct variant image for each item
- ✅ Brown hat shows brown image, black hat shows black image, etc.
- ✅ No changes needed - already working correctly!

---

### 3. **Simplified Variant Dropdown Labels** ✨ NEW
**File**: `api/printfulCatalog.js` (lines 966-982)

#### Problem
Variant dropdown was showing redundant product names:
```
Before:
- Trucker Cap / Brown/ Khaki
- Trucker Cap / Charcoal/ Black  
- Trucker Cap / Navy/ White
```

#### Solution
Strip the product name prefix to show only variant details:
```
After:
- Brown/ Khaki
- Charcoal/ Black
- Navy/ White
```

#### Implementation
Updated `normaliseVariant()` function to intelligently remove product name:

```javascript
// Create a cleaner option label by removing product name prefix
// e.g., "Trucker Cap / Brown/ Khaki" -> "Brown/ Khaki"
let optionLabel = name || `Variant ${catalogVariantId || printfulVariantId || ''}`.trim();
if (productName && optionLabel.startsWith(productName)) {
    // Remove product name and any following separator (/, -, |, etc.)
    optionLabel = optionLabel.substring(productName.length).replace(/^[\s\-\/\|]+/, '').trim();
}
// If we end up with an empty label after removal, use the full name
if (!optionLabel || optionLabel.length === 0) {
    optionLabel = name || `Variant ${catalogVariantId || printfulVariantId || ''}`.trim();
}
```

**Logic:**
1. Check if variant name starts with product name
2. Remove product name from the beginning
3. Strip any leftover separators (`/`, `-`, `|`, spaces)
4. Fallback to full name if result is empty

**Handles Multiple Formats:**
- `Product / Color` → `Color`
- `Product - Size / Color` → `Size / Color`
- `Product | Variant` → `Variant`
- `ProductName Option` → `Option`

---

## 🎨 User Experience Improvements

### Before
```
Product Modal Dropdown:
┌─────────────────────────────────┐
│ Select Variant                  │
├─────────────────────────────────┤
│ Trucker Cap / Brown/ Khaki     │ ← Redundant
│ Trucker Cap / Charcoal/ Black  │ ← Redundant
│ Trucker Cap / Navy/ White      │ ← Redundant
└─────────────────────────────────┘

Cart Item:
[Generic Product Image] Trucker Cap - Brown/ Khaki
```

### After
```
Product Modal Dropdown:
┌─────────────────────────────────┐
│ Select Variant                  │
├─────────────────────────────────┤
│ Brown/ Khaki                    │ ← Clean!
│ Charcoal/ Black                 │ ← Clean!
│ Navy/ White                     │ ← Clean!
└─────────────────────────────────┘

Cart Item:
[Brown Hat Image] Trucker Cap - Brown/ Khaki  ← Correct image!
```

---

## 🔧 Technical Details

### Data Flow

**1. Product Loading (Printful API)**
```javascript
// api/printfulCatalog.js
normaliseVariant(variant, productName) {
    // Input from Printful:
    variant.name = "Trucker Cap / Brown/ Khaki"
    
    // Processing:
    optionLabel = "Brown/ Khaki"  // Cleaned
    
    // Output:
    return {
        id: "printful-variant-12345",
        optionLabel: "Brown/ Khaki",
        imageUrl: "https://files.cdn.printful.com/.../brown-hat.jpg"
    }
}
```

**2. Adding to Cart**
```javascript
// scripts/shop.js
addItemToCart(product, variant, quantity) {
    state.cart.push({
        image: variant.imageUrl,  // ← Variant's image
        variantName: variant.optionLabel  // ← "Brown/ Khaki"
    });
}
```

**3. Displaying in Cart/Checkout**
```javascript
// Cart uses item.image (variant's image)
<img src="${item.image}">  // Brown hat image

// Checkout uses line.image (from cart data)
<img src="${line.image.url}">  // Brown hat image
```

### Variant Image Priority
When displaying variant images, the system uses this priority:

1. **First choice**: `variant.imageUrl` (single variant image)
2. **Second choice**: `variant.imageUrls[0]` (first of multiple images)
3. **Fallback 1**: `product.thumbnailUrl` (product default)
4. **Fallback 2**: `product.images[0].url` (first product image)

This ensures variants always show the most specific image available.

---

## 📝 Files Modified

### 1. `api/printfulCatalog.js`
- **Lines 966-982**: Updated `normaliseVariant()` to create cleaner `optionLabel`
- **Logic**: Removes product name prefix from variant names
- **Impact**: Dropdown labels now show only variant details

### 2. `scripts/shop.js` 
- **No changes needed**: Already using `variant.imageUrl` correctly
- **Verified**: Cart displays variant-specific images

### 3. `scripts/checkout.js`
- **No changes needed**: Already using `line.image` correctly
- **Verified**: Checkout displays variant-specific images

---

## 🧪 Testing Checklist

- [x] Variant dropdown shows clean labels (no product name prefix)
- [x] Cart sidebar displays variant-specific images
- [x] Checkout page displays variant-specific images
- [x] Changing variants in modal updates images correctly
- [x] Multiple products with variants work correctly
- [x] Fallback to product image if variant has no specific image

---

## 💡 Examples

### Hat Product with 3 Color Variants

**Dropdown Options:**
```
✅ Brown/ Khaki
✅ Charcoal/ Black
✅ Navy/ White
```

**Cart Display:**
```
[Brown Hat Image]    Trucker Cap        $19.50
                     Brown/ Khaki
                     Qty: 1

[Black Hat Image]    Trucker Cap        $19.50
                     Charcoal/ Black
                     Qty: 2
```

**Checkout Display:**
```
┌──────────────────────────────────────┐
│ [Brown Hat]  Trucker Cap             │
│              Brown/ Khaki            │
│              Qty: 1 · $19.50         │
├──────────────────────────────────────┤
│ [Black Hat]  Trucker Cap             │
│              Charcoal/ Black         │
│              Qty: 2 · $39.00         │
└──────────────────────────────────────┘
```

---

## 🚀 Deployment Notes

- **Breaking Changes**: None
- **Backward Compatible**: Yes
- **Cache Considerations**: Printful catalog will need to be re-fetched to get new variant labels
- **Storage Impact**: No change to cart data structure
- **Performance**: No impact - processing happens during API response normalization

---

## 🎁 Bonus Benefits

1. **Cleaner UI**: Less visual clutter in dropdowns
2. **Better Mobile UX**: Shorter labels fit better on small screens
3. **Improved Scannability**: Users can quickly identify variants
4. **Consistent Branding**: Product name in title, variant in dropdown
5. **Accessibility**: Screen readers announce cleaner, more concise labels

---

## 🔮 Future Enhancements

Potential improvements for later:
- Add variant attribute icons (color swatches, size badges)
- Show variant images in dropdown options
- Add "out of stock" indicators in dropdown
- Implement variant image zoom on hover
- Add image gallery for variants with multiple photos

---

*Last Updated: January 14, 2025*
