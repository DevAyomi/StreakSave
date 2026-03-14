const { ethers } = require('ethers');
require('dotenv').config();

const candidates = [
    '0x09635F643e140090A9A8Dcd712eD6285858ceBef',
    '0x4A679253410272dd5232B3Ff7cF5dbB88f295319',
    '0xa8665d0868be66bfc5d9f60cf0c5850ed9d72847'
];

async function find() {
    const provider = new ethers.JsonRpcProvider(process.env.INJECTIVE_RPC);
    const block = await provider.getBlockNumber();
    console.log(`Current block: ${block}`);

    const abi = [
        "event WeeklyDepositMade(address indexed user, address indexed token, uint256 weekNumber, uint256 amount)",
        "event StreakStarted(address indexed user, address indexed token, uint256 weeklyAmount, uint256 durationWeeks)"
    ];

    for (const address of candidates) {
        console.log(`\nChecking ${address}...`);
        const contract = new ethers.Contract(address, abi, provider);
        
        let depositCount = 0;
        let streakCount = 0;
        
        // Check last 200k blocks in chunks of 10k
        for (let i = 0; i < 20; i++) {
            const from = block - (i + 1) * 10000;
            const to = block - i * 10000;
            
            try {
                const deposits = await contract.queryFilter("WeeklyDepositMade", from, to);
                const streaks = await contract.queryFilter("StreakStarted", from, to);
                
                depositCount += deposits.length;
                streakCount += streaks.length;
                
                if (deposits.length > 0) {
                    console.log(`  - Found ${deposits.length} deposits in chunk ${i} (block ${deposits[0].blockNumber})`);
                }
            } catch (e) {
                // console.log(`  - Chunk ${i} failed`);
            }
        }
        console.log(`Total: ${depositCount} deposits, ${streakCount} streaks`);
    }
    process.exit(0);
}

find().catch(console.error);
