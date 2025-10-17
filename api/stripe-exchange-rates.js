/**
 * Stripe Exchange Rates API
 * Fetches live currency exchange rates from Stripe FX Quotes API
 * Rates are cached to reduce API calls
 */

// Cache exchange rates for 1 hour
let ratesCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

async function fetchStripeExchangeRates() {
    try {
        // Use Stripe FX Quotes API (preview) to get live exchange rates
        // This provides accurate, real-time rates directly from Stripe
        const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
        const currencies = ['usd', 'nzd', 'eur', 'gbp'];
        const rates = { AUD: 1.0 };
        
        // Fetch exchange rate for each currency (AUD to target)
        for (const currency of currencies) {
            const response = await fetch('https://api.stripe.com/v1/fx_quotes', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Stripe-Version': '2025-04-30.preview'
                },
                body: new URLSearchParams({
                    'to_currency': currency,
                    'from_currencies[]': 'aud',
                    'lock_duration': 'none'
                })
            });
            
            if (!response.ok) {
                console.error(`Failed to fetch ${currency.toUpperCase()} rate: ${response.status}`);
                continue; // Skip this currency but continue with others
            }
            
            const data = await response.json();
            
            // Extract the exchange rate (AUD to target currency)
            const exchangeRate = data.rates?.aud?.exchange_rate;
            if (exchangeRate) {
                rates[currency.toUpperCase()] = exchangeRate;
            }
        }
        
        // Ensure we got all rates, otherwise throw to use fallback
        if (Object.keys(rates).length < 5) {
            throw new Error('Failed to fetch all exchange rates');
        }
        
        return rates;
    } catch (error) {
        console.error('Error fetching Stripe exchange rates:', error);
        
        // Fallback to static rates if Stripe API fails
        return {
            AUD: 1.0,
            USD: 0.65,
            NZD: 1.08,
            EUR: 0.60,
            GBP: 0.51
        };
    }
}

module.exports = async (req, res) => {
    // Handle CORS
    const origin = req.headers?.origin || '';
    const allowedOrigins = [
        'https://motocoach.com.au',
        'https://www.motocoach.com.au',
        'https://sydneymotocoach.com',
        'https://www.sydneymotocoach.com',
        'https://smg-mc.vercel.app'
    ];
    
    // Allow Vercel preview deployments
    const isVercelPreview = origin && /\.vercel\.app$/i.test(new URL(origin).hostname);
    
    if (allowedOrigins.includes(origin) || isVercelPreview) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Check if we have valid cached rates
        const now = Date.now();
        const isCacheValid = ratesCache && cacheTimestamp && (now - cacheTimestamp < CACHE_DURATION);

        if (isCacheValid) {
            console.log('Returning cached exchange rates');
            return res.status(200).json({
                rates: ratesCache,
                cached: true,
                timestamp: cacheTimestamp
            });
        }

        // Fetch fresh rates from Stripe
        console.log('Fetching fresh exchange rates from Stripe');
        const rates = await fetchStripeExchangeRates();

        // Update cache
        ratesCache = rates;
        cacheTimestamp = now;

        return res.status(200).json({
            rates,
            cached: false,
            timestamp: cacheTimestamp
        });

    } catch (error) {
        console.error('Exchange rates API error:', error);
        
        // Return fallback rates
        return res.status(200).json({
            rates: {
                AUD: 1.0,
                USD: 0.65,
                NZD: 1.08,
                EUR: 0.60,
                GBP: 0.51
            },
            cached: false,
            fallback: true,
            error: 'Using fallback rates'
        });
    }
};
