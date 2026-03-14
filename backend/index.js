const express = require('express');
const { Pool } = require('pg');
const { ethers } = require('ethers');
const cors = require('cors');
const crypto = require('crypto');
const { bech32 } = require('bech32');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');
require('dotenv').config();

const resend = new Resend(process.env.RESEND_API_KEY);
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_for_streakpay';

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Database Migration: Ensure token_symbol exists
pool.query('ALTER TABLE deposit_history ADD COLUMN IF NOT EXISTS token_symbol VARCHAR(10) DEFAULT \'USDT\'').catch(err => console.error("Migration error:", err));

const PORT = process.env.PORT || 3001;

// --- Global Provider & ABIs ---
const provider = new ethers.JsonRpcProvider(process.env.INJECTIVE_RPC);
const USDT_ABI = [
    "function balanceOf(address) view returns (uint256)", 
    "function approve(address, uint256) returns (bool)", 
    "function allowance(address, address) view returns (uint256)"
];
const STREAKPAY_ABI_MIN = [
    "function startStreak(address token, uint256 weeklyAmount, uint256 durationWeeks, string description) payable",
    "function deposit(uint256 streakId) payable",
    "function claimReward(uint256 streakId)",
    "function emergencyWithdraw(uint256 streakId)",
    "function userStreaks(address, uint256) view returns (address user, address token, uint256 weeklyAmount, uint256 totalCommittedWeeks, uint256 weeksCompleted, uint256 lastDepositTimestamp, uint256 startTime, uint256 totalSaved, string description, bool isActive, bool isClaimed)",
    "function userStreakCount(address) view returns (uint256)"
];

// --- Encryption Helpers ---
const algorithm = 'aes-256-cbc';
const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');

function encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

function injToEth(injAddr) {
    if (!injAddr || !injAddr.startsWith('inj1')) return injAddr;
    try {
        const decoded = bech32.decode(injAddr);
        const data = bech32.fromWords(decoded.words);
        return '0x' + Buffer.from(data).toString('hex');
    } catch (e) {
        console.error("Address conversion error:", e);
        return injAddr;
    }
}

// --- Auth Middleware ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Access denied" });
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Invalid token" });
        req.user = user;
        next();
    });
};

// --- API Endpoints ---

// 1. Request OTP
app.post('/api/auth/request-otp', async (req, res) => {
    let { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });
    email = email.trim().toLowerCase();

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    try {
        // If user already exists, it will update their OTP (Login)
        // If not, it will create a new user with OTP (Register)        // Upsert user with OTP
        await pool.query(
            `INSERT INTO users (email, otp, otp_expires_at) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (email) DO UPDATE 
             SET otp = EXCLUDED.otp, otp_expires_at = EXCLUDED.otp_expires_at`,
            [email, otp, expiresAt]
        );

        // Send Email
        await resend.emails.send({
            from: 'StreakPay Auth <onboarding@resend.dev>',
            to: email,
            subject: 'Your StreakPay Login Code',
            html: `<p>Your secret login code is: <strong>${otp}</strong></p><p>It will expire in 5 minutes.</p>`
        });

        res.json({ message: "OTP sent successfully" });
    } catch (err) {
        console.error("OTP Error:", err);
        res.status(500).json({ error: "Failed to send OTP" });
    }
});

// 2. Verify OTP & Issue JWT
app.post('/api/auth/verify-otp', async (req, res) => {
    let { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: "Email and OTP required" });
    email = email.trim().toLowerCase();

    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (!user || user.otp !== otp || new Date() > new Date(user.otp_expires_at)) {
            return res.status(401).json({ error: "Invalid or expired OTP" });
        }

        // Clear OTP
        await pool.query('UPDATE users SET otp = NULL, otp_expires_at = NULL WHERE email = $1', [email]);

        // Issue JWT
        const token = jwt.sign({ email: user.email, wallet_address: user.wallet_address }, JWT_SECRET, { expiresIn: '7d' });
        
        res.json({ token, user });
    } catch (err) {
        console.error("Verify OTP Error:", err);
        res.status(500).json({ error: "Verification failed" });
    }
});

