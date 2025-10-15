# ⚠️ DEPRECATED - See VARIANT_SELECTION_CORRECTED.md

This implementation was based on a misunderstanding of requirements.

## What This Tried To Do (INCORRECT)
- Show ALL variant images as thumbnails
- Click thumbnail to SELECT that variant
- Hide dropdown menu

## What We Actually Need (CORRECT)
- Show SELECTED variant's images in carousel
- Use dropdown for variant selection (Color / Size combinations)
- Gallery updates when dropdown changes

**See `VARIANT_SELECTION_CORRECTED.md` for the correct implementation.**

---

# ~~Carousel-Based Variant Selection Implementation~~ (DEPRECATED)

## Overview
Complete redesign of the product modal to use an image carousel for variant selection instead of a traditional dropdown menu.

## User Experience Flow

### Before (Old System)
1. Open product modal
2. See single variant image
3. Use dropdown to select different variants
4. Image changes when dropdown selection changes

### After (New System)
1. Open product modal
2. See ALL variant images as thumbnails in carousel
3. Click any thumbnail to select that variant
4. Selected variant name displays below main image
5. Price and availability update instantly
6. Dropdown hidden (thumbnails replace it)

## Technical Implementation

### 1. Image Gallery (`buildImageGallery`)
**Location:** `scripts/shop.js` lines 258-338

**Changes:**
- Collects images from ALL variants (not just selected one)
- Adds metadata to each image:
  - `variantId`: Printful variant ID
  - `variantName`: Display name (e.g., "Brown/Khaki")
  - `variant`: Full variant object reference
- Displays selected variant label below main image
- Sets active thumbnail based on `currentVariant`

**Key Code:**
```javascript
variants.forEach(v => {
    if (v.imageUrl) {
        const exists = images.some(img => img.url === v.imageUrl);
        if (!exists) {
            images.push({
                url: v.imageUrl,
                altText: `${product.name} - ${v.optionLabel || v.name || 'Variant'}`,
                variantId: v.id,
                variantName: v.optionLabel || v.name || 'Variant',
                variant: v
            });
        }
    }
});
```

### 2. Variant Selection Dropdown (`buildVariantSelection`)
**Location:** `scripts/shop.js` lines 340-368

**Changes:**
- Automatically hides when all variants have images
- Returns empty string instead of dropdown HTML
- Thumbnails become primary selection UI

**Logic:**
```javascript
const allVariantsHaveImages = availableVariants.every(v => v.imageUrl);
if (allVariantsHaveImages) {
    return ''; // Hide dropdown, use thumbnails
}
```

### 3. Thumbnail Click Handler (`setupModalInteractions`)
**Location:** `scripts/shop.js` lines 470-520

**Changes:**
- Extracts `variantId` from clicked thumbnail
- Finds matching variant from product data
- Updates `currentVariant` global state
- Triggers price, availability, and label updates

**Key Code:**
```javascript
const variantId = button.getAttribute('data-variant-id');
if (variantId) {
    const selectedVariant = currentModalProduct.variants.find(v => v.id === variantId);
    if (selectedVariant) {
        currentVariant = selectedVariant;
        updateModalPrice();
        updateVariantAvailability();
        updateVariantLabel();
        button.classList.add('active');
    }
}
```

### 4. Variant Label Display (`updateVariantLabel`)
**Location:** `scripts/shop.js` lines 600-606

**New Function:**
- Updates `.variant-label-text` element
- Shows selected variant name (e.g., "Brown/Khaki")
- Called when variant changes via thumbnail or navigation

```javascript
function updateVariantLabel() {
    const variantLabel = modalBody.querySelector('.variant-label-text');
    if (variantLabel && currentVariant) {
        variantLabel.textContent = currentVariant.optionLabel || currentVariant.name || 'Variant';
    }
}
```

### 5. Gallery Navigation (`navigateGallery` & `setActiveImage`)
**Location:** `scripts/shop.js` lines 608-752

**Changes:**
- Now works with ALL variant images (not just current variant)
- When navigating, updates `currentVariant` to match displayed image
- Triggers price, availability, and label updates on navigation
- Arrow keys cycle through all variants

**Key Logic:**
```javascript
// Update current variant if navigating to a different variant
const newImage = images[currentImageIndex];
if (newImage.variant) {
    currentVariant = newImage.variant;
    updateModalPrice();
    updateVariantAvailability();
    updateVariantLabel();
}
```

### 6. CSS Styling
**Location:** `styles/shop.css` lines 853-875

