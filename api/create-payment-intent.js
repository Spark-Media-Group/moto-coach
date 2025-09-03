const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { amount, currency = 'aud', metadata = {} } = req.body;

        // Validate required fields
        if (!amount || amount <= 0) {
            return res.status(400).json({ 
                error: 'Invalid amount',
                details: 'Amount must be a positive number'
            });
        }

        // Create payment intent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100), // Convert to cents
            currency: currency.toLowerCase(),
            metadata: {
                source: 'moto_coach_track_reservation',
                ...metadata
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
