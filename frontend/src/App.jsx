import { useEffect, useMemo, useState } from 'react';
import {
  addFavorite,
  getExplanation,
  getFavorites,
  getMatches,
  getOdds,
  getPlayers,
  loginUser,
  queryAgent,
  registerUser,
  removeFavorite
} from './api';

const defaultFilters = {
  sport: '',
  league: '',
  upcoming: 'true'
};

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'));
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ email: '', password: '', fullName: '' });

  const [filters, setFilters] = useState(defaultFilters);
  const [matches, setMatches] = useState([]);
  const [favorites, setFavorites] = useState(new Set());
  const [oddsByMatch, setOddsByMatch] = useState({});
  const [explanationsByMatch, setExplanationsByMatch] = useState({});
  const [players, setPlayers] = useState([]);
  const [playerTeamFilter, setPlayerTeamFilter] = useState('');
  const [agentQueryText, setAgentQueryText] = useState('Who is likely to win?');
  const [agentAnswer, setAgentAnswer] = useState('');
  const [agentLoading, setAgentLoading] = useState(false);
  const [pairingLog, setPairingLog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const sports = useMemo(() => [...new Set(matches.map((m) => m.sport))], [matches]);
  const leagues = useMemo(() => [...new Set(matches.map((m) => m.league))], [matches]);
  const teams = useMemo(
    () => [...new Map(players.filter((p) => p.team_id).map((p) => [p.team_id, { id: p.team_id, name: p.team_name }])).values()],
    [players]
  );

  const playersForAuctionView = useMemo(() => {
    if (!playerTeamFilter) {
      return players.slice(0, 18);
    }
    return players.filter((player) => String(player.team_id) === playerTeamFilter).slice(0, 18);
  }, [players, playerTeamFilter]);

  useEffect(() => {
    loadMatches();
  }, [filters.sport, filters.league, filters.upcoming]);

  useEffect(() => {
    loadPlayers();
  }, []);

  useEffect(() => {
    if (token) {
      loadFavorites();
    }
  }, [token]);

  async function loadMatches() {
    setLoading(true);
    setError('');
    try {
      const data = await getMatches(filters);
      setMatches(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadPlayers(teamId = '') {
    try {
      const data = await getPlayers(teamId);
      setPlayers(data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadFavorites() {
    try {
      const data = await getFavorites(token);
      setFavorites(new Set(data.map((m) => m.id)));
    } catch {
      setFavorites(new Set());
    }
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setError('');
    try {
      const action = authMode === 'login' ? loginUser : registerUser;
      const payload =
        authMode === 'login'
          ? { email: authForm.email, password: authForm.password }
          : { email: authForm.email, password: authForm.password, fullName: authForm.fullName };

      const result = await action(payload);
      setToken(result.token);
      setUser(result.user);
      localStorage.setItem('token', result.token);
      localStorage.setItem('user', JSON.stringify(result.user));
    } catch (err) {
      setError(err.message);
    }
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken('');
    setUser(null);
    setFavorites(new Set());
  }

  async function toggleFavorite(matchId) {
    if (!token) {
      setError('Login required to use favorites');
      return;
    }

    try {
      if (favorites.has(matchId)) {
        await removeFavorite(matchId, token);
        const next = new Set(favorites);
        next.delete(matchId);
        setFavorites(next);
      } else {
        await addFavorite(matchId, token);
        setFavorites(new Set([...favorites, matchId]));
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function fetchOdds(matchId) {
    try {
      const data = await getOdds(matchId);
      setOddsByMatch((prev) => ({ ...prev, [matchId]: data }));
      const match = matches.find((item) => item.id === matchId);
      if (match) {
        const entry = `${match.home_team} vs ${match.away_team}`;
        setPairingLog((prev) => [entry, ...prev.filter((item) => item !== entry)].slice(0, 5));
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function onPlayerTeamFilterChange(value) {
    setPlayerTeamFilter(value);
    await loadPlayers(value);
  }

  function asCurrency(value) {
    return Number(value).toLocaleString('en-IN', {
      maximumFractionDigits: 0
    });
  }

  async function fetchExplanation(matchId) {
    try {
      const data = await getExplanation(matchId);
      setExplanationsByMatch((prev) => ({ ...prev, [matchId]: data }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAgentSubmit(event) {
    event.preventDefault();
    setAgentLoading(true);
    setError('');

    try {
      const response = await queryAgent(agentQueryText);
      setAgentAnswer(response.answer || 'No answer returned.');
    } catch (err) {
      setError(err.message);
    } finally {
      setAgentLoading(false);
    }
  }

  function normalizeOdds(match, loadedOdds) {
    const source = loadedOdds || match;
    const teamAProb = source?.probabilities?.teamA ?? source?.teamA_win_prob ?? source?.home_win_probability ?? 0;
    const teamBProb = source?.probabilities?.teamB ?? source?.teamB_win_prob ?? source?.away_win_probability ?? 0;
    const drawProb = source?.probabilities?.draw ?? source?.draw_prob ?? 0;

    return {
      teamAProb,
      teamBProb,
      drawProb,
      oddsA: source?.odds?.teamA ?? source?.home_decimal_odds,
      oddsB: source?.odds?.teamB ?? source?.away_decimal_odds,
      oddsDraw: source?.odds?.draw,
      confidence: source?.confidence_score ?? source?.confidenceScore ?? 0,
      risk: source?.risk_factor ?? source?.confidence ?? 'Unknown',
      analysis: source?.analysis
    };
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <p className="eyebrow">Z50 Sports Intelligence</p>
        <h1>Real Sports Odds Intelligence Platform</h1>
        <p>
          Data to model to API to UI. Inspect AI-generated win probabilities, filter leagues, and track your favorites in one live system.
        </p>
      </header>

      <section className="panel auth-panel">
        <div>
          <h2>{token ? `Welcome ${user?.full_name || user?.email}` : 'Authentication'}</h2>
          <p>JWT-secured access for personalized favorites and user sessions.</p>
        </div>
        {token ? (
          <button className="secondary" onClick={logout}>Logout</button>
        ) : (
          <form onSubmit={handleAuthSubmit} className="auth-form">
            <div className="switcher">
              <button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>Login</button>
              <button type="button" className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>Register</button>
            </div>
            {authMode === 'register' && (
              <input
                placeholder="Full name"
                value={authForm.fullName}
                onChange={(e) => setAuthForm({ ...authForm, fullName: e.target.value })}
                required
              />
            )}
            <input
              type="email"
              placeholder="Email"
              value={authForm.email}
              onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={authForm.password}
              onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
              required
            />
            <button type="submit">{authMode === 'login' ? 'Sign in' : 'Create account'}</button>
          </form>
        )}
      </section>

      <section className="panel filters">
        <h2>Match Filters</h2>
        <div className="filter-grid">
          <label>
            Sport
            <select value={filters.sport} onChange={(e) => setFilters({ ...filters, sport: e.target.value })}>
              <option value="">All</option>
              {sports.map((sport) => (
                <option key={sport} value={sport}>{sport}</option>
              ))}
            </select>
          </label>

          <label>
            League
            <select value={filters.league} onChange={(e) => setFilters({ ...filters, league: e.target.value })}>
              <option value="">All</option>
              {leagues.map((league) => (
                <option key={league} value={league}>{league}</option>
              ))}
            </select>
          </label>

          <label>
            Timeline
            <select value={filters.upcoming} onChange={(e) => setFilters({ ...filters, upcoming: e.target.value })}>
              <option value="true">Upcoming only</option>
              <option value="false">All</option>
            </select>
          </label>
        </div>
      </section>

      <section className="panel auction-panel">
        <div className="auction-head">
          <h2>Auction Intelligence</h2>
          <label>
            Franchise
            <select value={playerTeamFilter} onChange={(e) => onPlayerTeamFilterChange(e.target.value)}>
              <option value="">All Franchises</option>
              {teams.map((team) => (
                <option key={team.id} value={String(team.id)}>{team.name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="auction-table-wrap">
          <table className="auction-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Role</th>
                <th>Power</th>
                <th>Consistency</th>
                <th>Speed</th>
                <th>Experience</th>
                <th>Stamina</th>
                <th>Auction Price</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {playersForAuctionView.map((player) => (
                <tr key={player.id}>
                  <td>
                    <strong>{player.name}</strong>
                    <div className="smallcaps">{player.team_name || 'Unsold'}</div>
                  </td>
                  <td>{player.role}</td>
                  <td>{player.power}</td>
                  <td>{player.consistency}</td>
                  <td>{player.speed}</td>
                  <td>{player.experience}</td>
                  <td>{player.stamina}</td>
                  <td>₹ {asCurrency(player.auction_price)}</td>
                  <td>{player.injured ? 'Injured' : 'Fit'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel agent-panel">
        <h2>AI Agent Console</h2>
        <form className="agent-form" onSubmit={handleAgentSubmit}>
          <input
            value={agentQueryText}
            onChange={(e) => setAgentQueryText(e.target.value)}
            placeholder="Ask: Who is likely to win?"
          />
          <button type="submit" disabled={agentLoading}>{agentLoading ? 'Thinking...' : 'Ask Agent'}</button>
        </form>
        {agentAnswer && <p className="agent-answer">{agentAnswer}</p>}
        {!!pairingLog.length && (
          <div className="pair-log">
            <h3>Last 5 Pairings</h3>
            {pairingLog.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        )}
      </section>

      {error && <p className="error-banner">{error}</p>}

      <section className="match-grid">
        {loading && <p>Loading matches...</p>}
        {!loading && matches.length === 0 && <p>No matches found for this filter set.</p>}

        {matches.map((match) => {
          const odds = oddsByMatch[match.id];
          const model = normalizeOdds(match, odds);
          const explanation = explanationsByMatch[match.id];
          const favorite = favorites.has(match.id);

          return (
            <article key={match.id} className="panel match-card">
              <div className="match-top">
                <div>
                  <p className="smallcaps">{match.sport} • {match.league}</p>
                  <h3>{match.home_team} vs {match.away_team}</h3>
                  <p>{new Date(match.kickoff_time).toLocaleString()}</p>
                </div>
                <button className={favorite ? 'favorite active' : 'favorite'} onClick={() => toggleFavorite(match.id)}>
                  {favorite ? 'Favorited' : 'Add Favorite'}
                </button>
              </div>

              <div className="actions">
                <button onClick={() => fetchOdds(match.id)}>Generate Odds</button>
                <button className="secondary" onClick={() => fetchExplanation(match.id)}>Ask AI Agent</button>
              </div>

              {(odds || match.odds) && (
                <div className="odds-panel">
                  <div className="vs-row">
                    <span>{match.home_team}</span>
                    <span>VS</span>
                    <span>{match.away_team}</span>
                  </div>
                  <div className="meter">
                    <div className="home-bar" style={{ width: `${Math.round(model.teamAProb * 100)}%` }} />
                  </div>
                  <div className="meter-labels">
                    <span>{Math.round(model.teamAProb * 100)}%</span>
                    <span>{Math.round(model.teamBProb * 100)}%</span>
                  </div>
                  <p>{match.home_team}: <strong>{Math.round(model.teamAProb * 100)}%</strong> (odds {model.oddsA})</p>
                  <p>Draw: <strong>{Math.round(model.drawProb * 100)}%</strong> (odds {model.oddsDraw})</p>
                  <p>{match.away_team}: <strong>{Math.round(model.teamBProb * 100)}%</strong> (odds {model.oddsB})</p>
                  <div className="confidence-block">
                    <p>Confidence: {model.risk} ({Math.round(model.confidence * 100)}%)</p>
                    <div className="meter confidence-meter">
                      <div className="confidence-fill" style={{ width: `${Math.round(model.confidence * 100)}%` }} />
                    </div>
                  </div>
                  {model.analysis && <p className="summary">{model.analysis}</p>}
                </div>
              )}

              {explanation && (
                <div className="explain-panel">
                  <p><strong>AI Explanation:</strong> {explanation.explanation}</p>
                  <p className="summary">{explanation.summary}</p>
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
