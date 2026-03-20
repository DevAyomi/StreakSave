-- StreakPay Database Schema

-- Users table for off-chain profiles
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR UNIQUE,
    wallet_address TEXT UNIQUE,
    username TEXT,
    bio TEXT,
    profile_image TEXT,
    deposit_address TEXT UNIQUE,
    encrypted_private_key TEXT,
    otp VARCHAR,
    otp_expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Deposit history cached from on-chain events
CREATE TABLE IF NOT EXISTS deposit_history (
    tx_hash VARCHAR(66) PRIMARY KEY,
    wallet_address VARCHAR(42) REFERENCES users(wallet_address) ON DELETE CASCADE,
    week_number INTEGER NOT NULL,
    amount DECIMAL(20, 6) NOT NULL,
    timestamp TIMESTAMP NOT NULL
);

-- Streak goals and motivation
CREATE TABLE IF NOT EXISTS streak_goals (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(42) REFERENCES users(wallet_address) ON DELETE CASCADE,
    goal_description TEXT,
    target_amount DECIMAL(20, 6),
    duration_weeks INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for leaderboard performance
CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_deposit_wallet ON deposit_history(wallet_address);
