const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function checkSchema() {
  try {
    const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users';
    `);
    console.log("Users table columns:", JSON.stringify(res.rows, null, 2));
  } catch (error) {
    console.error("Check failed:", error);
  } finally {
    pool.end();
  }
}

checkSchema();
