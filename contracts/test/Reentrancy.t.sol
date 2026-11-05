// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {StandbyMarket} from "../src/StandbyMarket.sol";
import {MockUSDT, StandbyBase} from "./Base.t.sol";

/// @notice A USDT whose transfers call back into a target, to prove every token-moving entry point is
/// guarded. The callback's revert is bubbled up so the outer call fails with the guard's error.
contract HookUSDT is MockUSDT {
    address public target;
    bytes public data;

    constructor(uint8 dec) MockUSDT(dec) {}

    function arm(address target_, bytes calldata data_) external {
        target = target_;
        data = data_;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        address t = target;
        if (t != address(0) && from != address(0)) {
            target = address(0);
            (bool ok, bytes memory ret) = t.call(data);
            if (!ok) {
                assembly ("memory-safe") {
                    revert(add(ret, 32), mload(ret))
                }
            }
        }
    }
}

contract ReentrancyTest is StandbyBase {
    function _deployUsdt() internal override returns (address) {
        return address(new HookUSDT(6));
    }

    function _hook() internal view returns (HookUSDT) {
        return HookUSDT(address(usdt));
    }

    function _expectGuard() internal {
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
    }

    function test_depositIsGuarded() public {
        _deposit(100 * unit);
        _hook().arm(address(market), abi.encodeCall(StandbyMarket.withdraw, (1)));
        _expectGuard();
        _deposit(100 * unit);
    }

    function test_withdrawIsGuarded() public {
        _deposit(100 * unit);
        _hook().arm(address(market), abi.encodeCall(StandbyMarket.deposit, (1)));
        _expectGuard();
        vm.prank(lender);
        market.withdraw(1e6);
    }

    function test_openLoanIsGuarded() public {
        _seedDemo();
        _hook().arm(address(market), abi.encodeCall(StandbyMarket.openLoan, (1 * SHARES, 1 * unit)));
        _expectGuard();
        _open(1000 * SHARES, 500 * unit);
    }

    function test_repayIsGuarded() public {
        _seedDemo();
        uint256 id = _open(1000 * SHARES, 500 * unit);
        _hook().arm(address(market), abi.encodeCall(StandbyMarket.settle, (id)));
        _expectGuard();
        vm.prank(borrower);
        market.repay(id);
    }

    function test_settleIsGuarded() public {
        _seedDemo();
        uint256 id = _open(1000 * SHARES, 500 * unit);
        vm.warp(block.timestamp + TERM + GRACE + 1);
        _hook().arm(address(market), abi.encodeCall(StandbyMarket.deposit, (1)));
        _expectGuard();
        market.settle(id);
    }

    function test_bidBookPostAndWithdrawAreGuarded() public {
        uint256 id = _bid(buyer1, 100 * unit, 300);
        vm.prank(buyer1);
        bidBook.requestExit(id);
        vm.warp(block.timestamp + NOTICE);

        _hook()
            .arm(address(bidBook), abi.encodeWithSignature("postBid(uint256,uint16,uint40)", 1, 300, NOTICE));
        _expectGuard();
        vm.prank(buyer1);
        bidBook.postBid(1 * unit, 300, NOTICE);

        _hook().arm(address(bidBook), abi.encodeWithSignature("withdraw(uint256,uint256)", id, 1));
        _expectGuard();
        vm.prank(buyer1);
        bidBook.withdraw(id, 1 * unit);
    }
}
