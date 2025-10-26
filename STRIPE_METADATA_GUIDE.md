# 🏍️ Moto Coach Stripe Metadata Guide

## Overview

This guide explains the comprehensive metadata system implemented for Stripe Payment Intents. This metadata provides powerful business intelligence directly in your Stripe Dashboard.

---

## 📊 Metadata Fields Reference

### Core Fields (All Payments)

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `payment_source` | enum | Type of payment | `event_registration`, `shop_order`, `mixed` |
| `cart_id` | string | Cart identifier or `event_registration` | `cart_abc123` |
| `total_revenue` | decimal | Total payment amount | `1140.00` |
| `currency` | string | Currency code | `AUD`, `USD` |
| `customer_email` | email | Customer's email address | `rider@motocoach.com.au` |
| `source` | string | Platform identifier | `moto_coach_website` |
| `timestamp` | ISO date | When payment intent was created | `2025-01-15T10:30:00Z` |

### Event Registration Fields

Only present when `payment_source` is `event_registration` or `mixed`:

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `event_count` | integer | Number of events booked | `2` |
| `rider_count` | integer | Number of riders | `3` |
| `registration_type` | enum | Single or bundle | `multi_event_bundle`, `single_event` |
| `event_names` | string | Comma-separated event titles | `Track Day Premium, Weekend Bootcamp` |
| `event_dates` | string | Comma-separated dates | `15/01/2025, 22/01/2025` |
| `per_rider_rate` | decimal | Rate per rider | `195.00` |
| `bundle_discount` | boolean | Bundle discount applied | `true`, `false` |
| `event_revenue` | decimal | Revenue from events only | `1140.00` |

### Shop Order Fields

Only present when `payment_source` is `shop_order` or `mixed`:

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `shop_item_count` | integer | Number of distinct products | `3` |
| `shop_items` | string | Comma-separated items with quantity | `Moto Coach Jersey (x2), Hat (x1)` |
| `shop_revenue` | decimal | Revenue from shop only | `180.00` |
| `shipping_country` | string | Destination country | `Australia`, `United States` |
| `shipping_method` | string | Shipping service used | `Express Shipping` |

### Mixed Order Fields

Only present when `payment_source` is `mixed`:

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `event_portion` | decimal | Revenue from events | `380.00` |
| `shop_portion` | decimal | Revenue from shop | `75.00` |

---

## 🔍 Stripe Dashboard Filtering Examples

### By Payment Source

**View all event registrations:**
```
metadata["payment_source"]:event_registration
```

**View all shop orders:**
```
metadata["payment_source"]:shop_order
```

**View mixed orders (event + shop):**
```
metadata["payment_source"]:mixed
```

### By Event Registration Type

**Multi-event bundles only:**
```
metadata["registration_type"]:multi_event_bundle
```

**Single event bookings:**
```
metadata["registration_type"]:single_event
```

**Events with bundle discounts:**
```
metadata["bundle_discount"]:true
```

### By Rider/Customer Behavior

**High-value bookings (3+ riders):**
```
metadata["rider_count"] >= 3
```

**Multi-event bookings:**
```
metadata["event_count"] > 1
```

**Specific event bookings:**
```
metadata["event_names"] CONTAINS "Track Day Premium"
```

### By Geography

**Australian shop orders:**
```
metadata["payment_source"]:shop_order AND metadata["shipping_country"]:Australia
```

**International orders:**
```
metadata["shipping_country"]:United States OR metadata["shipping_country"]:New Zealand
```

### By Revenue Analysis

**High-value orders (over $500):**
```
metadata["total_revenue"] > 500
```

**Event-only revenue:**
```
metadata["payment_source"]:event_registration
```

**Compare event vs shop revenue in mixed orders:**
```
metadata["payment_source"]:mixed
```
Then view `event_portion` vs `shop_portion` fields.

### By Time Period

**Specific event dates:**
```
metadata["event_dates"] CONTAINS "January 2025"
```

**Combined filters for detailed analysis:**
```
metadata["payment_source"]:event_registration 
AND metadata["rider_count"] >= 3 
AND metadata["bundle_discount"]:true
```

---

## 📈 Business Intelligence Use Cases

### Revenue Analytics

1. **Event vs Shop Performance**
   - Filter by `payment_source` to compare event vs shop revenue
   - View `event_revenue` and `shop_revenue` fields
   - Track mixed orders to see cross-selling success

2. **Bundle Discount Effectiveness**
   - Filter `bundle_discount:true`
   - Compare `event_count` and `rider_count`
   - Calculate average booking value

3. **Geographic Distribution**
   - Filter by `shipping_country`
   - Identify key markets
   - Plan international expansion

### Customer Insights

1. **Booking Patterns**
   - Average `rider_count` per booking
   - Popular `event_names`
   - Peak booking dates from `event_dates`

2. **Product Preferences**
   - Most common items in `shop_items`
   - Average `shop_item_count`
   - Popular shipping methods

3. **High-Value Customers**
   - Filter `payment_source:mixed`
   - High `rider_count` bookings
   - Repeat customer tracking via `customer_email`

### Operational Metrics

1. **Capacity Planning**
   - Sum of `rider_count` by `event_dates`
   - Track remaining spots
   - Forecast demand

2. **Shipping Optimization**
   - `shipping_country` distribution
   - Popular `shipping_method` choices
   - International vs domestic ratio

3. **Pricing Strategy**
   - `per_rider_rate` analysis
   - Bundle discount adoption rate
   - Revenue per rider

---

## 🛠️ Technical Implementation

### Files Modified

1. **`scripts/checkout.js`**
   - Enhanced `createPaymentIntent()` function
   - Builds comprehensive metadata object
   - Calculates revenue breakdowns

2. **`api/create-payment-intent.js`**
   - Accepts metadata from frontend
   - Adds timestamp and source fields
   - Passes to Stripe API

3. **`testing/test-stripe-metadata.js`**
   - Test script to verify metadata generation
   - Simulates different payment scenarios
   - Validates all fields

### Testing

Run the test script to verify metadata generation:

```bash
node testing/test-stripe-metadata.js
```

This will simulate:
- Event-only registrations
- Shop-only orders
- Mixed orders (event + shop)

---

## 📝 Metadata Field Limits

Stripe enforces these limits on metadata:

- **Maximum fields:** 50 per object
- **Maximum key length:** 40 characters
- **Maximum value length:** 500 characters

Our implementation:
- Uses ~15-20 fields (well under 50 limit)
- All keys under 30 characters
- Long strings (event names, shop items) truncated to 490 characters

---

## 🚀 Future Enhancements

Potential additions to metadata:

1. **Customer Segments**
   - `customer_type`: new vs returning
   - `rider_experience`: beginner, intermediate, advanced
   - `ltv_segment`: customer lifetime value tier

2. **Marketing Attribution**
   - `referral_source`: where booking came from
   - `promo_code`: if discount code used
   - `campaign_id`: marketing campaign tracking

3. **Seasonal Analysis**
   - `season`: summer_2025, winter_2025
   - `booking_lead_time`: days before event
   - `day_of_week`: booking day pattern

4. **Equipment Data**
   - `bike_size`: from event registration
   - `gear_rental`: if equipment rented
   - `custom_requirements`: special requests

---

## 📞 Support

For questions about Stripe metadata:
- Check Stripe Dashboard under Payments → Metadata tab
- View this guide: `STRIPE_METADATA_GUIDE.md`
- Run test script: `node testing/test-stripe-metadata.js`

---

**Last Updated:** January 2025  
**Version:** 1.0.0
