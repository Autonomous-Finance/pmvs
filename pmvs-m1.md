# PMVS Part III. Valuation methodology PMVS-M1

```
pmvs-part:      m1
version:        1 (draft)
status:         Pre-EIP review draft
author:         Ivan Morozov (Zeit Finance)
created:        2026-08-18
requires:       PMVS Part I (core), Part II (settlement)
```

RFC 2119 / RFC 8174 keywords as in Part I.

## Abstract

PMVS-M1 computes net asset value and price per share for a vault that holds prediction-market outcome positions. It includes controlled cash, explicit liabilities, and every outcome position in the declared custody perimeter.

M1 separates capture from arithmetic. Capture obtains chain and venue data and pins the evidence used by the formulas. The formulas use integer arithmetic and declared parameters. This draft does not yet define the closed compute input needed to reproduce the complete output object.

M1 is a conservative displayed-liquidity method, not fair value, liquidation value, or a promise of execution. A material position that fails its depth or illiquidity rules blocks settlement. This prevents an uncertain mark from shifting value between entering and exiting vault-share holders.

```
capture: operator and outside systems      arithmetic: pure within each helper

chain reads at pinned blocks     --->      deterministic arithmetic helpers
raw venue responses              --->      cross marks and redemption payouts
exact decimal parsing            --->      integer PPS and cap checks
capture timing and failures      --->      recorded evidence for later verification
```

A resting order book is unsigned and cancellable. M1 simulates a sale into its bids, then subtracts the venue profile's execution-cost cap. The result is the **displayed-book cross mark**, not a guaranteed exit value.

## Role in the vault standard

The share-vault contract may hold only a temporary accounting-asset buffer while a separate strategy-custody account holds the outcome positions. M1 values the whole subject, not one contract balance.

For each valuation, M1:

1. reconstructs the complete position inventory for every declared custody account;
2. reads cash, claim reserves, liabilities, and share supply at pinned blocks;
3. marks live positions from captured executable bids and resolved positions from on-chain payout state;
4. converts every amount into the accounting asset;
5. computes NAV and gross price per share; and
6. supplies that price to the settlement profile for deposits, redemptions, and fees.

Outcome positions remain in vault custody. M1 supplies their accounting-asset value to settlement. It does not wrap or distribute them.

## Marks

Every position receives up to three figures:

- **Venue reference mark**: the venue's own reference price (a `curPrice`-style figure) times size. Display and context only; it MUST NOT price settlement.
- **Displayed-book cross mark**: simulate selling the position into the recorded bid ladder, best level first, at each level's price. Size beyond visible depth contributes zero. The record reports that unfilled size, and the materiality rule below may block settlement. From the filled gross proceeds, subtract `venueExitCost`, the venue profile's deterministic execution-cost cap. The remainder is the settlement-bearing mark. It carries no fill guarantee.
- **Redemption mark**: for resolved (redeemable) positions only, the on-chain payout value (below). Redeemable positions bypass the book.

```
position
  |
  +-- redeemable at pinned on-chain state? -- yes --> redemption mark
  |
  +-- closed but not redeemable? ---------- yes --> block unless negligible
  |
  +-- valid live book? --------------------- no  --> DATA_UNAVAILABLE
  |
  +-- no positive bids?
  |     |
  |     +-- persistent and within caps? ---- yes --> recorded zero write-off
  |     +-- otherwise ----------------------------> block settlement
  |
  +-- cross bids; material unfilled size? -- yes --> block settlement
        |
        +-- no -----------------------------------> displayed-book cross mark
```

Cross-mark pseudocode (pure, integer):

```
cross(sizeU, bids, venueInputs):        # bids are (priceU, qtyU), descending by price
    remaining = sizeU; num = 0
    for (p, q) in bids:
        take = min(q, remaining)
        num += take * p
        remaining -= take
        if remaining == 0: break
    grossMark = floor(num / PRICE_SCALE)
    venueExitCost = exitCostCap(grossMark, venueInputs)
    require 0 <= venueExitCost <= grossMark
    return (grossMark, venueExitCost, grossMark - venueExitCost, remaining)
```

`PRICE_SCALE`, position units, accounting-asset units, and `exitCostCap` come from the venue profile. A zero-cost venue returns zero. Capture merges duplicate prices by summing quantities, rejects non-positive levels, and orders prices strictly downward. Compute uses checked full-precision multiplication and records `unfilled = remaining`. Each output records `grossMark`, `venueExitCost`, and `mark`. `positionsValue` is the exact sum of the final per-position marks. It is never recomputed from floating-point totals.

