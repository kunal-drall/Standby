// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AllowlistRegistry} from "./AllowlistRegistry.sol";
import {BidBook} from "./BidBook.sol";
import {NavOracle} from "./NavOracle.sol";
import {RestrictedAsset} from "./RestrictedAsset.sol";
import {Roles} from "./Roles.sol";

/// @title StandbyMarket
/// @notice USDT lending pool and loans against the restricted asset. A loan borrows at most the lower
/// of a price-based limit and the committed bid capacity it can reserve after a haircut. Repayment and
/// default settlement each happen in one transaction. Parameters are immutable; there is no admin.
contract StandbyMarket is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum LoanState {
        None,
        Open,
        Repaid,
        Settled
    }

    struct Loan {
        address borrower;
        uint256 collateral;
        uint256 principal;
        uint40 openedAt;
        uint40 maturity;
        LoanState state;
    }

    struct Params {
        uint16 maxLtvBps;
        uint16 liqThresholdBps;
        uint16 haircutBps;
        uint16 rateBps;
        uint16 commitFeeBps;
        uint40 loanTerm;
        uint40 grace;
        uint40 maxNavAge;
    }

    struct Reservation {
        uint256 bidId;
        uint256 amount;
    }

    /// @dev Per-reservation outcome of a settlement, computed before any state changes.
    struct Fill {
        address buyer;
        uint256 take; // USDT taken from the bid
        uint256 shares; // asset shares delivered to the buyer
    }

    uint256 private constant BPS = 10_000;
    uint256 private constant YEAR = 365 days;
    uint256 private constant WAD = 1e18;

    IERC20 public immutable usdt;
    RestrictedAsset public immutable asset;
    NavOracle public immutable oracle;
    BidBook public immutable bidBook;
    AllowlistRegistry private immutable _registry;

    uint16 private immutable _maxLtvBps;
    uint16 private immutable _liqThresholdBps;
    uint16 private immutable _haircutBps;
    uint16 private immutable _rateBps;
    uint16 private immutable _commitFeeBps;
    uint40 private immutable _loanTerm;
    uint40 private immutable _grace;
    uint40 private immutable _maxNavAge;

    Loan[] private _loans;
    mapping(uint256 loanId => Reservation[]) private _reservations;

    mapping(address lender => uint256) public sharesOf;
    uint256 public totalShares;
    /// @notice Idle USDT the pool can lend or pay out. Tracked, not read from the balance.
    uint256 public cash;
    /// @notice Outstanding principal of open loans.
    uint256 public totalPrincipal;
    /// @dev Sum of principal * openedAt over open loans, for aggregate interest accrual.
    uint256 private _principalTime;

    event Deposited(address indexed lender, uint256 assets, uint256 shares);
    event Withdrawn(address indexed lender, uint256 assets, uint256 shares);
    event LoanOpened(
        uint256 indexed loanId,
        address indexed borrower,
        uint256 collateral,
        uint256 principal,
        uint40 maturity
    );
    event LoanRepaid(uint256 indexed loanId, uint256 paid, uint256 commitmentFees);
    event LoanSettled(
        uint256 indexed loanId, uint256 recovered, uint256 collateralToBuyers, uint256 collateralReturned
    );
    event Shortfall(uint256 indexed loanId, uint256 amount);

    error ZeroAddress();
    error BadConfig();
    error BadParams();
    error ZeroAmount();
    error ZeroShares();
    error InsufficientShares();
    error AssetPaused();
    error StaleNav();
    error AboveLtv();
    error InsufficientCash();
    error UnknownLoan();
    error LoanNotOpen();
    error NotBorrower();
    error NotSettleable();

    constructor(address usdt_, address asset_, address oracle_, address bidBook_, Params memory p) {
        if (usdt_ == address(0) || asset_ == address(0) || oracle_ == address(0) || bidBook_ == address(0)) {
            revert ZeroAddress();
        }
        RestrictedAsset a = RestrictedAsset(asset_);
        BidBook bb = BidBook(bidBook_);
        if (address(bb.usdt()) != usdt_ || address(bb.registry()) != address(a.registry())) {
            revert BadConfig();
        }
        if (
            p.maxLtvBps == 0 || p.maxLtvBps >= p.liqThresholdBps || p.liqThresholdBps > BPS
                || p.haircutBps >= BPS || p.loanTerm == 0 || p.maxNavAge == 0
        ) revert BadParams();

        usdt = IERC20(usdt_);
        asset = a;
        oracle = NavOracle(oracle_);
        bidBook = bb;
        _registry = a.registry();

        _maxLtvBps = p.maxLtvBps;
        _liqThresholdBps = p.liqThresholdBps;
        _haircutBps = p.haircutBps;
        _rateBps = p.rateBps;
        _commitFeeBps = p.commitFeeBps;
        _loanTerm = p.loanTerm;
        _grace = p.grace;
        _maxNavAge = p.maxNavAge;
    }

    // ---------------------------------------------------------------- pool

    function deposit(uint256 assets) external nonReentrant returns (uint256 shares) {
        if (assets == 0) revert ZeroAmount();
        shares = assets * (totalShares + 1) / (totalAssets() + 1);
        if (shares == 0) revert ZeroShares();

        sharesOf[msg.sender] += shares;
        totalShares += shares;
        cash += assets;
        emit Deposited(msg.sender, assets, shares);

        usdt.safeTransferFrom(msg.sender, address(this), assets);
    }

    function withdraw(uint256 shares) external nonReentrant returns (uint256 assets) {
        if (shares == 0) revert ZeroAmount();
        if (shares > sharesOf[msg.sender]) revert InsufficientShares();
        assets = convertToAssets(shares);
        if (assets > cash) revert InsufficientCash();

        sharesOf[msg.sender] -= shares;
        totalShares -= shares;
        cash -= assets;
        emit Withdrawn(msg.sender, assets, shares);

        usdt.safeTransfer(msg.sender, assets);
    }

    /// @notice Idle USDT + outstanding principal + interest accrued on open loans.
    function totalAssets() public view returns (uint256) {
        uint256 accrued = (totalPrincipal * block.timestamp - _principalTime) * _rateBps / (BPS * YEAR);
        return cash + totalPrincipal + accrued;
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        return shares * (totalAssets() + 1) / (totalShares + 1);
    }

    // ---------------------------------------------------------------- loans

    /// @return priceLimit maxLtv × collateral value at the latest NAV.
    /// @return capacityLimit Largest principal whose reservation fits the free bid capacity.
    /// @return maxBorrow The lower of the two.
    function previewLimits(uint256 collateral)
        external
        view
        returns (uint256 priceLimit, uint256 capacityLimit, uint256 maxBorrow)
    {
        (uint256 nav,) = oracle.latest();
        priceLimit = _value(collateral, nav) * _maxLtvBps / BPS;
        uint40 end = uint40(block.timestamp) + _loanTerm + _grace;
        capacityLimit = _capacityLimit(bidBook.freeCapacity(end));
        maxBorrow = Math.min(priceLimit, capacityLimit);
    }

    function openLoan(uint256 collateral, uint256 principal) external nonReentrant returns (uint256 loanId) {
        if (collateral == 0 || principal == 0) revert ZeroAmount();
        if (asset.paused()) revert AssetPaused();
        (uint256 nav, uint40 updatedAt) = oracle.latest();
        if (!_fresh(updatedAt)) revert StaleNav();
        if (principal > _value(collateral, nav) * _maxLtvBps / BPS) revert AboveLtv();
        if (principal > cash) revert InsufficientCash();

        uint40 openedAt = uint40(block.timestamp);
        uint40 maturity = openedAt + _loanTerm;
        uint256 needed = _needed(principal);

        loanId = _loans.length;
        _loans.push(
            Loan({
                borrower: msg.sender,
                collateral: collateral,
                principal: principal,
                openedAt: openedAt,
                maturity: maturity,
                state: LoanState.Open
            })
        );
        cash -= principal;
        totalPrincipal += principal;
        _principalTime += principal * openedAt;

        (uint256[] memory ids, uint256[] memory amounts) = bidBook.reserve(loanId, maturity + _grace, needed);
        Reservation[] storage rs = _reservations[loanId];
        for (uint256 i; i < ids.length; ++i) {
            rs.push(Reservation({bidId: ids[i], amount: amounts[i]}));
        }
        emit LoanOpened(loanId, msg.sender, collateral, principal, maturity);

        IERC20(address(asset)).safeTransferFrom(msg.sender, address(this), collateral);
        usdt.safeTransfer(msg.sender, principal);
    }

    /// @notice Principal plus simple interest to now (0 unless the loan is open).
    function due(uint256 loanId) external view returns (uint256) {
        Loan storage l = _loan(loanId);
        if (l.state != LoanState.Open) return 0;
        return _dueAt(l, block.timestamp);
    }

    /// @notice What `repay` pulls now: `dueNow + fees`, fees going to the reserved bids' buyers.
    function quoteRepay(uint256 loanId) external view returns (uint256 dueNow, uint256 fees) {
        Loan storage l = _loan(loanId);
        if (l.state != LoanState.Open) return (0, 0);
        dueNow = _dueAt(l, block.timestamp);
        Reservation[] storage rs = _reservations[loanId];
        uint256 elapsed = block.timestamp - l.openedAt;
        for (uint256 i; i < rs.length; ++i) {
            fees += _fee(rs[i].amount, elapsed);
        }
    }

    /// @notice Repays in one transaction: USDT to the pool, commitment fees to buyers, reservations
    /// released, collateral back to the borrower.
    function repay(uint256 loanId) external nonReentrant {
        Loan storage l = _loan(loanId);
        if (l.state != LoanState.Open) revert LoanNotOpen();
        if (msg.sender != l.borrower) revert NotBorrower();

        uint256 dueNow = _dueAt(l, block.timestamp);
        uint256 elapsed = block.timestamp - l.openedAt;
        Reservation[] storage rs = _reservations[loanId];
        uint256 n = rs.length;
        uint256[] memory feeOf = new uint256[](n);
        address[] memory buyers = new address[](n);
        uint256 fees;
        for (uint256 i; i < n; ++i) {
            feeOf[i] = _fee(rs[i].amount, elapsed);
            fees += feeOf[i];
            buyers[i] = bidBook.getBid(rs[i].bidId).buyer;
        }

        l.state = LoanState.Repaid;
        cash += dueNow;
        _closePrincipal(l);
        emit LoanRepaid(loanId, dueNow, fees);

        usdt.safeTransferFrom(msg.sender, address(this), dueNow + fees);
        for (uint256 i; i < n; ++i) {
            bidBook.release(rs[i].bidId, rs[i].amount);
            if (feeOf[i] > 0) usdt.safeTransfer(buyers[i], feeOf[i]);
        }
        IERC20(address(asset)).safeTransfer(l.borrower, l.collateral);
    }

    /// @notice True when the loan is open and past maturity plus grace, or (with fresh NAV) its debt
    /// exceeds the liquidation threshold of its collateral value.
    function isSettleable(uint256 loanId) public view returns (bool) {
        if (loanId >= _loans.length) return false;
        Loan storage l = _loans[loanId];
        if (l.state != LoanState.Open) return false;
        if (block.timestamp > uint256(l.maturity) + _grace) return true;
        (uint256 nav, uint40 updatedAt) = oracle.latest();
        if (!_fresh(updatedAt)) return false;
        return _dueAt(l, block.timestamp) * BPS > _value(l.collateral, nav) * _liqThresholdBps;
    }

    /// @notice Settles a defaulted loan in one transaction: each reserved bid, cheapest first, pays the
    /// pool and receives collateral at its own price; unused reservations are released and leftover
    /// collateral returns to the borrower. Anyone may call it.
    function settle(uint256 loanId) external nonReentrant {
        if (!isSettleable(loanId)) revert NotSettleable();
        Loan storage l = _loans[loanId];
        Reservation[] storage rs = _reservations[loanId];

        (Fill[] memory fills, uint256 recovered, uint256 toBuyers, uint256 remaining) = _planSettlement(l, rs);
        uint256 collateralLeft = l.collateral - toBuyers;

        l.state = LoanState.Settled;
        cash += recovered;
        _closePrincipal(l);
        if (remaining > 0) emit Shortfall(loanId, remaining);
        emit LoanSettled(loanId, recovered, toBuyers, collateralLeft);

        IERC20 share = IERC20(address(asset));
        for (uint256 i; i < fills.length; ++i) {
            uint256 bidId = rs[i].bidId;
            Fill memory f = fills[i];
            if (f.take > 0) {
                bidBook.fill(bidId, f.take, address(this));
                share.safeTransfer(f.buyer, f.shares);
            }
            uint256 unused = rs[i].amount - f.take;
            if (unused > 0) bidBook.release(bidId, unused);
        }
        if (collateralLeft > 0) share.safeTransfer(l.borrower, collateralLeft);
    }

    // ---------------------------------------------------------------- views

    function getLoan(uint256 loanId)
        external
        view
        returns (Loan memory loan, uint256[] memory bidIds, uint256[] memory reserved)
    {
        loan = _loan(loanId);
        Reservation[] storage rs = _reservations[loanId];
        bidIds = new uint256[](rs.length);
        reserved = new uint256[](rs.length);
        for (uint256 i; i < rs.length; ++i) {
            bidIds[i] = rs[i].bidId;
            reserved[i] = rs[i].amount;
        }
    }

    function loanCount() external view returns (uint256) {
        return _loans.length;
    }

    function params() external view returns (Params memory) {
        return Params({
            maxLtvBps: _maxLtvBps,
            liqThresholdBps: _liqThresholdBps,
            haircutBps: _haircutBps,
            rateBps: _rateBps,
            commitFeeBps: _commitFeeBps,
            loanTerm: _loanTerm,
            grace: _grace,
            maxNavAge: _maxNavAge
        });
    }

    // ---------------------------------------------------------------- internal

    function _loan(uint256 loanId) private view returns (Loan storage) {
        if (loanId >= _loans.length) revert UnknownLoan();
        return _loans[loanId];
    }

    function _fresh(uint40 updatedAt) private view returns (bool) {
        return updatedAt != 0 && block.timestamp - updatedAt <= _maxNavAge;
    }

    function _value(uint256 collateral, uint256 nav) private pure returns (uint256) {
        return collateral * nav / WAD;
    }

    function _dueAt(Loan storage l, uint256 t) private view returns (uint256) {
        return l.principal + l.principal * _rateBps * (t - l.openedAt) / (BPS * YEAR);
    }

    /// @dev Debt at maturity + grace for a loan opened now.
    function _dueAtEnd(uint256 principal) private view returns (uint256) {
        return principal + principal * _rateBps * (uint256(_loanTerm) + _grace) / (BPS * YEAR);
    }

    /// @dev needed = ceil(dueAt(maturity + grace) * 1e4 / (1e4 - haircut)).
    function _needed(uint256 principal) private view returns (uint256) {
        return Math.ceilDiv(_dueAtEnd(principal) * BPS, BPS - _haircutBps);
    }

    /// @dev Largest principal p with _needed(p) <= free. _needed(p) <= free exactly when
    /// _dueAtEnd(p) <= floor(free * (1e4 - h) / 1e4); the floors leave at most one more unit of room.
    function _capacityLimit(uint256 free) private view returns (uint256 p) {
        uint256 maxDue = free * (BPS - _haircutBps) / BPS;
        uint256 d = BPS * YEAR;
        uint256 k = uint256(_rateBps) * (uint256(_loanTerm) + _grace);
        p = maxDue * d / (d + k);
        if (_dueAtEnd(p + 1) <= maxDue) p += 1;
    }

    function _fee(uint256 reserved, uint256 elapsed) private view returns (uint256) {
        return reserved * _commitFeeBps * elapsed / (BPS * YEAR);
    }

    function _closePrincipal(Loan storage l) private {
        totalPrincipal -= l.principal;
        _principalTime -= l.principal * l.openedAt;
    }

    /// @dev Works out every fill before any state changes, so settle can follow
    /// checks-effects-interactions. A bid whose buyer no longer holds BUYER is skipped.
    function _planSettlement(Loan storage l, Reservation[] storage rs)
        private
        view
        returns (Fill[] memory fills, uint256 recovered, uint256 toBuyers, uint256 remaining)
    {
        (uint256 nav,) = oracle.latest();
        remaining = _dueAt(l, block.timestamp);
        uint256 collateralLeft = l.collateral;
        uint256 n = rs.length;
        fills = new Fill[](n);

        for (uint256 i; i < n; ++i) {
            BidBook.Bid memory b = bidBook.getBid(rs[i].bidId);
            fills[i].buyer = b.buyer;
            if (remaining == 0 || collateralLeft == 0) continue;
            if (!_registry.hasRole(b.buyer, Roles.BUYER)) continue;

            uint256 price = nav * (BPS - b.discountBps) / BPS;
            if (price == 0) continue;
            uint256 take = Math.min(rs[i].amount, remaining);
            uint256 shares = Math.ceilDiv(take * WAD, price);
            if (shares > collateralLeft) {
                shares = collateralLeft;
                take = shares * price / WAD;
            }
            if (take == 0) continue;

            fills[i].take = take;
            fills[i].shares = shares;
            remaining -= take;
            recovered += take;
            collateralLeft -= shares;
            toBuyers += shares;
        }
    }
}