**New Styles:**
- `.selected-variant-label`: Container with gradient background
- `.variant-label-text`: Text color and font weight
- Oswald font family for rugged look
- Orange accent color (#ff6b35) for brand consistency
- Responsive font sizing with clamp()

```css
.selected-variant-label {
    margin-top: 12px;
    padding: 8px 14px;
    background: linear-gradient(135deg, rgba(255, 107, 53, 0.1) 0%, rgba(255, 107, 53, 0.05) 100%);
    border-left: 3px solid #ff6b35;
    border-radius: 6px;
    font-family: 'Oswald', sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-size: clamp(0.85rem, 2vw, 0.95rem);
    color: #333;
    font-weight: 600;
}
```

## HTML Structure
```html
<div class="modal-gallery">
    <div class="main-image-container">
        <img id="modal-main-image" src="..." alt="...">
        <button class="gallery-nav gallery-prev">‹</button>
        <button class="gallery-nav gallery-next">›</button>
    </div>
    
    <!-- NEW: Variant label -->
    <div class="selected-variant-label">
        <strong>Selected:</strong> 
        <span class="variant-label-text">Brown/Khaki</span>
    </div>
    
    <div class="image-thumbnails">
        <button class="thumbnail" data-variant-id="12345">
            <img src="..." alt="Brown/Khaki">
        </button>
        <button class="thumbnail active" data-variant-id="12346">
            <img src="..." alt="Black">
        </button>
        <!-- More thumbnails... -->
    </div>
</div>
```

## Data Flow

### When Modal Opens
1. `openProductModal(product)` called
2. `buildImageGallery()` collects ALL variant images
3. First variant (or previously selected) set as active
4. Thumbnail with matching `variantId` gets `.active` class
5. Variant label shows selected variant name

### When User Clicks Thumbnail
1. Click event on `.thumbnail` button
2. Extract `data-variant-id` attribute
3. Find matching variant in `product.variants`
4. Update `currentVariant` = found variant
5. Call `updateModalPrice()` → updates price display
6. Call `updateVariantAvailability()` → updates stock status
7. Call `updateVariantLabel()` → updates variant name
8. Add `.active` class to clicked thumbnail

### When User Uses Arrow Navigation
1. Click `.gallery-prev` or `.gallery-next`
2. `navigateGallery(direction)` called
3. Calculate new `currentImageIndex`
4. Get image at new index (includes variant metadata)
5. If image has variant, update `currentVariant`
6. Call price, availability, and label update functions
7. Update main image and thumbnail active state

### When User Adds to Cart
1. Click "Add to Cart" button
2. `addItemToCart(product, currentVariant, quantity)`
3. Cart item includes:
   - `variant.imageUrl` (correct variant image)
   - `variant.optionLabel` (correct variant name)
   - `variant.price` (correct price)
   - `variant.id` (for Printful order creation)

## Testing Checklist

### Visual Tests
- [ ] All variant thumbnails display correctly
- [ ] Selected thumbnail has orange border (`.active` class)
- [ ] Main image shows correct variant
- [ ] Variant label displays below main image
- [ ] Label shows correct variant name
- [ ] Price updates when variant changes
- [ ] Availability status updates correctly

### Interaction Tests
- [ ] Click thumbnail → variant changes
- [ ] Click thumbnail → price updates
- [ ] Click thumbnail → availability updates
- [ ] Click thumbnail → label updates
- [ ] Left arrow → previous variant
- [ ] Right arrow → next variant
- [ ] Arrow navigation → updates all fields
- [ ] First/last wrap-around works

### Cart Tests
- [ ] Add to cart → correct variant image
- [ ] Add to cart → correct variant name
- [ ] Add to cart → correct price
- [ ] Shopping cart page → correct image
- [ ] Checkout page → correct image
- [ ] Multiple variants → distinct cart items

### Edge Cases
- [ ] Product with 1 variant → no navigation
- [ ] Product with no variant images → fallback to product image
- [ ] Out of stock variant → "Unavailable" message
- [ ] Rapid clicking → no race conditions
- [ ] Mobile view → thumbnails scroll horizontally

## Benefits

### For Users
✅ Visual variant selection (see what you're getting)
✅ Faster selection (no dropdown searching)
✅ More intuitive (click the image you want)
✅ Clear feedback (selected variant always visible)

### For Developer
✅ Cleaner code (single selection mechanism)
✅ Better state management (variant = displayed image)
✅ Reduced complexity (no dropdown sync issues)
✅ Consistent with modern e-commerce UX

## Files Modified
1. `scripts/shop.js` - Complete variant selection system
2. `styles/shop.css` - Variant label styling
3. `api/printfulCatalog.js` - Variant label cleaning (earlier change)

## Related Documentation
- `VARIANT_ID_FIX.md` - Earlier variant image fixes
- `US_COLOR_UPDATE.md` - Color variant handling
- `QUICK_FIX_SUMMARY.md` - Modal viewport fixes

## Notes
- Dropdown still appears for products where not all variants have images
- System automatically detects and adapts to available data
- Cart and checkout already use variant images (earlier fixes)
- No breaking changes to existing functionality

## Future Enhancements
- [ ] Add variant color swatches (if available in Printful data)
- [ ] Add keyboard navigation (arrow keys)
- [ ] Add touch swipe for mobile
- [ ] Preload variant images for faster switching
- [ ] Add transition animations between variants
