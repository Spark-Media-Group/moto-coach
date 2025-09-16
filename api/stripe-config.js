import { applyCors } from './_utils/cors';

export default async function handler(req, res) {
    const cors = applyCors(req, res, {
        methods: ['GET', 'OPTIONS'],
        headers: ['Content-Type']
    });

    if (cors.handled) {
        return;
    }

    // Only allow GET requests
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        res.status(200).json({
            publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
        });
    } catch (error) {
        console.error('Error getting Stripe config:', error);
        res.status(500).json({
            error: 'Configuration error'
        });
    }
}
