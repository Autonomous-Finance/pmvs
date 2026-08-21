# PMVS venue profile: `venue/polymarket/1`

```
pmvs-part:      profile (venue)
profile-id:     venue/polymarket/1
version:        1 (draft)
status:         Pre-EIP review draft
author:         Ivan Morozov (Zeit Finance)
created:        2026-08-18
requires:       PMVS Parts I through III; position/gnosis-ctf/1
```

Venue facts can change while the PMVS core remains stable. This draft was checked against Polymarket's primary documentation on 2026-08-21. Once this profile is released, a material contract, API, collateral, or fee change creates a new profile id. Old records keep this one.

A venue profile must supply the three capabilities Parts II and III consume: observable inventory (position tokens whose balances are on-chain readable), an executable bid surface (a displayed order book to cross), and a resolution signal (an on-chain finality and payout source). Venues without a limit-order book (AMM or RFQ venues) cannot reuse this profile's cross mark; they need their own profile defining the settlement-bearing mark.

## Outcome-position protocol

This profile covers Polymarket CTF positions traded through the CLOB. It covers standard binary markets and negative-risk binary markets. Under this profile, `portfolio.positionFormats` MUST equal `["position/gnosis-ctf/1"]`. The CTF position id is the ERC-1155 token id used in balances, transfers, approvals, CLOB orders, and redemption.

Standard and negative-risk markets use the same `ConditionalTokens` contract. Their exchange and conversion paths differ. Each supported position is binary, uses the UMA Adapter below as its oracle, sets `outcomeSlotCount = 2`, has a zero `parentCollectionId`, and uses `indexSet = 1` or `indexSet = 2`. Current positions use pUSD as collateral. A position with another oracle or a nonzero legacy-collateral position requires a profile that states its exact resolution, redemption, and accounting-asset conversion route.

This profile does not cover Polymarket Combo positions. Combo YES and NO tokens are ERC-1155 tokens issued by a separate `PositionManager` under the Positions Framework. They are not CTF positions. Combo execution uses an RFQ flow, not the CLOB book used by PMVS-M1 here. Supporting Combo positions therefore requires a separate position profile and a venue profile with a settlement-bearing RFQ valuation rule.

## Chain and contracts (Polygon PoS, chainId 137)

| Role | Address |
|---|---|
| Conditional Tokens Framework (ERC-1155 positions) | `0x4d97dcd97ec945f40cf65f87097ace5ea0476045` |
| CTF Exchange | `0xe111180000d2663c0091e4f400237545b87b996b` |
| Neg-risk Exchange | `0xe2222d279d744050d28e00520010520000310f59` |
| Neg-risk Adapter, CLOB v1, deprecated | `0xd91e80cf2e7be2e162c6513ced06f1dd0da35296` |
| pUSD proxy | `0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb` |
| pUSD implementation (observed 2026-08-21) | `0x6bbcef9f7ef3b6c592c99e0f206a0de94ad0925f` |
| Collateral onramp (USDC.e to venue dollar) | `0x93070a847efef7f70739046a929d47a521f5b8ee` |
| Collateral offramp (venue dollar to USDC.e) | `0x2957922eb93258b93368531d39facca3b4dc5854` |
| CTF Collateral Adapter | `0xada100db00ca00073811820692005400218fce1f` |
| Neg-risk CTF Collateral Adapter | `0xada2005600dec949baf300f4c6120000bdb6eaab` |
| UMA Adapter, CTF condition oracle | `0x6a9d222616c90fca5754cd1333cfd9b7fb6a4f74` |
| Gnosis Safe Factory, reference custody factory | `0xaacfeea03eb1561c4e67d661e40682bd20e3541b` |
| Positions Framework PositionManager proxy, exclusion sentinel | `0x006f54f7f9a22e0000cc2ab60031000000ae9fef` |
| PositionManager implementation (observed 2026-08-21) | `0x30c038f0dae8dcc3e6ad51d016f50821d32cb87e` |
| Combo Exchange proxy, outside this profile | `0xe3333700ca9d93003f00f0f71f8515005f6c00aa` |
| Combo Exchange implementation (observed 2026-08-21) | `0x7345c6842b244926125ed4054905cac49620b5dc` |
| AutoRedeemer proxy, approval sentinel | `0xa1200000d0002264c9a1698e001292d00e1b00af` |
| AutoRedeemer implementation (observed 2026-08-21) | `0x64860bfd14fccaac09cd36f347784a9616afb66c` |

