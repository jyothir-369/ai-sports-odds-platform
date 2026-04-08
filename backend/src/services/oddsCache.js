const cache = new Map();
const TTL_MS = Number(process.env.ODDS_CACHE_TTL_MS || 120000);

function keyForMatch(matchId) {
  return `match:${matchId}`;
}

function get(matchId) {
  const key = keyForMatch(matchId);
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  return entry.value;
}

function set(matchId, value) {
  const key = keyForMatch(matchId);
  cache.set(key, {
    value,
    expiresAt: Date.now() + TTL_MS
  });
}

module.exports = {
  get,
  set
};
