const express = require('express');
const streakController = require('../controllers/streakController');

const router = express.Router();

router.post('/start', streakController.startStreak);
router.post('/claim', streakController.claimReward);
router.post('/withdraw/emergency', streakController.emergencyWithdraw);

module.exports = router;
