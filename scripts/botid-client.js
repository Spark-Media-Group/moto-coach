const BOTID_MODULE_URL = 'https://esm.sh/botid@0.2.0/client?bundle';
const registeredRoutes = [];
let botIdModulePromise = null;

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

function loadBotIdModule() {
    if (!botIdModulePromise) {
        botIdModulePromise = import(BOTID_MODULE_URL).catch(error => {
            console.warn('Failed to load Vercel BotID client module:', error);
            botIdModulePromise = null;
            throw error;
        });
    }

    return botIdModulePromise;
}

export async function ensureBotIdClient(routes = []) {
    mergeRoutes(routes);

    if (!registeredRoutes.length) {
        return false;
    }

    try {
        const module = await loadBotIdModule();
        if (typeof module?.initBotId === 'function') {
            module.initBotId({
                protect: registeredRoutes.slice()
            });
            return true;
        }

        console.warn('Vercel BotID client module did not expose initBotId.');
        return false;
    } catch (error) {
        console.warn('Vercel BotID client initialisation failed:', error);
        return false;
    }
}
