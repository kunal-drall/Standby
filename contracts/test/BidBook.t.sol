// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BidBook} from "../src/BidBook.sol";
import {Roles} from "../src/Roles.sol";
import {StandbyBase} from "./Base.t.sol";

/// @notice C3: R4 (post bids with notice and discount limits) and R5 (exit after notice, unreserved only).
contract BidBookTest is StandbyBase {
    function test_postBidPullsUsdtAndRecordsBid() public {
        uint256 before = usdt.balanceOf(buyer1);
        vm.expectEmit(true, true, false, true, address(bidBook));
        emit BidBook.BidPosted(0, buyer1, 100 * unit, 300, NOTICE);
        uint256 id = _bid(buyer1, 100 * unit, 300);
        BidBook.Bid memory b = bidBook.getBid(id);
        assertEq(b.buyer, buyer1);
        assertEq(b.amount, 100 * unit);
        assertEq(b.reserved, 0);
        assertEq(b.discountBps, 300);
        assertEq(b.notice, NOTICE);
        assertEq(b.exitAt, 0);
        assertFalse(b.closed);
        assertEq(usdt.balanceOf(buyer1), before - 100 * unit);
        assertEq(usdt.balanceOf(address(bidBook)), 100 * unit);
        assertEq(bidBook.bidCount(), 1);
    }

    function test_postRequiresBuyerRole() public {
        vm.expectRevert(BidBook.NotBuyer.selector);
        vm.prank(outsider);
        bidBook.postBid(1, 300, NOTICE);
        vm.expectRevert(BidBook.NotBuyer.selector);
        vm.prank(borrower); // HOLDER only
        bidBook.postBid(1, 300, NOTICE);
    }

    function test_discountAndNoticeLimits() public {
        vm.startPrank(buyer1);
        vm.expectRevert(BidBook.DiscountTooHigh.selector);
        bidBook.postBid(1 * unit, 801, NOTICE);
        vm.expectRevert(BidBook.NoticeTooShort.selector);
        bidBook.postBid(1 * unit, 300, NOTICE - 1);
        vm.expectRevert(BidBook.ZeroAmount.selector);
        bidBook.postBid(0, 300, NOTICE);
        bidBook.postBid(1 * unit, 800, NOTICE); // limits are inclusive
        vm.stopPrank();
    }

    function test_requestExitSetsExitAt() public {
        uint256 id = _bid(buyer1, 100 * unit, 300);
        vm.expectEmit(true, false, false, true, address(bidBook));
        emit BidBook.ExitRequested(id, uint40(block.timestamp + NOTICE));
        vm.prank(buyer1);
        bidBook.requestExit(id);
        assertEq(bidBook.getBid(id).exitAt, block.timestamp + NOTICE);

        vm.expectRevert(BidBook.ExitAlreadyRequested.selector);
        vm.prank(buyer1);
        bidBook.requestExit(id);
        vm.expectRevert(BidBook.NotBidOwner.selector);
        vm.prank(buyer2);
        bidBook.requestExit(id);
    }

    function test_earlyWithdrawReverts() public {
        uint256 id = _bid(buyer1, 100 * unit, 300);
        vm.expectRevert(BidBook.ExitNotRequested.selector);
        vm.prank(buyer1);
        bidBook.withdraw(id, 1);

        vm.prank(buyer1);
        bidBook.requestExit(id);
        vm.warp(block.timestamp + NOTICE - 1);
        vm.expectRevert(BidBook.NoticeNotOver.selector);
        vm.prank(buyer1);
        bidBook.withdraw(id, 1);
    }

    function test_withdrawAfterNoticeClosesBid() public {
        uint256 id = _bid(buyer1, 100 * unit, 300);
        vm.prank(buyer1);
        bidBook.requestExit(id);
        vm.warp(block.timestamp + NOTICE);
        uint256 before = usdt.balanceOf(buyer1);

        vm.prank(buyer1);
        bidBook.withdraw(id, 40 * unit);
        assertEq(bidBook.getBid(id).amount, 60 * unit);
        assertEq(bidBook.openBidIds().length, 1);

        vm.prank(buyer1);
        bidBook.withdraw(id, 60 * unit);
        assertTrue(bidBook.getBid(id).closed);
        assertEq(bidBook.openBidIds().length, 0);
        assertEq(usdt.balanceOf(buyer1), before + 100 * unit);

        vm.expectRevert(BidBook.BidClosed.selector);
        vm.prank(buyer1);
        bidBook.withdraw(id, 1);
    }

    function test_reservedUsdtIsNeverWithdrawable() public {
        uint256 id = _bid(buyer1, 100 * unit, 300);
        vm.prank(address(market));
        bidBook.reserve(7, uint40(block.timestamp + 1000), 70 * unit);
        vm.prank(buyer1);
        bidBook.requestExit(id);
        vm.warp(block.timestamp + 10 * NOTICE);

        vm.expectRevert(BidBook.ExceedsUnreserved.selector);
        vm.prank(buyer1);
        bidBook.withdraw(id, 30 * unit + 1);
        vm.prank(buyer1);
        bidBook.withdraw(id, 30 * unit);
        assertEq(bidBook.getBid(id).amount, 70 * unit);
        assertFalse(bidBook.getBid(id).closed);
    }

    function test_freeCapacityExcludesReservedAndEarlyUnlocks() public {
        uint256 a = _bid(buyer1, 100 * unit, 300);
        _bid(buyer2, 50 * unit, 500);
        uint40 until = uint40(block.timestamp + 2000);
        assertEq(bidBook.freeCapacity(until), 150 * unit);

        vm.prank(address(market));
        bidBook.reserve(1, until, 30 * unit);
        assertEq(bidBook.freeCapacity(until), 120 * unit);

        // Bid a unlocks at now + 600, before `until`: it no longer counts, but still counts for an earlier end.
        vm.prank(buyer1);
        bidBook.requestExit(a);
        assertEq(bidBook.freeCapacity(until), 50 * unit);
        assertEq(bidBook.freeCapacity(uint40(block.timestamp + NOTICE - 1)), 120 * unit);
        assertEq(bidBook.freeCapacity(uint40(block.timestamp + NOTICE)), 50 * unit);
    }

    function test_freeCapacityExcludesRevokedBuyer() public {
        _bid(buyer1, 100 * unit, 300);
        _bid(buyer2, 50 * unit, 500);
        vm.prank(issuer);
        registry.setRoles(buyer1, Roles.HOLDER);
        assertEq(bidBook.freeCapacity(uint40(block.timestamp + 1)), 50 * unit);
    }

    function test_reserveCheapestFirst() public {
        uint256 b5 = _bid(buyer2, 100 * unit, 500);
        uint256 b3 = _bid(buyer1, 100 * unit, 300);
        uint256 b3late = _bid(buyer2, 100 * unit, 300);
        uint256[] memory open = bidBook.openBidIds();
        assertEq(open[0], b3);
        assertEq(open[1], b3late);
        assertEq(open[2], b5);

        vm.expectEmit(true, true, false, true, address(bidBook));
        emit BidBook.Reserved(b3, 9, 100 * unit);
        vm.prank(address(market));
        (uint256[] memory ids, uint256[] memory amounts) =
            bidBook.reserve(9, uint40(block.timestamp + 1), 150 * unit);
        assertEq(ids.length, 2);
        assertEq(ids[0], b3);
        assertEq(amounts[0], 100 * unit);
        assertEq(ids[1], b3late);
        assertEq(amounts[1], 50 * unit);
        assertEq(bidBook.getBid(b5).reserved, 0);
    }

    function test_reserveRevertsWhenShort() public {
        _bid(buyer1, 100 * unit, 300);
        vm.expectRevert(BidBook.InsufficientCapacity.selector);
        vm.prank(address(market));
        bidBook.reserve(0, uint40(block.timestamp + 1), 100 * unit + 1);
        assertEq(bidBook.getBid(0).reserved, 0);
    }

    function test_releaseAndFillAccounting() public {
        uint256 id = _bid(buyer1, 100 * unit, 300);
        vm.startPrank(address(market));
        bidBook.reserve(0, uint40(block.timestamp + 1), 80 * unit);
        bidBook.release(id, 20 * unit);
        assertEq(bidBook.getBid(id).reserved, 60 * unit);

        vm.expectRevert(BidBook.ExceedsReserved.selector);
        bidBook.fill(id, 60 * unit + 1, address(market));

        bidBook.fill(id, 60 * unit, address(market));
        vm.stopPrank();
        BidBook.Bid memory b = bidBook.getBid(id);
        assertEq(b.reserved, 0);
        assertEq(b.amount, 40 * unit);
        assertEq(usdt.balanceOf(address(market)), 60 * unit);
        assertEq(usdt.balanceOf(address(bidBook)), 40 * unit);
    }

    function test_fillToZeroClosesBid() public {
        uint256 id = _bid(buyer1, 100 * unit, 300);
        vm.startPrank(address(market));
        bidBook.reserve(0, uint40(block.timestamp + 1), 100 * unit);
        bidBook.fill(id, 100 * unit, address(market));
        vm.stopPrank();
        assertTrue(bidBook.getBid(id).closed);
        assertEq(bidBook.openBidIds().length, 0);
    }

    function test_onlyMarket() public {
        _bid(buyer1, 100 * unit, 300);
        vm.startPrank(outsider);
        vm.expectRevert(BidBook.NotMarket.selector);
        bidBook.reserve(0, 0, 1);
        vm.expectRevert(BidBook.NotMarket.selector);
        bidBook.release(0, 0);
        vm.expectRevert(BidBook.NotMarket.selector);
        bidBook.fill(0, 0, outsider);
        vm.stopPrank();
    }

    function test_setMarketOnceByDeployer() public {
        vm.expectRevert(BidBook.MarketAlreadySet.selector);
        bidBook.setMarket(outsider);

        BidBook fresh = new BidBook(address(usdt), address(registry), 800, NOTICE);
        vm.expectRevert(BidBook.NotDeployer.selector);
        vm.prank(outsider);
        fresh.setMarket(outsider);
    }

    function test_bookAndPerBuyerCaps() public {
        vm.startPrank(buyer1);
        for (uint256 i; i < 4; ++i) {
            bidBook.postBid(1 * unit, uint16(i * 100), NOTICE);
        }
        vm.expectRevert(BidBook.TooManyBids.selector);
        bidBook.postBid(1 * unit, 0, NOTICE);
        vm.stopPrank();
        assertEq(bidBook.openBidsOf(buyer1), 4);

        for (uint256 b; b < 7; ++b) {
            address extra = makeAddr(string(abi.encodePacked("buyer-", b)));
            vm.prank(issuer);
            registry.setRoles(extra, Roles.BUYER);
            usdt.mint(extra, 10 * unit);
            vm.startPrank(extra);
            usdt.approve(address(bidBook), type(uint256).max);
            for (uint256 i; i < 4; ++i) {
                bidBook.postBid(1 * unit, 100, NOTICE);
            }
            vm.stopPrank();
        }
        assertEq(bidBook.openBidIds().length, 32);
        vm.expectRevert(BidBook.TooManyBids.selector);
        vm.prank(buyer2);
        bidBook.postBid(1 * unit, 0, NOTICE);

        // closing a bid frees both the book slot and the buyer's slot
        vm.prank(buyer1);
        bidBook.requestExit(0);
        vm.warp(block.timestamp + NOTICE);
        vm.prank(buyer1);
        bidBook.withdraw(0, 1 * unit);
        assertEq(bidBook.openBidsOf(buyer1), 3);
        vm.prank(buyer2);
        bidBook.postBid(1 * unit, 0, NOTICE);
    }

    function test_noticeTooLong() public {
        uint40 tooLong = bidBook.MAX_NOTICE() + 1;
        vm.expectRevert(BidBook.NoticeTooLong.selector);
        vm.prank(buyer1);
        bidBook.postBid(1 * unit, 300, tooLong);
    }

    function test_evictRevokedBuyerRefundsUnreservedOnly() public {
        uint256 id = _bid(buyer1, 100 * unit, 300);
        vm.prank(address(market));
        bidBook.reserve(0, uint40(block.timestamp + 1), 30 * unit);

        vm.expectRevert(BidBook.StillBuyer.selector);
        bidBook.evict(id);

        vm.prank(issuer);
        registry.setRoles(buyer1, 0);
        uint256 before = usdt.balanceOf(buyer1);
        vm.prank(keeper); // anyone
        bidBook.evict(id);
        assertEq(usdt.balanceOf(buyer1), before + 70 * unit);
        BidBook.Bid memory b = bidBook.getBid(id);
        assertEq(b.amount, 30 * unit);
        assertEq(b.reserved, 30 * unit); // still backs its loan
        assertFalse(b.closed);

        vm.prank(address(market));
        bidBook.fill(id, 30 * unit, address(market));
        assertTrue(bidBook.getBid(id).closed);
        assertEq(bidBook.openBidsOf(buyer1), 0);
    }

    function test_openBidsStaySortedAfterClose() public {
        _bid(buyer1, 1 * unit, 700);
        _bid(buyer1, 1 * unit, 100);
        _bid(buyer1, 1 * unit, 400);
        vm.prank(buyer1);
        bidBook.requestExit(1);
        vm.warp(block.timestamp + NOTICE);
        vm.prank(buyer1);
        bidBook.withdraw(1, 1 * unit);
        uint256[] memory open = bidBook.openBidIds();
        assertEq(open.length, 2);
        assertEq(open[0], 2);
        assertEq(open[1], 0);
    }

    /// @notice Random sequences of posts, exits, withdrawals, reserves, releases and fills keep
    /// reserved <= amount per bid, sum(reserved) <= sum(amount), and the contract's USDT equal to sum(amount).
    function testFuzz_reservedNeverExceedsAmount(uint256 seed) public {
        for (uint256 step; step < 40; ++step) {
            seed = uint256(keccak256(abi.encode(seed, step)));
            uint256 op = seed % 6;
            uint256 n = bidBook.bidCount();
            uint256 pick = n == 0 ? 0 : (seed >> 8) % n;
            uint256 amt = ((seed >> 16) % 1000 + 1) * unit / 10;

            if (op == 0 || n == 0) {
                address who = step % 2 == 0 ? buyer1 : buyer2;
                if (bidBook.openBidIds().length < 32 && bidBook.openBidsOf(who) < 4) {
                    _bid(who, amt, uint16((seed >> 32) % 801));
                }
            } else if (op == 1) {
                BidBook.Bid memory b = bidBook.getBid(pick);
                if (!b.closed && b.exitAt == 0) {
                    vm.prank(b.buyer);
                    bidBook.requestExit(pick);
                }
            } else if (op == 2) {
                vm.warp(block.timestamp + (seed >> 40) % 900);
                BidBook.Bid memory b = bidBook.getBid(pick);
                uint256 free = b.amount - b.reserved;
                if (!b.closed && b.exitAt != 0 && block.timestamp >= b.exitAt && free > 0) {
                    vm.prank(b.buyer);
                    bidBook.withdraw(pick, amt > free ? free : amt);
                }
            } else if (op == 3) {
                uint40 until = uint40(block.timestamp + (seed >> 48) % 2000);
                if (bidBook.freeCapacity(until) >= amt) {
                    vm.prank(address(market));
                    bidBook.reserve(step, until, amt);
                }
            } else if (op == 4) {
                BidBook.Bid memory b = bidBook.getBid(pick);
                if (b.reserved > 0) {
                    vm.prank(address(market));
                    bidBook.release(pick, amt > b.reserved ? b.reserved : amt);
                }
            } else {
                BidBook.Bid memory b = bidBook.getBid(pick);
                if (b.reserved > 0) {
                    vm.prank(address(market));
                    bidBook.fill(pick, amt > b.reserved ? b.reserved : amt, keeper);
                }
            }
            _checkInvariants();
        }
    }

    function _checkInvariants() internal view {
        uint256 totalAmount;
        uint256 totalReserved;
        uint256 n = bidBook.bidCount();
        for (uint256 i; i < n; ++i) {
            BidBook.Bid memory b = bidBook.getBid(i);
            assertLe(b.reserved, b.amount);
            assertEq(b.closed, b.amount == 0);
            totalAmount += b.amount;
            totalReserved += b.reserved;
        }
        assertLe(totalReserved, totalAmount);
        assertEq(usdt.balanceOf(address(bidBook)), totalAmount);
    }
}
