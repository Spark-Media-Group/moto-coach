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

### 2. Price Conversion
- All prices are stored in AUD (Printful's base currency)
- Prices are converted in real-time when displayed
- Exchange rates are defined in `shop.js`:
  ```javascript
  const EXCHANGE_RATES = {
      'AUD': 1.0,    // Base currency
      'USD': 0.65,   // 1 AUD = 0.65 USD
      'NZD': 1.08,   // 1 AUD = 1.08 NZD
      'EUR': 0.60,   // 1 AUD = 0.60 EUR
      'GBP': 0.51    // 1 AUD = 0.51 GBP
  };
  ```

### 3. Persistent Currency Preference
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

### Option 1: Manual Updates (Current)
Edit the `EXCHANGE_RATES` object in `shop.js` with current rates.

### Option 2: Live Exchange Rates (Recommended)
Fetch rates from an API on page load:

```javascript
async function fetchExchangeRates() {
  try {
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/AUD');
    const data = await response.json();
    return {
      'AUD': 1.0,
      'USD': data.rates.USD,
      'NZD': data.rates.NZD,
      'EUR': data.rates.EUR,
      'GBP': data.rates.GBP
    };
  } catch (error) {
    console.error('Failed to fetch exchange rates:', error);
    return EXCHANGE_RATES; // Fallback to static rates
  }
}
```

### Option 3: Use Stripe's Dynamic Currency Conversion
Let Stripe handle the currency conversion automatically. Stripe will:
- Show prices in customer's local currency
- Handle conversion at current rates
- Settle to your account in AUD
- Charge a small fee for conversion

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

1. `shop.html` - Added currency selector dropdown
2. `shop.css` - Styled currency selector
3. `shop.js` - Core multi-currency logic:
   - Exchange rate conversion
   - Currency preference storage
   - Price conversion in all views
   - Currency change event handling

## Support

For questions or issues with multi-currency:
1. Check browser console for errors
2. Verify `localStorage` is working (check in DevTools)
3. Test with different currencies
4. Check Stripe dashboard for currency settings

---

**Remember**: This is client-side currency display only. Stripe handles the actual payment processing and currency conversion on their end.
