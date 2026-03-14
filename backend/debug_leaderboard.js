const { Pool } = require('pg');
const { ethers } = require('ethers');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function debug() {
    console.log("--- DB Check ---");
    const res = await pool.query('SELECT * FROM deposit_history ORDER BY timestamp DESC LIMIT 5');
    console.table(res.rows);

    console.log("\n--- Event Check ---");
    const provider = new ethers.JsonRpcProvider(process.env.INJECTIVE_RPC);
    const contract = new ethers.Contract(process.env.STREAKPAY_ADDRESS, [
        "event WeeklyDepositMade(address indexed user, address indexed token, uint256 weekNumber, uint256 amount)"
    ], provider);

    const block = await provider.getBlockNumber();
    console.log(`Current block: ${block}`);
    
    let from = block - 100000;
    while (from <= block) {
        const to = Math.min(from + 10000, block);
        console.log(`- Fetching ${from} to ${to}`);
        const events = await contract.queryFilter("WeeklyDepositMade", from, to);
        events.forEach(e => {
            console.log(`Block: ${e.blockNumber}, User: ${e.args.user}, Token: ${e.args.token}, Amount: ${e.args.amount}, Symbol: ${e.args.token.toLowerCase() === ethers.ZeroAddress.toLowerCase() ? 'INJ' : 'USDT'}`);
        });
        from = to + 1;
    }

    process.exit(0);
}

debug().catch(console.error);