A redemption mark records `grossMark = mark` and `venueExitCost = 0` unless its venue profile defines a separate on-chain redemption charge. A zero write-off records zero for all three values.

The additive portfolio value does not prove that every position could be sold
together. An aggregated book does not identify maker capital, and the same
capital may support bids in several markets. A trader can also post a bid for
the capture and cancel it before execution. M1 therefore MUST NOT be described
as a firm quote, a portfolio liquidation price, or authenticated venue truth.
Repeated observations, related-party controls, auctions, or realized sales may
belong in a stricter venue or valuation profile, but they cannot be inferred
from one unsigned book.

## NAV and PPS

```
positionsValue = sum(cross or redemption marks)
referenceValue = sum(venue reference marks)              # informative only
grossAssets    = cashValue + overlayValue + positionsValue
navSigned      = grossAssets - liabilities
nav            = max(navSigned, 0)
navDeficit     = max(-navSigned, 0)

assetScale = 10^assetDecimals
shareScale = 10^shareDecimals
PPS_SCALE  = 10^18

pps = floor(nav * shareScale * PPS_SCALE / (totalSupply * assetScale))
```

The numerator and denominator use checked full-precision arithmetic. When `totalSupply > 0` and `nav == 0`, `pps` is zero. M1 does not insert a one-unit sentinel into an economic value.

For comparison only, `referencePps` replaces `positionsValue` with `referenceValue` in the same NAV and PPS equations. It is `null` when `totalSupply == 0`. It never prices a settlement.

When `totalSupply == 0`, the component record supplies `initialPps`. If the subject also has nonzero NAV, it MUST apply a declared seeding or residual-asset rule before accepting a deposit. Otherwise a first depositor could receive value that was not theirs, and the verifier returns `UNALLOCATED_ASSETS`.

Liabilities include pending deposits that have not received shares, committed but unclaimed withdrawal assets, fee-beneficiary asset claims, debt, and declared operating obligations. Pending withdrawal shares remain in `totalSupply` until burned. The record lists every inclusion, exclusion, and liability line. It also records `grossAssets`, signed `navSigned`, `nav`, `navDeficit`, and `pps`.

M1 runs at least once for each settlement and at the L3 cadence declared by the deployment.

For an L1 evidence-bound settlement, the verifier completes the custody,
inventory, pinned-input, capture, quiescence, staleness, and applicable policy
checks below before it follows the authenticated price into settlement. A
record-valid or diagnostic-only valuation cannot support L1. These checks do
not reproduce the complete NAV or PPS calculation; that result requires L2.

## Inventory completeness

An omitted position misstates NAV. PMVS-M1 derives inventory from chain state rather than trusting a venue API list:

1. **Candidate discovery.** For every declared custody address, query the ERC-1155 `TransferSingle` and `TransferBatch` event topics with that address in the indexed `from` or `to` field. Do not restrict the query by emitting contract. Run both direction filters in bounded block ranges from the chain genesis or from a checkpoint that proves the complete starting contract-and-token-id set. A cached operator list alone is not a checkpoint.
2. **Emitter checks.** Treat each log only as a candidate because another contract can emit the same topic. A position asset key is `(chainId, positionContract, positionId)`. A holding key adds `custodyAccount` to that tuple. Deduplicate only identical holding keys. At the pinned block, inspect the emitter's code and ERC-165 responses, decode the ids, and read its balance for that custody address. An event-signature match from a contract that fails the ERC-165 procedure is an anomalous log, not proof of an ERC-1155 balance. A failed required chain read is `DATA_UNAVAILABLE`.
3. **Classification and inclusion.** The venue profile's contract list classifies candidates; it does not limit discovery. Every supported nonzero position in the declared custody perimeter is a subject asset. It enters inventory and NAV regardless of how it arrived. Version 1 has no admitted-versus-unsolicited distinction. A named sentinel balance, unsupported position contract, or unrecoverable position identity produces `UNSUPPORTED_POSITION_FORMAT` or `UNVERIFIABLE_INVENTORY`. That result blocks L1 and every higher level until holder-preserving recovery or wind-down removes the conflict. The verifier never calls or transfers an unknown token merely because its contract emitted a matching event. It never treats that event's `from` field as a return address.
4. **Normative quantities.** Read balances with `balanceOfBatch(account, ids)` at the pinned valuation block. Venue-API sizes MAY appear as `venueReportedSize` to expose discrepancies, but they never replace chain balances.
5. **Aggregate before marking.** Sum all holdings with the same asset key, then cross that aggregate quantity against one captured book. Crossing the same book once per custody account would reuse its depth and overstate value. Each output carries the asset key, aggregate quantity, and the complete sorted list of contributing holding keys and quantities.
6. **Fail closed.** Venue and API acquisition failures MUST surface as failures. A partial response, error response, unexpected shape, RPC limit, scan-resource limit, or incomplete log range aborts capture with `DATA_UNAVAILABLE`. A published gap record may report that result. A failure MUST NOT become a truncated candidate set, empty position list, or empty book. Such a fallback would misstate the vault as all cash and could fabricate worthlessness during retirement. Pagination runs to exhaustion and requires an explicit end-of-results signal.
7. **Size floors.** Any de-minimis exclusion MUST be a declared parameter (`minPositionSize`) applied to chain balances in compute, never a venue-API-side filter applied invisibly at capture.
8. **Non-chain custody.** A venue profile that keeps positions outside publicly readable chain custody MUST define an equally complete public inventory method. If it cannot, the record is `UNVERIFIABLE_INVENTORY` and cannot support an L1 evidence-bound settlement or any higher level. An operator omission is `INCOMPLETE_INVENTORY` and has the same effect.

