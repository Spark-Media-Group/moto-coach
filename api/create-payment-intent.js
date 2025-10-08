import Stripe from 'stripe';
import { applyCors } from './_utils/cors';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

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

    if (!stripe) {
        console.error('Stripe secret key is not configured');
        return res.status(500).json({
            error: 'Payment setup failed',
            details: 'Payment processor is not configured'
        });
    }

    try {
        const { amount, currency = 'aud', metadata = {} } = req.body || {};

        const normalizedAmount = Number(amount);
        const sanitizedMetadata = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
            ? metadata
            : {};

        // Validate required fields
        if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
            return res.status(400).json({
                error: 'Invalid amount',
                details: 'Amount must be a positive number'
            });
        }

        // Create payment intent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(normalizedAmount * 100), // Convert to cents
            currency: String(currency || 'aud').toLowerCase(),
            metadata: {
                source: 'moto_coach_track_reservation',
                ...sanitizedMetadata
            },
            // Option A: Let Stripe surface methods dynamically, including Afterpay
            automatic_payment_methods: {
                enabled: true,
                allow_redirects: 'always' // Enable redirects for Afterpay
            }
            // Note: Removed explicit payment_method_types to let Stripe handle dynamically
        });

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
