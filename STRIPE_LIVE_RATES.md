# Stripe Live Exchange Rates - Implementation Summary

## ✅ What's Been Implemented

Your Moto Coach shop now fetches **live, real-time exchange rates directly from Stripe** instead of using static rates.

## Architecture

```
┌─────────────┐
│   Browser   │
│  (shop.js)  │
└──────┬──────┘
       │ fetchExchangeRates()
       ▼
┌─────────────────────────────┐
│  /api/stripe-exchange-rates │  ◄─── Serverless Function
│  (Vercel Edge Function)      │      (1 hour cache)
└──────┬──────────────────────┘
       │ stripe.exchangeRates.retrieve('aud')
       ▼
┌─────────────┐
│   Stripe    │
│  API Rates  │
└─────────────┘
```

## Key Features

### 1. **Live Rate Fetching**
- Rates fetched from Stripe's Exchange Rates API
- Base currency: AUD (Australian Dollar)
- Target currencies: USD, NZD, EUR, GBP
- Updates on every page load (with caching)

### 2. **Multi-Layer Caching**
```
Priority 1: Fresh Stripe API (if > 1 hour old)
    ↓
Priority 2: Server cache (< 1 hour old)
    ↓
Priority 3: localStorage cache (< 24 hours old)
    ↓
Priority 4: Static fallback rates
```

### 3. **Error Resilience**
- Graceful degradation if Stripe API fails
- Uses cached rates from localStorage
- Falls back to static rates as last resort
- Never blocks shop loading

## Code Flow

### Frontend (shop.js)
```javascript
// 1. Page loads
initialiseShop()
  ↓
// 2. Fetch exchange rates first
fetchExchangeRates()
  ↓
// 3. Then load products
fetchPrintfulCatalog()
  ↓
// 4. Display everything with live rates
renderProducts()
```

### Backend (api/stripe-exchange-rates.js)
```javascript
// 1. Check cache (1 hour)
if (cache valid) return cached rates

// 2. Call Stripe API
const rates = await stripe.exchangeRates.retrieve('aud')

// 3. Cache and return
cache = rates
return rates
```

## Benefits

✅ **Accurate Pricing**: Matches exact rates Stripe uses for payments  
✅ **Performance**: 1-hour cache reduces API calls  
✅ **Reliability**: Multiple fallback layers ensure shop always works  
✅ **Cost-Effective**: Minimal Stripe API usage due to caching  
✅ **Real-Time**: Rates update automatically when cache expires  

## How to Test

1. **Open Browser DevTools Console**
2. **Load Shop Page**
3. **Look for logs:**
   ```
   [Exchange Rates] Fetching live rates from Stripe...
   [Exchange Rates] Successfully loaded: { cached: false, rates: {...} }
   ```
4. **Refresh Page** - Should see `cached: true` on second load
5. **Select Different Currency** - Prices update with live rates

## Monitoring Exchange Rates

### Check Current Rates
Open browser console on shop page:
```javascript
// Current rates being used
console.log(EXCHANGE_RATES);

// Check if rates are from Stripe or fallback
console.log(state.exchangeRatesLoaded); // true = Stripe, false = fallback
```

### View API Response
```bash
# Test the API endpoint directly
curl https://motocoach.com.au/api/stripe-exchange-rates
```

## Environment Variables Required

Make sure these are set in your Vercel project:

```env
STRIPE_SECRET_KEY=sk_live_... or sk_test_...
```

## Stripe API Usage

- **Endpoint:** `stripe.exchangeRates.retrieve('aud')`
- **Documentation:** https://stripe.com/docs/api/exchange_rates
- **Rate Limits:** Very generous (thousands per hour)
- **Cost:** FREE - included in Stripe account

## Cache Behavior Examples

### Scenario 1: First Load (Cold Start)
```
1. User loads shop → No cache
2. Calls Stripe API → Gets live rates
3. Caches for 1 hour
4. Saves to localStorage
Result: Fresh rates from Stripe ✓
```

### Scenario 2: Within 1 Hour
```
1. User loads shop → Cache exists (30 min old)
2. Returns cached rates immediately
3. No Stripe API call made
Result: Cached rates (still accurate) ✓
```

### Scenario 3: After 1 Hour
```
1. User loads shop → Cache expired
2. Calls Stripe API → Gets new rates
3. Updates cache
Result: Refreshed rates from Stripe ✓
```

### Scenario 4: Stripe API Failure
```
1. User loads shop → Stripe API down
2. Checks localStorage → Finds rates (8 hours old)
3. Uses cached rates (< 24h limit)
Result: Slightly outdated but functional ✓
```

### Scenario 5: Complete Failure
```
1. User loads shop → Stripe API down
2. localStorage empty or expired
3. Uses static fallback rates
Result: Shop works with fallback rates ✓
```

## Maintenance

### Updating Fallback Rates
If Stripe API is down for extended period, update fallback rates in `shop.js`:

```javascript
const FALLBACK_EXCHANGE_RATES = {
    'AUD': 1.0,
    'USD': 0.65,  // Update these
    'NZD': 1.08,
    'EUR': 0.60,
    'GBP': 0.51
};
```

### Adjusting Cache Duration
In `api/stripe-exchange-rates.js`:
```javascript
const CACHE_DURATION = 60 * 60 * 1000; // Change to 30 min: 30 * 60 * 1000
```

## Troubleshooting

### Rates Not Updating
1. Check console for errors
2. Verify `STRIPE_SECRET_KEY` is set
3. Check Stripe dashboard for API issues
4. Clear localStorage: `localStorage.clear()`

### Using Wrong Currency
1. Check: `localStorage.getItem('motocoach_currency')`
2. Reset: `localStorage.setItem('motocoach_currency', 'AUD')`

### API Errors
Check Vercel function logs:
```bash
vercel logs
```

## Next Steps

1. ✅ Live exchange rates implemented
2. ⏳ Add currency selector to checkout page
3. ⏳ Pass selected currency to Stripe payment intent
4. ⏳ Update order confirmation emails with correct currency

---

**Status:** ✅ COMPLETE - Live Stripe exchange rates are now active!