// 3. Setup Wallet & Profile
app.post('/api/auth/setup-wallet', authenticateToken, async (req, res) => {
    const { email } = req.user;

    if (!email) {
        return res.status(400).json({ error: "Session expired. Please log in again." });
    }

    // Use email as the username/identity
    const username = email;

    try {
        const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: "User not found. Please restart login." });
        }
        const user = userCheck.rows[0];

        // Generate deterministic self-custodial wallet from email + salt
        // (same as before so it's idempotent)
        const seed = crypto.createHash('sha256').update(email + process.env.ENCRYPTION_KEY).digest('hex');
        const wallet = new ethers.Wallet('0x' + seed);
        const walletAddr = wallet.address.toLowerCase();
        const encryptedKey = encrypt(wallet.privateKey);

        // If the wallet_address already conflicts (leftover from a broken previous attempt),
        // first clear the conflicting row, then update this user's row.
        await pool.query(
            `UPDATE users SET wallet_address = NULL, deposit_address = NULL, username = NULL
             WHERE wallet_address = $1 AND email != $2`,
            [walletAddr, email]
        );

        const updatedUser = await pool.query(
            `UPDATE users SET wallet_address = $1, username = $2, deposit_address = $3, encrypted_private_key = $4
             WHERE email = $5 RETURNING *`,
            [walletAddr, username, walletAddr, encryptedKey, email]
        );

        // Issue a fresh JWT with the wallet address
        const newToken = jwt.sign({ email, wallet_address: walletAddr }, JWT_SECRET, { expiresIn: '7d' });

        res.json({ user: updatedUser.rows[0], token: newToken });
    } catch (err) {
        console.error("Setup Wallet Error:", err.message, err.stack);
        res.status(500).json({ error: "Failed to setup wallet: " + err.message });
    }
});

