// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {CoverPool} from "../src/CoverPool.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @notice Drives random, valid sequences of pool actions. Every settler-only call is
///         pranked from the settler and every fan call is signed with the settler key,
///         so the only thing the fuzzer can do is exercise the real flow. The handler
///         is the buyer for every policy (msg.sender == this), and it mints itself the
///         collateral it needs on the fly. Calls that may legitimately revert are
///         swallowed so the campaign keeps exploring.
contract CoverPoolHandler is Test {
    CoverPool internal pool;
    MockERC20 internal usdc;
    uint256 internal settlerPk;
    address internal settler;

    uint256[] internal openedGames;
    mapping(uint256 => bool) internal isOpen;
    mapping(uint256 => bool) internal isResolved;
    uint256[] internal policyIds;

    bytes32 internal constant BUYPOLICY_TYPEHASH = keccak256(
        "BuyPolicy(address buyer,uint256 gameId,uint256 payout,uint256 premium,uint256 nonce,uint256 deadline)"
    );

    constructor(CoverPool pool_, MockERC20 usdc_, uint256 settlerPk_) {
        pool = pool_;
        usdc = usdc_;
        settlerPk = settlerPk_;
        settler = vm.addr(settlerPk_);
        usdc.approve(address(pool), type(uint256).max);
    }

    function deposit(uint256 amount) external {
        amount = bound(amount, 1, 1e15);
        usdc.mint(address(this), amount);
        try pool.deposit(amount) {} catch {}
    }

    function withdraw(uint256 shares) external {
        uint256 bal = pool.sharesOf(address(this));
        if (bal == 0) return;
        shares = bound(shares, 1, bal);
        try pool.withdraw(shares) {} catch {}
    }

    function openGame(uint256 gameId, uint256 threshold, uint256 cap) external {
        gameId = bound(gameId, 1, 20);
        if (isOpen[gameId]) return;
        threshold = bound(threshold, 1, 10);
        cap = bound(cap, 1, 1e15);
        vm.prank(settler);
        try pool.openGame(gameId, threshold, cap) {
            isOpen[gameId] = true;
            openedGames.push(gameId);
        } catch {}
    }

    function buy(uint256 gameSeed, uint256 payout, uint256 premium) external {
        if (openedGames.length == 0) return;
        uint256 gameId = openedGames[gameSeed % openedGames.length];
        if (isResolved[gameId]) return;
        payout = bound(payout, 1, 1e15);
        premium = bound(premium, 1, 1e15);
        uint256 deadline = block.timestamp + 1 days;
        uint256 nonce = pool.nonces(address(this));

        bytes32 structHash =
            keccak256(abi.encode(BUYPOLICY_TYPEHASH, address(this), gameId, payout, premium, nonce, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", pool.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(settlerPk, digest);

        usdc.mint(address(this), premium);
        try pool.buyPolicy(gameId, payout, premium, deadline, nonce, abi.encodePacked(r, s, v)) returns (uint256 id) {
            policyIds.push(id);
        } catch {}
    }

    function resolveGame(uint256 gameSeed, uint256 margin) external {
        if (openedGames.length == 0) return;
        uint256 gameId = openedGames[gameSeed % openedGames.length];
        if (isResolved[gameId]) return;
        margin = bound(margin, 0, 12);
        vm.prank(settler);
        try pool.resolve(gameId, margin) {
            isResolved[gameId] = true;
        } catch {}
    }

    function claimPolicy(uint256 policySeed) external {
        if (policyIds.length == 0) return;
        uint256 id = policyIds[policySeed % policyIds.length];
        try pool.claim(id) {} catch {}
    }
}

contract CoverPoolInvariantTest is Test {
    CoverPool internal pool;
    MockERC20 internal usdc;
    CoverPoolHandler internal handler;

    function setUp() public {
        (address settler, uint256 settlerPk) = makeAddrAndKey("settler");
        usdc = new MockERC20("USD Coin (PoS)", "USDC.e", 6);
        pool = new CoverPool(address(usdc), address(this), settler);
        handler = new CoverPoolHandler(pool, usdc, settlerPk);
        targetContract(address(handler));
    }

    /// @notice The core solvency guarantee: every reserved payout is always fully
    ///         backed by collateral actually held by the pool.
    function invariant_lockedExposureFullyBacked() public view {
        assertLe(pool.lockedExposure(), pool.totalAssets());
    }
}
