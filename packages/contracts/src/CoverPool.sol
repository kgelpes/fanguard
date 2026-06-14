// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title CoverPool
/// @notice FanGuard's pass-through blowout-cover vault. LPs deposit stablecoin
///         collateral (USDC.e on Polygon) and earn the premiums fans pay for cover.
///         A fan buys a policy that pays a fixed `payout` if their game resolves as a
///         blowout (final margin >= the game's threshold). Premiums flow in, payouts
///         flow out, and a per-game exposure cap guarantees every active payout is
///         fully backed — the solvency story. The off-chain Polymarket hedge that
///         neutralises the liability is intentionally OUT OF SCOPE of this contract.
///
/// @dev    Self-contained by design: the repo vendors only forge-std, so the ERC-20
///         interface, safe-transfer helper, reentrancy guard, and EIP-712 signature
///         verification are all hand-rolled here rather than pulling in OpenZeppelin.
///         The contract is decimal-agnostic — every amount is in the collateral's base
///         units (USDC.e has 6 decimals); there are no 18-decimal assumptions.
///
///         A `gameId` encodes a single insurable trigger (a fixture + the insured team),
///         so one `threshold` and one final `margin` per game is sufficient:
///         `margin` is how many goals/points the insured team LOST by (0 if it did not
///         lose), and `blowout = margin >= threshold`.
///
/// Deliberate hackathon simplifications (not bugs):
///   - Unclaimed blowout exposure stays locked forever (no settler sweep). The demo
///     always claims; a production build would add a claim deadline + sweep.
///   - `claim` pays `policy.holder` regardless of caller, so the settler agent can
///     auto-claim on the fan's behalf ("the scoreboard IS the claim").
///   - No fee-on-transfer token support — USDC.e is clean, so received == sent.
///   - No pause / emergency stop. The owner can only rotate the settler key.
///   - The settler is trusted as the pricing oracle: it signs the exact economics of
///     every policy, and `openGame`/`resolve` are settler-only.
contract CoverPool {
    // --------------------------------------------------------------------- //
    //                              Types                                     //
    // --------------------------------------------------------------------- //

    struct Game {
        bool opened; // openGame has been called
        bool resolved; // resolve has been called
        bool blowout; // final margin >= threshold
        uint256 threshold; // margin (insured team's losing deficit) that triggers a payout
        uint256 exposureCap; // max sum of policy payouts this game may back
        uint256 totalPayout; // sum of payouts of policies bought on this game
        uint256 margin; // final margin, written on resolve
    }

    struct Policy {
        address holder; // who gets paid on a blowout
        uint256 gameId; // the game this policy covers
        uint256 payout; // fixed payout on a blowout
        bool claimed; // payout already taken
    }

    // --------------------------------------------------------------------- //
    //                          Immutable / config                           //
    // --------------------------------------------------------------------- //

    /// @notice ERC-20 collateral the pool holds, deposits, and pays out in (USDC.e).
    address public immutable collateral;

    /// @notice Can rotate the settler key. Set once in the constructor.
    address public owner;

    /// @notice Signs `BuyPolicy` quotes and is the only caller of openGame/resolve.
    address public settler;

    // --------------------------------------------------------------------- //
    //                            LP share ledger                            //
    // --------------------------------------------------------------------- //

    /// @notice Total LP shares outstanding (dimensionless internal units).
    uint256 public totalShares;
    /// @notice LP share balances.
    mapping(address => uint256) public sharesOf;

    /// @notice Sum of payouts of every active policy (unresolved, or resolved-blowout
    ///         and not yet claimed). Capital backing these may not be withdrawn by LPs.
    uint256 public lockedExposure;

    // --------------------------------------------------------------------- //
    //                          Policies & games                             //
    // --------------------------------------------------------------------- //

    /// @notice Next policy id to assign. Starts at 1; id 0 is the "none" sentinel.
    uint256 public nextPolicyId = 1;
    mapping(uint256 => Policy) public policies;
    mapping(uint256 => Game) public games;

    /// @notice Per-buyer EIP-712 nonce, consumed in order to prevent quote replay.
    mapping(address => uint256) public nonces;

    // --------------------------------------------------------------------- //
    //                               EIP-712                                 //
    // --------------------------------------------------------------------- //

    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant BUYPOLICY_TYPEHASH = keccak256(
        "BuyPolicy(address buyer,uint256 gameId,uint256 payout,uint256 premium,uint256 nonce,uint256 deadline)"
    );

    uint256 private immutable INITIAL_CHAIN_ID;
    bytes32 private immutable INITIAL_DOMAIN_SEPARATOR;

    // --------------------------------------------------------------------- //
    //                              Constants                                //
    // --------------------------------------------------------------------- //

    /// @dev Virtual share/asset offset. Neutralises the first-deposit donation
    ///      ("inflation") attack and removes the divide-by-zero that would otherwise
    ///      brick deposits once the pool has shares but zero assets after a full loss.
    uint256 private constant VIRTUAL = 1;

    /// @dev secp256k1 half-order. Signatures with `s` above this are malleable.
    uint256 private constant SECP256K1_HALF_ORDER = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    uint256 private _locked = 1; // 1 = unlocked, 2 = entered

    // --------------------------------------------------------------------- //
    //                                Events                                 //
    // --------------------------------------------------------------------- //

    event Deposit(address indexed lp, uint256 assets, uint256 shares);
    event Withdraw(address indexed lp, uint256 assets, uint256 shares);
    event GameOpened(uint256 indexed gameId, uint256 threshold, uint256 exposureCap);
    event PolicyBought(
        uint256 indexed policyId, uint256 indexed gameId, address indexed holder, uint256 payout, uint256 premium
    );
    event GameResolved(uint256 indexed gameId, uint256 margin, bool blowout);
    event Claimed(uint256 indexed policyId, address indexed holder, uint256 payout);
    event SettlerUpdated(address indexed oldSettler, address indexed newSettler);

    // --------------------------------------------------------------------- //
    //                                Errors                                 //
    // --------------------------------------------------------------------- //

    error NotOwner();
    error NotSettler();
    error ZeroAmount();
    error ZeroAddress();
    error GameExists();
    error GameNotOpen();
    error GameResolvedAlready();
    error GameNotResolved();
    error BadThreshold();
    error ZeroCap();
    error ExposureCapExceeded();
    error InsufficientFreeAssets();
    error InsufficientShares();
    error Expired();
    error BadNonce();
    error MalleableSignature();
    error BadV();
    error InvalidSignature();
    error UnknownPolicy();
    error AlreadyClaimed();
    error NotBlowout();
    error TransferFailed();
    error Reentrancy();

    // --------------------------------------------------------------------- //
    //                              Modifiers                                //
    // --------------------------------------------------------------------- //

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlySettler() {
        if (msg.sender != settler) revert NotSettler();
        _;
    }

    modifier nonReentrant() {
        if (_locked == 2) revert Reentrancy();
        _locked = 2;
        _;
        _locked = 1;
    }

    // --------------------------------------------------------------------- //
    //                             Constructor                               //
    // --------------------------------------------------------------------- //

    /// @param collateral_ ERC-20 the pool holds and pays out in (USDC.e on Polygon).
    /// @param owner_       Cold key allowed to rotate the settler.
    /// @param settler_     Hot agent key that signs quotes and opens/resolves games.
    constructor(address collateral_, address owner_, address settler_) {
        if (collateral_ == address(0) || owner_ == address(0) || settler_ == address(0)) revert ZeroAddress();
        collateral = collateral_;
        owner = owner_;
        settler = settler_;
        INITIAL_CHAIN_ID = block.chainid;
        INITIAL_DOMAIN_SEPARATOR = _computeDomainSeparator();
    }

    // --------------------------------------------------------------------- //
    //                                Views                                  //
    // --------------------------------------------------------------------- //

    /// @notice Collateral held by the pool (deposits + premiums - payouts paid).
    function totalAssets() public view returns (uint256) {
        return _balance();
    }

    /// @notice Assets not reserved against live policies — the LP-withdrawable pool.
    ///         Reverts (underflow) if the solvency invariant were ever violated.
    function freeAssets() public view returns (uint256) {
        return totalAssets() - lockedExposure;
    }

    /// @notice EIP-712 domain separator, recomputed if the chain forked.
    function domainSeparator() public view returns (bytes32) {
        return block.chainid == INITIAL_CHAIN_ID ? INITIAL_DOMAIN_SEPARATOR : _computeDomainSeparator();
    }

    // --------------------------------------------------------------------- //
    //                            LP: deposit / withdraw                      //
    // --------------------------------------------------------------------- //

    /// @notice Deposit `amount` collateral and mint LP shares against the pool's
    ///         pre-deposit value. Shares round down (favouring existing LPs).
    function deposit(uint256 amount) external nonReentrant returns (uint256 shares) {
        if (amount == 0) revert ZeroAmount();
        uint256 ts = totalShares;
        // Price against assets BEFORE pulling the deposit. The +VIRTUAL offset blocks
        // the donation/inflation attack and the assets==0 divide-by-zero.
        shares = ts == 0 ? amount : (amount * (ts + VIRTUAL)) / (totalAssets() + VIRTUAL);
        if (shares == 0) revert ZeroAmount();

        totalShares = ts + shares;
        sharesOf[msg.sender] += shares;

        _safeTransferFrom(msg.sender, address(this), amount);
        emit Deposit(msg.sender, amount, shares);
    }

    /// @notice Burn `shares` and withdraw the proportional collateral, capped at the
    ///         free (unlocked) pool so capital backing live policies stays put.
    function withdraw(uint256 shares) external nonReentrant returns (uint256 assets) {
        if (shares == 0) revert ZeroAmount();
        uint256 bal = sharesOf[msg.sender];
        if (shares > bal) revert InsufficientShares();

        uint256 ts = totalShares;
        uint256 ta = totalAssets();
        assets = (shares * (ta + VIRTUAL)) / (ts + VIRTUAL); // rounds down, favours pool
        if (assets > ta - lockedExposure) revert InsufficientFreeAssets();

        sharesOf[msg.sender] = bal - shares;
        totalShares = ts - shares;

        _safeTransfer(msg.sender, assets);
        emit Withdraw(msg.sender, assets, shares);
    }

    // --------------------------------------------------------------------- //
    //                          Settler: game lifecycle                       //
    // --------------------------------------------------------------------- //

    /// @notice Open a game for cover. `threshold` is the losing margin that counts as a
    ///         blowout; it must be >= 1 so a non-loss (margin 0) never triggers a payout.
    function openGame(uint256 gameId, uint256 threshold, uint256 exposureCap) external onlySettler {
        Game storage g = games[gameId];
        if (g.opened) revert GameExists();
        if (threshold == 0) revert BadThreshold();
        if (exposureCap == 0) revert ZeroCap();

        g.opened = true;
        g.threshold = threshold;
        g.exposureCap = exposureCap;
        emit GameOpened(gameId, threshold, exposureCap);
    }

    /// @notice Buy a policy. The settler signs the exact (buyer, game, payout, premium)
    ///         quote off-chain; this contract never trusts user-supplied economics.
    /// @param gameId   Open, unresolved game to cover.
    /// @param payout   Fixed payout on a blowout, in collateral units.
    /// @param premium  Premium pulled from `msg.sender`, in collateral units.
    /// @param deadline Unix time after which the signed quote is void.
    /// @param nonce    Must equal `nonces[msg.sender]`; consumed on success.
    /// @param sig      65-byte settler signature over the EIP-712 `BuyPolicy` struct.
    function buyPolicy(
        uint256 gameId,
        uint256 payout,
        uint256 premium,
        uint256 deadline,
        uint256 nonce,
        bytes calldata sig
    ) external nonReentrant returns (uint256 policyId) {
        if (block.timestamp > deadline) revert Expired();
        if (payout == 0 || premium == 0) revert ZeroAmount();

        Game storage g = games[gameId];
        if (!g.opened) revert GameNotOpen();
        if (g.resolved) revert GameResolvedAlready();

        // Verify the settler authorised exactly this quote for exactly this buyer.
        if (nonce != nonces[msg.sender]) revert BadNonce();
        bytes32 structHash =
            keccak256(abi.encode(BUYPOLICY_TYPEHASH, msg.sender, gameId, payout, premium, nonce, deadline));
        _requireSettlerSig(keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash)), sig);
        nonces[msg.sender] = nonce + 1;

        // Per-game exposure cap.
        uint256 newGamePayout = g.totalPayout + payout;
        if (newGamePayout > g.exposureCap) revert ExposureCapExceeded();

        // Global solvency: every reserved payout must stay fully backed once the
        // premium lands. USDC.e is not fee-on-transfer, so post-balance == ta + premium.
        if (lockedExposure + payout > totalAssets() + premium) revert InsufficientFreeAssets();

        g.totalPayout = newGamePayout;
        lockedExposure += payout;
        policyId = nextPolicyId++;
        policies[policyId] = Policy({holder: msg.sender, gameId: gameId, payout: payout, claimed: false});

        _safeTransferFrom(msg.sender, address(this), premium);
        emit PolicyBought(policyId, gameId, msg.sender, payout, premium);
    }

    /// @notice Record a game's final margin. On a non-blowout the whole game's reserved
    ///         exposure is released back to LPs exactly once; on a blowout it stays
    ///         locked and is released per `claim`.
    function resolve(uint256 gameId, uint256 margin) external onlySettler {
        Game storage g = games[gameId];
        if (!g.opened) revert GameNotOpen();
        if (g.resolved) revert GameResolvedAlready();

        g.resolved = true;
        g.margin = margin;
        bool blow = margin >= g.threshold;
        g.blowout = blow;
        if (!blow) {
            lockedExposure -= g.totalPayout;
        }
        emit GameResolved(gameId, margin, blow);
    }

    /// @notice Pay a policy's payout to its holder if its game resolved as a blowout.
    ///         Callable by anyone (e.g. the settler agent) — funds always go to the
    ///         holder. A non-blowout policy is worthless and reverts.
    function claim(uint256 policyId) external nonReentrant {
        if (policyId == 0 || policyId >= nextPolicyId) revert UnknownPolicy();
        Policy storage p = policies[policyId];
        if (p.claimed) revert AlreadyClaimed();

        Game storage g = games[p.gameId];
        if (!g.resolved) revert GameNotResolved();
        if (!g.blowout) revert NotBlowout();

        p.claimed = true;
        lockedExposure -= p.payout;

        _safeTransfer(p.holder, p.payout);
        emit Claimed(policyId, p.holder, p.payout);
    }

    // --------------------------------------------------------------------- //
    //                          Owner: key rotation                          //
    // --------------------------------------------------------------------- //

    /// @notice Rotate the settler key (the hot agent that signs quotes & resolves games).
    function setSettler(address newSettler) external onlyOwner {
        if (newSettler == address(0)) revert ZeroAddress();
        emit SettlerUpdated(settler, newSettler);
        settler = newSettler;
    }

    /// @notice Hand the owner (key-rotation) role to a new address.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
    }

    // --------------------------------------------------------------------- //
    //                          Internal: EIP-712                            //
    // --------------------------------------------------------------------- //

    function _computeDomainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes("FanGuard CoverPool")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    /// @dev Recover `digest`'s signer from a 65-byte signature and require it is the
    ///      settler. Includes the full minimal guard set for raw ecrecover: exact
    ///      length, low-half `s` (no malleability), `v` in {27,28}, and a non-zero
    ///      recovered address (ecrecover returns 0 on failure).
    function _requireSettlerSig(bytes32 digest, bytes calldata sig) internal view {
        if (sig.length != 65) revert InvalidSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (uint256(s) > SECP256K1_HALF_ORDER) revert MalleableSignature();
        if (v != 27 && v != 28) revert BadV();
        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
        if (signer != settler) revert NotSettler();
    }

    // --------------------------------------------------------------------- //
    //                       Internal: ERC-20 plumbing                       //
    // --------------------------------------------------------------------- //

    function _balance() internal view returns (uint256) {
        (bool ok, bytes memory data) = collateral.staticcall(abi.encodeWithSelector(0x70a08231, address(this))); // balanceOf(address)
        if (!ok || data.length < 32) revert TransferFailed();
        return abi.decode(data, (uint256));
    }

    /// @dev transfer(address,uint256); tolerates bool-returning and no-return tokens.
    function _safeTransfer(address to, uint256 amount) internal {
        (bool ok, bytes memory data) = collateral.call(abi.encodeWithSelector(0xa9059cbb, to, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    /// @dev transferFrom(address,address,uint256); tolerates bool/no-return tokens.
    function _safeTransferFrom(address from, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = collateral.call(abi.encodeWithSelector(0x23b872dd, from, to, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }
}
