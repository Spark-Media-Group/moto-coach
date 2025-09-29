import { isLiveEnvironment } from './environment';

let botIdModulePromise = null;

function createRequestFromNode(req) {
  try {
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
    const url = new URL(req.url || '/', `${protocol}://${host}`);
    const headers = new Headers();

    for (const [key, value] of Object.entries(req.headers || {})) {
      if (Array.isArray(value)) {
        for (const entry of value) {
          if (typeof entry === 'string') {
            headers.append(key, entry);
          }
        }
      } else if (typeof value === 'string') {
        headers.append(key, value);
      }
    }

    return new Request(url.toString(), {
      method: req.method || 'GET',
      headers
    });
  } catch (error) {
    console.warn('Failed to create Request for BotID verification:', error);
    return null;
  }
}

function loadBotIdModule() {
  if (!botIdModulePromise) {
    botIdModulePromise = import('botid/server').catch(error => {
      console.warn('Failed to load BotID server module:', error);
      botIdModulePromise = null;
      throw error;
    });
  }

  return botIdModulePromise;
}

export async function checkBotProtection(req, context = {}) {
  const isLive = isLiveEnvironment();

  if (!isLive) {
    return {
      isBot: false,
      skipped: true,
      reason: 'Non-live environment'
    };
  }

  const request = createRequestFromNode(req);
  if (!request) {
    return {
      isBot: false,
      skipped: true,
      reason: 'Request conversion failed'
    };
  }

  try {
    const module = await loadBotIdModule();
    const checker = module?.checkBotId;
    if (typeof checker !== 'function') {
      console.warn('BotID server module did not expose checkBotId.');
      return {
        isBot: false,
        skipped: true,
        reason: 'Module missing checkBotId'
      };
    }

    const result = await checker(request, context);
    if (!result || typeof result.isBot !== 'boolean') {
      return {
        isBot: false,
        skipped: true,
        reason: 'Unexpected response'
      };
    }

    return {
      ...result,
      skipped: false
    };
  } catch (error) {
    console.warn('BotID verification failed:', error);
    return {
      isBot: false,
      skipped: true,
      error
    };
  }
}
