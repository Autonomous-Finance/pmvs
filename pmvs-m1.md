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

PMVS-M1 turns a changing portfolio of prediction-market outcome positions into the accounting value behind one durable ERC-20 vault share. It computes net asset value and price per share from controlled cash, explicit liabilities, and every outcome position in the declared custody perimeter.

The method has two stages. Capture obtains chain and venue data and pins every input. Compute uses only those inputs, integer arithmetic, and declared parameters. An independent implementation can then reproduce the output.

M1 is a conservative displayed-liquidity method. It is not fair value, liquidation value, or a promise of execution. A material position that cannot be priced under its depth and illiquidity rules blocks settlement rather than transferring the uncertainty between entering and exiting vault-share holders.

```
capture: operator and outside systems      compute: pure and repeatable

chain reads at pinned blocks     --->      computeValuation(inputs)
raw venue responses              --->      marks, NAV, and price per share
exact decimal parsing            --->      no clock, network, or hidden config
capture timing and failures      --->      deterministic ordered output
```

Valuation names its price concepts precisely. A resting order book is unsigned and cancellable. Crossing it in simulation yields gross cross proceeds. The venue profile then subtracts a deterministic upper bound on execution charges to produce the **displayed-book cross mark**. That mark is not a guaranteed exit value.

## Role in the vault standard

The share-vault contract may hold only a temporary accounting-asset buffer while a separate strategy-custody account holds the outcome positions. M1 values the whole subject, not one contract balance.

For each valuation, M1:

1. reconstructs the complete position inventory for every declared custody account;
2. reads cash, claim reserves, liabilities, and share supply at pinned blocks;
3. marks live positions from captured executable bids and resolved positions from on-chain payout state;
4. converts every amount into the accounting asset;
5. computes NAV and gross price per share; and
6. supplies that price to the settlement profile for deposits, redemptions, and fees.

Outcome positions remain portfolio assets. M1 does not wrap each position into a new ERC-20 and does not distribute those positions to vault-share holders.

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

Liabilities include pending deposits that have not received shares, committed but unclaimed withdrawal assets, manager-claimable asset fees, debt, and declared operating obligations. Pending withdrawal shares remain in `totalSupply` until burned. The record lists every inclusion, exclusion, and liability line. It also records `grossAssets`, signed `navSigned`, `nav`, `navDeficit`, and `pps`.

M1 runs at least once for each settlement and at the L3 cadence declared by the deployment.

## Inventory completeness

The single largest failure mode of venue-priced NAV is a silently incomplete position set. PMVS-M1 makes inventory a chain-derived fact rather than a venue-API answer:

1. **Universe reconstruction.** For every declared custody address, reconstruct the token-id universe from all ERC-1155 `TransferSingle` and `TransferBatch` logs that touch it, across every position-token contract in the venue profile. Scan from contract creation or from a checkpoint that proves the starting balance and token-id set. A cached operator list alone is not a checkpoint. Keep ids with nonzero balances and record unsolicited positions rather than hiding them.
2. **Normative quantities.** Read balances with `balanceOfBatch(account, ids)` at the pinned valuation block. Venue-API sizes MAY appear as `venueReportedSize` to expose discrepancies, but they never replace chain balances.
3. **Fail closed.** Venue and API acquisition failures MUST surface as failures. A partial response, error response, or unexpected shape aborts capture with `DATA_UNAVAILABLE`. A published gap record may report that result. A failure MUST NOT become an empty position list or empty book. Such a fallback would misstate the vault as all cash and could fabricate worthlessness during retirement. Pagination runs to exhaustion and requires an explicit end-of-results signal.
4. **Size floors.** Any de-minimis exclusion (dust positions) MUST be a declared parameter (`minPositionSize`) applied to chain balances in compute, never a venue-API-side filter applied invisibly at capture.
5. A venue profile that keeps positions outside publicly readable chain custody MUST define an equally complete public inventory method. If it cannot, the record is `UNVERIFIABLE_INVENTORY` and cannot support L2. An operator omission is `INCOMPLETE_INVENTORY`.

## Redeemable (resolved) positions

1. A position is redeemable when its market's resolution is final per the venue profile's on-chain signal (payout numerators reported, condition resolved).
2. The **redemption mark** is `floor(size * payoutNumerator / payoutDenominator)` in the position's collateral base units. The cash-perimeter conversion then normalizes it to the accounting asset. Both stages use pinned on-chain state and explicit rounding. A venue reference price does not determine redemption value.
3. Redeemable positions SHOULD be physically redeemed to cash before settlement. Closed-but-unredeemable positions block settlement (below) unless negligible.
4. **False-retirement guard.** A zero-NAV decision MUST use post-redemption state. The operator either redeems all redeemable positions in confirmed transactions or includes their on-chain redemption marks. Coarse display-unit rounding is forbidden. Otherwise real collateral can be written off before retirement.
5. A saved zero-NAV plan is not current evidence. Every resumed workflow repeats the inventory, redemption, liability, and NAV checks at new pinned blocks. Recovered value cancels the old plan. No action may reuse a price or allocation derived from it.

## Illiquidity policy

