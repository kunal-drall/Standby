// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AllowlistRegistry} from "./AllowlistRegistry.sol";
import {Roles} from "./Roles.sol";

/// @title BidBook
/// @notice Holds allowlisted buyers' USDT bids. A bid has a fixed discount to NAV and a notice period:
/// after `requestExit`, the USDT stays locked until the notice ends, and reserved USDT is never
/// withdrawable. Only the market reserves, releases and fills.
contract BidBook is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Bid {
        address buyer;
        uint256 amount; // USDT held for this bid, reserved part included
        uint256 reserved; // part of `amount` reserved by open loans
        uint16 discountBps;
        uint40 notice;
        uint40 exitAt; // 0 until the buyer requests an exit
        bool closed;
    }

    uint256 public constant MAX_OPEN_BIDS = 32;

    IERC20 public immutable usdt;
    AllowlistRegistry public immutable registry;
    uint16 public immutable maxDiscountBps;
    uint40 public immutable minNotice;
    address private immutable _deployer;

    address public market;

    Bid[] private _bids;
    /// @dev Open bid ids, cheapest discount first, ties by id (oldest first).
    uint256[] private _open;

    event MarketSet(address market);
    event BidPosted(
        uint256 indexed bidId, address indexed buyer, uint256 amount, uint16 discountBps, uint40 notice
    );
    event ExitRequested(uint256 indexed bidId, uint40 exitAt);
    event BidWithdrawn(uint256 indexed bidId, uint256 amount);
    event Reserved(uint256 indexed bidId, uint256 indexed loanId, uint256 amount);
    event Released(uint256 indexed bidId, uint256 amount);
    event Filled(uint256 indexed bidId, uint256 usdtAmount);

    error NotBuyer();
    error NotBidOwner();
    error NotMarket();
    error NotDeployer();
    error MarketAlreadySet();
    error ZeroAddress();
    error ZeroAmount();
    error UnknownBid();
    error BidClosed();
    error ExitAlreadyRequested();
    error ExitNotRequested();
    error NoticeNotOver();
    error ExceedsUnreserved();
    error ExceedsReserved();
    error DiscountTooHigh();
    error NoticeTooShort();
    error TooManyBids();
    error InsufficientCapacity();

    modifier onlyMarket() {
        if (msg.sender != market) revert NotMarket();
        _;
    }

    constructor(address usdt_, address registry_, uint16 maxDiscountBps_, uint40 minNotice_) {
        if (usdt_ == address(0) || registry_ == address(0)) revert ZeroAddress();
        if (maxDiscountBps_ >= 10_000) revert DiscountTooHigh();
        usdt = IERC20(usdt_);
        registry = AllowlistRegistry(registry_);
        maxDiscountBps = maxDiscountBps_;
        minNotice = minNotice_;
        _deployer = msg.sender;
    }

    /// @notice Sets the market once. Only the deployer can call it.
    function setMarket(address market_) external {
        if (msg.sender != _deployer) revert NotDeployer();
        if (market != address(0)) revert MarketAlreadySet();
        if (market_ == address(0)) revert ZeroAddress();
        market = market_;
        emit MarketSet(market_);
    }

    // ---------------------------------------------------------------- buyers

    /// @notice Locks `amount` USDT in a new bid. The caller must hold the BUYER role.
    function postBid(uint256 amount, uint16 discountBps, uint40 notice)
        external
        nonReentrant
        returns (uint256 bidId)
    {
        if (!registry.hasRole(msg.sender, Roles.BUYER)) revert NotBuyer();
        if (amount == 0) revert ZeroAmount();
        if (discountBps > maxDiscountBps) revert DiscountTooHigh();
        if (notice < minNotice) revert NoticeTooShort();
        if (_open.length >= MAX_OPEN_BIDS) revert TooManyBids();

        bidId = _bids.length;
        _bids.push(
            Bid({
                buyer: msg.sender,
                amount: amount,
                reserved: 0,
                discountBps: discountBps,
                notice: notice,
                exitAt: 0,
                closed: false
            })
        );
        _insertOpen(bidId, discountBps);
        emit BidPosted(bidId, msg.sender, amount, discountBps, notice);

        usdt.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Starts the notice period. The bid keeps backing loans that end before `exitAt`.
    function requestExit(uint256 bidId) external {
        Bid storage b = _bid(bidId);
        if (b.buyer != msg.sender) revert NotBidOwner();
        if (b.closed) revert BidClosed();
        if (b.exitAt != 0) revert ExitAlreadyRequested();
        uint40 exitAt = SafeCast.toUint40(block.timestamp + b.notice);
        b.exitAt = exitAt;
        emit ExitRequested(bidId, exitAt);
    }

    /// @notice Withdraws unreserved USDT once the notice period has ended.
    function withdraw(uint256 bidId, uint256 amount) external nonReentrant {
        Bid storage b = _bid(bidId);
        if (b.buyer != msg.sender) revert NotBidOwner();
        if (b.closed) revert BidClosed();
        if (b.exitAt == 0) revert ExitNotRequested();
        if (block.timestamp < b.exitAt) revert NoticeNotOver();
        if (amount == 0) revert ZeroAmount();
        if (amount > b.amount - b.reserved) revert ExceedsUnreserved();

        b.amount -= amount;
        if (b.amount == 0) _close(bidId, b);
        emit BidWithdrawn(bidId, amount);

        usdt.safeTransfer(msg.sender, amount);
    }

    // ---------------------------------------------------------------- market

    /// @notice Reserves `needed` USDT for `loanId` from bids that still back loans ending at `until`,
    /// cheapest discount first. Reverts if the free capacity is short.
    function reserve(uint256 loanId, uint40 until, uint256 needed)
        external
        onlyMarket
        returns (uint256[] memory bidIds, uint256[] memory amounts)
    {
        if (needed == 0) revert ZeroAmount();
        uint256 n = _open.length;
        bidIds = new uint256[](n);
        amounts = new uint256[](n);
        uint256 count;
        uint256 remaining = needed;

        for (uint256 i; i < n && remaining > 0; ++i) {
            uint256 id = _open[i];
            Bid storage b = _bids[id];
            if (!_backs(b, until)) continue;
            uint256 free = b.amount - b.reserved;
            if (free == 0) continue;
            uint256 take = free < remaining ? free : remaining;
            b.reserved += take;
            remaining -= take;
            bidIds[count] = id;
            amounts[count] = take;
            ++count;
            emit Reserved(id, loanId, take);
        }
        if (remaining > 0) revert InsufficientCapacity();

        assembly ("memory-safe") {
            mstore(bidIds, count)
            mstore(amounts, count)
        }
    }

    /// @notice Returns reserved USDT to the bid's free balance.
    function release(uint256 bidId, uint256 amount) external onlyMarket {
        Bid storage b = _bid(bidId);
        if (amount > b.reserved) revert ExceedsReserved();
        b.reserved -= amount;
        emit Released(bidId, amount);
    }

    /// @notice Pays `usdtAmount` of the bid's reserved USDT to `to` (the market, on settlement).
    function fill(uint256 bidId, uint256 usdtAmount, address to) external onlyMarket nonReentrant {
        Bid storage b = _bid(bidId);
        if (usdtAmount > b.reserved) revert ExceedsReserved();
        b.reserved -= usdtAmount;
        b.amount -= usdtAmount;
        if (b.amount == 0) _close(bidId, b);
        emit Filled(bidId, usdtAmount);

        usdt.safeTransfer(to, usdtAmount);
    }

    // ---------------------------------------------------------------- views

    /// @notice Unreserved USDT in open bids that will still be locked at `until` and whose buyer
    /// still holds the BUYER role.
    function freeCapacity(uint40 until) external view returns (uint256 free) {
        uint256 n = _open.length;
        for (uint256 i; i < n; ++i) {
            Bid storage b = _bids[_open[i]];
            if (_backs(b, until)) free += b.amount - b.reserved;
        }
    }

    function getBid(uint256 bidId) external view returns (Bid memory) {
        return _bid(bidId);
    }

    function bidCount() external view returns (uint256) {
        return _bids.length;
    }

    /// @notice Open bid ids, cheapest discount first.
    function openBidIds() external view returns (uint256[] memory) {
        return _open;
    }

    // ---------------------------------------------------------------- internal

    function _bid(uint256 bidId) private view returns (Bid storage) {
        if (bidId >= _bids.length) revert UnknownBid();
        return _bids[bidId];
    }

    /// @dev A bid backs a loan ending at `until` if it is not in exit, or unlocks after `until`,
    /// and its buyer is still allowlisted as a buyer.
    function _backs(Bid storage b, uint40 until) private view returns (bool) {
        if (b.exitAt != 0 && b.exitAt <= until) return false;
        return registry.hasRole(b.buyer, Roles.BUYER);
    }

    function _insertOpen(uint256 bidId, uint16 discountBps) private {
        uint256 n = _open.length;
        uint256 pos = n;
        for (uint256 i; i < n; ++i) {
            if (_bids[_open[i]].discountBps > discountBps) {
                pos = i;
                break;
            }
        }
        _open.push(bidId);
        for (uint256 i = n; i > pos; --i) {
            _open[i] = _open[i - 1];
        }
        _open[pos] = bidId;
    }

    function _close(uint256 bidId, Bid storage b) private {
        b.closed = true;
        uint256 n = _open.length;
        for (uint256 i; i < n; ++i) {
            if (_open[i] == bidId) {
                for (uint256 j = i; j + 1 < n; ++j) {
                    _open[j] = _open[j + 1];
                }
                _open.pop();
                return;
            }
        }
    }
}