## Redeemable (resolved) positions

1. A position is redeemable when its market's resolution is final per the venue profile's on-chain signal (payout numerators reported, condition resolved).
2. For a root CTF position, the **redemption mark** is `floor(size * payoutNumerator / payoutDenominator)` in the position's collateral base units. The cash-perimeter conversion then normalizes it to the accounting asset. For a nested CTF position, redemption returns a parent position rather than collateral. Its active position and venue profiles MUST give the complete parent-position conversion route before M1 can produce an accounting-asset mark. Both cases use pinned on-chain state and explicit rounding. A venue reference price does not determine redemption value.
3. Redeemable positions SHOULD be physically redeemed to cash before settlement. Closed-but-unredeemable positions block settlement (below) unless negligible.
4. **False-retirement guard.** A zero-NAV decision MUST use post-redemption state. The operator either redeems all redeemable positions in confirmed transactions or includes their on-chain redemption marks. Coarse display-unit rounding is forbidden. Otherwise real collateral can be written off before retirement.
5. A saved zero-NAV plan is not current evidence. Every resumed workflow repeats the inventory, redemption, liability, and NAV checks at new pinned blocks. Recovered value cancels the old plan. No action may reuse a price or allocation derived from it.

## Illiquidity policy

Illiquid positions can shift value between depositor and redeemer cohorts. M1 therefore makes a depth failure block settlement.

1. `grossMark` MUST NOT exceed the position's maximum on-chain payout, and `mark` MUST NOT exceed `grossMark`. A book with invalid prices or quantities is `DATA_UNAVAILABLE`.
2. Each position records filled size, unfilled size, `unfilledMaximumPayout`, and the declared `materialityReference`. The record also reports `aggregateUnfilledMaximumPayout`, the sum of all per-position values before applying aggregate caps.
3. A material unfilled amount blocks both deposit and withdrawal settlement. The per-position and aggregate caps are component parameters. This rule applies to a partly filled ladder as well as an empty bid side.
4. A no-bid position MAY be marked at zero only after at least `zeroBidObservations` successful captures spanning `zeroBidWindow`. Each source response must show a live market and a valid empty bid array. An outage, parse failure, or missing market counts as `DATA_UNAVAILABLE`, never as no bids.
5. A write-off is permitted only when the position's maximum payout and the aggregate write-off stay below both the declared absolute caps and percentage caps. The record carries the observation hashes and calculations.
6. Percentage caps use `materialityReference`, the last valid anchored L2 NAV produced by a valuation method with a complete compute profile. Let `U` be an exposure in accounting-asset base units, `A` its absolute cap, `B` its cap in basis points, and `R` the materiality reference. The exposure passes the combined cap exactly when `U <= A` and `U * 10_000 <= R * B`. Equality passes. Both products use checked full-precision arithmetic. The aggregate test uses the sum of the underlying unrounded `U` values. Current PMVS-M1 cannot create that L2 reference. Until an eligible method supplies one, percentage-based exceptions are disabled and settlement blocks unless the component record explicitly selects an absolute-only rule.
7. Closed but unredeemable positions block settlement unless the same absolute and aggregate negligibility rules pass.
8. A material position may be moved to a side pocket only through another profile that allocates its economic rights before accepting new flows. Merely omitting it from deposit NAV would dilute existing holders and is forbidden. The remaining choices are to block settlement or enter wind-down.
9. Every enforcement point in one valuation and settlement cycle uses the same materiality reference and parameters. Resume logic MUST reload that context rather than apply defaults.

