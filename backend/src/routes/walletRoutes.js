const express = require('express');
const walletController = require('../controllers/walletController');

const router = express.Router();

router.get('/balance/:address', walletController.getBalance);
router.post('/send', walletController.sendFunds);

module.exports = router;
