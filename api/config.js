import { applyCors } from './_utils/cors';
import { isLiveEnvironment } from './_utils/environment';

export default async function handler(req, res) {
    const cors = applyCors(req, res, {
        methods: ['GET', 'OPTIONS'],
        headers: ['Content-Type']
    });

    if (cors.handled) {
        return;
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Only return public configuration that's safe to expose
        const botProtectionEnabled = isLiveEnvironment();
        const config = {
            botProtectionEnabled,
            // Add other public config here if needed
        };

        res.status(200).json(config);
    } catch (error) {
        console.error('Error getting config:', error);
        res.status(500).json({ error: 'Failed to get configuration' });
    }
}
