const pool = require('../config/db');
const { ethers } = require('ethers');
const { provider, STREAKPAY_ABI_MIN, STREAKPAY_ADDRESS, USDT_ABI } = require('../config/provider');
const { decrypt } = require('../utils/encryption');

exports.startStreak = async (req, res) => {
    try {
        const { username, amount, duration, token, purpose } = req.body;
        const streakToken = token || ethers.ZeroAddress; 

        const userRes = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (userRes.rows.length === 0) return res.status(404).json({ error: "User not found" });
        
        const user = userRes.rows[0];
        if (!user.encrypted_private_key) return res.status(400).json({ error: "No managed wallet" });

        const userKey = decrypt(user.encrypted_private_key);
        const userWallet = new ethers.Wallet(userKey, provider);
        const contract = new ethers.Contract(STREAKPAY_ADDRESS, STREAKPAY_ABI_MIN, userWallet);

        const decimals = streakToken === ethers.ZeroAddress ? 18 : 6;
        const streakAmount = amount ? ethers.parseUnits(amount.toString(), decimals) : 0;
        const streakDuration = duration ? Number(duration) : 4;
        const streakPurpose = purpose || "Savings Goal";

        if (streakAmount === 0) return res.status(400).json({ error: "Invalid amount" });

        let tx;
        if (streakToken === ethers.ZeroAddress) {
            const balance = await provider.getBalance(user.deposit_address);
            if (balance < streakAmount) return res.status(400).json({ error: "Insufficient INJ balance" });
            tx = await contract.startStreak(streakToken, streakAmount, streakDuration, streakPurpose, { value: streakAmount });
        } else {
            const usdt = new ethers.Contract(streakToken, USDT_ABI, userWallet);
            const balance = await usdt.balanceOf(user.deposit_address);
            if (balance < streakAmount) return res.status(400).json({ error: "Insufficient USDT balance" });

            const allowance = await usdt.allowance(user.deposit_address, STREAKPAY_ADDRESS);
            if (allowance < streakAmount) {
                const atx = await usdt.approve(STREAKPAY_ADDRESS, ethers.MaxUint256);
                await atx.wait();
            }
            tx = await contract.startStreak(streakToken, streakAmount, streakDuration, streakPurpose);
        }
        res.json({ success: true, txHash: tx.hash });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.claimReward = async (req, res) => {
    const { username, streakId } = req.body;
    try {
        const userRes = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (userRes.rows.length === 0) return res.status(404).json({ error: "User not found" });
        const user = userRes.rows[0];
        const userKey = decrypt(user.encrypted_private_key);
        const userWallet = new ethers.Wallet(userKey, provider);
        const contract = new ethers.Contract(STREAKPAY_ADDRESS, STREAKPAY_ABI_MIN, userWallet);

        const tx = await contract.claimReward(Number(streakId));
        await tx.wait();
        res.json({ success: true, txHash: tx.hash });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.emergencyWithdraw = async (req, res) => {
    const { username, streakId } = req.body;
    try {
        const userRes = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (userRes.rows.length === 0) return res.status(404).json({ error: "User not found" });
        const user = userRes.rows[0];
        const userKey = decrypt(user.encrypted_private_key);
        const userWallet = new ethers.Wallet(userKey, provider);
        const contract = new ethers.Contract(STREAKPAY_ADDRESS, STREAKPAY_ABI_MIN, userWallet);

        const tx = await contract.emergencyWithdraw(Number(streakId));
        await tx.wait();
        res.json({ success: true, txHash: tx.hash });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};