app.post('/api/users/register', async (req, res) => {
    const { wallet_address, username, bio, profile_image } = req.body;
    if (!wallet_address) return res.status(400).json({ error: 'Wallet address required' });

    try {
        const query = `
            INSERT INTO users (wallet_address, username, bio, profile_image)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (wallet_address) 
            DO UPDATE SET username = EXCLUDED.username, bio = EXCLUDED.bio, profile_image = EXCLUDED.profile_image
            RETURNING *;
        `;
        const result = await pool.query(query, [wallet_address.toLowerCase(), username, bio, profile_image]);
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Get Leaderboard
app.get('/api/leaderboard', async (req, res) => {
    try {
        const query = `
            SELECT 
                u.wallet_address, 
                u.username, 
                SUM(d.amount::float) as total_savings, 
                d.token_symbol, 
                COUNT(d.tx_hash) as weeks,
                d.streak_id,
                COALESCE(sg.goal_description, 'Unnamed Plan') as goal_description
            FROM users u
            JOIN deposit_history d ON u.wallet_address = d.wallet_address
            LEFT JOIN streak_goals sg ON u.wallet_address = sg.wallet_address AND d.streak_id = sg.streak_id
            WHERE sg.is_withdrawn = FALSE OR sg.is_withdrawn IS NULL
            GROUP BY u.wallet_address, u.username, d.token_symbol, d.streak_id, sg.goal_description
            ORDER BY total_savings DESC
            LIMIT 20;
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/stats', async (req, res) => {
    try {
        const tvlQuery = `
            SELECT COALESCE(SUM(CASE WHEN token_symbol = 'USDT' THEN amount::float ELSE 0 END), 0) as usdt_tvl,
                   COALESCE(SUM(CASE WHEN token_symbol = 'INJ' THEN amount::float ELSE 0 END), 0) as inj_tvl,
                   COUNT(DISTINCT wallet_address) as active_savers,
                   COUNT(*) as total_deposits
            FROM deposit_history;
        `;
        const result = await pool.query(tvlQuery);
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Set Streak Goal
app.post('/api/streak/note', async (req, res) => {
    const { wallet_address, goal_description, target_amount, duration_weeks } = req.body;
    try {
        const query = `
            INSERT INTO streak_goals (wallet_address, goal_description, target_amount, duration_weeks)
            VALUES ($1, $2, $3, $4)
            RETURNING *;
        `;
        const result = await pool.query(query, [wallet_address.toLowerCase(), goal_description, target_amount, duration_weeks]);
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Get Wallet Balance
app.get('/api/wallet/balance/:address', async (req, res) => {
    const { address } = req.params;
    const provider = new ethers.JsonRpcProvider(process.env.INJECTIVE_RPC);
    const USDT_ABI = ["function balanceOf(address) view returns (uint256)"];
    const usdt = new ethers.Contract(process.env.USDT_ADDRESS || '0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1', USDT_ABI, provider);

    try {
        const injBalance = await provider.getBalance(address);
        const usdtBalance = await usdt.balanceOf(address);
        res.json({
            inj: ethers.formatEther(injBalance),
            usdt: ethers.formatUnits(usdtBalance, 6)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch balance" });
    }
});

// Start Streak (Revised for Multiple Goals)
app.post('/api/streak/start', async (req, res) => {
    try {
        const { username, amount, duration, token, purpose } = req.body;
        const streakToken = token || '0x0000000000000000000000000000000000000000'; 

        const userRes = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (userRes.rows.length === 0) return res.status(404).json({ error: "User not found" });
        
        const user = userRes.rows[0];
        if (!user.encrypted_private_key) return res.status(400).json({ error: "No managed wallet" });

        const userKey = decrypt(user.encrypted_private_key);
        const userWallet = new ethers.Wallet(userKey, provider);
        const contract = new ethers.Contract(process.env.STREAKPAY_ADDRESS, STREAKPAY_ABI_MIN, userWallet);

        const decimals = streakToken === '0x0000000000000000000000000000000000000000' ? 18 : 6;
        const streakAmount = amount ? ethers.parseUnits(amount.toString(), decimals) : 0;
        const streakDuration = duration ? Number(duration) : 4;
        const streakPurpose = purpose || "Savings Goal";

        if (streakAmount === 0) return res.status(400).json({ error: "Invalid amount" });

        let tx;
        if (streakToken === '0x0000000000000000000000000000000000000000') {
            const balance = await provider.getBalance(user.deposit_address);
            if (balance < streakAmount) return res.status(400).json({ error: "Insufficient INJ balance" });
            tx = await contract.startStreak(streakToken, streakAmount, streakDuration, streakPurpose, { value: streakAmount });
        } else {
            const usdt = new ethers.Contract(streakToken, USDT_ABI, userWallet);
            const balance = await usdt.balanceOf(user.deposit_address);
            if (balance < streakAmount) return res.status(400).json({ error: "Insufficient USDT balance" });

            const allowance = await usdt.allowance(user.deposit_address, process.env.STREAKPAY_ADDRESS);
            if (allowance < streakAmount) {
                const atx = await usdt.approve(process.env.STREAKPAY_ADDRESS, ethers.MaxUint256);
                await atx.wait();
            }
            tx = await contract.startStreak(streakToken, streakAmount, streakDuration, streakPurpose);
        }
        res.json({ success: true, txHash: tx.hash });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Claim Reward (Multi-Streak)
app.post('/api/streak/claim', async (req, res) => {
    const { username, streakId } = req.body;
    try {
        const userRes = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (userRes.rows.length === 0) return res.status(404).json({ error: "User not found" });
        const user = userRes.rows[0];
        const userKey = decrypt(user.encrypted_private_key);
        const userWallet = new ethers.Wallet(userKey, provider);
        const contract = new ethers.Contract(process.env.STREAKPAY_ADDRESS, STREAKPAY_ABI_MIN, userWallet);

        const tx = await contract.claimReward(Number(streakId));
        await tx.wait();
        res.json({ success: true, txHash: tx.hash });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Emergency Withdraw (Multi-Streak)
app.post('/api/streak/withdraw/emergency', async (req, res) => {
    const { username, streakId } = req.body;
    try {
        const userRes = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (userRes.rows.length === 0) return res.status(404).json({ error: "User not found" });
        const user = userRes.rows[0];
        const userKey = decrypt(user.encrypted_private_key);
        const userWallet = new ethers.Wallet(userKey, provider);
        const contract = new ethers.Contract(process.env.STREAKPAY_ADDRESS, STREAKPAY_ABI_MIN, userWallet);

        const tx = await contract.emergencyWithdraw(Number(streakId));
        await tx.wait();
        res.json({ success: true, txHash: tx.hash });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Outbound Transfer from Managed Wallet
app.post('/api/wallet/send', async (req, res) => {
    let { username, recipient, amount, token } = req.body;
    try {
        const userRes = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (userRes.rows.length === 0) return res.status(404).json({ error: "User not found" });
        const user = userRes.rows[0];
        
        // Convert recipient if it's an Injective bech32 address
        recipient = injToEth(recipient);
        
        const userKey = decrypt(user.encrypted_private_key);
        const userWallet = new ethers.Wallet(userKey, provider);
        
        const isInj = !token || token === '0x0000000000000000000000000000000000000000';
        const decimals = isInj ? 18 : 6;
        const amountParsed = ethers.parseUnits(amount.toString(), decimals);

        let tx;
        if (isInj) {
            tx = await userWallet.sendTransaction({
                to: recipient,
                value: amountParsed
            });
        } else {
            const usdt = new ethers.Contract(token, USDT_ABI, userWallet);
            tx = await usdt.transfer(recipient, amountParsed);
        }

        res.json({ success: true, txHash: tx.hash });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// --- On-Chain Sync Logic ---

const STREAKPAY_ABI = [
    "function userStreaks(address) view returns (address user, address token, uint256 weeklyAmount, uint256 totalCommittedWeeks, uint256 weeksCompleted, uint256 lastDepositTimestamp, uint256 startTime, uint256 totalSaved, bool isActive, bool isClaimed)",
    "event WeeklyDepositMade(address indexed user, address indexed token, uint256 weekNumber, uint256 amount)"
];

let lastSyncedBlock = 0;

async function syncEvents() {
    console.log("Starting periodic event sync...");

    const contracts = [
        {
            address: process.env.STREAKPAY_ADDRESS,
            abi: [
                "event WeeklyDepositMade(address indexed user, uint256 indexed streakId, address indexed token, uint256 weekNumber, uint256 amount)",
                "event StreakStarted(address indexed user, uint256 indexed streakId, address indexed token, uint256 weeklyAmount, uint256 durationWeeks, string description)",
                "event FundsWithdrawn(address indexed user, uint256 indexed streakId, address indexed token, uint256 amount)"
            ]
        },
        {
            address: "0x4A679253410272dd5232B3Ff7cF5dbB88f295319", // Legacy contract
            abi: [
                "event WeeklyDepositMade(address indexed user, uint256 weekNumber, uint256 amount)",
                "event StreakStarted(address indexed user, address indexed token, uint256 weeklyAmount, uint256 durationWeeks)",
                "function userStreaks(address) view returns (address user, address token, uint256 weeklyAmount, uint256 totalCommittedWeeks, uint256 weeksCompleted, uint256 lastDepositTimestamp, uint256 startTime, uint256 totalSaved, bool isActive, bool isClaimed)"
            ]
        }
    ];

    const runSync = async () => {
        try {
            if (lastSyncedBlock === 0) {
                // Perform a deep re-sync of 100,000 blocks (~27 hours) to catch all history
                const currentBlock = await provider.getBlockNumber();
                lastSyncedBlock = currentBlock - 100000; 
                console.log(`Re-syncing from block ${lastSyncedBlock}`);
            }

            const currentBlock = await provider.getBlockNumber();
            if (currentBlock <= lastSyncedBlock) return;

            console.log(`Syncing blocks ${lastSyncedBlock + 1} to ${currentBlock}`);
            
            for (const item of contracts) {
                const contract = new ethers.Contract(item.address, item.abi, provider);
                let fromBlock = lastSyncedBlock + 1;
                
                while (fromBlock <= currentBlock) {
                    const toBlock = Math.min(fromBlock + 5000, currentBlock);
                    console.log(`- Fetching chunk ${fromBlock} to ${toBlock} for ${item.address}`);
                    
                    // 1. WeeklyDepositMade
                    const depositEvents = await contract.queryFilter("WeeklyDepositMade", fromBlock, toBlock);
                    for (const event of depositEvents) {
                        const { user, streakId, weekNumber, amount } = event.args;
                        let token = event.args.token;
                        const txHash = event.transactionHash;

                        if (!token) {
                            try {
                                const s = await contract.userStreaks(user, Number(streakId));
                                token = s.token;
                            } catch (e) { token = ethers.ZeroAddress; }
                        }

                        const isInj = token.toLowerCase() === ethers.ZeroAddress.toLowerCase();
                        const decimals = isInj ? 18 : 6;
                        const symbol = isInj ? 'INJ' : 'USDT';
                        const amountFormatted = ethers.formatUnits(amount, decimals);

                        await pool.query('INSERT INTO users (wallet_address) VALUES ($1) ON CONFLICT DO NOTHING', [user.toLowerCase()]);
                        await pool.query(`
                            INSERT INTO deposit_history (tx_hash, wallet_address, streak_id, week_number, amount, timestamp, token_symbol)
                            VALUES ($1, $2, $3, $4, $5, NOW(), $6)
                            ON CONFLICT (tx_hash) DO NOTHING;
                        `, [txHash, user.toLowerCase(), Number(streakId), Number(weekNumber), amountFormatted, symbol]);
                    }

                    // 2. StreakStarted
                    const startEvents = await contract.queryFilter("StreakStarted", fromBlock, toBlock);
                    for (const event of startEvents) {
                        const { user, streakId, weeklyAmount, durationWeeks, description } = event.args;
                        const isInj = event.args.token ? event.args.token.toLowerCase() === ethers.ZeroAddress.toLowerCase() : true;
                        const amountFormatted = ethers.formatUnits(weeklyAmount, isInj ? 18 : 6);

                        await pool.query(`
                            INSERT INTO streak_goals (wallet_address, streak_id, goal_description, target_amount, duration_weeks, created_at, is_withdrawn)
                            VALUES ($1, $2, $3, $4, $5, NOW(), FALSE)
                            ON CONFLICT (wallet_address, streak_id) DO NOTHING;
                        `, [user.toLowerCase(), Number(streakId), description || "Savings Goal", (Number(amountFormatted) * Number(durationWeeks)).toString(), Number(durationWeeks)]);
                    }

                    // 3. FundsWithdrawn
                    const withdrawEvents = await contract.queryFilter("FundsWithdrawn", fromBlock, toBlock).catch(() => []);
                    for (const event of withdrawEvents) {
                        const { user, streakId } = event.args;
                        await pool.query(`
                            UPDATE streak_goals SET is_withdrawn = TRUE 
                            WHERE wallet_address = $1 AND streak_id = $2
                        `, [user.toLowerCase(), Number(streakId)]);
                    }
                    fromBlock = toBlock + 1;
                }
            }
            lastSyncedBlock = currentBlock;
        } catch (err) {
            console.error("Polling sync error:", err.message);
        }
    };

    setInterval(runSync, 15000); // Poll every 15 seconds
}

// --- Background Monitor & Relayer ---
async function monitorManagedWallets() {
    console.log("Starting managed wallet monitor...");
    const masterWallet = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY, provider);
    
    setInterval(async () => {
        try {
            const users = await pool.query('SELECT * FROM users WHERE encrypted_private_key IS NOT NULL');
            
            for (const user of users.rows) {
                const userKey = decrypt(user.encrypted_private_key);
                const userWallet = new ethers.Wallet(userKey, provider);
                const usdt = new ethers.Contract(process.env.USDT_ADDRESS || '0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1', USDT_ABI, userWallet);
                const contract = new ethers.Contract(process.env.STREAKPAY_ADDRESS, STREAKPAY_ABI_MIN, userWallet);

                const injBalance = await provider.getBalance(user.deposit_address);
                const usdtBalance = await usdt.balanceOf(user.deposit_address);

                // 1. Gas check (Fund with 0.1 INJ if low)
                if (injBalance < ethers.parseEther("0.05")) {
                    console.log(`Funding gas for ${user.username}...`);
                    const tx = await masterWallet.sendTransaction({
                        to: user.deposit_address,
                        value: ethers.parseEther("0.1")
                    });
                    await tx.wait();
                }

                // 2. Deposit logic (REMOVED AUTO-START per user request)
                // Users must manually create streaks. Relayer only funds gas.
                /*
                const streak = await contract.userStreaks(user.deposit_address);
                if (!streak.isActive) {
                    if (usdtBalance >= ethers.parseUnits("10", 6)) {
                        console.log(`Auto-starting USDT streak for ${user.username}...`);
                        const allowance = await usdt.allowance(user.deposit_address, process.env.STREAKPAY_ADDRESS);
                        if (allowance < usdtBalance) {
                            await (await usdt.approve(process.env.STREAKPAY_ADDRESS, ethers.MaxUint256)).wait();
                        }
                        const tx = await contract.startStreak(process.env.USDT_ADDRESS, usdtBalance, 4);
                        await tx.wait();
                    } else if (injBalance >= ethers.parseEther("1")) {
                        console.log(`Auto-starting INJ streak for ${user.username}...`);
                        const tx = await contract.startStreak('0x0000000000000000000000000000000000000000', ethers.parseEther("0.5"), 4, { value: ethers.parseEther("0.5") });
                        await tx.wait();
                    }
                }
                */
            }
        } catch (err) {
            console.error("Monitor Error:", err.message);
        }
    }, 60000); // Check every minute
}

app.listen(PORT, () => {
    console.log(`Backend listening on port ${PORT}`);
    syncEvents().catch(console.error);
    monitorManagedWallets().catch(console.error);
});
