const pool = require('../config/db');
const { encrypt } = require('../utils/encryption');
const { ethers } = require('ethers');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');
const { JWT_SECRET } = require('../middleware/auth');
require('dotenv').config();

const resend = new Resend(process.env.RESEND_API_KEY);

exports.requestOTP = async (req, res) => {
    let { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });
    email = email.trim().toLowerCase();

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    try {
        console.log(`Bypassing Resend: Generating demo OTP for ${email}`);
        await pool.query(
            `INSERT INTO users (email, otp, otp_expires_at) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (email) DO UPDATE 
             SET otp = EXCLUDED.otp, otp_expires_at = EXCLUDED.otp_expires_at`,
            [email, otp, expiresAt]
        );

        console.log("Demo OTP session initiated for", email);
        res.json({ message: "OTP session initiated. Use code 000000 to login." });
    } catch (err) {
        console.error("OTP Error:", err);
        res.status(500).json({ error: "Failed to initiate login session", detail: err.message });
    }
};

exports.verifyOTP = async (req, res) => {
    console.log("Verify OTP Request Headers:", req.headers);
    console.log("Verify OTP Request Body:", req.body);
    let { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: "Email and OTP required" });
    email = email.trim().toLowerCase();

    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        // Demo OTP check
        const isDemoOTP = otp === '000000';
        const isValidStoredOTP = user && user.otp === otp && new Date() <= new Date(user.otp_expires_at);

        if (!isDemoOTP && !isValidStoredOTP) {
            return res.status(401).json({ error: "Invalid or expired OTP" });
        }

        // If it's a new user and they used the demo OTP, we might not have a record yet or it might be incomplete.
        // But requestOTP should have already created the record.
        if (!user) {
            return res.status(404).json({ error: "User not found. Please request an OTP first." });
        }

        await pool.query('UPDATE users SET otp = NULL, otp_expires_at = NULL WHERE email = $1', [email]);
        const token = jwt.sign({ email: user.email, wallet_address: user.wallet_address }, JWT_SECRET, { expiresIn: '7d' });
        
        res.json({ token, user });
    } catch (err) {
        console.error("Verify OTP Error:", err);
        res.status(500).json({ error: "Verification failed" });
    }
};

exports.setupWallet = async (req, res) => {
    const { email } = req.user;
    if (!email) return res.status(400).json({ error: "Session expired. Please log in again." });

    const username = email;

    try {
        const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userCheck.rows.length === 0) return res.status(404).json({ error: "User not found. Please restart login." });

        const seed = crypto.createHash('sha256').update(email + process.env.ENCRYPTION_KEY).digest('hex');
        const wallet = new ethers.Wallet('0x' + seed);
        const walletAddr = wallet.address.toLowerCase();
        const encryptedKey = encrypt(wallet.privateKey);

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

        const newToken = jwt.sign({ email, wallet_address: walletAddr }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ user: updatedUser.rows[0], token: newToken });
    } catch (err) {
        console.error("Setup Wallet Error:", err.message);
        res.status(500).json({ error: "Failed to setup wallet: " + err.message });
    }
};
