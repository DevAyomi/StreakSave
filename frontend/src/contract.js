export const STREAKPAY_ADDRESS = "0x9feA9ab28B7D5902958dDf2d4e40A78FFdC00577";
export const USDT_ADDRESS = "0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1";

export const STREAKPAY_ABI = [
  {
    "type": "constructor",
    "inputs": [{ "name": "_usdt", "type": "address", "internalType": "address" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "claimReward",
    "inputs": [{ "name": "_streakId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "deposit",
    "inputs": [{ "name": "_streakId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "emergencyWithdraw",
    "inputs": [{ "name": "_streakId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "startStreak",
    "inputs": [
      { "name": "_token", "type": "address", "internalType": "address" },
      { "name": "_weeklyAmount", "type": "uint256", "internalType": "uint256" },
      { "name": "_durationWeeks", "type": "uint256", "internalType": "uint256" },
      { "name": "_description", "type": "string", "internalType": "string" }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "userStreakCount",
    "inputs": [{ "name": "", "type": "address", "internalType": "address" }],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "userStreaks",
    "inputs": [
      { "name": "", "type": "address", "internalType": "address" },
      { "name": "_streakId", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [
      { "name": "user", "type": "address", "internalType": "address" },
      { "name": "token", "type": "address", "internalType": "address" },
      { "name": "weeklyAmount", "type": "uint256", "internalType": "uint256" },
      { "name": "totalCommittedWeeks", "type": "uint256", "internalType": "uint256" },
      { "name": "weeksCompleted", "type": "uint256", "internalType": "uint256" },
      { "name": "lastDepositTimestamp", "type": "uint256", "internalType": "uint256" },
      { "name": "startTime", "type": "uint256", "internalType": "uint256" },
      { "name": "totalSaved", "type": "uint256", "internalType": "uint256" },
      { "name": "description", "type": "string", "internalType": "string" },
      { "name": "isActive", "type": "bool", "internalType": "bool" },
      { "name": "isClaimed", "type": "bool", "internalType": "bool" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "StreakStarted",
    "inputs": [
      { "name": "user", "type": "address", "indexed": true },
      { "name": "streakId", "type": "uint256", "indexed": true },
      { "name": "token", "type": "address", "indexed": true },
      { "name": "weeklyAmount", "type": "uint256", "indexed": false },
      { "name": "durationWeeks", "type": "uint256", "indexed": false },
      { "name": "description", "type": "string", "indexed": false }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "WeeklyDepositMade",
    "inputs": [
      { "name": "user", "type": "address", "indexed": true },
      { "name": "streakId", "type": "uint256", "indexed": true },
      { "name": "token", "type": "address", "indexed": true },
      { "name": "weekNumber", "type": "uint256", "indexed": false },
      { "name": "amount", "type": "uint256", "indexed": false }
    ],
    "anonymous": false
  }
];
