const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
import { applyCors } from './_utils/cors';

export default async function handler(req, res) {
    const cors = applyCors(req, res, {
        methods: ['POST', 'OPTIONS'],
        headers: ['Content-Type']
    });

    if (cors.handled) {
        return;
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { amount, currency = 'aud', metadata = {}, taxDisplayMode } = req.body;

        // Validate required fields
        if (!amount || amount <= 0) {
            return res.status(400).json({ 
                error: 'Invalid amount',
                details: 'Amount must be a positive number'
            });
        }

        // Log metadata for debugging (will appear in Vercel logs)
        console.log('Creating payment intent with metadata:', {
            amount,
            currency,
            taxDisplayMode,
            payment_source: metadata.payment_source,
            event_count: metadata.event_count,
            shop_item_count: metadata.shop_item_count
        });

        // Create payment intent with comprehensive metadata
        // Amount is the exact Printful-calculated total (no automatic tax or FX fees)
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100), // Convert to cents
            currency: currency.toLowerCase(),
            metadata: {
                source: 'moto_coach_website',
                timestamp: new Date().toISOString(),
                tax_display_mode: taxDisplayMode || 'unknown',
                ...metadata
            },
            automatic_payment_methods: {
                enabled: true,
                allow_redirects: 'always'
            }
            // Note: No automatic_tax - using Printful's exact calculated totals
        });

        console.log('Payment intent created successfully:', paymentIntent.id);

        res.status(200).json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id
        });

    } catch (error) {
        console.error('Error creating payment intent:', error);
        res.status(500).json({
            error: 'Payment setup failed',
            details: error.message
        });
    }
}
