// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BidBook} from "../src/BidBook.sol";
import {RestrictedAsset} from "../src/RestrictedAsset.sol";
import {Roles} from "../src/Roles.sol";
import {StandbyMarket} from "../src/StandbyMarket.sol";
import {StandbyBase} from "./Base.t.sol";

/// @notice C4: R3 pool, R6 open at the lower limit, R7 repay, R8 settle, R11 fee, R12 NAV default,
/// R14 share price. Runs once with 6-decimal and once with 18-decimal USDT.
abstract contract StandbyMarketTest is StandbyBase {
    // ------------------------------------------------------------ pool (R3, R14)

    function test_depositAndWithdraw() public {
        uint256 shares = _deposit(1000 * unit);
        assertEq(market.sharesOf(lender), shares);
        assertEq(market.totalShares(), shares);
        assertEq(market.cash(), 1000 * unit);
        assertEq(market.totalAssets(), 1000 * unit);

        uint256 before = usdt.balanceOf(lender);
        vm.prank(lender);
        uint256 assets = market.withdraw(shares);
        assertApproxEqAbs(assets, 1000 * unit, 1);
        assertEq(usdt.balanceOf(lender), before + assets);
        assertEq(market.sharesOf(lender), 0);
    }

    function test_withdrawRevertsWhenCashLentOut() public {
        _seedDemo();
        _open(1000 * SHARES, 800 * unit);
        uint256 shares = market.sharesOf(lender);
        vm.expectRevert(StandbyMarket.InsufficientCash.selector);
        vm.prank(lender);
        market.withdraw(shares);
        vm.expectRevert(StandbyMarket.InsufficientShares.selector);
        vm.prank(lender);
        market.withdraw(shares + 1);
    }

    function test_donationDoesNotMoveSharePrice() public {
        _deposit(100 * unit);
        uint256 price = market.convertToAssets(1e6);
        usdt.mint(address(market), 1_000_000 * unit);
        assertEq(market.convertToAssets(1e6), price);
    }

    function test_sharePriceRisesAfterRepaidLoan() public {
        _seedDemo();
        uint256 shares = market.sharesOf(lender);
        uint256 before = market.convertToAssets(shares);
        uint256 id = _open(1000 * SHARES, 800 * unit);
        vm.warp(block.timestamp + 600);
        vm.prank(borrower);
        market.repay(id);
        assertGt(market.convertToAssets(shares), before);
        assertEq(market.totalPrincipal(), 0);
    }

    // ------------------------------------------------------------ limits (R6)

    function test_previewLimitsReturnsTheLowerLimit() public {
        _seedDemo();
        (uint256 priceLimit, uint256 capacityLimit, uint256 maxBorrow) = market.previewLimits(1000 * SHARES);
        assertEq(priceLimit, 867 * unit); // 1,000 × 1.02 × 85%
        assertLt(capacityLimit, 990 * unit); // (1,100 × 90%) less interest to the end of grace
        assertGt(capacityLimit, 989 * unit);
        assertEq(maxBorrow, priceLimit);

        (priceLimit, capacityLimit, maxBorrow) = market.previewLimits(2000 * SHARES);
        assertEq(priceLimit, 1734 * unit);
        assertEq(maxBorrow, capacityLimit);
    }

    function test_capacityLimitIsExactlyTheLargestFittingPrincipal() public {
        _seedDemo();
        (, uint256 capacityLimit,) = market.previewLimits(2000 * SHARES);
        assertLe(_needed(capacityLimit), 1100 * unit);
        assertGt(_needed(capacityLimit + 1), 1100 * unit);

        vm.prank(issuer);
        asset.mint(borrower, 1000 * SHARES);
        uint256 snap = vm.snapshotState();
        vm.expectRevert(BidBook.InsufficientCapacity.selector);
        _open(2000 * SHARES, capacityLimit + 1);
        vm.revertToState(snap);
        _open(2000 * SHARES, capacityLimit);
        assertEq(
            bidBook.freeCapacity(uint40(block.timestamp + TERM + GRACE)), 1100 * unit - _needed(capacityLimit)
        );
    }

    function test_openLoanAtPriceLimit() public {
        _seedDemo();
        uint256 before = usdt.balanceOf(borrower);
        uint256 id = _open(1000 * SHARES, 867 * unit);
        assertEq(usdt.balanceOf(borrower), before + 867 * unit);
        assertEq(asset.balanceOf(address(market)), 1000 * SHARES);
        assertEq(market.cash(), 633 * unit);
        assertEq(market.totalPrincipal(), 867 * unit);
        assertEq(market.loanCount(), 1);

        (StandbyMarket.Loan memory l, uint256[] memory bidIds, uint256[] memory reserved) = market.getLoan(id);
        assertEq(l.borrower, borrower);
        assertEq(l.maturity, block.timestamp + TERM);
        assertEq(uint8(l.state), uint8(StandbyMarket.LoanState.Open));
        // Cheapest first: the 3% bid is used up before the 5% bid.
        assertEq(bidIds.length, 2);
        assertEq(bidIds[0], 0);
        assertEq(reserved[0], 600 * unit);
        assertEq(reserved[0] + reserved[1], _needed(867 * unit));
    }

    function test_openLoanRevertsAboveLtv() public {
        _seedDemo();
        vm.expectRevert(StandbyMarket.AboveLtv.selector);
        _open(1000 * SHARES, 867 * unit + 1);
    }

    function test_openLoanRevertsAboveCapacity() public {
        _bid(buyer1, 100 * unit, 300);
        _deposit(1500 * unit);
        vm.expectRevert(BidBook.InsufficientCapacity.selector);
        _open(1000 * SHARES, 91 * unit);
    }

    function test_openLoanRevertsOnStaleNav() public {
        _seedDemo();
        vm.warp(block.timestamp + MAX_NAV_AGE + 1);
        vm.expectRevert(StandbyMarket.StaleNav.selector);
        _open(1000 * SHARES, 100 * unit);
    }

    function test_openLoanRevertsWhenPaused() public {
        _seedDemo();
        vm.prank(issuer);
        asset.pause();
        vm.expectRevert(StandbyMarket.AssetPaused.selector);
        _open(1000 * SHARES, 100 * unit);
    }

    function test_openLoanRevertsWithoutCash() public {
        _bid(buyer1, 600 * unit, 300);
        _bid(buyer2, 500 * unit, 500);
        _deposit(100 * unit);
        vm.expectRevert(StandbyMarket.InsufficientCash.selector);
        _open(1000 * SHARES, 101 * unit);
    }

    function test_openLoanRevertsForNonAllowedBorrower() public {
        _seedDemo();
        vm.prank(borrower);
        asset.transfer(buyer1, 100 * SHARES);
        vm.prank(issuer);
        registry.setRoles(buyer1, 0);
        vm.prank(buyer1);
        vm.expectRevert();
        market.openLoan(100 * SHARES, 10 * unit);
    }

    // ------------------------------------------------------------ repay (R7, R11)

    function test_repayInOneTransaction() public {
        _seedDemo();
        uint256 id = _open(1000 * SHARES, 867 * unit);
        (,, uint256[] memory reserved) = market.getLoan(id);
        vm.warp(block.timestamp + 600);

        (uint256 dueNow, uint256 fees) = market.quoteRepay(id);
        assertEq(dueNow, _dueAt(867 * unit, 600));
        assertEq(market.due(id), dueNow);
        uint256 expectedFee0 = reserved[0] * FEE * 600 / (10_000 * YEAR);
        uint256 expectedFee1 = reserved[1] * FEE * 600 / (10_000 * YEAR);
        assertEq(fees, expectedFee0 + expectedFee1);

        uint256 borrowerUsdt = usdt.balanceOf(borrower);
        uint256 b1 = usdt.balanceOf(buyer1);
        uint256 b2 = usdt.balanceOf(buyer2);
        vm.expectEmit(true, false, false, true, address(market));
        emit StandbyMarket.LoanRepaid(id, dueNow, fees);
        vm.prank(borrower);
        market.repay(id);

        assertEq(usdt.balanceOf(borrower), borrowerUsdt - dueNow - fees);
        assertEq(usdt.balanceOf(buyer1), b1 + expectedFee0);
        assertEq(usdt.balanceOf(buyer2), b2 + expectedFee1);
        assertEq(asset.balanceOf(borrower), 1000 * SHARES);
        assertEq(asset.balanceOf(address(market)), 0);
        assertEq(bidBook.getBid(0).reserved, 0);
        assertEq(bidBook.getBid(1).reserved, 0);
        assertEq(market.cash(), 633 * unit + dueNow);
        (StandbyMarket.Loan memory l,,) = market.getLoan(id);
        assertEq(uint8(l.state), uint8(StandbyMarket.LoanState.Repaid));
        assertEq(market.due(id), 0);
    }

    function test_repayOnlyByBorrowerAndOnce() public {
        _seedDemo();
        uint256 id = _open(1000 * SHARES, 500 * unit);
        vm.expectRevert(StandbyMarket.NotBorrower.selector);
        vm.prank(keeper);
        market.repay(id);
        vm.prank(borrower);
        market.repay(id);
        vm.expectRevert(StandbyMarket.LoanNotOpen.selector);
        vm.prank(borrower);
        market.repay(id);
    }

    function test_lateRepayStillWorksUntilSettled() public {
        _seedDemo();
        uint256 id = _open(1000 * SHARES, 500 * unit);
        vm.warp(block.timestamp + TERM + GRACE + 60);
        assertTrue(market.isSettleable(id));
        vm.prank(borrower);
        market.repay(id);
        assertFalse(market.isSettleable(id));
    }

    // ------------------------------------------------------------ settle (R8, R12)

    function test_settleBeforeMaturityPlusGraceReverts() public {
        _seedDemo();
        uint256 id = _open(1000 * SHARES, 867 * unit);
        vm.warp(block.timestamp + TERM + GRACE);
        assertFalse(market.isSettleable(id));
        vm.expectRevert(StandbyMarket.NotSettleable.selector);
        market.settle(id);
    }

    function test_settleFillsCheapestFirstAndReturnsLeftover() public {
        _seedDemo();
        uint256 id = _open(1000 * SHARES, 867 * unit);
        vm.warp(block.timestamp + TERM + GRACE + 1);
        assertTrue(market.isSettleable(id));

        uint256 dueNow = market.due(id);
        uint256 nav = _nav102();
        uint256 price1 = nav * 9700 / 10_000;
        uint256 price2 = nav * 9500 / 10_000;
        uint256 take1 = 600 * unit;
        uint256 shares1 = (take1 * 1e18 + price1 - 1) / price1;
        uint256 take2 = dueNow - take1;
        uint256 shares2 = (take2 * 1e18 + price2 - 1) / price2;
        uint256 cashBefore = market.cash();

        vm.expectEmit(true, false, false, true, address(market));
        emit StandbyMarket.LoanSettled(id, dueNow, shares1 + shares2, 1000 * SHARES - shares1 - shares2);
        vm.prank(keeper); // anyone can settle
        market.settle(id);

        assertEq(asset.balanceOf(buyer1), shares1);
        assertEq(asset.balanceOf(buyer2), shares2);
        assertEq(asset.balanceOf(borrower), 1000 * SHARES - shares1 - shares2);
        assertEq(asset.balanceOf(address(market)), 0);
        assertEq(market.cash(), cashBefore + dueNow); // lender made whole
        assertTrue(bidBook.getBid(0).closed); // 600 fully filled
        BidBook.Bid memory b2 = bidBook.getBid(1);
        assertEq(b2.reserved, 0); // unused part released
        assertEq(b2.amount, 500 * unit - take2);
        (StandbyMarket.Loan memory l,,) = market.getLoan(id);
        assertEq(uint8(l.state), uint8(StandbyMarket.LoanState.Settled));
        assertEq(market.totalPrincipal(), 0);

        vm.expectRevert(StandbyMarket.NotSettleable.selector);
        market.settle(id);
    }

    function test_settleEmitsShortfallWhenCollateralRunsOut() public {
        _seedDemo();
        uint256 id = _open(1000 * SHARES, 867 * unit);
        vm.prank(issuer);
        oracle.setNav(_nav102() / 2); // NAV halves
        vm.warp(block.timestamp + TERM + GRACE + 1);
        uint256 dueNow = market.due(id);
        uint256 assetsBefore = market.totalAssets();

        vm.recordLogs();
        market.settle(id);
        assertEq(asset.balanceOf(borrower), 0);
        assertEq(asset.balanceOf(buyer1) + asset.balanceOf(buyer2), 1000 * SHARES);
        uint256 recovered = market.cash() - 633 * unit;
        assertLt(recovered, dueNow);
        assertLt(market.totalAssets(), assetsBefore); // the pool takes the loss
        assertEq(bidBook.getBid(0).reserved + bidBook.getBid(1).reserved, 0);
        _assertEmitted(keccak256("Shortfall(uint256,uint256)"));
    }

    function test_revokedBuyerStillPaysAndSharesAreHeld() public {
        _seedDemo();
        uint256 id = _open(1000 * SHARES, 400 * unit); // needs ~445, all from the 3% bid
        vm.prank(issuer);
        registry.setRoles(buyer1, 0);
        vm.warp(block.timestamp + TERM + GRACE + 1);
        uint256 dueNow = market.due(id);
        uint256 cashBefore = market.cash();

        market.settle(id);
        uint256 price = _nav102() * 9700 / 10_000;
        uint256 shares = (dueNow * 1e18 + price - 1) / price;
        assertEq(market.cash(), cashBefore + dueNow); // the commitment still repays the pool
        assertEq(asset.balanceOf(buyer1), 0); // never sent off the allowlist
        assertEq(market.claimableShares(buyer1), shares);
        assertEq(asset.balanceOf(borrower), 1000 * SHARES - shares); // no windfall
        assertEq(bidBook.getBid(0).amount, 600 * unit - dueNow);

        vm.expectRevert(RestrictedAsset.NotAllowed.selector);
        vm.prank(buyer1);
        market.claimShares();
        vm.prank(issuer);
        registry.setRoles(buyer1, Roles.BUYER);
        vm.prank(buyer1);
        market.claimShares();
        assertEq(asset.balanceOf(buyer1), shares);
        assertEq(market.claimableShares(buyer1), 0);
    }

    function test_revokedBorrowerCanStillRepayAndCollateralIsHeld() public {
        _seedDemo();
        uint256 id = _open(1000 * SHARES, 400 * unit);
        vm.prank(issuer);
        registry.setRoles(borrower, 0);
        vm.prank(borrower);
        market.repay(id);
        assertEq(bidBook.getBid(0).reserved, 0); // reservations released
        assertEq(market.claimableShares(borrower), 1000 * SHARES);

        uint256 id2 = _openAfterRestore();
        vm.prank(issuer);
        registry.setRoles(borrower, 0);
        vm.warp(block.timestamp + TERM + GRACE + 1);
        market.settle(id2); // not blocked by the revoked borrower
        assertEq(market.claimableShares(borrower), 1000 * SHARES - asset.balanceOf(buyer1));
        assertEq(asset.balanceOf(borrower), 0);
    }

    function _openAfterRestore() internal returns (uint256) {
        vm.prank(issuer);
        registry.setRoles(borrower, Roles.HOLDER);
        vm.prank(borrower);
        market.claimShares();
        return _open(1000 * SHARES, 400 * unit);
    }

    function test_navDropMakesLoanSettleableEarly() public {
        _seedDemo();
        uint256 id = _open(1000 * SHARES, 867 * unit);
        assertFalse(market.isSettleable(id));
        // debt 867 > 90% of value requires value < 963.3: NAV 0.96 gives 960.
        vm.prank(issuer);
        oracle.setNav(96 * unit / 100);
        assertTrue(market.isSettleable(id));
        market.settle(id);
        (StandbyMarket.Loan memory l,,) = market.getLoan(id);
        assertEq(uint8(l.state), uint8(StandbyMarket.LoanState.Settled));
    }

    function test_settlementWaitsForFreshNav() public {
        _seedDemo();
        uint256 id = _open(1000 * SHARES, 867 * unit);
        vm.warp(block.timestamp + MAX_NAV_AGE + 1); // long past due, but NAV is stale
        assertFalse(market.isSettleable(id));
        vm.expectRevert(StandbyMarket.NotSettleable.selector);
        market.settle(id);
        vm.prank(issuer);
        oracle.setNav(_nav102());
        assertTrue(market.isSettleable(id));
        market.settle(id);
    }

    function test_staleNavAloneIsNotEnoughBeforeMaturity() public {
        StandbyMarket.Params memory p = _params();
        p.loanTerm = 3 days;
        p.maxNavAge = 1 hours;
        StandbyMarket longMarket =
            new StandbyMarket(address(usdt), address(asset), address(oracle), address(bidBook), p);
        // reuse the deployment's NAV and role setup; only the early-default rule is checked here
        vm.prank(issuer);
        oracle.setNav(96 * unit / 100);
        vm.warp(block.timestamp + 2 hours);
        assertFalse(longMarket.isSettleable(0));
    }

    function test_settlePausedAssetReverts() public {
        _seedDemo();
        uint256 id = _open(1000 * SHARES, 500 * unit);
        vm.warp(block.timestamp + TERM + GRACE + 1);
        vm.prank(issuer);
        asset.pause();
        vm.expectRevert();
        market.settle(id);
        vm.prank(issuer);
        asset.unpause();
        market.settle(id);
    }

    function test_reservationsAreNotCountedTwice() public {
        _seedDemo();
        (, uint256 cap1,) = market.previewLimits(5000 * SHARES);
        vm.prank(issuer);
        asset.mint(borrower, 1000 * SHARES);
        _open(1000 * SHARES, 500 * unit);
        (, uint256 cap2,) = market.previewLimits(5000 * SHARES);
        // The first loan's reservation is gone from free capacity: about 500 less principal fits.
        assertApproxEqAbs(cap2, cap1 - 500 * unit, 2);
        vm.expectRevert(BidBook.InsufficientCapacity.selector);
        _open(1000 * SHARES, cap2 + 1);
        _open(1000 * SHARES, cap2);
    }

    function test_constructorValidatesParams() public {
        StandbyMarket.Params memory p = _params();
        p.maxLtvBps = p.liqThresholdBps;
        vm.expectRevert(StandbyMarket.BadParams.selector);
        new StandbyMarket(address(usdt), address(asset), address(oracle), address(bidBook), p);

        vm.expectRevert(StandbyMarket.BadConfig.selector);
        new StandbyMarket(address(0xdead), address(asset), address(oracle), address(bidBook), _params());
    }

    function _assertEmitted(bytes32 topic) internal {
        bool found;
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics.length > 0 && logs[i].topics[0] == topic) found = true;
        }
        assertTrue(found, "event not emitted");
    }
}

import {Vm} from "forge-std/Vm.sol";

contract StandbyMarketUsdt6Test is StandbyMarketTest {
    function _decimals() internal pure override returns (uint8) {
        return 6;
    }
}

contract StandbyMarketUsdt18Test is StandbyMarketTest {
    function _decimals() internal pure override returns (uint8) {
        return 18;
    }
}
