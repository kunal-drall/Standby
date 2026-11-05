// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AllowlistRegistry} from "./AllowlistRegistry.sol";
import {Roles} from "./Roles.sol";

/// @title RestrictedAsset
/// @notice ERC-20 fund share (18 decimals). Every transfer checks both sides against the registry;
/// the issuer mints to holders and can pause all movement.
contract RestrictedAsset is ERC20 {
    AllowlistRegistry public immutable registry;
    address public immutable issuer;
    bool public paused;

    event PauseSet(bool paused);

    error Paused();
    error NotAllowed();
    error NotIssuer();
    error NotHolder();
    error ZeroAddress();

    modifier onlyIssuer() {
        if (msg.sender != issuer) revert NotIssuer();
        _;
    }

    constructor(string memory name_, string memory symbol_, address registry_, address issuer_)
        ERC20(name_, symbol_)
    {
        if (registry_ == address(0) || issuer_ == address(0)) revert ZeroAddress();
        registry = AllowlistRegistry(registry_);
        issuer = issuer_;
    }

    /// @notice Mints shares to an account that holds the HOLDER role.
    function mint(address to, uint256 amount) external onlyIssuer {
        if (!registry.hasRole(to, Roles.HOLDER)) revert NotHolder();
        _mint(to, amount);
    }

    function pause() external onlyIssuer {
        paused = true;
        emit PauseSet(true);
    }

    function unpause() external onlyIssuer {
        paused = false;
        emit PauseSet(false);
    }

    /// @dev Blocks every balance change while paused; transfers (not mints) need both sides allowed.
    function _update(address from, address to, uint256 value) internal override {
        if (paused) revert Paused();
        if (from != address(0) && to != address(0)) {
            if (!registry.isAllowed(from) || !registry.isAllowed(to)) revert NotAllowed();
        }
        super._update(from, to, value);
    }
}
