// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice AllowlistRegistry role bits (docs/interfaces.md section 5).
library Roles {
    uint8 internal constant HOLDER = 1;
    uint8 internal constant BUYER = 2;
    uint8 internal constant CONTRACT = 4;
    uint8 internal constant ALL = HOLDER | BUYER | CONTRACT;
}
