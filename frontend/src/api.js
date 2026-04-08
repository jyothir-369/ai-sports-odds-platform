const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(payload.message || 'Request failed');
  }

  return response.json();
}

export function registerUser(body) {
  return request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function loginUser(body) {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function getMatches(filters = {}) {
  const query = new URLSearchParams(filters);
  return request(`/api/matches?${query.toString()}`);
}

export function getOdds(matchId) {
  return request(`/api/matches/${matchId}/odds`);
}

export function getExplanation(matchId) {
  return request(`/api/matches/${matchId}/explain`);
}

export function getFavorites(token) {
  return request('/api/favorites', {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

export function addFavorite(matchId, token) {
  return request('/api/favorites', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ matchId })
  });
}

export function removeFavorite(matchId, token) {
  return request(`/api/favorites/${matchId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

export function getPlayers(teamId) {
  const query = new URLSearchParams();
  if (teamId) {
    query.set('teamId', teamId);
  }
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request(`/api/players${suffix}`);
}

export function queryAgent(query) {
  return request('/api/agent/query', {
    method: 'POST',
    body: JSON.stringify({ query })
  });
}