## Quiescent capture

M1 requires a quiescent state at the declared capture boundary:

1. Every custody account MUST have no executable external commitment that is absent from the record, no pending fill, and no in-flight redemption. The record includes every reserved or locked balance. The active venue profile defines how the operator proves that each old commitment is either recorded or no longer executable. If off-chain signatures cannot be enumerated or cancelled on-chain, an empty API result, a CLOB cancellation, or repeated stable-empty checks do not prove quiescence. The profile MUST require a chain-enforced pause or revocation that keeps those signatures unusable through settlement. Without that control, the capture is diagnostic-only and cannot support L1 or any higher level.
2. Chain reads execute at one pinned block per chain (`eth_call` at height), with the block number and block hash recorded per chain. Multi-chain overlays (below) pin their own blocks.
3. Venue reads record per-request timing: request start, response end, and any venue-supplied timestamp or sequence fields verbatim. The record declares `maxSkewMs`, `maxVenueResponseLagMs`, `maxCaptureAgeMs`, and `validUntil`. The first three fields are millisecond durations. `validUntil` is a Unix timestamp in seconds and equals `floor((endedAtMs + maxCaptureAgeMs) / 1000)` after checked addition. A venue timestamp MUST fall within `maxVenueResponseLagMs` of the recorded response interval and MUST NOT regress within one capture. At execution, `block.timestamp * 1000` MUST NOT exceed `endedAtMs + maxCaptureAgeMs`; equivalently, `block.timestamp <= validUntil`. The age continues past anchoring and ends at settlement execution.
4. Between capture and settlement, no custody balance, open order, fee input, authority, or other settlement-bearing state may change. If it changes before submission, the operator MUST rebuild the record. The covered contract enforces `validUntil`; the receipt compares every other observable chain pre-state and post-state. A profile that does not enforce those other preconditions on-chain can detect a race after execution but cannot prevent it, and MUST disclose that limit.
5. Deployments that cannot fully quiesce MAY declare a weaker capture profile. Records under it MUST name it (a behavior-selecting field, so verifiers without it return `UNSUPPORTED_PROFILE`). The result is diagnostic-only. It cannot support an L1 evidence-bound settlement or any higher level.

## Cash perimeter

1. `cashValue` starts with every declared collateral balance at every subject-controlled address: external custody, vault buffers, request escrow, claim funding, and fee custody. Each balance is read at its pinned block and normalized to accounting-asset base units. Moving cash inside this perimeter MUST NOT change NAV.
2. Exclusions and liabilities are separate labeled lines. They include unminted deposit escrow, committed withdrawal claims, fee-beneficiary claims, debt, operating obligations, and any cash that does not belong to vault-share holders. The same balance cannot appear as both a share asset and claim funding.
3. For multiple collateral tokens, the profile declares an exact conversion source, scale, rounding rule, staleness bound, and depeg response. A fixed 1:1 rule is allowed only as an explicit risk assumption. Listing a depeg without changing the conversion is not risk control.
4. Off-venue and cross-chain positions enter as `overlayValue` with pinned blocks, finality rules, ownership checks, liabilities, and exact conversion functions. A bridge asset and its in-flight canonical claim MUST NOT both be counted.

## Determinism contract

