const express = require('express');
const pool = require('../config/db');
const { generateOdds, generateOddsBatch } = require('../services/aiClient');
const oddsCache = require('../services/oddsCache');

const router = express.Router();

function toAIPayload(match) {
  return {
    match_id: match.id,
    teamA: match.home_team,
    teamB: match.away_team,
    teamA_rating: Number(match.home_rating || 50),
    teamB_rating: Number(match.away_rating || 50),
    volatility: Number((Number(match.home_consistency_std || 8) + Number(match.away_consistency_std || 8)) / 2),
    data_points: Number(match.data_points || 0),
    head_to_head_count: Number(match.head_to_head_count || 0),
    star_injuries: Number(match.home_star_injuries || 0) + Number(match.away_star_injuries || 0)
  };
}

function withOddsShape(match, oddsPayload) {
  return {
    match_id: match.id,
    id: match.id,
    sport: match.sport,
    league: match.league,
    home_team: match.home_team,
    away_team: match.away_team,
    start_time: match.kickoff_time,
    kickoff_time: match.kickoff_time,
    teams: `${match.home_team} vs ${match.away_team}`,
    probabilities: {
      teamA: oddsPayload.teamA_win_prob,
      teamB: oddsPayload.teamB_win_prob,
      draw: oddsPayload.draw_prob
    },
    odds: oddsPayload.odds,
    confidence_score: oddsPayload.confidence_score,
    risk_factor: oddsPayload.risk_factor,
    analysis: oddsPayload.analysis
  };
}

async function attachOdds(matches) {
  const response = [];
  const toCompute = [];

  for (const match of matches) {
    const cached = oddsCache.get(match.id);
    if (cached) {
      response.push(withOddsShape(match, cached));
    } else {
      toCompute.push(match);
    }
  }

  if (toCompute.length) {
    const payload = toCompute.map(toAIPayload);
    const batchResult = await generateOddsBatch(payload);
    const generated = new Map((batchResult.results || []).map((row) => [Number(row.match_id), row]));

    for (const match of toCompute) {
      const oddsPayload = generated.get(Number(match.id));
      if (oddsPayload) {
        oddsCache.set(match.id, oddsPayload);
        response.push(withOddsShape(match, oddsPayload));
      }
    }
  }

  return response.sort((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime());
}

router.get('/', async (req, res) => {
  const { sport, league, upcoming } = req.query;

  const conditions = [];
  const params = [];

  if (sport) {
    params.push(sport);
    conditions.push(`m.sport = $${params.length}`);
  }

  if (league) {
    params.push(league);
    conditions.push(`m.league = $${params.length}`);
  }

  if (upcoming === 'true') {
    conditions.push('m.kickoff_time >= NOW()');
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
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
        m.sport,
        m.league,
        m.kickoff_time,
        m.home_team_id,
        m.away_team_id,
        ht.name AS home_team,
        at.name AS away_team,
        ht.home_stadium,
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
       ${whereClause}
       ORDER BY m.kickoff_time ASC`,
      params
    );

    const withOdds = await attachOdds(result.rows);
    return res.json(withOdds);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load matches', error: error.message });
  }
});

router.get('/:id/odds', async (req, res) => {
  try {
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
        m.sport,
        m.league,
        m.kickoff_time,
        m.home_team_id,
        m.away_team_id,
        ht.name AS home_team,
        at.name AS away_team,
        ht.home_stadium,
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
       WHERE m.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Match not found' });
    }

    const match = result.rows[0];
    const cached = oddsCache.get(match.id);
    if (cached) {
      return res.json(withOddsShape(match, cached));
    }

    const odds = await generateOdds(toAIPayload(match));
    oddsCache.set(match.id, odds);
    return res.json(withOddsShape(match, odds));
  } catch (error) {
    return res.status(500).json({ message: 'Failed to generate odds', error: error.message });
  }
});

router.get('/:id/explain', async (req, res) => {
  try {
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
         m.sport,
         m.league,
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
       WHERE m.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Match not found' });
    }

    const match = result.rows[0];
    let odds = oddsCache.get(match.id);
    if (!odds) {
      odds = await generateOdds(toAIPayload(match));
      oddsCache.set(match.id, odds);
    }

    const favorite = odds.teamA_win_prob >= odds.teamB_win_prob ? match.home_team : match.away_team;
    const favoriteProb = Math.max(odds.teamA_win_prob, odds.teamB_win_prob);
    const explanation = `${favorite} has a higher win probability (${Math.round(favoriteProb * 100)}%). Draw probability is ${Math.round(odds.draw_prob * 100)}%, with confidence ${Math.round(odds.confidence_score * 100)}%.`;

    return res.json({
      matchId: Number(req.params.id),
      explanation,
      summary: odds.analysis,
      confidenceScore: odds.confidence_score,
      confidence: odds.risk_factor,
      probabilities: {
        teamA: odds.teamA_win_prob,
        teamB: odds.teamB_win_prob,
        draw: odds.draw_prob
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to explain prediction', error: error.message });
  }
});

module.exports = router;