Rows marked as outside, exclusion, or approval sentinels define an explicit boundary. Listing them does not activate Combo support. Capture pins proxy implementations and runtime-code hashes rather than trusting this dated table.

The collateral registry contains two 6-decimal tokens: pUSD at the proxy above and USDC.e at `0x2791bca1f2de4661ed88a30c99a7a9449aa84174`. Polymarket documents pUSD as a USDC claim and supplies amount-preserving wrap and unwrap calls. The pinned pUSD source also exposes role-gated minting and owner-authorized upgrades. PMVS therefore does not treat the documentation alone as proof of current redeemability.

Under this profile, converting pUSD amounts to USDC.e at 1:1 is an explicit risk assumption. A fresh valuation supports that assumption only when pinned chain reads establish all of these facts:

1. The component record matches the proxy implementation, proxy authority, pUSD implementation code, ramp code, and ramp authority state.
2. pUSD reports 6 decimals and its immutable `USDCE()` value equals USDC.e.
3. The offramp reports `COLLATERAL_TOKEN() == pUSD`, has the required pUSD wrapper role, and reports `paused(USDC.e) == false`.
4. `USDC.e.balanceOf(pUSD.VAULT())` and `USDC.e.allowance(pUSD.VAULT(), pUSD)` each cover all outstanding pUSD supply at the pinned block.
5. A deposit path that wraps USDC.e also checks the onramp's pUSD address, wrapper role, and USDC.e pause state.

A failed read, pause, role mismatch, code change, authority change, or reserve shortfall blocks fresh settlement under this profile. It does not turn pUSD or a pUSD-denominated position into zero. The record lists pUSD and USDC.e balances separately. These checks prove state at one block only. They do not guarantee that the backing or ramp stays available until a later payout, so records state this residual collateral risk.

Custody pattern: a per-vault venue-relayed Strategy Safe holds positions and venue collateral. The component record names the Safe as a contract account and pins its runtime code. The share-vault contract is not the position holder. Position token ids are CTF `uint256` ids.

## Inventory (Part III bindings)

- Transfer-log reconstruction runs over the CTF contract (`TransferSingle` and `TransferBatch`) from each custody account's proved checkpoint.
- Quantities come from `balanceOfBatch` on the CTF at the pinned valuation block. Venue Data-API sizes are `venueReportedSize` metadata only.
- Each venue position entry contains a `position` object that passes `position/gnosis-ctf/1`, including its `oracle`, `questionId`, and `outcomeSlotCount` fields. The surrounding venue entry names the CLOB asset and exchange route. The verifier requires the binary and root-position constraints above, applies the CTF derivations, and requires `position.positionId` to equal the book's `asset_id`. This binds the order book to the held ERC-1155 position and its payout asset.
- The Data API (`https://data-api.polymarket.com/positions`) applies server-side size filters. Because API sizes are non-normative this only affects metadata completeness, and capture MUST NOT apply any API-side filter to the normative set.

### Combo exclusion sentinel

1. Reconstruct the PositionManager token-id set for every custody account from its `TransferSingle` and `TransferBatch` logs.
2. Read every candidate id with PositionManager `balanceOfBatch` at the same pinned block as the CTF inventory.
3. Any nonzero PositionManager balance produces `UNSUPPORTED_POSITION_FORMAT`. It blocks valuation-dependent settlement under this profile. No dust exception applies.
4. A PositionManager `setApprovalForAll` approval does not prove that the Safe owns a Combo token. Record it as a custody power, but trigger the unsupported-position result only for a nonzero balance.
5. Pin all CTF and PositionManager operator approvals. At the ERC-1155 layer, an approved operator is authorized to move that token family. The record identifies the operator, its intended function, and the authority that can revoke it. This includes the CTF Exchange, Neg Risk CTF Exchange, Neg Risk Adapter, AutoRedeemer, and any other approved operator.

