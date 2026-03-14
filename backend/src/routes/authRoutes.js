const express = require('express');
const authController = require('../controllers/authController');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

router.post('/request-otp', authController.requestOTP);
router.post('/verify-otp', authController.verifyOTP);
router.post('/setup-wallet', authenticateToken, authController.setupWallet);

module.exports = router;
