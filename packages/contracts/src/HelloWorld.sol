// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title HelloWorld
/// @notice Throwaway contract used to prove the FanGuard deploy pipeline end-to-end
///         (build → test → simulate → broadcast to Polygon mainnet) before any real
///         product contract (CoverPool.sol) is written. Has no product meaning.
contract HelloWorld {
    string public greeting;

    event GreetingChanged(string previous, string current);

    constructor(string memory initialGreeting) {
        greeting = initialGreeting;
    }

    function setGreeting(string calldata newGreeting) external {
        emit GreetingChanged(greeting, newGreeting);
        greeting = newGreeting;
    }
}
