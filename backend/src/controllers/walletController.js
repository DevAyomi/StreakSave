const pool = require('../config/db');
const { ethers } = require('ethers');
const { provider, USDT_ABI } = require('../config/provider');
const { decrypt } = require('../utils/encryption');
const { injToEth } = require('../utils/address');
require('dotenv').config();

exports.getBalance = async (req, res) => {
    const { address } = req.params;
    const usdtAddress = process.env.USDT_ADDRESS || '0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1';
    const usdt = new ethers.Contract(usdtAddress, USDT_ABI, provider);

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
};

exports.sendFunds = async (req, res) => {
    let { username, recipient, amount, token } = req.body;
    try {
        const userRes = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (userRes.rows.length === 0) return res.status(404).json({ error: "User not found" });
        const user = userRes.rows[0];
        
        recipient = injToEth(recipient);
        const userKey = decrypt(user.encrypted_private_key);
        const userWallet = new ethers.Wallet(userKey, provider);
        
        const isInj = !token || token === ethers.ZeroAddress;
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
};
