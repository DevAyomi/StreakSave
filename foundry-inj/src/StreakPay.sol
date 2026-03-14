// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title StreakPay
 * @dev A gamified savings protocol on Injective where users commit to weekly deposits (USDT or INJ).
 */
contract StreakPay is ReentrancyGuard {
    struct Streak {
        address user;
        address token; // address(0) for native INJ, else ERC20 address
        uint256 weeklyAmount;
        uint256 totalCommittedWeeks;
        uint256 weeksCompleted;
        uint256 lastDepositTimestamp;
        uint256 startTime;
        uint256 totalSaved;
        string description; // What the user is saving for
        bool isActive;
        bool isClaimed;
    }

    IERC20 public immutable usdt;
    uint256 public constant WEEK_DURATION = 7 days;
    uint256 public constant DEPOSIT_WINDOW = 3 days;
    uint256 public rewardBips = 500; // 5% bonus

    // User address => Streak ID => Streak
    mapping(address => mapping(uint256 => Streak)) public userStreaks;
    // User address => Total streaks created
    mapping(address => uint256) public userStreakCount;
    mapping(address => uint256) public totalValueLocked;

    event StreakStarted(address indexed user, uint256 indexed streakId, address indexed token, uint256 weeklyAmount, uint256 durationWeeks, string description);
    event WeeklyDepositMade(address indexed user, uint256 indexed streakId, address indexed token, uint256 weekNumber, uint256 amount);
    event StreakCompleted(address indexed user, uint256 indexed streakId, uint256 totalSaved, uint256 bonus);
    event FundsWithdrawn(address indexed user, uint256 indexed streakId, address indexed token, uint256 amount);

    error NoActiveStreak();
    error DepositWindowNotOpen();
    error StreakBroken();
    error AlreadyClaimed();
    error CycleNotFinished();
    error InvalidAmount();
    error TransferFailed();

    constructor(address _usdt) {
        usdt = IERC20(_usdt);
    }

    /**
     * @dev Start a new savings streak.
     * @param _token Token address (address(0) for Native INJ).
     * @param _weeklyAmount Amount to save every week.
     * @param _durationWeeks Number of weeks for the streak.
     * @param _description Purpose of the streak.
     */
    function startStreak(address _token, uint256 _weeklyAmount, uint256 _durationWeeks, string memory _description) external payable nonReentrant {
        if (_weeklyAmount == 0) revert InvalidAmount();

        uint256 streakId = userStreakCount[msg.sender]++;
        
        userStreaks[msg.sender][streakId] = Streak({
            user: msg.sender,
            token: _token,
            weeklyAmount: _weeklyAmount,
            totalCommittedWeeks: _durationWeeks,
            weeksCompleted: 0,
            lastDepositTimestamp: 0,
            startTime: block.timestamp,
            totalSaved: 0,
            description: _description,
            isActive: true,
            isClaimed: false
        });

        emit StreakStarted(msg.sender, streakId, _token, _weeklyAmount, _durationWeeks, _description);
        
        // Make first deposit
        _deposit(streakId);
    }

    /**
     * @dev Make the weekly deposit.
     */
    function deposit(uint256 _streakId) external payable nonReentrant {
        _deposit(_streakId);
    }

    function _deposit(uint256 _streakId) internal {
        Streak storage streak = userStreaks[msg.sender][_streakId];
        if (!streak.isActive) revert NoActiveStreak();
        if (streak.weeksCompleted >= streak.totalCommittedWeeks) revert ("Streak already finished");

        uint256 currentWeek = streak.weeksCompleted;
        uint256 weekStartTime = streak.startTime + (currentWeek * WEEK_DURATION);
        
        if (block.timestamp < weekStartTime) revert DepositWindowNotOpen();
        if (block.timestamp > weekStartTime + DEPOSIT_WINDOW) {
            streak.isActive = false;
            revert StreakBroken();
        }

        if (streak.token == address(0)) {
            // Native INJ
            if (msg.value < streak.weeklyAmount) revert InvalidAmount();
            // Refund excess if any
            if (msg.value > streak.weeklyAmount) {
                (bool refund, ) = payable(msg.sender).call{value: msg.value - streak.weeklyAmount}("");
                if (!refund) revert TransferFailed();
            }
        } else {
            // ERC20
            bool success = IERC20(streak.token).transferFrom(msg.sender, address(this), streak.weeklyAmount);
            if (!success) revert TransferFailed();
        }

        streak.totalSaved += streak.weeklyAmount;
        streak.weeksCompleted++;
        streak.lastDepositTimestamp = block.timestamp;
        totalValueLocked[streak.token] += streak.weeklyAmount;

        emit WeeklyDepositMade(msg.sender, _streakId, streak.token, streak.weeksCompleted, streak.weeklyAmount);

        if (streak.weeksCompleted == streak.totalCommittedWeeks) {
            emit StreakCompleted(msg.sender, _streakId, streak.totalSaved, (streak.totalSaved * rewardBips) / 10000);
        }
    }

    /**
     * @dev Claim principal + bonus rewards.
     */
    function claimReward(uint256 _streakId) external nonReentrant {
        Streak storage streak = userStreaks[msg.sender][_streakId];
        if (streak.isClaimed) revert AlreadyClaimed();
        if (streak.weeksCompleted < streak.totalCommittedWeeks) revert CycleNotFinished();

        uint256 bonus = (streak.totalSaved * rewardBips) / 10000;
        uint256 totalOut = streak.totalSaved + bonus;

        streak.isClaimed = true;
        streak.isActive = false;
        totalValueLocked[streak.token] -= streak.totalSaved;

        if (streak.token == address(0)) {
            (bool success, ) = payable(msg.sender).call{value: totalOut}("");
            if (!success) revert TransferFailed();
        } else {
            bool success = IERC20(streak.token).transfer(msg.sender, totalOut);
            if (!success) revert TransferFailed();
        }

        emit FundsWithdrawn(msg.sender, _streakId, streak.token, totalOut);
    }

    /**
     * @dev Emergency withdraw (principal only, bonus lost).
     */
    function emergencyWithdraw(uint256 _streakId) external nonReentrant {
         Streak storage streak = userStreaks[msg.sender][_streakId];
         if (streak.isClaimed) revert AlreadyClaimed();
         

         uint256 amount = streak.totalSaved;
         streak.isClaimed = true;
         streak.isActive = false;
         totalValueLocked[streak.token] -= amount;

         if (streak.token == address(0)) {
             (bool success, ) = payable(msg.sender).call{value: amount}("");
             if (!success) revert TransferFailed();
         } else {
             bool success = IERC20(streak.token).transfer(msg.sender, amount);
             if (!success) revert TransferFailed();
         }

         emit FundsWithdrawn(msg.sender, _streakId, streak.token, amount);
    }

    function setRewardBips(uint256 _bips) external {
        rewardBips = _bips;
    }

    // Allow contract to receive native INJ for rewards
    receive() external payable {}
}
