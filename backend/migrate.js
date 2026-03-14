const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function runMigration() {
  try {
    console.log("Starting migration...");
    
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR UNIQUE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS otp VARCHAR;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMP;
      ALTER TABLE users ALTER COLUMN username DROP NOT NULL;
    `);
    
    console.log("Migration successful.");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    pool.end();
  }
}

runMigration();
