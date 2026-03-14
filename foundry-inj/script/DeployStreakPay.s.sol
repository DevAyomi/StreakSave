// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/StreakPay.sol";
import "./HelperConfig.s.sol";

contract DeployStreakPay is Script {
    function run() external returns (StreakPay, HelperConfig) {
        HelperConfig helperConfig = new HelperConfig();
        (uint256 deployerKey, ) = helperConfig.activeNetworkConfig();

        // Injective Testnet MockUSDT address from previous deployment or new one
        // Let's assume we use the one we just deployed: 0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1
        address usdtAddress = 0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1;

        vm.startBroadcast(deployerKey);
        StreakPay streakPay = new StreakPay(usdtAddress);
        vm.stopBroadcast();

        return (streakPay, helperConfig);
    }
}
