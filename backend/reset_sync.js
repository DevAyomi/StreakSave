const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function reset() {
    console.log("Clearing deposit_history...");
    await pool.query('DELETE FROM deposit_history');
    console.log("Deposit history cleared. Restarting the backend will re-sync events.");
    process.exit(0);
}

reset().catch(console.error);
