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
    console.log("Starting schema fix migration...");
    
    // Check if 'email' exists, if not add it
    await pool.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='id') THEN
          -- Step 1: Add a temporary id column
          ALTER TABLE users ADD COLUMN id SERIAL;
        END IF;

        -- Step 2: Change Primary Key
        -- Drop existing PK on wallet_address if it exists
        -- Note: We need to find the constraint name. Usually it's users_pkey.
        BEGIN
          ALTER TABLE users DROP CONSTRAINT IF EXISTS users_pkey;
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;

        -- Add new PK on id
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name='users' AND constraint_type='PRIMARY KEY') THEN
            ALTER TABLE users ADD PRIMARY KEY (id);
        END IF;

        -- Step 3: Make wallet_address nullable and unique
        ALTER TABLE users ALTER COLUMN wallet_address DROP NOT NULL;
        
        -- Step 4: Add other missing columns
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='email') THEN
          ALTER TABLE users ADD COLUMN email VARCHAR UNIQUE;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='otp') THEN
          ALTER TABLE users ADD COLUMN otp VARCHAR;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='otp_expires_at') THEN
          ALTER TABLE users ADD COLUMN otp_expires_at TIMESTAMP;
        END IF;

      END $$;
    `);
    
    console.log("Migration successful.");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    pool.end();
  }
}

runMigration();
