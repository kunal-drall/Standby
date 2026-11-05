// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AllowlistRegistry} from "../src/AllowlistRegistry.sol";
import {BidBook} from "../src/BidBook.sol";
import {NavOracle} from "../src/NavOracle.sol";
import {RestrictedAsset} from "../src/RestrictedAsset.sol";
import {Roles} from "../src/Roles.sol";
import {StandbyMarket} from "../src/StandbyMarket.sol";

/// @notice Deploys the five contracts with the demo parameters (docs/interfaces.md section 4), wires
/// roles and the bid book's market, and writes the addresses to a deployments JSON file.
/// Env: DEPLOYER_PK (issuer), USDT_ADDRESS, BORROWER_PK, BUYER1_PK, BUYER2_PK,
/// optional DEPLOYMENTS_OUT (default ../packages/shared/src/deployments.json).
contract Deploy is Script {
    uint16 internal constant MAX_DISCOUNT_BPS = 800;
    uint40 internal constant MIN_NOTICE = 600;

    function demoParams() internal pure returns (StandbyMarket.Params memory) {
        return StandbyMarket.Params({
            maxLtvBps: 8500,
            liqThresholdBps: 9000,
            haircutBps: 1000,
            rateBps: 800,
            commitFeeBps: 200,
            loanTerm: 900,
            grace: 120,
            maxNavAge: 86400
        });
    }

    struct Deployed {
        AllowlistRegistry registry;
        RestrictedAsset asset;
        NavOracle oracle;
        BidBook bidBook;
        StandbyMarket market;
    }

    function run() external {
        address usdt = vm.envAddress("USDT_ADDRESS");
        uint256 startBlock = block.number;
        Deployed memory dep = _deploy(usdt);
        _write(dep, usdt, startBlock);
    }

    function _deploy(address usdt) internal returns (Deployed memory dep) {
        uint256 deployerPk = vm.envUint("DEPLOYER_PK");
        address issuer = vm.addr(deployerPk);

        vm.startBroadcast(deployerPk);
        dep.registry = new AllowlistRegistry(issuer);
        dep.asset = new RestrictedAsset("Demo T-Bill Fund Share", "dTBILL", address(dep.registry), issuer);
        dep.oracle = new NavOracle(issuer);
        dep.bidBook = new BidBook(usdt, address(dep.registry), MAX_DISCOUNT_BPS, MIN_NOTICE);
        dep.market = new StandbyMarket(
            usdt, address(dep.asset), address(dep.oracle), address(dep.bidBook), demoParams()
        );
        dep.bidBook.setMarket(address(dep.market));
        dep.registry.setRoles(address(dep.market), Roles.CONTRACT);
        dep.registry.setRoles(address(dep.bidBook), Roles.CONTRACT);
        dep.registry.setRoles(vm.addr(vm.envUint("BORROWER_PK")), Roles.HOLDER);
        dep.registry.setRoles(vm.addr(vm.envUint("BUYER1_PK")), Roles.BUYER);
        dep.registry.setRoles(vm.addr(vm.envUint("BUYER2_PK")), Roles.BUYER);
        vm.stopBroadcast();
    }

    function _write(Deployed memory dep, address usdt, uint256 startBlock) internal {
        string memory out = vm.envOr("DEPLOYMENTS_OUT", string("../packages/shared/src/deployments.json"));
        string memory c = "contracts";
        vm.serializeAddress(c, "AllowlistRegistry", address(dep.registry));
        vm.serializeAddress(c, "RestrictedAsset", address(dep.asset));
        vm.serializeAddress(c, "NavOracle", address(dep.oracle));
        vm.serializeAddress(c, "BidBook", address(dep.bidBook));
        string memory contractsJson = vm.serializeAddress(c, "StandbyMarket", address(dep.market));
        string memory d = "deployments";
        vm.serializeUint(d, "chainId", block.chainid);
        vm.serializeAddress(d, "usdt", usdt);
        vm.serializeUint(d, "startBlock", startBlock);
        vm.writeJson(vm.serializeString(d, "contracts", contractsJson), out);

        console.log("REGISTRY_ADDRESS=%s", address(dep.registry));
        console.log("ASSET_ADDRESS=%s", address(dep.asset));
        console.log("ORACLE_ADDRESS=%s", address(dep.oracle));
        console.log("BIDBOOK_ADDRESS=%s", address(dep.bidBook));
        console.log("MARKET_ADDRESS=%s", address(dep.market));
        console.log("deployments written to %s", out);
    }
}
