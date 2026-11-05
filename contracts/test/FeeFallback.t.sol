// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockUSDT, StandbyBase} from "./Base.t.sol";

/// @notice A USDT that refuses transfers to blocked addresses, like a Tether-style blacklist.
contract BlockingUSDT is MockUSDT {
    mapping(address => bool) public blocked;

    constructor(uint8 dec) MockUSDT(dec) {}

    function setBlocked(address who, bool value) external {
        blocked[who] = value;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!blocked[to], "blocked");
        super._update(from, to, value);
    }
}

contract FeeFallbackTest is StandbyBase {
    function _deployUsdt() internal override returns (address) {
        return address(new BlockingUSDT(6));
    }

    function test_blockedBuyerCannotBlockRepayment() public {
        _seedDemo();
        uint256 id = _open(1000 * SHARES, 867 * unit);
        vm.warp(block.timestamp + 600);
        (, uint256 fees) = market.quoteRepay(id);
        BlockingUSDT(address(usdt)).setBlocked(buyer1, true);
        uint256 b2 = usdt.balanceOf(buyer2);

        vm.prank(borrower);
        market.repay(id);
        uint256 held = market.claimableFees(buyer1);
        assertGt(held, 0);
        assertEq(held + usdt.balanceOf(buyer2) - b2, fees);
        assertEq(asset.balanceOf(borrower), 1000 * SHARES);

        BlockingUSDT(address(usdt)).setBlocked(buyer1, false);
        uint256 b1 = usdt.balanceOf(buyer1);
        vm.prank(buyer1);
        market.claimFees();
        assertEq(usdt.balanceOf(buyer1), b1 + held);
        assertEq(market.claimableFees(buyer1), 0);
    }
}
