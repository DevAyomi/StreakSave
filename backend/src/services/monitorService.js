const { ethers } = require('ethers');
const pool = require('../config/db');
const { provider, USDT_ABI } = require('../config/provider');
const { decrypt } = require('../utils/encryption');
require('dotenv').config();

async function monitorManagedWallets() {
    console.log("Starting managed wallet monitor...");
    const masterWallet = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY, provider);
    
    setInterval(async () => {
        try {
            const users = await pool.query('SELECT * FROM users WHERE encrypted_private_key IS NOT NULL');
            
            for (const user of users.rows) {
                const injBalance = await provider.getBalance(user.deposit_address);

                if (injBalance < ethers.parseEther("0.05")) {
                    console.log(`Funding gas for ${user.username}...`);
                    const tx = await masterWallet.sendTransaction({
                        to: user.deposit_address,
                        value: ethers.parseEther("0.1")
                    });
                    await tx.wait();
                }
            }
        } catch (err) {
            console.error("Monitor Error:", err.message);
        }
    }, 60000);
}

module.exports = { monitorManagedWallets };
