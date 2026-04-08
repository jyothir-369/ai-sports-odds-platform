require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const matchesRoutes = require('./routes/matchesRoutes');
const favoritesRoutes = require('./routes/favoritesRoutes');
const playersRoutes = require('./routes/playersRoutes');
const agentRoutes = require('./routes/agentRoutes');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'backend' });
});

app.use('/api/auth', authRoutes);
app.use('/api/matches', matchesRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/players', playersRoutes);
app.use('/api/agent', agentRoutes);

module.exports = app;
