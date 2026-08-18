# PMVS venue profile: `venue/polymarket/1`

```
pmvs-part:      profile (venue)
profile-id:     venue/polymarket/1
version:        1 (draft)
status:         Draft
author:         Ivan Morozov (Zeit Finance)
created:        2026-08-18
requires:       PMVS Parts I–III
```

Venue profiles are versioned and explicitly mutable. The venue is a live, centralized service whose contracts, endpoints, and fee rules change on its own schedule. Everything venue-specific is pinned here, per profile version, and never in the PMVS core: a venue change produces `venue/polymarket/2`, not an edit to Parts I through III. Records name the exact profile id they were captured under, and verifiers without that id return `UNSUPPORTED_PROFILE`.

A venue profile must supply the three capabilities Parts II and III consume: observable inventory (position tokens whose balances are on-chain readable), an executable bid surface (a displayed order book to cross), and a resolution signal (an on-chain finality and payout source). Venues without a limit-order book (AMM or RFQ venues) cannot reuse this profile's cross mark; they need their own profile defining the settlement-bearing mark.

## Chain and contracts (Polygon PoS, chainId 137)

| Role | Address |
|---|---|
| Conditional Tokens Framework (ERC-1155 positions) | `0x4d97dcd97ec945f40cf65f87097ace5ea0476045` |
| CTF Exchange | `0xe111180000d2663c0091e4f400237545b87b996b` |
| Neg-risk Exchange | `0xe2222d279d744050d28e00520010520000310f59` |
| Neg-risk Adapter | `0xd91e80cf2e7be2e162c6513ced06f1dd0da35296` |
| Collateral onramp (USDC.e to venue dollar) | `0x93070a847efef7f70739046a929d47a521f5b8ee` |
| Collateral offramp (venue dollar to USDC.e) | `0x2957922eb93258b93368531d39facca3b4dc5854` |

Collateral registry (both 6 decimals): the venue dollar pUSD `0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb` and USDC.e `0x2791bca1f2de4661ed88a30c99a7a9449aa84174`. Conversion rule: 1:1 par for NAV purposes. A market depeg between them is a disclosure event; the record lists each token separately, so the par assumption stays visible and revisable by profile version.

Custody pattern: a per-vault venue-relayed Safe-style wallet holds positions and venue collateral. Its address is on-chain discoverable, and it is the account the inventory rules of Part III reconstruct. Position token ids are CTF position ids (`uint256`); neg-risk wrapped positions resolve to CTF ids for balance purposes.

## Inventory (Part III bindings)

- Transfer-log reconstruction runs over the CTF contract (`TransferSingle` and `TransferBatch`) and any neg-risk wrapper contracts listed above, from the custody account's inception checkpoint.
- Quantities come from `balanceOfBatch` on the CTF at the pinned valuation block. Venue Data-API sizes are `venueReportedSize` metadata only.
- The Data API (`https://data-api.polymarket.com/positions`) applies server-side size filters. Because API sizes are non-normative this only affects metadata completeness, and capture MUST NOT apply any API-side filter to the normative set.

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
 If total displayed depth < size: capture the ENTIRE bid side —
 "unfilled remainder = 0" is only provable against an exhausted ladder.
```

1. **Raw-response preservation.** The exact response bytes of every book read that feeds a record MUST be retained and content-addressed: the hash goes in the record, and the bytes stay retrievable as a sidecar object under the storage profile. Normalized integer inputs (the ladders the engine consumes) are published inside the record, and the original decimal lexemes survive in the raw sidecar. Normalization is lossy, and only raw bytes can support later re-examination of a capture dispute.
2. **Ladder depth.** Bids MUST be captured from the best price downward through and including the first level at which cumulative bid quantity reaches the position's mark quantity. If total displayed depth is smaller, the entire bid side MUST be captured. `bidsTruncated: true` is only lawful when the cross fully filled within the captured depth. Under-capture is an `INCOMPLETE_INVENTORY`-class malformation of the record.
3. Normalization: prices to `priceU6` in `[0, 10^6]`, quantities to base units, duplicate levels merged, strict descending order. Malformed levels (non-numeric, negative, a zero-price bid) invalidate the capture for that token: `DATA_UNAVAILABLE`, not "empty book". Ask-side capture is NOT required, since the cross mark never reads asks; implementations MAY retain asks in the raw sidecar only.
4. **Venue correlation fields.** The book response's `hash`, `timestamp`, and `tick_size`/`min_order_size` fields MUST be copied into the record verbatim as opaque strings. The venue documents its book hash as a change identifier, not a signed authenticity proof, and a normalized or truncated ladder cannot recompute it. Verifiers MUST treat these fields as correlation anchors (exact-match comparison against watcher observations) and MUST NOT attempt to validate them structurally.
5. Per-token capture timing follows Part III: request start and response end recorded, skew bounds applied.

## Resolution signal

- Finality: CTF condition resolution (payout numerators and denominator reported on-chain), plus the neg-risk adapter's determination for neg-risk markets.
- Redemption-mark inputs (Part III): pinned-block payout numerators and denominator per condition.
- Redemption execution: standard CTF redemption; neg-risk positions redeem through the adapter with `indexSet = 1 << outcomeIndex`.
- Market metadata from venue APIs (closed flags, end dates) is context only and never a resolution authority.

## Venue fees

Polymarket applies taker fees per market with dynamically queryable parameters. The fee for a fill of size `s` at price `p` follows the venue's on-chain calculator shape, `fee = s · rate · (p·(1−p))^e`, summed per matched level. The facts this profile version pins: fee parameters are per-market and mutable by the venue, so a fee-netted mark cannot be part of PMVS-M1. It is reserved for PMVS-M2, which will pin an exact fee-resolution procedure and a fail-safe ceiling. Records under this profile carry gross cross marks; any fee estimation an implementation performs is out of record scope.

## Degraded modes (venue outage or shutdown)

The venue is a single centralized service, so its unavailability is a first-class state:

1. An API outage is `DATA_UNAVAILABLE` per Part III. An outage MUST NOT produce empty books, empty inventories, or zero marks, and no settlement that requires fresh valuation may execute against captures stale beyond their bounds.
2. A prolonged outage or announced shutdown triggers the deployment's declared degraded mode: block valuation-dependent deposits and rolls, and keep cancellation and claim paths open, since they need no venue. Where positions can still resolve on-chain (CTF resolution is on-chain), a resolution-only recovery MAY value and redeem resolved positions from chain state alone and wind the vault down under Part II's retirement records.
3. A venue shutdown never justifies marking open positions to zero. Unresolvable positions under a dead venue are a disclosed side pocket in wind-down, valued per whatever recovery the deployment can document.

## Data-rights note (non-normative)

Records under this profile embed venue API responses and republish them durably. Public API accessibility is not by itself a redistribution or permanent-republication license. Operators adopting this profile must clear venue terms, database rights, and applicable privacy obligations before publication. This is a deployment prerequisite, not a protocol rule.

## Copyright

Copyright and related rights on this document's text are waived via CC0-1.0.