1. **Capture** assembles the valuation record: subject, chain state at pinned blocks, venue state, raw-response hashes and locations, capture timing, engine identity, and declared parameters. It preserves raw response bytes. Decimal values are parsed from their original string or JSON lexeme with an arbitrary-precision decimal parser and converted once to profile units. A path through IEEE-754 is forbidden. Excess precision, an unexpected exponent, or an out-of-range value fails capture under the venue profile.
2. **Arithmetic** uses integer values, recorded time, and explicit parameters. Each implemented helper uses no network, clock, or ambient configuration. Position outputs sort by numeric chain id, lowercase position-contract address, then numeric position id. Contributing holdings sort by lowercase custody-account address. Cash, overlay, liability, and exclusion lines sort by `id` in UTF-16 code-unit order. Bids sort by descending integer price. Serialization follows these field rules, not host map iteration.
3. This draft does not define `computeValuation(inputs) -> outputs` or require a byte comparison of the complete `outputs` object.
4. Engine identity (name, semantic version, source commit, release artifact hash) and the full parameter set sit inside the hashed region. A methodology change is a new methodology id (PMVS-M2 and onward); verifiers select math by that id and MUST return `UNSUPPORTED_PROFILE` for ids they do not implement. Changing or omitting a venue profile's `exitCostCap` also changes settlement math and requires a new profile or methodology id.
5. Before a Final proposal or L2 valuation claim, two independently written implementations MUST reproduce every normative vector. Their source revisions and outputs are recorded. Shared helper code for canonicalization, Merkle construction, or valuation math does not count as independence for that feature.
6. A conformance suite SHOULD use mutation tests. Reintroducing each documented defect should make at least one test fail. A surviving mutation identifies either a missing test or behavior outside the claimed scope; the review record states which.

## Current arithmetic scope and L2 status

The reference module currently implements `aggregatePositionHoldings`, `crossDisplayedBids`, `ctfRedemptionPayout`, `bpsExitCostCap`, `materialityWithinCaps`, and `valuationPps`. Each helper covers only its explicit arguments and formula. The module does not map generic chain reads into cash, overlay, liability, exclusion, resolution, supply, or component-parameter inputs. No standalone engine derives the complete `outputs` object from a closed input.

The repository also has no end-to-end deployment verifier that combines every
Core, settlement, valuation, venue, anchor, storage, and chain check needed for
L1. The schema validators, record-level semantic verifier, and profile helpers
return partial results. Passing one of them is not a PMVS conformance result.

In this draft, `ARITHMETIC_MISMATCH` means that an implemented helper returned a different result after the verifier bound and checked every explicit argument to that helper. It MUST NOT be used to claim that an implementation reproduced the complete valuation output.

PMVS-M1 cannot support an L2 valuation-reproducible claim in its current form. That claim requires all of the following:

1. a closed compute profile that maps every output field to typed, machine-readable inputs, including accounting lines, resolution state, total supply, materiality state, decimals, `initialPps`, and venue-fee inputs, and that binds the active component record and parameters;
2. a standalone engine that consumes the component record and the valuation record without trusting its `outputs` object;
3. normative success and failure vectors for the complete computation; and
4. two independent implementations that reproduce those vectors without shared valuation code.

## Valuation records

Pre-settlement and periodic valuations use schema `pmvs/valuation-record` with `schemaVersion: "1"`. Every integer is a decimal string in its declared unit. The structure is:

```jsonc
{
  "schema": "pmvs/valuation-record",
  "schemaVersion": "1",
  "subject": { "chainId": "137", "shareToken": "0x…" },
  "components": "0x…",
  "context": {
    "stream": "subject", "kind": "valuation", "sequence": "…", "prev": "0x…",
    "producedAt": "…", "valuationTime": "…", "epoch": "…", "slot": null
  },
  "method": {
    "id": "pmvs-m1", "engine": "…", "engineVersion": "…",
    "sourceCommit": "…", "artifactHash": "0x…", "parameters": {}
  },
  "inputs": {
    "chainState": [],
    "venueState": { "profile": "venue/profile/id", "positions": [], "books": [], "responses": [] },
    "capture": {
      "startedAtMs": "…", "endedAtMs": "…", "maxSkewMs": "…",
      "maxVenueResponseLagMs": "…", "maxCaptureAgeMs": "…", "validUntil": "…"
    }
  },
  "outputs": {
    "perPosition": [], "cashLines": [], "overlayLines": [], "liabilityLines": [],
    "exclusionLines": [], "aggregateUnfilledMaximumPayout": "…",
    "cashValue": "…", "overlayValue": "…", "positionsValue": "…",
    "grossAssets": "…", "liabilities": "…", "navSigned": "…", "nav": "…",
    "navDeficit": "…", "totalSupply": "…", "pps": "…", "referencePps": "…"
  },
  "extensions": [],
  "meta": {}
}
```

Each chain-state entry contains the chain id, block number, block hash, block time, and a `reads` array. Each read has a unique id, role, contract address, call data, return bytes, decoded value, and unit. Cash, liability, position, resolution, fee, and supply reads remain separate lines.

