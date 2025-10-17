# Multi-Currency Implementation Guide

## Overview
Your Moto Coach shop now supports multiple currencies! Customers can choose their preferred currency (AUD, USD, NZD, EUR, GBP) and see prices displayed in that currency throughout the shopping experience.

## Features Implemented

### 1. Currency Selector
- Located in the shop controls area (next to the sort dropdown)
- Dropdown with 5 currency options:
  - AUD $ (Australian Dollar) - Default
  - USD $ (US Dollar)
  - NZD $ (New Zealand Dollar)
  - EUR € (Euro)
  - GBP £ (British Pound)

### 2. Live Exchange Rates from Stripe ✨
- **Real-time rates**: Fetched directly from Stripe's Exchange Rates API
- **Automatic caching**: Rates cached for 1 hour to reduce API calls
- **Fallback system**: Uses cached rates (24h max) or static fallback if API fails
- **localStorage cache**: Rates saved locally for offline fallback
- Exchange rates are fetched on page load before products display

### 3. Price Conversion
- All prices are stored in AUD (Printful's base currency)
- Prices are converted in real-time using live Stripe rates
- Conversion happens at display time (products, modal, cart)
- Stripe's rates ensure accuracy with actual payment processing
- User's currency choice is saved to `localStorage`
- Currency preference persists across page refreshes
- Key: `motocoach_currency`

### 4. Real-time Updates
When a user changes currency:
- All product card prices update immediately
- Modal prices update (if modal is open)
- Cart prices update
- Cart subtotal updates

## Where Prices Are Converted

1. **Product Grid** (`renderProducts()`)
   - Product card prices converted and displayed

2. **Product Modal** (`openProductModal()`)
   - Modal price display converted

3. **Shopping Cart** (`updateCartUI()`)
   - Individual item prices converted
   - Subtotal converted

4. **Cart Totals** (`calculateCartTotals()`)
   - Subtotal calculated in AUD, then converted

## Next Steps for Stripe Integration

To complete the multi-currency payment flow with Stripe:

### 1. Update Checkout Page
Add currency selector to `checkout.html` (similar to shop page)

### 2. Pass Currency to Stripe
When creating a payment intent in `create-payment-intent.js`, pass the selected currency:

```javascript
const paymentIntent = await stripe.paymentIntents.create({
  amount: Math.round(totalAmount * 100), // Convert to cents
  currency: selectedCurrency.toLowerCase(), // e.g., 'usd', 'aud'
  automatic_payment_methods: {
    enabled: true,
  },
});
```

### 3. Convert Order Total for Stripe
```javascript
// In checkout.js
const selectedCurrency = localStorage.getItem('motocoach_currency') || 'AUD';
const audTotal = calculateCartTotal(); // Original AUD total
const convertedTotal = convertPrice(audTotal, selectedCurrency);

// Send to Stripe
const response = await fetch('/api/create-payment-intent', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    amount: convertedTotal,
    currency: selectedCurrency
  })
});
```

### 4. Update Printful Order Creation
When creating orders in Printful, always use AUD prices (Printful's requirement). Convert back if needed:

```javascript
// If user paid in USD, convert back to AUD for Printful
const audPrice = paidPrice / EXCHANGE_RATES[selectedCurrency];
```

## Updating Exchange Rates

### ✅ Current Implementation: Live Stripe Rates
The system now fetches real-time exchange rates from Stripe's API!

**How it works:**
1. On page load, `fetchExchangeRates()` is called
2. Requests rates from `/api/stripe-exchange-rates` endpoint
3. Endpoint calls Stripe's Exchange Rates API: `stripe.exchangeRates.retrieve('aud')`
4. Rates are cached for 1 hour to reduce API calls
5. If API fails, falls back to cached rates or static fallback

**Cache Strategy:**
- Server-side: 1 hour cache in memory
- Client-side: 24 hour max age in localStorage
- Automatic refresh when cache expires

**Fallback Rates:**
If all else fails, static rates are used:
```javascript
const FALLBACK_EXCHANGE_RATES = {
    'AUD': 1.0,
    'USD': 0.65,
    'NZD': 1.08,
    'EUR': 0.60,
    'GBP': 0.51
};
```

### Manual Rate Updates
To update fallback rates, edit `FALLBACK_EXCHANGE_RATES` in `shop.js`.

## Testing Multi-Currency

1. Open shop page
2. Select a currency from the dropdown
3. Verify all product prices update
4. Open a product modal - price should be in selected currency
5. Add to cart - cart prices should be in selected currency
6. Refresh page - currency preference should persist
7. Change currency again - all prices should update immediately

## Important Notes

- **Printful Integration**: Printful orders must be created in AUD (their system requirement)
- **Stripe Settlement**: Configure Stripe to settle in AUD to match Printful
- **Exchange Rate Updates**: Update rates weekly or integrate a live API
- **Tax Implications**: Consult with accountant about multi-currency tax reporting
- **Rounding**: Prices are rounded to 2 decimal places

## Files Modified

1. **`shop.html`** - Added currency selector dropdown
2. **`shop.css`** - Styled currency selector
3. **`shop.js`** - Core multi-currency logic:
   - Exchange rate conversion
   - Currency preference storage
   - Price conversion in all views
   - Currency change event handling
   - Live rate fetching from API
   - Intelligent caching system
4. **`api/stripe-exchange-rates.js`** - NEW: Serverless API endpoint
   - Fetches live rates from Stripe
   - Implements 1-hour server-side cache
   - Provides fallback rates on error

## API Endpoint Details

### `/api/stripe-exchange-rates`
**Method:** GET  
**Response:**
```json
{
  "rates": {
    "AUD": 1.0,
    "USD": 0.6542,
    "NZD": 1.0823,
    "EUR": 0.5987,
    "GBP": 0.5124
  },
  "cached": false,
  "timestamp": 1697472000000
}
```

**Caching:** 
- Rates cached in memory for 1 hour
- Reduces Stripe API calls
- Returns `cached: true` when serving from cache

**Error Handling:**
- Returns fallback rates on error
- Includes `fallback: true` flag
- Never throws errors to client

## Support

For questions or issues with multi-currency:
1. Check browser console for errors
2. Verify `localStorage` is working (check in DevTools)
3. Test with different currencies
4. Check Stripe dashboard for currency settings

---

**Remember**: This is client-side currency display only. Stripe handles the actual payment processing and currency conversion on their end.
