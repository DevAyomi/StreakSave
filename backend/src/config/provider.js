const { ethers } = require('ethers');
require('dotenv').config();

const provider = new ethers.JsonRpcProvider(process.env.INJECTIVE_RPC);

const USDT_ABI = [
    "function balanceOf(address) view returns (uint256)", 
    "function approve(address, uint256) returns (bool)", 
    "function allowance(address, address) view returns (uint256)",
    "function transfer(address, uint256) returns (bool)"
];

const STREAKPAY_ABI_MIN = [
    "function startStreak(address token, uint256 weeklyAmount, uint256 durationWeeks, string description) payable",
    "function deposit(uint256 streakId) payable",
    "function claimReward(uint256 streakId)",
    "function emergencyWithdraw(uint256 streakId)",
    "function userStreaks(address, uint256) view returns (address user, address token, uint256 weeklyAmount, uint256 totalCommittedWeeks, uint256 weeksCompleted, uint256 lastDepositTimestamp, uint256 startTime, uint256 totalSaved, string description, bool isActive, bool isClaimed)",
    "function userStreakCount(address) view returns (uint256)",
    "event WeeklyDepositMade(address indexed user, uint256 indexed streakId, address indexed token, uint256 weekNumber, uint256 amount)",
    "event StreakStarted(address indexed user, uint256 indexed streakId, address indexed token, uint256 weeklyAmount, uint256 durationWeeks, string description)",
    "event FundsWithdrawn(address indexed user, uint256 indexed streakId, address indexed token, uint256 amount)"
];

const STREAKPAY_ADDRESS = process.env.STREAKPAY_ADDRESS;
const USDT_ADDRESS = process.env.USDT_ADDRESS;

module.exports = {
    provider,
    USDT_ABI,
    STREAKPAY_ABI_MIN,
    STREAKPAY_ADDRESS,
    USDT_ADDRESS
};
