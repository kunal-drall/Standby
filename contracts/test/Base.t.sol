// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AllowlistRegistry} from "../src/AllowlistRegistry.sol";
import {BidBook} from "../src/BidBook.sol";
import {NavOracle} from "../src/NavOracle.sol";
import {RestrictedAsset} from "../src/RestrictedAsset.sol";
import {Roles} from "../src/Roles.sol";
import {StandbyMarket} from "../src/StandbyMarket.sol";

contract MockUSDT is ERC20 {
    uint8 private immutable _dec;

    constructor(uint8 dec) ERC20("Mock USDT", "USDT") {
        _dec = dec;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @notice Shared deployment matching the demo: parameters from interfaces.md section 4, NAV 1.02,
/// 1,000 shares to the borrower, two buyers, one lender.
abstract contract StandbyBase is Test {
    MockUSDT internal usdt;
    AllowlistRegistry internal registry;
    RestrictedAsset internal asset;
    NavOracle internal oracle;
    BidBook internal bidBook;
    StandbyMarket internal market;

    address internal issuer = makeAddr("issuer");
    address internal lender = makeAddr("lender");
    address internal buyer1 = makeAddr("buyer1");
    address internal buyer2 = makeAddr("buyer2");
    address internal borrower = makeAddr("borrower");
    address internal outsider = makeAddr("outsider");
    address internal keeper = makeAddr("keeper");

    uint256 internal unit;
    uint256 internal constant SHARES = 1e18;
    uint256 internal constant YEAR = 365 days;

    uint16 internal constant MAX_LTV = 8500;
    uint16 internal constant LIQ = 9000;
    uint16 internal constant HAIRCUT = 1000;
    uint16 internal constant RATE = 800;
    uint16 internal constant FEE = 200;
    uint40 internal constant TERM = 900;
    uint40 internal constant GRACE = 120;
    uint40 internal constant MAX_NAV_AGE = 86400;
    uint40 internal constant NOTICE = 600;

    function _decimals() internal pure virtual returns (uint8) {
        return 6;
    }

    function _params() internal pure returns (StandbyMarket.Params memory) {
        return StandbyMarket.Params({
            maxLtvBps: MAX_LTV,
            liqThresholdBps: LIQ,
            haircutBps: HAIRCUT,
            rateBps: RATE,
            commitFeeBps: FEE,
            loanTerm: TERM,
            grace: GRACE,
            maxNavAge: MAX_NAV_AGE
        });
    }

    function _deployUsdt() internal virtual returns (address) {
        return address(new MockUSDT(_decimals()));
    }

    function setUp() public virtual {
        vm.warp(1_800_000_000);
        usdt = MockUSDT(_deployUsdt());
        unit = 10 ** usdt.decimals();

        registry = new AllowlistRegistry(issuer);
        asset = new RestrictedAsset("Demo T-Bill Fund Share", "dTBILL", address(registry), issuer);
        oracle = new NavOracle(issuer);
        bidBook = new BidBook(address(usdt), address(registry), 800, NOTICE);
        market =
            new StandbyMarket(address(usdt), address(asset), address(oracle), address(bidBook), _params());
        bidBook.setMarket(address(market));

        vm.startPrank(issuer);
        registry.setRoles(address(market), Roles.CONTRACT);
        registry.setRoles(address(bidBook), Roles.CONTRACT);
        registry.setRoles(borrower, Roles.HOLDER);
        registry.setRoles(buyer1, Roles.BUYER);
        registry.setRoles(buyer2, Roles.BUYER);
        oracle.setNav(_nav102());
        asset.mint(borrower, 1000 * SHARES);
        vm.stopPrank();

        address[4] memory funded = [lender, buyer1, buyer2, borrower];
        for (uint256 i; i < funded.length; ++i) {
            usdt.mint(funded[i], 1_000_000 * unit);
            vm.startPrank(funded[i]);
            usdt.approve(address(bidBook), type(uint256).max);
            usdt.approve(address(market), type(uint256).max);
            asset.approve(address(market), type(uint256).max);
            vm.stopPrank();
        }
    }

    function _nav102() internal view returns (uint256) {
        return 102 * unit / 100;
    }

    function _bid(address buyer, uint256 amount, uint16 discountBps) internal returns (uint256 id) {
        vm.prank(buyer);
        id = bidBook.postBid(amount, discountBps, NOTICE);
    }

    function _deposit(uint256 amount) internal returns (uint256 shares) {
        vm.prank(lender);
        shares = market.deposit(amount);
    }

    function _open(uint256 collateral, uint256 principal) internal returns (uint256 loanId) {
        vm.prank(borrower);
        loanId = market.openLoan(collateral, principal);
    }

    /// @dev The demo book: 600 USDT at 3% and 500 USDT at 5%, 1,500 USDT in the pool.
    function _seedDemo() internal {
        _bid(buyer1, 600 * unit, 300);
        _bid(buyer2, 500 * unit, 500);
        _deposit(1500 * unit);
    }

    function _dueAt(uint256 principal, uint256 elapsed) internal pure returns (uint256) {
        return principal + principal * RATE * elapsed / (10_000 * YEAR);
    }

    function _needed(uint256 principal) internal pure returns (uint256) {
        uint256 d = _dueAt(principal, uint256(TERM) + GRACE) * 10_000;
        return (d + (10_000 - HAIRCUT) - 1) / (10_000 - HAIRCUT);
    }
}
