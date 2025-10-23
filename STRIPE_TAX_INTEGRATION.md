# Stripe Tax Integration Summary

## Problem
Printful's V2 Order Estimation API was failing with "Property `source` is required" errors, making it impossible to calculate sales tax for US orders through Printful.

## Solution
Implemented **Stripe Tax API** for accurate US sales tax calculations while continuing to use Printful for shipping costs.

## Implementation

### New Endpoint: `/api/calculate-tax`
- Uses Stripe Tax API to calculate state-specific sales tax
- Accepts line items, shipping cost, and customer address
- Returns accurate tax amounts with jurisdiction breakdown

### Updated Checkout Flow
**For US addresses:**
1. ✅ **Printful Shipping API** → Get shipping cost ($4.10 for Charlotte, NC)
2. ✅ **Stripe Tax API** → Calculate sales tax based on:
   - Line items (product prices)
   - Shipping cost
   - Delivery address (state-specific rates)
3. ✅ Display: **Shop items + Shipping + Tax + Total**

**For AU/NZ addresses:**
- Continues using existing Printful retail_costs (GST-inclusive)

## Benefits
- ✅ Accurate US sales tax calculations (state & local)
- ✅ Stripe Tax handles nexus determination automatically
- ✅ Real-time tax rates (updated by Stripe)
- ✅ Tax breakdown by jurisdiction available
- ✅ Reliable API (Stripe vs broken Printful V2)

## Endpoints Used

### Printful - Shipping Only
```
POST https://api.printful.com/shipping/rates
```
Returns shipping cost, NO tax.

### Stripe - Tax Calculation
```
POST /api/calculate-tax
```
Returns accurate US sales tax with breakdown.

## Example for Charlotte, NC
- **Product:** Trucker Cap ($12.53)
- **Shipping:** $4.10 (via Printful)
- **Tax:** ~$1.16 (7% NC sales tax via Stripe)
- **Total:** $17.79

## Files Changed
- `api/calculate-tax.js` - New Stripe Tax endpoint
- `scripts/checkout.js` - Updated to use both APIs

## Deployment
Committed to `dev` branch (commit 633af77)
Auto-deployed to Vercel
