// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {CoverPool} from "../src/CoverPool.sol";

/// @notice Deploys CoverPool to Polygon mainnet. Reads the deployer key from
///   PRIVATE_KEY, and optionally COLLATERAL_TOKEN / OWNER / SETTLER. Unset OWNER and
///   SETTLER both default to the deployer address; COLLATERAL_TOKEN defaults to native USDC.
///
///   Simulate:  forge script script/CoverPool.s.sol --rpc-url polygon
///   Broadcast: forge script script/CoverPool.s.sol --rpc-url polygon --broadcast
contract CoverPoolScript is Script {
    // Native USDC on Polygon (6 decimals) — fans hold native USDC and pay it
    // directly, so the premium settles same-token with no swap (a USDC→USDC.e
    // swap is too small for Relay to fill at checkout). The hedge desk converts
    // USDC→USDC.e→pUSD in bulk off the critical path. See apps/web/lib/flow/config.ts.
    address internal constant DEFAULT_COLLATERAL = 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address collateral = vm.envOr("COLLATERAL_TOKEN", DEFAULT_COLLATERAL);
        address owner = vm.envOr("OWNER", deployer);
        address settler = vm.envOr("SETTLER", deployer);

        vm.startBroadcast(deployerKey);
        CoverPool pool = new CoverPool(collateral, owner, settler);
        vm.stopBroadcast();

        console2.log("CoverPool deployed at:", address(pool));
        console2.log("  collateral:", collateral);
        console2.log("  owner:     ", owner);
        console2.log("  settler:   ", settler);
    }
}
