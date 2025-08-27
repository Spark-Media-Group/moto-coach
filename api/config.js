export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Only return public configuration that's safe to expose
        const config = {
            recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY,
            // Add other public config here if needed
        };

        res.status(200).json(config);
    } catch (error) {
        console.error('Error getting config:', error);
        res.status(500).json({ error: 'Failed to get configuration' });
    }
}
