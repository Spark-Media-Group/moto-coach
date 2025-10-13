# Real-Time Shipping Calculation Implementation

## Overview
Successfully implemented real-time shipping cost calculation in the checkout page that fetches actual Printful shipping rates as the user enters their address.

## What Was Implemented

### 1. Backend API Endpoint (`/api/printfulShippingRates.js`)
Created a new serverless endpoint that:
- Accepts recipient address and cart items
- Validates required address fields (address1, city, country, postal code)
- Calls Printful's `/shipping/rates` API
- Returns all available shipping options
- Identifies the cheapest shipping option
- Handles errors gracefully

**Key Features:**
- Full address validation
- Support for multiple items in cart
- Returns shipping options with delivery times
- Error handling and logging

### 2. Frontend Shipping Calculation (`scripts/checkout.js`)

#### Address Validation
- `isValidAddress()` - Validates address completeness before API call
- Requires: address1 (min 3 chars), city (min 2 chars), country, postal code (min 3 chars)
- For US, Canada, Australia: also requires state/province

#### Country Code Mapping
- `getCountryCode()` - Converts country names to ISO codes
- Maps: Australia → AU, United States → US, New Zealand → NZ, Canada → CA

#### Real-Time Calculation
- `setupShippingCalculation()` - Sets up event listeners on address fields
- Debounced by 1 second to prevent API spam
- Triggers when all required fields are filled
- Shows "Calculating..." indicator while fetching
- Updates order summary with shipping cost
- Recalculates total to include shipping

#### API Integration
- `fetchPrintfulShippingRates()` - Calls backend endpoint with address
- Extracts Printful variant IDs from cart items
- Stores shipping method details in checkout data
- Updates cost breakdown (subtotal + shipping + tax = total)
- Saves to sessionStorage for persistence
- Re-renders order summary with new totals

## How It Works

### User Flow:
1. User adds items to cart from shop page
2. User clicks "Proceed to Checkout"
3. User fills in shipping address fields:
   - Address line 1
   - City
   - Country (dropdown)
   - State/Province (dropdown, enabled after country selection)
   - Postal Code

### Automatic Calculation:
4. As user types, event listeners monitor address fields
5. When all required fields are complete (1 second after last change):
   - Address is validated
   - API call is made to `/api/printfulShippingRates`
   - Backend calls Printful's shipping rates API
   - Cheapest shipping option is selected
6. Order summary updates automatically:
   - "Calculated separately" → "$4.49 USD" (example)
   - Total updates to include shipping cost
7. Shipping cost persists in sessionStorage

### Payment Flow:
8. User proceeds with payment
9. Order includes pre-calculated shipping cost
10. No timeout issues because shipping was already calculated

## Test Results

### Test Case: Trucker Cap to Charlotte, NC
- **Product:** Trucker Cap / Charcoal/Black
- **Retail Price:** $19.50
- **Address:** 10748 Hellebore Rd, Charlotte, NC 28213
- **Shipping Options:**
  - Flat Rate: $4.49 (4-6 days)
  - Carbon Offset: $4.58 (4-6 days)
- **Selected:** Cheapest option ($4.49)
- **Total:** $23.99 (product + shipping)

## Benefits

1. **Better UX:** Users see total cost before entering payment info
2. **No Surprises:** Shipping cost is transparent upfront
3. **No Timeouts:** Shipping calculated early, not during payment
4. **Real-Time:** Updates as user types their address
5. **Smart:** Only calculates when address is complete and valid
6. **Efficient:** Debounced to prevent excessive API calls
7. **Accurate:** Uses actual Printful shipping rates for real destination

## Files Modified

### New Files:
- `api/printfulShippingRates.js` - Backend endpoint for shipping rates

### Modified Files:
- `scripts/checkout.js`:
  - Added `fetchPrintfulShippingRates()` function
  - Added `setupShippingCalculation()` function  
  - Added `isValidAddress()` validation helper
  - Added `getCountryCode()` mapping helper
  - Enhanced cost calculation to include shipping
  - Auto-calls shipping calculation on page load

## Environment Variables Required
- `PRINTFUL_API_KEY` - Must be set in Vercel environment variables

## Testing the Feature

### Manual Testing:
1. Add any product to cart
2. Go to checkout page
3. Fill in address:
   - Address: 10748 Hellebore Rd
   - City: Charlotte
   - Country: United States
   - State: North Carolina (NC)
   - Postal Code: 28213
4. Watch order summary update with shipping cost
5. Verify total includes shipping

### Console Logging:
The implementation includes detailed console logging:
- `"Valid address detected, calculating shipping..."` - When address is complete
- `"✅ Shipping calculated: $X.XX (Method Name)"` - When successful
- Error messages if API call fails

## Next Steps

The shipping calculation is now live and will:
- Show real shipping costs to customers
- Prevent timeout errors during checkout
- Provide accurate totals before payment
- Use Printful's actual shipping rates

## Known Limitations

1. Requires valid Printful API key in environment
2. Only calculates for addresses with all required fields
3. Uses cheapest shipping option by default (future: let user choose)
4. Currently supports US, Canada, Australia, New Zealand (expandable)

## Future Enhancements

- [ ] Let user choose from multiple shipping options
- [ ] Add international shipping support for more countries  
- [ ] Show delivery date estimates in UI
- [ ] Cache shipping rates for same address
- [ ] Add loading spinner animation
- [ ] Validate address format (street numbers, etc.)
