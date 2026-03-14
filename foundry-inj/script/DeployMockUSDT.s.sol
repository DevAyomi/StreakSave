// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "forge-std/Script.sol";
import "./HelperConfig.s.sol";

contract MockUSDT is ERC20 {
    constructor() ERC20("Mock Tether", "USDT") {
        _mint(msg.sender, 1000000 * 10**6);
    }

    function decimals() public view virtual override returns (uint8) {
        return 6;
    }
}

contract DeployMockUSDT is Script {
    function run() external returns (address) {
        HelperConfig helperConfig = new HelperConfig();
        (uint256 deployerKey, ) = helperConfig.activeNetworkConfig();

        vm.startBroadcast(deployerKey);
        MockUSDT usdt = new MockUSDT();
        vm.stopBroadcast();
        return address(usdt);
    }
}
