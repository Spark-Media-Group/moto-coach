/**
 * Stripe Exchange Rates API
 * Fetches live currency exchange rates from Stripe
 * Rates are cached to reduce API calls
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { handleCors } = require('./_utils/cors');

// Cache exchange rates for 1 hour
let ratesCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

async function fetchStripeExchangeRates() {
    try {
        // Fetch exchange rates from Stripe
        // Stripe provides rates with USD as base currency
        const rates = await stripe.exchangeRates.retrieve('aud');
        
        if (!rates || !rates.rates) {
            throw new Error('Invalid response from Stripe exchange rates API');
        }

        // Extract the rates we need
        return {
            AUD: 1.0, // Base currency
            USD: rates.rates.usd || 0.65,
            NZD: rates.rates.nzd || 1.08,
            EUR: rates.rates.eur || 0.60,
            GBP: rates.rates.gbp || 0.51
        };
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
    const corsHeaders = handleCors(req);
    Object.entries(corsHeaders).forEach(([key, value]) => {
        res.setHeader(key, value);
    });

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
