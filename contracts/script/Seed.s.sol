// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {BidBook} from "../src/BidBook.sol";
import {NavOracle} from "../src/NavOracle.sol";
import {RestrictedAsset} from "../src/RestrictedAsset.sol";
import {StandbyMarket} from "../src/StandbyMarket.sol";

/// @notice Seeds the demo: 1,000 shares to the borrower, NAV 1.02 USDT, buyer 1 bids at 3% and buyer 2
/// at 5% with a 10-minute notice, and a lender deposit. Amounts are whole USDT, capped at what each
/// wallet holds. Env: DEPLOYER_PK, LENDER_PK, BUYER1_PK, BUYER2_PK, BORROWER_PK, ASSET_ADDRESS,
/// ORACLE_ADDRESS, BIDBOOK_ADDRESS, MARKET_ADDRESS, USDT_ADDRESS; optional SEED_BID1, SEED_BID2,
/// SEED_DEPOSIT (whole USDT; defaults 600, 500, 1500), SEED_SHARES (default 1000).
contract Seed is Script {
    function run() external {
        IERC20Metadata usdt = IERC20Metadata(vm.envAddress("USDT_ADDRESS"));
        RestrictedAsset asset = RestrictedAsset(vm.envAddress("ASSET_ADDRESS"));
        NavOracle oracle = NavOracle(vm.envAddress("ORACLE_ADDRESS"));
        BidBook bidBook = BidBook(vm.envAddress("BIDBOOK_ADDRESS"));
        StandbyMarket market = StandbyMarket(vm.envAddress("MARKET_ADDRESS"));
        uint256 unit = 10 ** usdt.decimals();
        console.log("USDT decimals: %s", usdt.decimals());

        uint256 issuerPk = vm.envUint("DEPLOYER_PK");
        address borrower = vm.addr(vm.envUint("BORROWER_PK"));
        vm.startBroadcast(issuerPk);
        asset.mint(borrower, vm.envOr("SEED_SHARES", uint256(1000)) * 1e18);
        oracle.setNav(102 * unit / 100);
        vm.stopBroadcast();

        _bid(usdt, bidBook, vm.envUint("BUYER1_PK"), vm.envOr("SEED_BID1", uint256(600)) * unit, 300);
        _bid(usdt, bidBook, vm.envUint("BUYER2_PK"), vm.envOr("SEED_BID2", uint256(500)) * unit, 500);

        uint256 lenderPk = vm.envUint("LENDER_PK");
        uint256 deposit = _cap(usdt, vm.addr(lenderPk), vm.envOr("SEED_DEPOSIT", uint256(1500)) * unit);
        if (deposit > 0) {
            vm.startBroadcast(lenderPk);
            usdt.approve(address(market), deposit);
            market.deposit(deposit);
            vm.stopBroadcast();
        }
        console.log("lender deposit (base units): %s", deposit);
    }

    function _bid(IERC20Metadata usdt, BidBook bidBook, uint256 pk, uint256 wanted, uint16 discountBps) internal {
        uint256 amount = _cap(usdt, vm.addr(pk), wanted);
        if (amount == 0) {
            console.log("skipped bid at %s bps: wallet holds no USDT", discountBps);
            return;
        }
        vm.startBroadcast(pk);
        usdt.approve(address(bidBook), amount);
        uint256 id = bidBook.postBid(amount, discountBps, bidBook.minNotice());
        vm.stopBroadcast();
        console.log("bid %s: %s base units at %s bps", id, amount, discountBps);
    }

    function _cap(IERC20Metadata usdt, address who, uint256 wanted) internal view returns (uint256) {
        uint256 balance = usdt.balanceOf(who);
        if (balance < wanted) console.log("SHORT: %s holds %s, wanted %s", who, balance, wanted);
        return balance < wanted ? balance : wanted;
    }
}