Illiquid positions can shift value between depositor and redeemer cohorts. M1 therefore makes a depth failure block settlement.

1. `grossMark` MUST NOT exceed the position's maximum on-chain payout, and `mark` MUST NOT exceed `grossMark`. A book with invalid prices or quantities is `DATA_UNAVAILABLE`.
2. Each position records filled size, unfilled size, unfilled maximum payout, and those amounts as a share of the declared materiality reference. The record also reports aggregate unfilled exposure.
3. A material unfilled amount blocks both deposit and withdrawal settlement. The per-position and aggregate caps are component parameters. This rule applies to a partly filled ladder as well as an empty bid side.
4. A no-bid position MAY be marked at zero only after at least `zeroBidObservations` successful captures spanning `zeroBidWindow`. Each source response must show a live market and a valid empty bid array. An outage, parse failure, or missing market counts as `DATA_UNAVAILABLE`, never as no bids.
5. A write-off is permitted only when the position's maximum payout and the aggregate write-off stay below both the declared absolute caps and percentage caps. The record carries the observation hashes and calculations.
6. Percentage caps use `materialityReference`, the last valid anchored L2 NAV before this capture. If no such value exists or it is zero, percentage-based exceptions are disabled and settlement blocks unless an absolute rule alone is explicitly declared.
7. Closed but unredeemable positions block settlement unless the same absolute and aggregate negligibility rules pass.
8. A material position may be moved to a side pocket only through another profile that allocates its economic rights before accepting new flows. Merely omitting it from deposit NAV would dilute existing holders and is forbidden. The remaining choices are to block settlement or enter wind-down.
9. Every enforcement point in one valuation and settlement cycle uses the same materiality reference and parameters. Resume logic MUST reload that context rather than apply defaults.

## Quiescent capture

A reproducible valuation needs a still target. At the declared capture boundary:

1. Every custody account MUST have zero open venue orders, no pending fills, no in-flight redemptions, and no undisclosed reserved or locked collateral. The component record defines the freeze procedure, including cancellation and repeated stable-empty checks.
2. Chain reads execute at one pinned block per chain (`eth_call` at height), with the block number and block hash recorded per chain. Multi-chain overlays (below) pin their own blocks.
3. Venue reads record per-request timing: request start, response end, and any venue-supplied timestamp or sequence fields verbatim. The record declares `maxCaptureSkew` (oldest to newest venue read) and `maxCaptureAge` (capture to anchor); breaching either marks the record `STALE`.
4. Between capture and settlement, no custody balance, open order, fee input, authority, or other settlement-bearing state may change. If it changes before submission, the operator MUST rebuild the record. The receipt compares observable chain pre-state and post-state. A profile that does not enforce those preconditions on-chain can detect a race after execution but cannot prevent it, and MUST disclose that limit.
5. Deployments that cannot fully quiesce MAY declare a weaker capture profile. Records under it MUST name it (a behavior-selecting field, so verifiers without it return `UNSUPPORTED_PROFILE`), and it cannot support L2's byte-exact claims unless it, too, pins every input.

## Cash perimeter

1. `cashValue` starts with every declared collateral balance at every subject-controlled address: external custody, vault buffers, request escrow, claim funding, and fee custody. Each balance is read at its pinned block and normalized to accounting-asset base units. Moving cash inside this perimeter MUST NOT change NAV.
2. Exclusions and liabilities are separate labeled lines. They include unminted deposit escrow, committed withdrawal claims, manager-claimable fees, debt, operating obligations, and any cash that does not belong to vault-share holders. The same balance cannot appear as both a share asset and claim funding.
3. For multiple collateral tokens, the profile declares an exact conversion source, scale, rounding rule, staleness bound, and depeg response. A fixed 1:1 rule is allowed only as an explicit risk assumption. Listing a depeg without changing the conversion is not risk control.
4. Off-venue and cross-chain positions enter as `overlayValue` with pinned blocks, finality rules, ownership checks, liabilities, and exact conversion functions. A bridge asset and its in-flight canonical claim MUST NOT both be counted.

## Determinism contract

