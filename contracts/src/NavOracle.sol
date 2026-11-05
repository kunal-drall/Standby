// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title NavOracle
/// @notice Issuer-posted NAV: USDT base units per 1e18 share units, with the time it was posted.
contract NavOracle {
    address public immutable issuer;

    uint256 private _nav;
    uint40 private _updatedAt;

    event NavPosted(uint256 nav, uint40 at);

    error NotIssuer();
    error ZeroNav();
    error ZeroAddress();

    constructor(address issuer_) {
        if (issuer_ == address(0)) revert ZeroAddress();
        issuer = issuer_;
    }

    function setNav(uint256 nav) external {
        if (msg.sender != issuer) revert NotIssuer();
        if (nav == 0) revert ZeroNav();
        uint40 at = uint40(block.timestamp);
        _nav = nav;
        _updatedAt = at;
        emit NavPosted(nav, at);
    }

    /// @return nav Latest NAV (0 before the first post).
    /// @return updatedAt Unix time of the latest post (0 before the first post).
    function latest() external view returns (uint256 nav, uint40 updatedAt) {
        return (_nav, _updatedAt);
    }
}
