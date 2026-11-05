# Submission

## Short description (≤ 100 characters)

Lend against restricted tokenized assets: allowlisted buyers lock USDT to buy the collateral on default.

## Long description

Lenders accept tokenized real-world assets but cap them low, because when a loan defaults nobody has committed to buy collateral that only approved wallets may hold. A restricted fund share cannot be dumped on a DEX, and redemptions run on the issuer's schedule.

Standby lines the buyer up before the loan is made. Allowlisted buyers lock USDT in bids at a fixed discount to NAV, with a notice period before they can leave. A borrower pledges fund shares and may borrow the lower of a price-based limit (85% of NAV × shares) and the committed bid capacity after a 10% haircut. Opening the loan reserves specific bids, cheapest discount first, and reserved USDT can never be withdrawn while the loan is open.

Repayment is one transaction: USDT to the pool, a commitment fee to the buyers, reservations released, shares back to the borrower. Default (past maturity plus grace, or debt above 90% of collateral value at a fresh NAV) is also one transaction: each reserved bid pays the pool and receives shares at its own price, delivery versus payment, and any leftover shares go back to the borrower. The asset contract refuses any transfer to a wallet off the allowlist, so shares can only land with approved buyers.

Five small contracts on Whitechain Sepolia (AllowlistRegistry, RestrictedAsset, NavOracle, BidBook, StandbyMarket), a keeper that settles defaults and serves a read API, a web app with a page per party, and a docs site. Every payment uses the official test USDT.

Why on-chain stablecoin settlement: the asset and the USDT move in one transaction only if both live on the same chain; a bank rail cannot deliver a restricted token against payment atomically, and lenders can verify buyers' locked USDT on-chain before they lend.

## Video script (about 3:40, live narration, every party shown)

| Time | Screen | Say |
|---|---|---|
| 0:00 | Overview page | "Lenders cap tokenized fund shares low because only approved wallets can hold them, so nobody can sell them in a default. Standby lines the buyer up first." |
| 0:20 | Issuer page | Show the allowlist and post NAV 1.02. Click "Try transfer" to an outside wallet: it fails with NotAllowed. Open the explorer link. "The transfer rule is in the contract." |
| 0:50 | Buyer page (Buyer 1, then Buyer 2) | Show the two bids: 600 USDT at 3% and 500 USDT at 5%, 10-minute notice. "This USDT is locked; the discount can't change." |
| 1:20 | Lender page, then Capacity | Show the 1,500 USDT deposit, then committed, reserved and free capacity. |
| 1:40 | Borrower page | Pledge 1,000 shares. "Price limit 867, capacity limit about 990: the lower one wins." Open the loan; show the reservation on Capacity (the 3% bid is used first). |
| 2:10 | Buyer page | Buyer 1 requests an exit and clicks Withdraw: NoticeNotOver. "The commitment holds." |
| 2:30 | Borrower page | Repay. One transaction: shares back, pool paid, buyers get the commitment fee. Explorer link. |
| 3:00 | Activity page | A second loan opened before recording is past due; the keeper settled it: buyers paid USDT and received shares, the lender is whole, leftover shares returned. Explorer link for the settle transaction. |
| 3:40 | Overview | "The buyer is lined up before the loan is made." |

Loan term plus grace is 17 minutes, longer than the slot: open the second loan at least 20 minutes before recording, and record the default path in advance as a fallback.

## Links

- Repository: https://github.com/kunal-drall/Standby
- App: TODO(kunal) after `npx vercel deploy --prod` from `web/`
- Docs: TODO(kunal) after `npx vercel deploy --prod` from `site/`
- Contracts and transactions: README "Deployments" and "Transactions" (filled after the testnet deploy)

## Team

TODO(kunal): names with Telegram and X handles.