The strict balance rule permits a liveness attack through an unsolicited ERC-1155 transfer. A deployment MUST declare an unsupported-token response before accepting deposits. It may return an unsolicited token to its nonzero recorded sender in a disclosed transaction, then start a new pinned capture. It MUST NOT discard a token acquired by the strategy, a token with disputed ownership, or a position with material rights. Such a token requires an active profile, holder-preserving recovery, or wind-down. Until then, fresh valuation-dependent settlement remains blocked. Existing cancellation and funded-claim paths remain available according to the active settlement profile.

## Book capture (the executable bid surface)

Source: the CLOB API (`https://clob.polymarket.com`), `GET /book?token_id=…` per position token.

```
 bid ladder (descending price)         position size = 900
 ┌──────────────┬─────────┐
 │ price        │ qty     │   cumulative
 │ 0.42         │ 300     │   300   ← capture
 │ 0.40         │ 250     │   550   ← capture
 │ 0.37         │ 500     │  1050   ← capture (first level reaching size)
 │ 0.30         │ 800     │         ── may stop here; bidsTruncated: true
 └──────────────┴─────────┘
 If total displayed depth < size: capture the ENTIRE bid side.
 "unfilled remainder = 0" is only provable against an exhausted ladder.
```

1. **Raw-response preservation.** The exact response bytes of every book read that feeds a record MUST be retained and content-addressed: the hash goes in the record, and the bytes stay retrievable as a sidecar object under the storage profile. Normalized integer inputs (the ladders the engine consumes) are published inside the record, and the original decimal lexemes survive in the raw sidecar. Normalization is lossy, and only raw bytes can support later re-examination of a capture dispute.
2. **Ladder depth.** Bids MUST be captured from the best price downward through and including the first level at which cumulative bid quantity reaches the position's mark quantity. If total displayed depth is smaller, the entire bid side MUST be captured. `bidsTruncated: true` is lawful only when the cross fully filled within the captured depth. Under-capture is `INCOMPLETE_CAPTURE`.
3. Normalization: prices to `priceU6` in `[0, 10^6]`, quantities to base units, duplicate levels merged, strict descending order. Malformed levels (non-numeric, negative, a zero-price bid) invalidate the capture for that token: `DATA_UNAVAILABLE`, not "empty book". Ask-side capture is NOT required, since the cross mark never reads asks; implementations MAY retain asks in the raw sidecar only.
4. **Venue correlation fields.** Copy `market`, `asset_id`, `timestamp`, `hash`, `min_order_size`, `tick_size`, `neg_risk`, and `last_trade_price` from the response. Preserve their JSON types and lexemes in the raw sidecar. The hash is not a venue signature. A verifier treats it as an opaque correlation value and does not try to derive it from a truncated ladder.
5. Per-token capture timing follows Part III: request start and response end recorded, skew bounds applied.

## Resolution signal

- Finality: the CTF reports a nonzero payout denominator for the recorded condition id. This profile does not infer finality from an upstream UMA adapter or an API flag.
- Redemption-mark inputs: pinned-block payout numerators and denominator for the position's recorded `conditionId` and `indexSet`.
- Redemption execution: direct CTF redemption or the applicable CTF Collateral Adapter listed above. The record names the route, pins its code, and records the exact calldata and resulting collateral.
- Market metadata from venue APIs (closed flags, end dates) is context only and never a resolution authority.

## Venue fees

Current venue documentation gives the expected taker-fee shape `fee = shares * feeRate * price * (1 - price)`. It says rates vary by market category, makers pay no fee, and fees round to five decimal places. Those API-level facts are mutable. The exchange contract instead enforces an on-chain upper bound through `getMaxFeeRate()` in basis points.

