// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/StreakPay.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDT is ERC20 {
    constructor() ERC20("Mock USDT", "USDT") {
        _mint(msg.sender, 1000000 ether);
    }
    function decimals() public view virtual override returns (uint8) {
        return 6;
    }
}

contract StreakPayTest is Test {
    StreakPay public streakPay;
    MockUSDT public usdt;
    address public user = address(1);
    uint256 public weeklyAmount = 100 * 10**6; // 100 USDT

    function setUp() public {
        usdt = new MockUSDT();
        streakPay = new StreakPay(address(usdt));
        
        usdt.transfer(user, 1000 * 10**6);
        vm.prank(user);
        usdt.approve(address(streakPay), type(uint256).max);
        
        // Give some native INJ to the user
        vm.deal(user, 100 ether);
    }

    function testStartStreakUSDT() public {
        vm.prank(user);
        streakPay.startStreak(address(usdt), weeklyAmount, 4, "iPhone");

        (,,,, uint256 weeksCompleted,,,,,,) = streakPay.userStreaks(user, 0);
        assertEq(weeksCompleted, 1);
        assertEq(usdt.balanceOf(address(streakPay)), weeklyAmount);
    }

    function testStartStreakINJ() public {
        uint256 injAmount = 1 ether;
        vm.prank(user);
        streakPay.startStreak{value: injAmount}(address(0), injAmount, 4, "Savings");

        (,,,, uint256 weeksCompleted,,,,,,) = streakPay.userStreaks(user, 0);
        assertEq(weeksCompleted, 1);
        assertEq(address(streakPay).balance, injAmount);
    }

    function testMultipleStreaks() public {
        vm.startPrank(user);
        streakPay.startStreak(address(usdt), weeklyAmount, 4, "iPhone");
        streakPay.startStreak(address(usdt), weeklyAmount, 10, "Vacation");
        vm.stopPrank();

        assertEq(streakPay.userStreakCount(user), 2);
    }

    function testWeeklyDeposit() public {
        vm.startPrank(user);
        streakPay.startStreak(address(usdt), weeklyAmount, 4, "iPhone");
        
        // Fast forward 1 week
        vm.warp(block.timestamp + 7 days);
        streakPay.deposit(0);
        
        vm.stopPrank();

        (,,,, uint256 weeksCompleted,,,,,,) = streakPay.userStreaks(user, 0);
        assertEq(weeksCompleted, 2);
    }

    function testStreakBroken() public {
        vm.startPrank(user);
        streakPay.startStreak(address(usdt), weeklyAmount, 4, "iPhone");
        
        // Fast forward 11 days (past the 3-day window of the second week)
        vm.warp(block.timestamp + 11 days);
        
        vm.expectRevert(StreakPay.StreakBroken.selector);
        streakPay.deposit(0);
        
        vm.stopPrank();
    }

    function testClaimRewardUSDT() public {
        vm.startPrank(user);
        streakPay.startStreak(address(usdt), weeklyAmount, 4, "iPhone");
        
        for(uint256 i = 1; i < 4; i++) {
            vm.warp(block.timestamp + 7 days);
            streakPay.deposit(0);
        }

        // Fund Reward Pool
        vm.stopPrank();
        usdt.transfer(address(streakPay), 100 * 10**6);
        
        vm.prank(user);
        streakPay.claimReward(0);

        uint256 expectedBalance = 1000 * 10**6 + (weeklyAmount * 4 * 5 / 100);
        assertEq(usdt.balanceOf(user), expectedBalance);
    }

    function testClaimRewardINJ() public {
        uint256 injAmount = 1 ether;
        vm.startPrank(user);
        streakPay.startStreak{value: injAmount}(address(0), injAmount, 4, "Savings");
        
        for(uint256 i = 1; i < 4; i++) {
            vm.warp(block.timestamp + 7 days);
            streakPay.deposit{value: injAmount}(0);
        }

        // Fund Reward Pool
        vm.stopPrank();
        vm.deal(address(streakPay), 10 ether); // Add some rewards
        
        uint256 balanceBefore = user.balance;
        vm.prank(user);
        streakPay.claimReward(0);

        uint256 bonus = (injAmount * 4 * 5 / 100);
        assertEq(user.balance, balanceBefore + (injAmount * 4) + bonus);
    }
}
