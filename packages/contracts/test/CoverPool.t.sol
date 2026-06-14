// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {CoverPool} from "../src/CoverPool.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract CoverPoolTest is Test {
    CoverPool internal pool;
    MockERC20 internal usdc;

    address internal settler;
    uint256 internal settlerPk;
    address internal lp = makeAddr("lp");
    address internal fan = makeAddr("fan");

    uint256 internal constant ONE = 1e6; // 1 USDC.e (6 decimals)

    bytes32 internal constant BUYPOLICY_TYPEHASH = keccak256(
        "BuyPolicy(address buyer,uint256 gameId,uint256 payout,uint256 premium,uint256 nonce,uint256 deadline)"
    );

    function setUp() public {
        (settler, settlerPk) = makeAddrAndKey("settler");
        usdc = new MockERC20("USD Coin (PoS)", "USDC.e", 6);
        // The test contract is the owner so it can call setSettler/transferOwnership directly.
        pool = new CoverPool(address(usdc), address(this), settler);
    }

    // ----------------------------- helpers ------------------------------- //

    function _fund(address who, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.prank(who);
        usdc.approve(address(pool), type(uint256).max);
    }

    function _seedPoolAndGame(uint256 gameId, uint256 threshold, uint256 cap, uint256 lpAmount) internal {
        _fund(lp, lpAmount);
        vm.prank(lp);
        pool.deposit(lpAmount);
        vm.prank(settler);
        pool.openGame(gameId, threshold, cap);
    }

    function _sign(
        uint256 pk,
        address buyer,
        uint256 gameId,
        uint256 payout,
        uint256 premium,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(BUYPOLICY_TYPEHASH, buyer, gameId, payout, premium, nonce, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", pool.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    // ------------------------------ deposit ------------------------------ //

    function test_FirstDepositMintsOneToOne() public {
        _fund(lp, 1000 * ONE);
        vm.prank(lp);
        uint256 shares = pool.deposit(1000 * ONE);

        assertEq(shares, 1000 * ONE);
        assertEq(pool.totalShares(), 1000 * ONE);
        assertEq(pool.sharesOf(lp), 1000 * ONE);
        assertEq(pool.totalAssets(), 1000 * ONE);
        assertEq(pool.freeAssets(), 1000 * ONE);
    }

    function test_DepositZeroReverts() public {
        vm.prank(lp);
        vm.expectRevert(CoverPool.ZeroAmount.selector);
        pool.deposit(0);
    }

    function test_WithdrawRoundTrip() public {
        _fund(lp, 1000 * ONE);
        vm.startPrank(lp);
        pool.deposit(1000 * ONE);
        uint256 assets = pool.withdraw(1000 * ONE);
        vm.stopPrank();

        assertEq(assets, 1000 * ONE);
        assertEq(pool.totalShares(), 0);
        assertEq(usdc.balanceOf(lp), 1000 * ONE);
    }

    function test_WithdrawInsufficientSharesReverts() public {
        _fund(lp, 1000 * ONE);
        vm.startPrank(lp);
        pool.deposit(1000 * ONE);
        vm.expectRevert(CoverPool.InsufficientShares.selector);
        pool.withdraw(1000 * ONE + 1);
        vm.stopPrank();
    }

    /// @dev The +VIRTUAL offset means a first-depositor griefer cannot brick a later
    ///      deposit (no round-to-zero) and the donation he uses to inflate is a loss.
    function test_InflationAttackUnprofitable() public {
        address attacker = makeAddr("attacker");
        address victim = makeAddr("victim");
        _fund(attacker, 1_000_000 * ONE);
        _fund(victim, 1_000_000 * ONE);

        vm.prank(attacker);
        uint256 attShares = pool.deposit(1); // seed 1 base unit
        assertEq(attShares, 1);

        uint256 donation = 100 * ONE;
        vm.prank(attacker);
        usdc.transfer(address(pool), donation); // direct donation inflates assets

        vm.prank(victim);
        uint256 vShares = pool.deposit(200 * ONE);
        assertGt(vShares, 0); // not bricked to zero

        vm.prank(attacker);
        uint256 attOut = pool.withdraw(attShares);
        assertLt(attOut, donation + 1); // attacker recovers less than he sank
    }

    // ----------------------------- openGame ------------------------------ //

    function test_OpenGameOnlySettler() public {
        // The test contract is the owner, NOT the settler.
        vm.expectRevert(CoverPool.NotSettler.selector);
        pool.openGame(1, 2, 100 * ONE);

        vm.prank(settler);
        pool.openGame(1, 2, 100 * ONE);
        (bool opened,,, uint256 threshold, uint256 cap,,) = pool.games(1);
        assertTrue(opened);
        assertEq(threshold, 2);
        assertEq(cap, 100 * ONE);
    }

    function test_OpenGameGuards() public {
        vm.startPrank(settler);
        vm.expectRevert(CoverPool.BadThreshold.selector);
        pool.openGame(1, 0, 100 * ONE);

        vm.expectRevert(CoverPool.ZeroCap.selector);
        pool.openGame(1, 2, 0);

        pool.openGame(1, 2, 100 * ONE);
        vm.expectRevert(CoverPool.GameExists.selector);
        pool.openGame(1, 2, 100 * ONE);
        vm.stopPrank();
    }

    // ----------------------------- buyPolicy ----------------------------- //

    function test_BuyPolicyHappyPath() public {
        _seedPoolAndGame(1, 2, 1000 * ONE, 1000 * ONE);
        _fund(fan, 100 * ONE);

        uint256 payout = 300 * ONE;
        uint256 premium = 30 * ONE;
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(settlerPk, fan, 1, payout, premium, 0, deadline);

        vm.prank(fan);
        uint256 policyId = pool.buyPolicy(1, payout, premium, deadline, 0, sig);

        assertEq(policyId, 1);
        assertEq(pool.lockedExposure(), payout);
        assertEq(pool.nonces(fan), 1);
        assertEq(pool.totalAssets(), 1000 * ONE + premium);
        assertEq(pool.freeAssets(), 1000 * ONE + premium - payout);

        (address holder, uint256 gid, uint256 p, bool claimed) = pool.policies(policyId);
        assertEq(holder, fan);
        assertEq(gid, 1);
        assertEq(p, payout);
        assertFalse(claimed);

        (,,,,, uint256 totalPayout,) = pool.games(1);
        assertEq(totalPayout, payout);
    }

    function test_BuyPolicyBadSignerReverts() public {
        _seedPoolAndGame(1, 2, 1000 * ONE, 1000 * ONE);
        _fund(fan, 100 * ONE);
        uint256 deadline = block.timestamp + 1 hours;
        (, uint256 badPk) = makeAddrAndKey("bad");
        bytes memory sig = _sign(badPk, fan, 1, 300 * ONE, 30 * ONE, 0, deadline);

        vm.prank(fan);
        vm.expectRevert(CoverPool.NotSettler.selector);
        pool.buyPolicy(1, 300 * ONE, 30 * ONE, deadline, 0, sig);
    }

    function test_BuyPolicyWrongNonceReverts() public {
        _seedPoolAndGame(1, 2, 1000 * ONE, 1000 * ONE);
        _fund(fan, 100 * ONE);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(settlerPk, fan, 1, 300 * ONE, 30 * ONE, 5, deadline);

        vm.prank(fan);
        vm.expectRevert(CoverPool.BadNonce.selector);
        pool.buyPolicy(1, 300 * ONE, 30 * ONE, deadline, 5, sig);
    }

    function test_BuyPolicyExpiredReverts() public {
        _seedPoolAndGame(1, 2, 1000 * ONE, 1000 * ONE);
        _fund(fan, 100 * ONE);
        vm.warp(1000);
        uint256 deadline = 500;
        bytes memory sig = _sign(settlerPk, fan, 1, 300 * ONE, 30 * ONE, 0, deadline);

        vm.prank(fan);
        vm.expectRevert(CoverPool.Expired.selector);
        pool.buyPolicy(1, 300 * ONE, 30 * ONE, deadline, 0, sig);
    }

    function test_BuyPolicyReplayReverts() public {
        _seedPoolAndGame(1, 2, 1000 * ONE, 1000 * ONE);
        _fund(fan, 100 * ONE);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(settlerPk, fan, 1, 300 * ONE, 30 * ONE, 0, deadline);

        vm.prank(fan);
        pool.buyPolicy(1, 300 * ONE, 30 * ONE, deadline, 0, sig);

        // Same signature + nonce 0 again: the nonce has advanced to 1.
        vm.prank(fan);
        vm.expectRevert(CoverPool.BadNonce.selector);
        pool.buyPolicy(1, 300 * ONE, 30 * ONE, deadline, 0, sig);
    }

    function test_BuyPolicyExposureCapExceededReverts() public {
        _seedPoolAndGame(1, 2, 100 * ONE, 1000 * ONE); // cap = 100
        _fund(fan, 1000 * ONE);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(settlerPk, fan, 1, 101 * ONE, 20 * ONE, 0, deadline);

        vm.prank(fan);
        vm.expectRevert(CoverPool.ExposureCapExceeded.selector);
        pool.buyPolicy(1, 101 * ONE, 20 * ONE, deadline, 0, sig);
    }

    function test_BuyPolicyInsufficientFreeAssetsReverts() public {
        // No LP capital — the pool cannot back a payout larger than the premium.
        vm.prank(settler);
        pool.openGame(1, 2, 1000 * ONE);
        _fund(fan, 1000 * ONE);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(settlerPk, fan, 1, 300 * ONE, 30 * ONE, 0, deadline);

        vm.prank(fan);
        vm.expectRevert(CoverPool.InsufficientFreeAssets.selector);
        pool.buyPolicy(1, 300 * ONE, 30 * ONE, deadline, 0, sig);
    }

    function test_BuyPolicyGameNotOpenReverts() public {
        _fund(fan, 100 * ONE);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(settlerPk, fan, 7, 300 * ONE, 30 * ONE, 0, deadline);

        vm.prank(fan);
        vm.expectRevert(CoverPool.GameNotOpen.selector);
        pool.buyPolicy(7, 300 * ONE, 30 * ONE, deadline, 0, sig);
    }

    function test_BuyPolicyOnResolvedGameReverts() public {
        _seedPoolAndGame(1, 2, 1000 * ONE, 1000 * ONE);
        vm.prank(settler);
        pool.resolve(1, 1);
        _fund(fan, 100 * ONE);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(settlerPk, fan, 1, 300 * ONE, 30 * ONE, 0, deadline);

        vm.prank(fan);
        vm.expectRevert(CoverPool.GameResolvedAlready.selector);
        pool.buyPolicy(1, 300 * ONE, 30 * ONE, deadline, 0, sig);
    }

    function test_BuyPolicyZeroAmountReverts() public {
        _seedPoolAndGame(1, 2, 1000 * ONE, 1000 * ONE);
        _fund(fan, 100 * ONE);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(settlerPk, fan, 1, 0, 30 * ONE, 0, deadline);

        vm.prank(fan);
        vm.expectRevert(CoverPool.ZeroAmount.selector);
        pool.buyPolicy(1, 0, 30 * ONE, deadline, 0, sig);
    }

    // ------------------------- resolve & claim --------------------------- //

    function test_ResolveBlowoutAndClaim() public {
        _seedPoolAndGame(1, 3, 1000 * ONE, 1000 * ONE);
        _fund(fan, 100 * ONE);
        uint256 payout = 300 * ONE;
        uint256 premium = 30 * ONE;
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(settlerPk, fan, 1, payout, premium, 0, deadline);
        vm.prank(fan);
        uint256 policyId = pool.buyPolicy(1, payout, premium, deadline, 0, sig);

        vm.prank(settler);
        pool.resolve(1, 4); // margin 4 >= threshold 3 -> blowout

        uint256 fanBefore = usdc.balanceOf(fan);
        pool.claim(policyId); // any caller; funds go to the holder
        assertEq(usdc.balanceOf(fan), fanBefore + payout);
        assertEq(pool.lockedExposure(), 0);

        (,,, bool claimed) = pool.policies(policyId);
        assertTrue(claimed);
    }

    function test_ResolveNoBlowoutPolicyWorthless() public {
        _seedPoolAndGame(1, 3, 1000 * ONE, 1000 * ONE);
        _fund(fan, 100 * ONE);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(settlerPk, fan, 1, 300 * ONE, 30 * ONE, 0, deadline);
        vm.prank(fan);
        uint256 policyId = pool.buyPolicy(1, 300 * ONE, 30 * ONE, deadline, 0, sig);

        vm.prank(settler);
        pool.resolve(1, 1); // margin 1 < threshold 3 -> no blowout

        assertEq(pool.lockedExposure(), 0);
        // Premium kept, exposure released -> LPs are up by the full premium.
        assertEq(pool.freeAssets(), 1030 * ONE);

        vm.expectRevert(CoverPool.NotBlowout.selector);
        pool.claim(policyId);
    }

    function test_ResolveDoubleReverts() public {
        _seedPoolAndGame(1, 2, 1000 * ONE, 1000 * ONE);
        vm.startPrank(settler);
        pool.resolve(1, 3);
        vm.expectRevert(CoverPool.GameResolvedAlready.selector);
        pool.resolve(1, 3);
        vm.stopPrank();
    }

    function test_ResolveOnlySettler() public {
        vm.prank(settler);
        pool.openGame(1, 2, 100 * ONE);
        vm.expectRevert(CoverPool.NotSettler.selector);
        pool.resolve(1, 2);
    }

    function test_ResolveGameNotOpenReverts() public {
        vm.prank(settler);
        vm.expectRevert(CoverPool.GameNotOpen.selector);
        pool.resolve(99, 2);
    }

    function test_ClaimUnknownPolicyReverts() public {
        vm.expectRevert(CoverPool.UnknownPolicy.selector);
        pool.claim(0);
        vm.expectRevert(CoverPool.UnknownPolicy.selector);
        pool.claim(999);
    }

    function test_ClaimUnresolvedGameReverts() public {
        _seedPoolAndGame(1, 2, 1000 * ONE, 1000 * ONE);
        _fund(fan, 100 * ONE);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(settlerPk, fan, 1, 300 * ONE, 30 * ONE, 0, deadline);
        vm.prank(fan);
        uint256 policyId = pool.buyPolicy(1, 300 * ONE, 30 * ONE, deadline, 0, sig);

        vm.expectRevert(CoverPool.GameNotResolved.selector);
        pool.claim(policyId);
    }

    function test_ClaimDoubleReverts() public {
        _seedPoolAndGame(1, 3, 1000 * ONE, 1000 * ONE);
        _fund(fan, 100 * ONE);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(settlerPk, fan, 1, 300 * ONE, 30 * ONE, 0, deadline);
        vm.prank(fan);
        uint256 policyId = pool.buyPolicy(1, 300 * ONE, 30 * ONE, deadline, 0, sig);
        vm.prank(settler);
        pool.resolve(1, 5);

        pool.claim(policyId);
        vm.expectRevert(CoverPool.AlreadyClaimed.selector);
        pool.claim(policyId);
    }

    // ------------------------- withdraw gating --------------------------- //

    function test_WithdrawBlockedByLockedExposure() public {
        _seedPoolAndGame(1, 2, 1000 * ONE, 1000 * ONE);
        _fund(fan, 100 * ONE);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(settlerPk, fan, 1, 300 * ONE, 30 * ONE, 0, deadline);
        vm.prank(fan);
        pool.buyPolicy(1, 300 * ONE, 30 * ONE, deadline, 0, sig);

        // free = 1030 - 300 = 730; a full exit would pull ~1029 > free -> revert.
        vm.prank(lp);
        vm.expectRevert(CoverPool.InsufficientFreeAssets.selector);
        pool.withdraw(1000 * ONE);

        // A partial withdraw that stays within free assets succeeds.
        vm.prank(lp);
        uint256 got = pool.withdraw(700 * ONE);
        assertGt(got, 700 * ONE);
        assertLt(got, 730 * ONE);
    }

    // ------------------------- ownership / keys -------------------------- //

    function test_SetSettlerOnlyOwner() public {
        address newSettler = makeAddr("newSettler");
        vm.prank(fan);
        vm.expectRevert(CoverPool.NotOwner.selector);
        pool.setSettler(newSettler);

        pool.setSettler(newSettler); // test contract is the owner
        assertEq(pool.settler(), newSettler);

        vm.expectRevert(CoverPool.ZeroAddress.selector);
        pool.setSettler(address(0));
    }

    function test_TransferOwnership() public {
        address newOwner = makeAddr("newOwner");
        pool.transferOwnership(newOwner);
        assertEq(pool.owner(), newOwner);

        vm.expectRevert(CoverPool.NotOwner.selector);
        pool.transferOwnership(address(this));
    }

    function test_ConstructorRejectsZeroAddress() public {
        vm.expectRevert(CoverPool.ZeroAddress.selector);
        new CoverPool(address(0), address(this), settler);
        vm.expectRevert(CoverPool.ZeroAddress.selector);
        new CoverPool(address(usdc), address(0), settler);
        vm.expectRevert(CoverPool.ZeroAddress.selector);
        new CoverPool(address(usdc), address(this), address(0));
    }
}
