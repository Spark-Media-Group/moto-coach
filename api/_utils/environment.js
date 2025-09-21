const LIVE_BRANCHES = new Set(['main']);

function getCurrentBranch() {
  const branch = process.env.VERCEL_GIT_COMMIT_REF || process.env.GIT_BRANCH || process.env.BRANCH || '';
  return branch.trim().toLowerCase();
}

function getVercelEnv() {
  return (process.env.VERCEL_ENV || '').trim().toLowerCase();
}

function getNodeEnv() {
  return (process.env.NODE_ENV || '').trim().toLowerCase();
}

export function isLiveEnvironment() {
  const branch = getCurrentBranch();
  const vercelEnv = getVercelEnv();

  if (vercelEnv && vercelEnv !== 'production') {
    return false;
  }

  if (branch) {
    return LIVE_BRANCHES.has(branch);
  }

  const nodeEnv = getNodeEnv();
  if (nodeEnv && nodeEnv !== 'production') {
    return false;
  }

  return true;
}

export function getEnvironmentDetails() {
  return {
    branch: getCurrentBranch(),
    vercelEnv: getVercelEnv(),
    nodeEnv: getNodeEnv(),
    isLive: isLiveEnvironment(),
  };
}