For a vault selling one position as a taker, this profile defines:

```
maxFeeRateBps = exchange.getMaxFeeRate() at the pinned block
require 1 <= maxFeeRateBps <= 9_999
venueExitCost = floor(grossMark * maxFeeRateBps / 10_000)
mark          = grossMark - venueExitCost
```

The position entry names the exchange route. The record pins its code and the `getMaxFeeRate()` return value. In the pinned contract, zero disables the limit rather than the fee, so zero cannot support an M1 mark. A failed call, value outside `[1, 9999]`, or unknown route is `DATA_UNAVAILABLE`. This cost is the largest fee the pinned exchange configuration permits, not a prediction of the fee the operator will quote. It is intentionally more conservative than the category formula. A later fee-cap change triggers M1's rebuild rule.

Vector in 6-decimal collateral units: `grossMark = 50000000` and `maxFeeRateBps = 500` gives `venueExitCost = 2500000` and `mark = 47500000`. A one-unit gross mark at the same cap has zero cost after the contract's floor.

## Degraded modes (venue outage or shutdown)

The venue is a single centralized service, so its unavailability is a first-class state:

1. An API outage is `DATA_UNAVAILABLE` per Part III. An outage MUST NOT produce empty books, empty inventories, or zero marks, and no settlement that requires fresh valuation may execute against captures stale beyond their bounds.
2. A prolonged outage or announced shutdown triggers the deployment's declared degraded mode: block valuation-dependent deposits and rolls, and keep cancellation and claim paths open, since they need no venue. Where positions can still resolve on-chain (CTF resolution is on-chain), a resolution-only recovery MAY value and redeem resolved positions from chain state alone and wind the vault down under Part II's retirement records.
3. A venue shutdown never justifies marking open positions to zero. A side pocket requires a separate profile that allocates its rights before new flows. Without one, unresolved material positions block settlement and enter wind-down disclosure.

## Primary references

- [Polymarket contract addresses](https://docs.polymarket.com/resources/contracts)
- [How Polymarket CTF positions work](https://docs.polymarket.com/trading/positions/how-positions-work)
- [Polymarket combinatorial positions and the separate Positions Framework](https://docs.polymarket.com/trading/positions/combinatorial)
- [Polymarket Combo RFQ flow](https://docs.polymarket.com/trading/combos/overview)
- [Order-book response](https://docs.polymarket.com/api-reference/market-data/get-order-book)
- [pUSD wrapping and unwrapping](https://docs.polymarket.com/concepts/pusd)
- [CollateralToken source at `ccc0596`](https://github.com/Polymarket/ctf-exchange-v2/blob/ccc0596074f4dfd62c944fbca4de252893b82b4b/src/collateral/CollateralToken.sol)
- [CollateralOfframp source at `ccc0596`](https://github.com/Polymarket/ctf-exchange-v2/blob/ccc0596074f4dfd62c944fbca4de252893b82b4b/src/collateral/CollateralOfframp.sol)
- [Exchange fee cap source at `ccc0596`](https://github.com/Polymarket/ctf-exchange-v2/blob/ccc0596074f4dfd62c944fbca4de252893b82b4b/src/exchange/mixins/Fees.sol)
- [Exchange sell-fee settlement at `ccc0596`](https://github.com/Polymarket/ctf-exchange-v2/blob/ccc0596074f4dfd62c944fbca4de252893b82b4b/src/exchange/mixins/Trading.sol)
- [Resolution and redemption](https://docs.polymarket.com/concepts/resolution)
- [Trading fees](https://docs.polymarket.com/trading/fees)

## Data-rights note (non-normative)

Records under this profile embed venue API responses and republish them durably. Public API accessibility is not by itself a redistribution or permanent-republication license. Operators adopting this profile must clear venue terms, database rights, and applicable privacy obligations before publication. This is a deployment prerequisite, not a protocol rule.

## Copyright

Copyright and related rights on this document's text are waived via CC0-1.0.
