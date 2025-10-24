import Stripe from 'stripe';
import { applyCors } from './_utils/cors';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
    const cors = applyCors(req, res, {
        methods: ['POST', 'OPTIONS'],
        headers: ['Content-Type']
    });

    if (cors.handled) {
        return;
    }

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { lineItems, currency, customerDetails } = req.body;

        if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
            return res.status(400).json({ error: 'Line items are required' });
        }

        if (!customerDetails || !customerDetails.address) {
            return res.status(400).json({ error: 'Customer address is required' });
        }

        // Create a tax calculation using Stripe Tax API
        const calculation = await stripe.tax.calculations.create({
            currency: currency || 'usd',
            line_items: lineItems.map(item => ({
                amount: Math.round(parseFloat(item.amount) * 100), // Convert to cents
                reference: item.id || item.reference || 'item',
                tax_code: item.taxCode || 'txcd_99999999', // General tangible goods
            })),
            customer_details: {
                address: {
                    line1: customerDetails.address.line1,
                    city: customerDetails.address.city,
                    state: customerDetails.address.state,
                    postal_code: customerDetails.address.postal_code,
                    country: customerDetails.address.country || 'US',
                },
                address_source: 'shipping',
            },
            shipping_cost: customerDetails.shippingCost ? {
                amount: Math.round(parseFloat(customerDetails.shippingCost) * 100),
            } : undefined,
        });

        // Extract tax amounts
        const taxAmount = calculation.tax_amount_exclusive / 100;
        const totalAmount = calculation.amount_total / 100;

        return res.status(200).json({
            success: true,
            taxAmount,
            totalAmount,
            currency: calculation.currency.toUpperCase(),
            taxBreakdown: calculation.tax_breakdown?.map(item => ({
                amount: item.amount / 100,
                rate: item.tax_rate_details?.percentage_decimal,
                jurisdiction: item.tax_rate_details?.display_name,
            })) || [],
            calculation,
        });
    } catch (error) {
        console.error('Tax calculation error:', error);
        return res.status(500).json({
            error: 'Failed to calculate tax',
            details: error.message,
        });
    }
}
