require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const pool = require('../src/config/db');

async function seed() {
  const client = await pool.connect();
  let transactionOpen = false;

  try {
    const sqlPath = path.join(__dirname, '../../db/init.sql');
    const initSql = fs.readFileSync(sqlPath, 'utf8');

    await client.query('BEGIN');
    transactionOpen = true;
    await client.query(initSql);
    await client.query('COMMIT');
    transactionOpen = false;

    const pythonCommand = process.env.PYTHON_CMD || 'python';
    const seedScript = path.join(__dirname, '../../db/seed_data.py');
    const result = spawnSync(pythonCommand, [seedScript], {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL
      }
    });

    if (result.status !== 0) {
      throw new Error('Python synthetic seed step failed. Ensure ai-service requirements are installed.');
    }

    console.log('Database seeded successfully with synthetic auction and history data.');
  } catch (error) {
    if (transactionOpen) {
      await client.query('ROLLBACK');
    }
    console.error('Seeding failed:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
