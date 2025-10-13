// Serverless function to fetch shipping rates from Printful
// This endpoint is called from checkout.js to calculate shipping costs in real-time

const PRINTFUL_API_BASE = 'https://api.printful.com';
const PRINTFUL_API_KEY = process.env.PRINTFUL_API_KEY;

module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    if (!PRINTFUL_API_KEY) {
        console.error('PRINTFUL_API_KEY not configured');
        res.status(500).json({ error: 'Printful API key not configured' });
        return;
    }

    try {
        const { recipient, items, currency = 'USD', locale = 'en_US' } = req.body;

        // Validate required fields
        if (!recipient || !recipient.address1 || !recipient.city || !recipient.country_code || !recipient.zip) {
            res.status(400).json({ error: 'Missing required recipient address fields' });
            return;
        }

        if (!items || !Array.isArray(items) || items.length === 0) {
            res.status(400).json({ error: 'Missing or invalid items array' });
            return;
        }

        // Validate each item has variant_id and quantity
        for (const item of items) {
            if (!item.variant_id || !item.quantity) {
                res.status(400).json({ error: 'Each item must have variant_id and quantity' });
                return;
            }
        }

        // Build the payload for Printful's shipping rates API
        const payload = {
            recipient,
            items,
            currency,
            locale
        };

        console.log('Fetching shipping rates from Printful:', JSON.stringify({
            recipient: {
                city: recipient.city,
                state: recipient.state_code,
                country: recipient.country_code,
                zip: recipient.zip
            },
            itemCount: items.length
        }));

        // Call Printful's shipping rates endpoint
        const response = await fetch(`${PRINTFUL_API_BASE}/shipping/rates`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${PRINTFUL_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Printful shipping rates error:', data);
            res.status(response.status).json({
                error: data.error?.message || 'Failed to fetch shipping rates from Printful',
                details: data
            });
            return;
        }

        // Printful returns an array of shipping options
        if (!data.result || !Array.isArray(data.result)) {
            console.error('Unexpected Printful response format:', data);
            res.status(500).json({ error: 'Unexpected response format from Printful' });
            return;
        }

        const shippingOptions = data.result;

        // Find the cheapest standard shipping option
        const cheapestOption = shippingOptions.reduce((min, option) => {
            const rate = parseFloat(option.rate);
            const minRate = parseFloat(min.rate);
            return rate < minRate ? option : min;
        });

        console.log(`Shipping rates calculated: ${shippingOptions.length} options, cheapest: $${cheapestOption.rate} (${cheapestOption.name})`);

        // Return shipping options
        res.status(200).json({
            success: true,
            shippingOptions: shippingOptions,
            cheapestOption: {
                id: cheapestOption.id,
                name: cheapestOption.name,
                rate: cheapestOption.rate,
                currency: cheapestOption.currency,
                minDeliveryDays: cheapestOption.minDeliveryDays,
                maxDeliveryDays: cheapestOption.maxDeliveryDays,
                minDeliveryDate: cheapestOption.minDeliveryDate,
                maxDeliveryDate: cheapestOption.maxDeliveryDate
            }
        });

    } catch (error) {
        console.error('Error fetching Printful shipping rates:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
};
