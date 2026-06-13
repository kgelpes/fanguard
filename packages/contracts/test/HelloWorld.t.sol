// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {HelloWorld} from "../src/HelloWorld.sol";

contract HelloWorldTest is Test {
    HelloWorld internal hello;

    event GreetingChanged(string previous, string current);

    function setUp() public {
        hello = new HelloWorld("gm fanguard");
    }

    function test_InitialGreeting() public view {
        assertEq(hello.greeting(), "gm fanguard");
    }

    function test_SetGreeting() public {
        vm.expectEmit(false, false, false, true);
        emit GreetingChanged("gm fanguard", "your night is protected");

        hello.setGreeting("your night is protected");
        assertEq(hello.greeting(), "your night is protected");
    }
}
