# 🏍️ Stripe Metadata Quick Reference

## Common Dashboard Filters

### Payment Types
```
Event Registration:  metadata["payment_source"]:event_registration
Shop Order:          metadata["payment_source"]:shop_order  
Mixed Order:         metadata["payment_source"]:mixed
```

### Event Filters
```
Multi-Event Bundle:  metadata["registration_type"]:multi_event_bundle
With Discount:       metadata["bundle_discount"]:true
High Rider Count:    metadata["rider_count"] >= 3
Specific Event:      metadata["event_names"] CONTAINS "Track Day"
```

### Shop Filters
```
Australia Orders:    metadata["shipping_country"]:Australia
Multiple Items:      metadata["shop_item_count"] >= 3
International:       metadata["shipping_country"]:United States
```

### Revenue Analysis
```
High Value:          metadata["total_revenue"] > 500
Event Revenue:       Use field: event_revenue
Shop Revenue:        Use field: shop_revenue
Mixed Breakdown:     Use fields: event_portion, shop_portion
```

## Key Metadata Fields

**Always Present:**
- `payment_source`, `total_revenue`, `currency`, `customer_email`

**Event Bookings:**
- `event_count`, `rider_count`, `event_names`, `event_dates`, `event_revenue`

**Shop Orders:**
- `shop_item_count`, `shop_items`, `shop_revenue`, `shipping_country`

**Mixed Orders:**
- All above + `event_portion` and `shop_portion`

## Test Commands

```bash
# Run metadata test
node testing/test-stripe-metadata.js

# Check files modified
git status
```

## Files Changed
- `scripts/checkout.js` - Enhanced createPaymentIntent()
- `api/create-payment-intent.js` - Added logging
- `testing/test-stripe-metadata.js` - Test script
- `STRIPE_METADATA_GUIDE.md` - Full documentation

---
*For detailed documentation, see STRIPE_METADATA_GUIDE.md*
