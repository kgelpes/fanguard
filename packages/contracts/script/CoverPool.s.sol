// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {CoverPool} from "../src/CoverPool.sol";

/// @notice Deploys CoverPool to Polygon mainnet. Reads the deployer key from
///   PRIVATE_KEY, and optionally COLLATERAL_TOKEN / OWNER / SETTLER. Unset OWNER and
///   SETTLER both default to the deployer address; COLLATERAL_TOKEN defaults to USDC.e.
///
///   Simulate:  forge script script/CoverPool.s.sol --rpc-url polygon
///   Broadcast: forge script script/CoverPool.s.sol --rpc-url polygon --broadcast
contract CoverPoolScript is Script {
    // Bridged USDC.e on Polygon (6 decimals) — the premium settles here so the hedge
    // wallet can wrap straight to Polymarket's pUSD. See apps/web/lib/flow/config.ts.
    address internal constant DEFAULT_COLLATERAL = 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174;

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
