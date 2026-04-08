const express = require('express');
const pool = require('../config/db');
const authMiddleware = require('../middleware/auth');
const { generateOddsBatch } = require('../services/aiClient');
const oddsCache = require('../services/oddsCache');

const router = express.Router();

router.use(authMiddleware);

router.get('/', async (req, res) => {
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
       SELECT m.id, m.sport, m.league, ht.name AS home_team, at.name AS away_team, m.kickoff_time, ht.home_stadium,
              hm.avg_power AS home_rating, am.avg_power AS away_rating,
              hm.consistency_std AS home_consistency_std, am.consistency_std AS away_consistency_std,
              hm.star_injuries AS home_star_injuries, am.star_injuries AS away_star_injuries,
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
       FROM favorites f
       JOIN matches m ON m.id = f.match_id
       JOIN teams ht ON ht.id = m.home_team_id
       JOIN teams at ON at.id = m.away_team_id
       LEFT JOIN team_metrics hm ON hm.team_id = m.home_team_id
       LEFT JOIN team_metrics am ON am.team_id = m.away_team_id
       WHERE f.user_id = $1
       ORDER BY m.kickoff_time ASC`,
      [req.user.id]
    );

    const rows = result.rows;
    const cachedRows = [];
    const toCompute = [];

    for (const row of rows) {
      const cached = oddsCache.get(row.id);
      if (cached) {
        cachedRows.push({ ...row, odds: cached.odds, probabilities: {
          teamA: cached.teamA_win_prob,
          teamB: cached.teamB_win_prob,
          draw: cached.draw_prob
        } });
      } else {
        toCompute.push(row);
      }
    }

    if (toCompute.length) {
      const batchPayload = toCompute.map((row) => ({
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

      const generated = await generateOddsBatch(batchPayload);
      const mapped = new Map((generated.results || []).map((entry) => [Number(entry.match_id), entry]));

      for (const row of toCompute) {
        const odds = mapped.get(Number(row.id));
        if (odds) {
          oddsCache.set(row.id, odds);
          cachedRows.push({
            ...row,
            odds: odds.odds,
            probabilities: {
              teamA: odds.teamA_win_prob,
              teamB: odds.teamB_win_prob,
              draw: odds.draw_prob
            }
          });
        }
      }
    }

    return res.json(cachedRows);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch favorites', error: error.message });
  }
});

router.post('/', async (req, res) => {
  const { matchId } = req.body;

  if (!matchId) {
    return res.status(400).json({ message: 'matchId is required' });
  }

  try {
    await pool.query(
      `INSERT INTO favorites (user_id, match_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, match_id) DO NOTHING`,
      [req.user.id, matchId]
    );

    return res.status(201).json({ message: 'Favorite saved' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to save favorite', error: error.message });
  }
});

router.delete('/:matchId', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM favorites WHERE user_id = $1 AND match_id = $2',
      [req.user.id, req.params.matchId]
    );

    return res.json({ message: 'Favorite removed' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to remove favorite', error: error.message });
  }
});

module.exports = router;
