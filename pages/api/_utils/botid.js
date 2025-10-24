import { isLiveEnvironment } from './environment';

const SCORE_HEADERS = [
  'x-vercel-bot-score',
  'x-vercel-botid-score',
  'x-botd-score',
  'x-bot-score'
];

const ACTION_HEADERS = [
  'x-vercel-bot-action',
  'x-vercel-botid-action',
  'x-botd-action',
  'x-bot-action'
];

const VERDICT_HEADERS = [
  'x-vercel-bot-result',
  'x-vercel-botid-result',
  'x-botd-result'
];

const REQUEST_ID_HEADERS = [
  'x-vercel-bot-request-id',
  'x-vercel-botid-request-id',
  'x-botd-request-id'
];

const DETECTION_ID_HEADERS = [
  'x-vercel-bot-detection-id',
  'x-vercel-botid-detection-id',
  'x-botd-detection-id'
];

function normaliseHeader(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.find((entry) => typeof entry === 'string' && entry.trim().length > 0) || null;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  return null;
}

function getHeaderValue(req, headerNames) {
  if (!req?.headers) {
    return null;
  }

  for (const name of headerNames) {
    const headerValue = normaliseHeader(req.headers[name]);
    if (headerValue !== null) {
      return headerValue;
    }
  }

  return null;
}

function parseScore(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const numeric = Number.parseFloat(value);
  if (Number.isNaN(numeric)) {
    return null;
  }

  if (numeric < 0) {
    return 0;
  }

  if (numeric > 1) {
    return 1;
  }

  return numeric;
}

function determineVerdict({ score, action, verdict }) {
  if (typeof action === 'string') {
    const lowered = action.toLowerCase();
    if (lowered === 'deny' || lowered === 'block' || lowered === 'challenge') {
      return true;
    }

    if (lowered === 'allow' || lowered === 'pass') {
      return false;
    }
  }

  if (typeof verdict === 'string') {
    const lowered = verdict.toLowerCase();
    if (lowered === 'bot' || lowered === 'bad') {
      return true;
    }

    if (lowered === 'human' || lowered === 'good') {
      return false;
    }
  }

  if (typeof score === 'number') {
    return score >= 0.5;
  }

  return false;
}

function extractBotSignal(req) {
  const scoreValue = getHeaderValue(req, SCORE_HEADERS);
  const actionValue = getHeaderValue(req, ACTION_HEADERS);
  const verdictValue = getHeaderValue(req, VERDICT_HEADERS);
  const requestIdValue = getHeaderValue(req, REQUEST_ID_HEADERS);
  const detectionIdValue = getHeaderValue(req, DETECTION_ID_HEADERS);

  if (!scoreValue && !actionValue && !verdictValue && !requestIdValue && !detectionIdValue) {
    return null;
  }

  const score = parseScore(scoreValue);

  return {
    score,
    action: actionValue || null,
    verdict: verdictValue || null,
    requestId: requestIdValue || null,
    detectionId: detectionIdValue || null,
    scoreRaw: scoreValue || null
  };
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

  const signal = extractBotSignal(req);
  if (!signal) {
    return {
      isBot: false,
      skipped: true,
      reason: 'BotID headers unavailable'
    };
  }

  const isBot = determineVerdict(signal);

  return {
    isBot,
    skipped: false,
    score: signal.score ?? null,
    scoreRaw: signal.scoreRaw,
    action: signal.action,
    verdict: signal.verdict,
    requestId: signal.requestId,
    detectionId: signal.detectionId,
    context
  };
}
