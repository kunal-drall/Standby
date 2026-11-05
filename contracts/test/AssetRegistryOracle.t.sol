// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AllowlistRegistry} from "../src/AllowlistRegistry.sol";
import {NavOracle} from "../src/NavOracle.sol";
import {RestrictedAsset} from "../src/RestrictedAsset.sol";
import {Roles} from "../src/Roles.sol";
import {StandbyBase} from "./Base.t.sol";

/// @notice C2: R1 (restricted asset with allowlist) and R2 (pause, NAV with timestamp).
contract AllowlistRegistryTest is StandbyBase {
    function test_roleBitmask() public view {
        assertTrue(registry.hasRole(borrower, Roles.HOLDER));
        assertFalse(registry.hasRole(borrower, Roles.BUYER));
        assertTrue(registry.hasRole(address(market), Roles.CONTRACT));
        assertFalse(registry.hasRole(borrower, 0));
        assertTrue(registry.isAllowed(buyer1));
        assertFalse(registry.isAllowed(outsider));
        assertEq(registry.roles(buyer1), Roles.BUYER);
    }

    function test_combinedRoles() public {
        vm.prank(issuer);
        registry.setRoles(outsider, Roles.HOLDER | Roles.BUYER);
        assertTrue(registry.hasRole(outsider, Roles.HOLDER));
        assertTrue(registry.hasRole(outsider, Roles.BUYER));
        assertTrue(registry.hasRole(outsider, Roles.HOLDER | Roles.BUYER));
        assertFalse(registry.hasRole(outsider, Roles.HOLDER | Roles.CONTRACT));
    }

    function test_setRolesEmitsAndRemoves() public {
        vm.expectEmit(true, false, false, true, address(registry));
        emit AllowlistRegistry.RolesSet(buyer1, 0);
        vm.prank(issuer);
        registry.setRoles(buyer1, 0);
        assertFalse(registry.isAllowed(buyer1));
    }

    function test_onlyIssuerSetsRoles() public {
        vm.expectRevert(AllowlistRegistry.NotIssuer.selector);
        vm.prank(outsider);
        registry.setRoles(outsider, Roles.HOLDER);
    }

    function test_rejectsUnknownRoleBits() public {
        vm.expectRevert(AllowlistRegistry.InvalidRoles.selector);
        vm.prank(issuer);
        registry.setRoles(outsider, 8);
    }

    function test_rejectsZeroAddress() public {
        vm.expectRevert(AllowlistRegistry.ZeroAddress.selector);
        vm.prank(issuer);
        registry.setRoles(address(0), Roles.HOLDER);
    }
}

contract RestrictedAssetTest is StandbyBase {
    function test_transferBetweenAllowedWallets() public {
        vm.prank(borrower);
        asset.transfer(buyer1, 10 * SHARES);
        assertEq(asset.balanceOf(buyer1), 10 * SHARES);
        assertEq(asset.decimals(), 18);
    }

    function test_transferToNonAllowedReverts() public {
        vm.expectRevert(RestrictedAsset.NotAllowed.selector);
        vm.prank(borrower);
        asset.transfer(outsider, 1 * SHARES);
    }

    function test_transferFromNonAllowedReverts() public {
        vm.prank(borrower);
        asset.transfer(buyer1, 5 * SHARES);
        vm.prank(issuer);
        registry.setRoles(buyer1, 0);
        vm.expectRevert(RestrictedAsset.NotAllowed.selector);
        vm.prank(buyer1);
        asset.transfer(borrower, 1 * SHARES);
    }

    function test_transferFromViaAllowanceChecksBothSides() public {
        vm.prank(borrower);
        asset.approve(outsider, 10 * SHARES);
        vm.expectRevert(RestrictedAsset.NotAllowed.selector);
        vm.prank(outsider);
        asset.transferFrom(borrower, outsider, 1 * SHARES);
    }

    function test_mintOnlyToHolder() public {
        vm.expectRevert(RestrictedAsset.NotHolder.selector);
        vm.prank(issuer);
        asset.mint(buyer1, 1 * SHARES);
        vm.expectRevert(RestrictedAsset.NotHolder.selector);
        vm.prank(issuer);
        asset.mint(outsider, 1 * SHARES);
    }

    function test_mintOnlyByIssuer() public {
        vm.expectRevert(RestrictedAsset.NotIssuer.selector);
        vm.prank(borrower);
        asset.mint(borrower, 1 * SHARES);
    }

    function test_pauseBlocksTransfersAndMint() public {
        vm.expectEmit(false, false, false, true, address(asset));
        emit RestrictedAsset.PauseSet(true);
        vm.prank(issuer);
        asset.pause();
        assertTrue(asset.paused());

        vm.expectRevert(RestrictedAsset.Paused.selector);
        vm.prank(borrower);
        asset.transfer(buyer1, 1 * SHARES);

        vm.expectRevert(RestrictedAsset.Paused.selector);
        vm.prank(issuer);
        asset.mint(borrower, 1 * SHARES);

        vm.prank(issuer);
        asset.unpause();
        vm.prank(borrower);
        asset.transfer(buyer1, 1 * SHARES);
        assertEq(asset.balanceOf(buyer1), 1 * SHARES);
    }

    function test_onlyIssuerPauses() public {
        vm.expectRevert(RestrictedAsset.NotIssuer.selector);
        vm.prank(borrower);
        asset.pause();
    }

    function testFuzz_sharesNeverReachNonAllowed(address to, uint256 amount) public {
        vm.assume(to != address(0) && !registry.isAllowed(to));
        amount = bound(amount, 1, 1000 * SHARES);
        vm.expectRevert(RestrictedAsset.NotAllowed.selector);
        vm.prank(borrower);
        asset.transfer(to, amount);
    }
}

contract NavOracleTest is StandbyBase {
    function test_latestReturnsNavAndTimestamp() public {
        vm.warp(block.timestamp + 100);
        vm.expectEmit(false, false, false, true, address(oracle));
        emit NavOracle.NavPosted(1_010_000, uint40(block.timestamp));
        vm.prank(issuer);
        oracle.setNav(1_010_000);
        (uint256 nav, uint40 at) = oracle.latest();
        assertEq(nav, 1_010_000);
        assertEq(at, block.timestamp);
    }

    function test_onlyIssuerSetsNav() public {
        vm.expectRevert(NavOracle.NotIssuer.selector);
        vm.prank(outsider);
        oracle.setNav(1);
    }

    function test_zeroNavReverts() public {
        vm.expectRevert(NavOracle.ZeroNav.selector);
        vm.prank(issuer);
        oracle.setNav(0);
    }

    function test_freshOracleIsEmpty() public {
        NavOracle fresh = new NavOracle(issuer);
        (uint256 nav, uint40 at) = fresh.latest();
        assertEq(nav, 0);
        assertEq(at, 0);
    }
}
