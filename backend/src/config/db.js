const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Run initial migration
pool.query('ALTER TABLE deposit_history ADD COLUMN IF NOT EXISTS token_symbol VARCHAR(10) DEFAULT \'USDT\'')
    .catch(err => console.error("Database initialization error:", err));

module.exports = pool;
