// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Proves the toolchain and remappings work. Delete once C2 adds real tests.
contract ScaffoldTest is Test {
    function test_openZeppelinResolves() public {
        ERC20 token = new ScaffoldToken();
        assertEq(token.decimals(), 18);
    }
}

contract ScaffoldToken is ERC20("Scaffold", "SCF") {}
