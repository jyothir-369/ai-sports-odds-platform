const express = require('express');
const pool = require('../config/db');
const { generateOddsBatch } = require('../services/aiClient');
const oddsCache = require('../services/oddsCache');

const router = express.Router();

async function loadMatchesForAgent() {
  const result = await pool.query(
    `WITH team_metrics AS (
       SELECT
         r.team_id,
         AVG(p.power)::numeric(6,2) AS avg_power,
         COALESCE(STDDEV_POP(p.consistency), 0)::numeric(6,2) AS consistency_std,
         SUM(CASE WHEN r.is_star AND p.injured THEN 1 ELSE 0 END)::int AS star_injuries
       FROM rosters r
       JOIN players p ON p.id = r.player_id
       GROUP BY r.team_id
     )
     SELECT
       m.id,
       m.kickoff_time,
       ht.name AS home_team,
       at.name AS away_team,
       hm.avg_power AS home_rating,
       am.avg_power AS away_rating,
       hm.consistency_std AS home_consistency_std,
       am.consistency_std AS away_consistency_std,
       hm.star_injuries AS home_star_injuries,
       am.star_injuries AS away_star_injuries,
       (
         COALESCE((SELECT COUNT(*) FROM match_history h WHERE h.team_a = m.home_team_id OR h.team_b = m.home_team_id), 0)
         +
         COALESCE((SELECT COUNT(*) FROM match_history h WHERE h.team_a = m.away_team_id OR h.team_b = m.away_team_id), 0)
       )::int AS data_points,
       COALESCE((
         SELECT COUNT(*)
         FROM match_history h2
         WHERE (h2.team_a = m.home_team_id AND h2.team_b = m.away_team_id)
            OR (h2.team_a = m.away_team_id AND h2.team_b = m.home_team_id)
       ), 0)::int AS head_to_head_count
     FROM matches m
     JOIN teams ht ON ht.id = m.home_team_id
     JOIN teams at ON at.id = m.away_team_id
     LEFT JOIN team_metrics hm ON hm.team_id = m.home_team_id
     LEFT JOIN team_metrics am ON am.team_id = m.away_team_id
     ORDER BY m.kickoff_time ASC
     LIMIT 20`
  );

  const rows = result.rows;
  const toCompute = [];
  const enriched = [];

  for (const row of rows) {
    const cached = oddsCache.get(row.id);
    if (cached) {
      enriched.push({ ...row, odds: cached });
    } else {
      toCompute.push(row);
    }
  }

  if (toCompute.length) {
    const payload = toCompute.map((row) => ({
      match_id: row.id,
      teamA: row.home_team,
      teamB: row.away_team,
      teamA_rating: Number(row.home_rating || 50),
      teamB_rating: Number(row.away_rating || 50),
      volatility: Number((Number(row.home_consistency_std || 8) + Number(row.away_consistency_std || 8)) / 2),
      data_points: Number(row.data_points || 0),
      head_to_head_count: Number(row.head_to_head_count || 0),
      star_injuries: Number(row.home_star_injuries || 0) + Number(row.away_star_injuries || 0)
    }));

    const generated = await generateOddsBatch(payload);
    const mapped = new Map((generated.results || []).map((entry) => [Number(entry.match_id), entry]));

    for (const row of toCompute) {
      const odds = mapped.get(Number(row.id));
      if (odds) {
        oddsCache.set(row.id, odds);
        enriched.push({ ...row, odds });
      }
    }
  }

  return enriched;
}

router.post('/query', async (req, res) => {
  const query = String(req.body?.query || '').toLowerCase().trim();
  if (!query) {
    return res.status(400).json({ message: 'query is required' });
  }

  try {
    const matches = await loadMatchesForAgent();
    if (!matches.length) {
      return res.json({ answer: 'No matches are available right now.' });
    }

    if (query.includes('close odds') || query.includes('closest') || query.includes('close match')) {
      const closest = [...matches].sort(
        (a, b) => Math.abs(a.odds.teamA_win_prob - a.odds.teamB_win_prob) - Math.abs(b.odds.teamA_win_prob - b.odds.teamB_win_prob)
      )[0];

      return res.json({
        answer: `Closest odds: ${closest.home_team} vs ${closest.away_team} (${(closest.odds.teamA_win_prob * 100).toFixed(1)}% vs ${(closest.odds.teamB_win_prob * 100).toFixed(1)}%). Draw ${(closest.odds.draw_prob * 100).toFixed(1)}%.`
      });
    }

    if (query.includes('predictable') || query.includes('most certain')) {
      const predictable = [...matches].sort(
        (a, b) => b.odds.confidence_score - a.odds.confidence_score
      )[0];

      return res.json({
        answer: `Most predictable match is ${predictable.home_team} vs ${predictable.away_team} with confidence ${(predictable.odds.confidence_score * 100).toFixed(1)}% and risk ${predictable.odds.risk_factor}.`
      });
    }

    const bestFavorite = [...matches].sort((a, b) =>
      Math.max(b.odds.teamA_win_prob, b.odds.teamB_win_prob) - Math.max(a.odds.teamA_win_prob, a.odds.teamB_win_prob)
    )[0];
    const favoredTeam = bestFavorite.odds.teamA_win_prob >= bestFavorite.odds.teamB_win_prob
      ? bestFavorite.home_team
      : bestFavorite.away_team;
    const favoredProb = Math.max(bestFavorite.odds.teamA_win_prob, bestFavorite.odds.teamB_win_prob);

    return res.json({
      answer: `${favoredTeam} is currently the strongest favorite at ${(favoredProb * 100).toFixed(1)}% win probability in ${bestFavorite.home_team} vs ${bestFavorite.away_team}. Confidence is ${(bestFavorite.odds.confidence_score * 100).toFixed(1)}%.`
    });
  } catch (error) {
    return res.status(500).json({ message: 'Agent query failed', error: error.message });
  }
});

module.exports = router;
