const { ethers } = require('ethers');
const pool = require('../config/db');
const { provider } = require('../config/provider');

let lastSyncedBlock = 0;

async function syncEvents() {
    console.log("Starting periodic event sync...");

    const contracts = [
        {
            address: process.env.STREAKPAY_ADDRESS,
            abi: [
                "event WeeklyDepositMade(address indexed user, uint256 indexed streakId, address indexed token, uint256 weekNumber, uint256 amount)",
                "event StreakStarted(address indexed user, uint256 indexed streakId, address indexed token, uint256 weeklyAmount, uint256 durationWeeks, string description)",
                "event FundsWithdrawn(address indexed user, uint256 indexed streakId, address indexed token, uint256 amount)",
                "function userStreaks(address, uint256) view returns (address user, address token, uint256 weeklyAmount, uint256 totalCommittedWeeks, uint256 weeksCompleted, uint256 lastDepositTimestamp, uint256 startTime, uint256 totalSaved, string description, bool isActive, bool isClaimed)"
            ]
        },
        {
            address: "0x4A679253410272dd5232B3Ff7cF5dbB88f295319",
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

    setInterval(runSync, 15000);
}

module.exports = { syncEvents };
