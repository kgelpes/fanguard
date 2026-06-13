// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {HelloWorld} from "../src/HelloWorld.sol";

/// @notice Deploys HelloWorld. Reads the deployer key from the PRIVATE_KEY env var.
///   Simulate: forge script script/HelloWorld.s.sol --rpc-url polygon
///   Broadcast: forge script script/HelloWorld.s.sol --rpc-url polygon --broadcast
contract HelloWorldScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);
        HelloWorld hello = new HelloWorld("gm fanguard");
        vm.stopBroadcast();

        console2.log("HelloWorld deployed at:", address(hello));
        console2.log("greeting:", hello.greeting());
    }
}
