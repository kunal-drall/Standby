// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Roles} from "./Roles.sol";

/// @title AllowlistRegistry
/// @notice Issuer-managed roles that decide who may hold the restricted asset.
/// Roles are a bitmask: HOLDER = 1, BUYER = 2, CONTRACT = 4. Any role makes an account allowed.
contract AllowlistRegistry {
    uint8 public constant HOLDER = Roles.HOLDER;
    uint8 public constant BUYER = Roles.BUYER;
    uint8 public constant CONTRACT = Roles.CONTRACT;

    address public immutable issuer;
    mapping(address account => uint8) public roles;

    event RolesSet(address indexed account, uint8 roles);

    error NotIssuer();
    error ZeroAddress();
    error InvalidRoles();

    constructor(address issuer_) {
        if (issuer_ == address(0)) revert ZeroAddress();
        issuer = issuer_;
    }

    /// @notice Replaces `account`'s roles. Pass 0 to remove it from the allowlist.
    function setRoles(address account, uint8 roles_) external {
        if (msg.sender != issuer) revert NotIssuer();
        if (account == address(0)) revert ZeroAddress();
        if (roles_ & ~Roles.ALL != 0) revert InvalidRoles();
        roles[account] = roles_;
        emit RolesSet(account, roles_);
    }

    /// @notice True if `account` holds every bit in `role`.
    function hasRole(address account, uint8 role) external view returns (bool) {
        return role != 0 && roles[account] & role == role;
    }

    /// @notice True if `account` holds any role.
    function isAllowed(address account) external view returns (bool) {
        return roles[account] != 0;
    }
}