Each response entry contains the source profile, request description, start and end times, response-byte hash, retrieval locations, and venue correlation fields. Each position output carries `(chainId, positionContract, positionId)`, its sorted contributing custody holdings, aggregate quantity, one method (`cross`, `redemption`, `writeoff_zero_bid`, or `excluded_negligible`), filled and unfilled size, unfilled maximum payout, gross mark, venue exit cost, final mark, maximum payout, materiality inputs, observation hashes, and an optional reference mark. The four line-item arrays expose the evidence behind each reported aggregate.

A pre-settlement valuation has an epoch and `slot: null`. A periodic valuation has a slot and may use `epoch: null`. A missing slot uses a gap record, not an empty valuation. Every record is directly anchored under Part I. These records cannot support L3 while PMVS-M1 remains ineligible for L2.

## Verification procedure (valuation scope)

1. **Chain state.** Re-execute every recorded read at the pinned block against an archive node. Require the recorded block hash to remain canonical at the declared confirmation depth. This covers supply, cash, liabilities visible on-chain, position balances, resolution, and fee state. A difference is `CHAIN_STATE_MISMATCH`. This check is mandatory for an affected L1 settlement and every higher level.
2. **Inventory.** Re-derive the token universe from transfer logs (inception checkpoint to valuation block) and `balanceOfBatch`. Require the record's position set to equal it after applying only the declared `minPositionSize` exclusions, each of which remains visible in `exclusionLines`. A shortfall is `INCOMPLETE_INVENTORY` and blocks L1 and every higher level.
3. **Capture.** Fetch each raw response from at least one recorded location, verify its byte hash, repeat the profile's exact decimal parsing, and compare the normalized venue inputs. Missing raw bytes, missing pages, or an incomplete response set blocks an affected L1 settlement even when individual arithmetic helpers can still run.
4. **Arithmetic.** Recompute each implemented reference helper from arguments that have already passed their chain-state, profile, and parameter bindings. A different helper result is `ARITHMETIC_MISMATCH`. This draft does not authorize a byte comparison of the complete `outputs` object or an L2 valuation-reproducible claim.
5. **Policy.** Check partial depth, no-bid persistence, per-position and aggregate caps, materiality reference, exclusions, maximum payouts, zero-supply assets, and the false-retirement guard. Every applicable check must pass for L1 and every higher level.
6. **Continuity and staleness.** Check slot coverage, capture skew, capture age, freeze evidence, and the transaction race window. The settlement-specific checks must pass for L1 and every higher level.
7. **Fidelity (optional).** Hand venue state to the watcher procedure for corroboration. Outputs carry `INCONCLUSIVE` or `FIDELITY_SUSPECT` weight under Part I.

This checks chain facts against the canonical chain and checks each implemented helper against its bound arguments. Venue-input truth is corroborated at best.

## Rationale

- **Chain-derived inventory.** ERC-1155 does not require token-id enumeration. Transfer logs establish the candidate id set, and pinned balance calls establish quantities. An operator list alone cannot show that nothing was omitted.
- **Displayed-book cross mark.** A resting order can disappear before execution. M1 names the exact calculation, including a venue-cost cap, without implying a fill.
- **Capture and arithmetic.** Clocks, retries, source changes, and network failures stay in capture. Each implemented helper receives fixed arguments and has one answer. Complete valuation replay needs the closed compute profile described above.
- **Two-sided caution.** An invented fallback can inflate NAV. An easy write-off can depress it. Either direction transfers value between cohorts of vault-share holders.

## Security considerations

- A venue or trader can place and cancel bids to influence a capture. Quiescence and watchers reduce some uncertainty but do not authenticate the book.
- Independent per-asset crosses can rely on the same maker collateral across several markets. `positionsValue` is an additive accounting result, not proof that the portfolio can execute at once.
- A fee-capped mark can still be unfair if deposits or withdrawals proceed while material unfilled exposure remains. The settlement gate is therefore part of the method.
- A venue can change its fee cap after capture. The same pinned value must govern valuation and settlement, or the record is rebuilt. A profile with an unlimited fee setting cannot produce an M1 cross mark.
- Missing liabilities inflate NAV. Missing positions can depress it. Verifiers check the entire custody perimeter, including claim funding and venue inventory.
- Cross-chain overlays can be counted twice during bridge transit or reorged after a short confirmation window. Each overlay declares finality and mutually exclusive ownership states.
- A source API can change types or decimal precision without changing its endpoint. The venue profile pins accepted shapes and fails on unknown forms.

## Copyright

Copyright and related rights in this document and repository-owned reference
code are waived under CC0-1.0. Third-party material remains under its own
license. CC0 does not grant trademark or patent rights.
