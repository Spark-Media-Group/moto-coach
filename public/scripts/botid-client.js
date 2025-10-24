const BOT_PROTECTION_SCRIPT_URL = 'https://cdn.vercel-insights.com/v1/botd/script.js';
const registeredRoutes = [];
let scriptPromise = null;

function normaliseRoute(route) {
    if (!route || typeof route.path !== 'string' || !route.path.trim()) {
        return null;
    }

    const method = (route.method || 'POST').toUpperCase();

    return {
        path: route.path.trim(),
        method
    };
}

function mergeRoutes(routes) {
    if (!Array.isArray(routes)) {
        return;
    }

    const existingKeys = new Set(registeredRoutes.map(route => `${route.method}:${route.path}`));

    for (const route of routes) {
        const normalised = normaliseRoute(route);
        if (!normalised) {
            continue;
        }

        const key = `${normalised.method}:${normalised.path}`;
        if (!existingKeys.has(key)) {
            registeredRoutes.push(normalised);
            existingKeys.add(key);
        }
    }
}

function loadBotProtectionScript() {
    if (typeof document === 'undefined') {
        return Promise.reject(new Error('BotID script can only be loaded in the browser.'));
    }

    if (!scriptPromise) {
        scriptPromise = new Promise((resolve, reject) => {
            const existingScript = document.querySelector('script[data-vercel-bot-protection="true"]');
            if (existingScript) {
                if (existingScript.dataset.loaded === 'true') {
                    resolve();
                    return;
                }

                existingScript.addEventListener('load', () => resolve());
                existingScript.addEventListener('error', (event) => reject(event?.error || new Error('Failed to load BotID script.')));
                return;
            }

            const script = document.createElement('script');
            script.src = BOT_PROTECTION_SCRIPT_URL;
            script.async = true;
            script.defer = true;
            script.dataset.vercelBotProtection = 'true';

            script.addEventListener('load', () => {
                script.dataset.loaded = 'true';
                resolve();
            });

            script.addEventListener('error', (event) => {
                reject(event?.error || new Error('Failed to load BotID script.'));
            });

            document.head.appendChild(script);
        });
    }

    return scriptPromise;
}

function getBotClient() {
    if (typeof window === 'undefined') {
        return null;
    }

    const candidates = [
        window.__vercelBotProtection,
        window.__vercelBotId,
        window.botd,
        window.vercelBotProtection
    ];

    for (const candidate of candidates) {
        if (candidate && typeof candidate.protect === 'function') {
            return candidate;
        }

        if (candidate && typeof candidate.init === 'function') {
            return candidate;
        }
    }

    return null;
}

function registerRoutesWithClient(client, routes) {
    if (!client || !routes.length) {
        return false;
    }

    try {
        if (typeof client.protect === 'function') {
            client.protect({ protect: routes, routes });
            return true;
        }

        if (typeof client.init === 'function') {
            client.init({ protect: routes, routes });
            return true;
        }
    } catch (error) {
        console.warn('Vercel BotID client registration failed:', error);
    }

    return false;
}

export async function ensureBotIdClient(routes = []) {
    mergeRoutes(routes);

    if (!registeredRoutes.length) {
        return false;
    }

    if (typeof window === 'undefined') {
        return false;
    }

    let client = getBotClient();
    if (registerRoutesWithClient(client, registeredRoutes)) {
        return true;
    }

    try {
        await loadBotProtectionScript();
    } catch (error) {
        console.warn('Failed to load Vercel BotID protection script:', error);
        return false;
    }

    client = getBotClient();
    if (!client) {
        console.warn('Vercel BotID client was not initialised after loading the script.');
        return false;
    }

    return registerRoutesWithClient(client, registeredRoutes);
}
