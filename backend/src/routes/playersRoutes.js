const express = require('express');
const pool = require('../config/db');

const router = express.Router();

router.get('/', async (req, res) => {
  const { teamId } = req.query;
  const params = [];
  let whereClause = '';

  if (teamId) {
    params.push(teamId);
    whereClause = 'WHERE t.id = $1';
  }

  try {
    const result = await pool.query(
      `SELECT
        p.id,
        p.name,
        p.role,
        p.power,
        p.consistency,
        p.speed,
        p.experience,
        p.stamina,
        p.auction_price,
        p.injured,
        t.id AS team_id,
        t.name AS team_name,
        r.is_star
       FROM players p
       LEFT JOIN rosters r ON r.player_id = p.id
       LEFT JOIN teams t ON t.id = r.team_id
       ${whereClause}
       ORDER BY p.auction_price DESC, p.power DESC`,
      params
    );

    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load players', error: error.message });
  }
});

module.exports = router;