1. **Capture** assembles `inputs`: subject, chain state at pinned blocks, venue state, raw-response hashes and locations, capture timing, engine identity, and all parameters. It preserves raw response bytes. Decimal values are parsed from their original string or JSON lexeme with an arbitrary-precision decimal parser and converted once to profile units. A path through IEEE-754 is forbidden. Excess precision, an unexpected exponent, or an out-of-range value fails capture under the venue profile.
2. **Compute** is `computeValuation(inputs) -> outputs`. It uses integer arithmetic, recorded time, no network, no ambient configuration, and deterministic iteration order. Positions sort by numeric token id, collateral by lowercase address, and bids by descending integer price. Serialization follows the schema order rules, not host map iteration.
3. A reference engine MUST expose compute as a standalone entry point that consumes a record. L2 re-execution byte-compares the canonical `outputs` object. It does not claim to reconstruct capture inputs or the full record hash. A difference is `ARITHMETIC_MISMATCH`.
4. Engine identity (name, semantic version, source commit, release artifact hash) and the full parameter set sit inside the hashed region. A methodology change is a new methodology id (PMVS-M2 and onward); verifiers select math by that id and MUST return `UNSUPPORTED_PROFILE` for ids they do not implement. Changing or omitting a venue profile's `exitCostCap` also changes settlement math and requires a new profile or methodology id.
5. Before a Final proposal or production L2 claim, two independently written implementations MUST reproduce every normative vector. Their source revisions and outputs are recorded. Shared helper code for canonicalization, Merkle construction, or valuation math does not count as independence for that feature.
6. A conformance suite SHOULD use mutation tests. Reintroducing each documented defect should make at least one test fail. A surviving mutation identifies either a missing test or behavior outside the claimed scope; the review record states which.

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
    "capture": { "startedAtMs": "…", "endedAtMs": "…", "maxSkewMs": "…" }
  },
  "outputs": {
    "perPosition": [], "cashValue": "…", "overlayValue": "…", "positionsValue": "…",
    "grossAssets": "…", "liabilities": "…", "navSigned": "…", "nav": "…",
    "navDeficit": "…", "totalSupply": "…", "pps": "…", "referencePps": "…"
  },
  "extensions": [],
  "meta": {}
}
```

Each chain-state entry contains the chain id, block number, block hash, block time, contract address, call data or named read, return bytes, decoded value, and unit. Cash, liability, position, resolution, fee, and supply reads remain separate lines.

Each response entry contains the source profile, request description, start and end times, response-byte hash, retrieval locations, and venue correlation fields. Each position output names one method: `cross`, `redemption`, `writeoff_zero_bid`, or `excluded_negligible`. It also records filled size, unfilled size, gross mark, venue exit cost, final mark, maximum payout, and an optional reference mark.

A pre-settlement valuation has an epoch and `slot: null`. An L3 periodic valuation has a slot and may use `epoch: null`. A missing slot uses a gap record, not an empty valuation. Periodic records may be anchored through later subject-stream ancestry unless their signer requires individual ERC-1271 validation under Part I.

## Verification procedure (valuation scope)

1. **Chain state.** Re-execute every recorded read at the pinned block against an archive node. Require the recorded block hash to remain canonical at the declared confirmation depth. This covers supply, cash, liabilities visible on-chain, position balances, resolution, and fee state. A difference is `CHAIN_STATE_MISMATCH`.
2. **Inventory.** Re-derive the token universe from transfer logs (inception checkpoint to valuation block) and `balanceOfBatch`; require the record's position set to equal it, net of the declared dust floor. A shortfall is `INCOMPLETE_INVENTORY`.
3. **Capture.** Fetch each raw response from at least one recorded location, verify its byte hash, repeat the profile's exact decimal parsing, and compare the normalized venue inputs. Missing raw bytes limit venue-input verification even when compute still runs.
4. **Arithmetic.** Run the reference compute on `inputs` and byte-compare the canonical `outputs`. Divergence is `ARITHMETIC_MISMATCH`.
5. **Policy.** Check partial depth, no-bid persistence, per-position and aggregate caps, materiality reference, exclusions, maximum payouts, zero-supply assets, and the false-retirement guard.
6. **Continuity and staleness.** Check slot coverage, capture skew, capture age, freeze evidence, and the transaction race window.
7. **Fidelity (optional).** Hand venue state to the watcher procedure for corroboration. Outputs carry `INCONCLUSIVE` or `FIDELITY_SUSPECT` weight under Part I.

This checks chain facts against the canonical chain and proves arithmetic relative to recorded inputs. Venue-input truth is corroborated at best.

## Rationale

- **Chain-derived inventory.** ERC-1155 does not require token-id enumeration. Transfer logs establish the candidate id set, and pinned balance calls establish quantities. An operator list alone cannot show that nothing was omitted.
- **Displayed-book cross mark.** A resting order can disappear before execution. M1 names the exact calculation, including a venue-cost cap, without implying a fill.
- **Capture and compute.** Clocks, retries, source changes, and network failures stay in capture. Compute receives fixed inputs and has one answer.
- **Two-sided caution.** An invented fallback can inflate NAV. An easy write-off can depress it. Either direction transfers value between cohorts of vault-share holders.

## Security considerations

- A venue or trader can place and cancel bids to influence a capture. Quiescence and watchers reduce some uncertainty but do not authenticate the book.
- A fee-capped mark can still be unfair if deposits or withdrawals proceed while material unfilled exposure remains. The settlement gate is therefore part of the method.
- A venue can change its fee cap after capture. The same pinned value must govern valuation and settlement, or the record is rebuilt. A profile with an unlimited fee setting cannot produce an M1 cross mark.
- Missing liabilities inflate NAV just as missing positions can depress it. Verifiers check the entire custody perimeter, including claim funding and venue inventory.
- Cross-chain overlays can be counted twice during bridge transit or reorged after a short confirmation window. Each overlay declares finality and mutually exclusive ownership states.
- A source API can change types or decimal precision without changing its endpoint. The venue profile pins accepted shapes and fails on unknown forms.

## Copyright

Copyright and related rights on this document's text are waived via CC0-1.0. No license to any implementation code, trademark, or patent is granted or implied.
