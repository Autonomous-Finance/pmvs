# PMVS Part III. Valuation methodology PMVS-M1

```
pmvs-part:      m1
version:        1 (draft)
status:         Draft
author:         Ivan Morozov (Zeit Finance)
created:        2026-08-18
requires:       PMVS Part I (core), Part II (settlement)
```

RFC 2119 / RFC 8174 keywords as in Part I.

## Abstract

PMVS-M1 is the normative valuation methodology: how a vault's net asset value (NAV) and price per share (PPS) are computed from custody cash plus marked venue positions, and, the load-bearing part, how the computation is packaged so that an independent party re-executes it byte-exactly. The methodology splits into an impure **capture stage** (fetch chain and venue data, canonicalize once, assemble the record's inputs) and a pure **compute stage** (inputs to outputs, no clock, no network). Conformance at L2 means the compute stage is a pure function over the record and the record's inputs satisfy the completeness rules below.

```
 capture (impure, operator-run)          compute (pure, anyone can run)
 ┌─────────────────────────────┐         ┌──────────────────────────────┐
 │ chain reads @ pinned block  │         │ computeValuation(inputs)     │
 │ venue reads (books, meta)   │ ──────▶ │   → marks, NAV, PPS          │
 │ canonicalize floats ONCE    │ inputs  │ no clock · no network        │
 └─────────────────────────────┘ in the  │ no ambient config            │
        retries, caches,         record  └───────────────┬──────────────┘
        jitter live here                                 │ byte-equal?
                                        verifier re-runs ┘   (L2 check)
```

Valuation names its price concepts precisely. A resting order book is unsigned, cancellable liquidity: crossing it in simulation yields a **displayed-book cross mark**, the gross notional of sweeping displayed bids, not a guaranteed exit value. This methodology does not use the word "realizable".

## Marks

Every position receives up to three figures:

- **Venue reference mark**: the venue's own reference price (a `curPrice`-style figure) times size. Display and context only; it MUST NOT price settlement.
- **Displayed-book cross mark**: simulate selling the full position into the recorded bid ladder, best level first, each level at its own price. Size the visible depth cannot absorb contributes zero, with no invented fallback price. This is the settlement-bearing mark. It is gross of venue fees and carries no fill guarantee. A profile MAY define a fee-netted variant (reserved: PMVS-M2), which then MUST NOT leak into the published gross PPS.
- **Redemption mark**: for resolved (redeemable) positions only, the on-chain payout value (below). Redeemable positions bypass the book.

```
 position ─▶ redeemable? ──yes──▶ redemption mark (on-chain payout state)
               │no
               ▼
        market closed? ──yes──▶ illiquid: blocks the roll (unless negligible)
               │no
               ▼
     metadata unlabeled? ──yes──▶ never written off; regular illiquidity
               │no                 handling on the recorded book
               ▼
        bids present? ──yes──▶ displayed-book cross mark (sweep, unfilled = 0)
               │no
               ▼
   persistent no-bid, within  ──yes──▶ write-off to 0 (bounded, recorded)
   the declared caps?
               │no
               └──▶ illiquid: blocks the roll for operator review
```

Cross-mark pseudocode (pure, integer):

```
cross(sizeU, bids):                     # sizeU: base units; bids: [(priceU, qtyU)] strictly descending price
    remaining = sizeU; num = 0
    for (p, q) in bids:
        take = min(q, remaining)
        num += take * p
        remaining -= take
        if remaining == 0: break
    return floor(num / PRICE_SCALE)     # single floor per position
```

Rules: duplicate price levels are merged (quantities summed) at capture; levels are strictly descending; one floor per position, never per level; `unfilled = remaining` is recorded per position. The sum of per-position marks equals `positionsValue` exactly. The total is the sum of already-floored marks, never an independently floored float accumulation.

## NAV and PPS

```
positionsValue = Σ cross-or-redemption marks (settlement-bearing set)
referenceValue = Σ venue-reference marks                (informative)
navRaw   = cashValue + overlayValue + positionsValue    # all in asset base units
nav      = max(navRaw, 1)                               # 1-base-unit sentinel, flagged
pps      = floor(nav · BRIDGE · WAD / totalSupply)      # BRIDGE = 10^(18−D)
           totalSupply == 0  ⇒  pps = WAD (definitional unit price)
```

`navRaw` and `nav` are both recorded, and `navFloor = (navRaw == 0)` is an explicit output flag. `navRaw == 0` is an economic statement of worthlessness; the 1-unit sentinel exists only so the PPS division is total. Downstream logic MUST branch on `navRaw`, never on the sentinel. Excluded from NAV: pending (unminted) deposits, pending (unburned) withdrawal escrows, and unaccrued fees. Marking cadence: at minimum once per roll at the frozen epoch's valuation point, plus the periodic cadence the deployment declares (`cadenceSeconds`, L3).

## Inventory completeness

The single largest failure mode of venue-priced NAV is a silently incomplete position set. PMVS-M1 makes inventory a chain-derived fact rather than a venue-API answer:

1. **Universe reconstruction.** The position-token universe of a custody account MUST be reconstructed from on-chain transfer history: all ERC-1155 `TransferSingle` and `TransferBatch` events touching the account, over every position-token contract listed in the venue profile (conditional tokens and any wrapped variants), from a pinned inception checkpoint (block plus account-creation evidence) to the valuation block. The resulting id set, net of zero balances, is the candidate inventory.
2. **Normative quantities.** Position sizes are the on-chain balances at the valuation block, read with `balanceOfBatch(account, ids)` at that block, never venue-API sizes. Venue-API sizes MAY be recorded as `venueReportedSize` for discrepancy surfacing; on a mismatch the chain figure governs.
3. **Fail closed.** Venue and API acquisition failures MUST surface as failures. A partial, erroring, or shape-unexpected response MUST abort capture with `DATA_UNAVAILABLE` (recorded as such if a record is still published, for example a gap record). It MUST NOT be treated as an empty position list, and an outage MUST NOT be treated as an empty book. Silent empty-list fallbacks convert API downtime into "the vault is all cash", which both misprices settlement and, per the retirement rules, can fabricate worthlessness. Pagination MUST run to exhaustion with an explicit end-of-results signal.
4. **Size floors.** Any de-minimis exclusion (dust positions) MUST be a declared parameter (`minPositionSize`) applied to chain balances in compute, never a venue-API-side filter applied invisibly at capture.
5. A record whose inventory cannot be established this way is `INCOMPLETE_INVENTORY` (an operator-side violation) or `UNVERIFIABLE_INVENTORY` (the verifier cannot re-derive it, for example missing profile contracts), and cannot support an L2 claim.

## Redeemable (resolved) positions

1. A position is redeemable when its market's resolution is final per the venue profile's on-chain signal (payout numerators reported, condition resolved).
2. The **redemption mark** is the on-chain payout: `floor(size · payoutNumerator / payoutDenominator)` in collateral units, computed from pinned on-chain resolution state, not from a venue reference price. One floor, to the asset base unit, never to whole display currency.
3. Redeemable positions SHOULD be physically redeemed to cash before settlement. Closed-but-unredeemable positions block settlement (below) unless negligible.
4. **The order-of-operations law (the false-retirement guard).** Any decision that a vault's NAV is zero, in particular the zero-NAV terminal retirement of Part II, MUST be computed on post-redemption state: either after all redeemable positions have been redeemed in confirmed transactions, or with redemption marks valued from on-chain payout state as above. A pipeline that floors redemption values coarsely and evaluates zero-NAV before physically redeeming can write off real collateral and retire a vault that still holds value. The precursor exhibited exactly this shape until 2026-08-18 (gaps M1 and M2 below), which is why this law is a MUST.
5. **The law extends across resumptions.** A persisted zero-NAV intent (a planned wind-down settlement that has not yet executed on-chain) is stale state, not evidence. Every resumption MUST re-validate the intent against current post-redemption NAV before any settlement action. Recovered value voids the intent, and the resumed workflow MUST re-plan from the current figures rather than replay anything derived from the void intent; in particular, a price per share derived from sentinel NAV MUST never be published. Re-validating only when the current run's own first reading still shows the sentinel is insufficient: recovery that landed before the resumption bypasses such a check entirely. The precursor had exactly this door until an adversarial verification round closed it on 2026-08-18.

## Illiquidity policy

This replaces any unconditional zero-bid write-off:

1. "No bids means the cross mark is zero" follows arithmetically from the cross rule. The policy question is whether a zero mark may bypass the illiquidity block and let settlement proceed.
2. A tradable position with no positive bid MAY be written down to zero only if all of the following hold: (a) the absence of bids is persistent, observed in at least `zeroBidObservations` independent captures spanning at least `zeroBidWindow` (declared parameters; single-capture write-offs are non-conformant); (b) the venue data source was live at each observation (an outage observation counts for nothing: `DATA_UNAVAILABLE` is not an empty book); (c) the position's maximum possible value (`size × maxPayout`) is within the declared materiality cap (`illiquidWriteoffCapPctNav`); and (d) the write-off is recorded per position with its observation evidence.
3. A material illiquid position, beyond the cap, MUST NOT be written down and MUST NOT be silently marked. The deployment enters a declared degraded mode: block new deposits, side-pocket the position (exclude it from the deposit-pricing NAV while disclosing it), or open wind-down, per the policy declared in the component-generation record.
4. Closed-but-unredeemable positions (resolution pending) block settlement unless negligible under declared thresholds (`negligiblePositionPctNav`, `negligibleAggregatePctNav`). The negligibility escape MUST be disabled when NAV itself is unavailable (`navRaw` unknown or sentinel-floored).
5. **Policy consistency.** Within one valuation and settlement cycle, every enforcement point of this policy MUST evaluate under one context: the same NAV reference and the same declared parameters. A cycle that established a NAV reference MUST propagate it to every enforcement point; omitting it at one site produces divergent verdicts for the same position within one cycle, for example a position written off within cap at valuation that then hard-blocks a liquidation resume. The precursor's liquidation-resume path did exactly this until 2026-08-18.

## Quiescent capture

Valuation is meaningful only over a still target. At the declared capture boundary:

1. The custody account MUST have zero open venue orders, no pending fills, no in-flight redemptions, and no reserved or locked collateral. The deployment's freeze mechanism (order cancellation plus stable-empty confirmation polling) is declared in the component-generation record.
2. Chain reads execute at one pinned block per chain (`eth_call` at height), with the block number and block hash recorded per chain. Multi-chain overlays (below) pin their own blocks.
3. Venue reads record per-request timing: request start, response end, and any venue-supplied timestamp or sequence fields verbatim. The record declares `maxCaptureSkew` (oldest to newest venue read) and `maxCaptureAge` (capture to anchor); breaching either marks the record `STALE`.
4. Between the capture boundary and the settlement transaction, no custody mutation, config change (fee rate, authorities), or venue activity may occur for the subject. If any does, the record MUST be rebuilt. The receipt (Part II) exposes post-state, so violations are visible.
5. Deployments that cannot fully quiesce MAY declare a weaker capture profile. Records under it MUST name it (a behavior-selecting field, so verifiers without it return `UNSUPPORTED_PROFILE`), and it cannot support L2's byte-exact claims unless it, too, pins every input.

## Cash perimeter

1. `cashValue` sums the collateral balances of every custody address in the subject's component graph: the external custody account (strategy wallet), the vault contract buffer, and the settlement contract escrow, for every collateral token in the venue profile's registry, each decimal-normalized to asset base units at the pinned block. Intra-system transfers MUST NOT change NAV; a perimeter that omits one component address fails this trivially and is non-conformant.
2. Liabilities and earmarks are subtracted or excluded explicitly: escrowed pending deposits (never counted until minted), manager-claimable fee assets, and any declared operating earmarks. Each appears as a labeled line in the record.
3. Multi-collateral handling (for example a venue-wrapped dollar plus a bridged dollar): the profile declares the conversion rule, typically 1:1 par with a depeg disclosure duty, and the record lists each token separately before conversion.
4. **Overlays.** Off-venue yield positions (for example savings tokens on another chain) enter as `overlayValue` with their own pinned block and chain reads and conversion functions declared in the record, never as unpinned additions after the fact.

## Determinism contract

1. **Capture (impure)** assembles `record.inputs`: subject, context, chainState (per-chain pinned reads), venueState (positions, books, resolution state, raw-response references per the venue profile), engine identity, parameters. Floating-point venue values are canonicalized to decimal strings once, at capture; the strings are thereafter the inputs of record.
2. **Compute (pure)** is `computeValuation(inputs) → outputs` with integer arithmetic only (no IEEE-754 anywhere in the value path), no clock (`valuationTime` is an input, and any age or aging logic uses recorded times), no network, no ambient configuration (every threshold above is a recorded parameter), and deterministic iteration order (positions ascending by token id as integers, collateral by lowercase address, bids by descending price), with serialization order equal to iteration order.
3. The open-source engine MUST expose compute as a standalone entry point consuming a record file. Re-execution reproducing `outputs` byte-exactly (equivalently, reproducing `recordHash`) is the L2 verification step. Divergence is `ARITHMETIC_MISMATCH`.
4. Engine identity (name, semantic version, source commit, release artifact hash) and the full parameter set sit inside the hashed region. A methodology change is a new methodology id (PMVS-M2 and onward); verifiers select math by that id and MUST return `UNSUPPORTED_PROFILE` for ids they do not implement. Venue-fee-netted marking is explicitly reserved for a future methodology id and MUST NOT be retrofitted into M1 records.
5. The standard ships the Part II and III test vectors. A second, independently written implementation MUST reproduce them. The vectors in this suite were generated by two independent implementations, one production-derived and one spec-derived, with byte-equal results.
6. **Mutation validation.** A conformance test suite SHOULD be validated by mutation: reintroducing each documented precursor defect (the gap tables of Parts II and III) into the implementation MUST cause at least one suite failure. A mutation that survives marks an unpinned behavior, which MUST be either covered by a new test or documented as an accepted residual. The precursor's suites were mutation-validated on 2026-08-18: ten of thirteen reintroduced defects were caught immediately, and the three survivors received dedicated tests the same day.

## Valuation records

Two kinds carry M1 data. Schemas follow Part I enveloping, and every quantity is a decimal string.

The **pre-roll valuation record** (`kind: "valuation"`, mandatory per roll at L2) carries: subject; context (epoch, sequence, prev, valuationTime plus unix ms); chainState per chain, `{ blockNumber, blockHash, blockTimestamp, reads: { totalSupply, cash: [token, holder, balance, decimals, normalized], positionBalances: [tokenId, balance], resolutionState, highWaterMark, feeRate, settlementVersion } }`; venueState, `{ profile, positions[], books[] (per the venue profile: ladders to the required depth, verbatim venue correlation fields, raw-response references), resolution evidence }`; engine plus params; outputs, `{ perPosition: [tokenId, markMethod ∈ {cross, redemption, writeoff_zero_bid, excluded_negligible}, mark, unfilled, venueReferenceMark], cashValue, overlayValue, positionsValue, navRaw, nav, navFloor, totalSupply, crossPps, referencePps, grossPps (== crossPps), settlement { hwm, feeRate, version, netPps } }`.

The **periodic valuation record** (same schema, `kind: "valuation"`, slot-stamped) occupies deterministic cadence slots; slots without data carry gap records (Part I). Periodic records are anchored transitively through the hash chain. Individual anchoring is not required, and its absence is not a defect.

## Verification procedure (valuation scope)

1. **Chain state.** Re-execute every recorded read at the pinned block against an archive node, and require the recorded block hash to be canonical at the declared confirmation depth. A mismatch is `CHAIN_STATE_MISMATCH`. This covers supply, cash, position balances, resolution state, and fee state.
2. **Inventory.** Re-derive the token universe from transfer logs (inception checkpoint to valuation block) and `balanceOfBatch`; require the record's position set to equal it, net of the declared dust floor. A shortfall is `INCOMPLETE_INVENTORY`.
3. **Arithmetic.** Run the reference compute on `inputs` and byte-compare `outputs`. Divergence is `ARITHMETIC_MISMATCH`.
4. **Policy.** Check every `writeoff_zero_bid` against the persistence and materiality rules (observation evidence present, cap respected); check negligibility exclusions; check the zero-NAV order-of-operations law against redemption transactions in the receipt window.
5. **Continuity and staleness.** Slot coverage, skew and age bounds, capture-boundary declarations.
6. **Fidelity (optional).** Hand venueState to the watcher procedure (profile `watcher/0`) for corroboration. Outputs carry `INCONCLUSIVE` or `FIDELITY_SUSPECT` weight, per Part I's T3 framing.

What this proves and does not prove is exactly Part I's T1/T2/T3 split: chain facts are proven, methodology application is proven relative to disclosed inputs, and venue-input truth is corroborated at best.

## Precursor implementation and migration gaps

The precursor engine (open-sourcing planned) computes a paper mark from a venue reference price and a cross mark from live books. Its distances from M1 are listed here because the standard's honesty requires them; each is a migration work item. The four safety-tagged rows were closed on 2026-08-18 after an adversarially verified fix cycle (two independent review passes, one executable falsification, and a regression harness over the zero-NAV resume matrix).

| # | Precursor behavior (verified in source) | M1 requirement | Status |
|---|---|---|---|
| M1 | Redeemable positions were valued `floor_whole_currency(float_size × refPrice)`: a $0.99 position marked to $0 | Redemption mark from on-chain payout state, single base-unit floor | closed 2026-08-18: integer-micro redemption values with one floor to the base unit (`computeRedeemableValueMicros`) |
| M2 | NAV and the zero-NAV decision were computed before physical redemption and never revisited | Zero-NAV on post-redemption state, re-validated at every resumption (the false-retirement guard) | closed 2026-08-18 in two passes: the terminal decision is re-made on post-redemption state (sentinel NAV with positions still held blocks loudly; a positionless estate is required); a later adversarial round found the recovered-before-resume door (a persisted zero-NAV intent bypassing re-validation when the run's first NAV read already showed recovery) and closed it the same day; both doors pinned by resume-matrix regression cells |
| M3 | Zero-bid write-off from a single observation, bypassing the illiquidity block at any size | Persistence plus materiality-capped write-offs, one policy context per cycle | closed 2026-08-18: write-off allowance capped at 1% of NAV per position and 2% aggregate, the aggregate budget shared with the negligibility skip; a second book read about 5s later must confirm the empty bid side, with a fresh liquidity re-read on flicker; metadata-unlabeled positions never qualify; a liquidation-resume call site that initially evaluated without the NAV reference (blocking instead of honoring the cap) was aligned the same day. The spec's fuller declared-interval persistence (`zeroBidObservations`/`zeroBidWindow` as record parameters) remains a target |
| M4 | A venue-API failure or unexpected shape yielded an empty position list, and NAV proceeded as all cash | Fail closed; `DATA_UNAVAILABLE` | closed 2026-08-18: position fetches are strict-only and unrecognized response shapes throw; NAV-dependent paths error loudly during outages instead of publishing a false all-cash figure |
| M5 | Position sizes and inventory come from the venue Data API only (with a server-side dust threshold); no transfer-log reconstruction, no `balanceOfBatch` | Chain-derived inventory and quantities | open |
| M6 | Cross-mark accumulation in IEEE-754 floats with one late floor; per-position and total figures need not agree | Integer-only, single floor per position, sum consistency | open (the redemption branch is now integer; the cross path still floats) |
| M7 | Wall-clock reads inside valuation (aging logic defaults to now); in-process caches and retry jitter affect results | Pure compute over recorded time | open (`nowMs` is injectable but defaults to the clock) |
| M8 | Chain reads at `latest`; no block numbers or hashes recorded anywhere | Pinned reads | open |
| M9 | Books: only aggregate proceeds retained; venue correlation fields (book hash, timestamp, tick size) parsed then discarded; no raw-response preservation | Venue-profile capture rules | open |
| M10 | Periodic figures go to an operator database that is publicly readable but privileged-mutable (backfill jobs update historical rows); no published records, no slots, no gap discipline | Published, chained, slot-stamped records | open |
| M11 | An off-chain yield overlay is added outside the engine after NAV, from unpinned reads on another chain | Overlay as a pinned recorded input | open |
| M12 | Engine parameters are constants in code, not carried in records; no methodology or engine identity surfaced | Parameterization in the hashed region | open (the thresholds are now named exported constants, still not record-carried) |

The remaining open rows are conformance work toward L2 and L3, not live hazards.

## Rationale

- **Why chain-derived inventory.** ERC-1155 has no enumeration, so auditing only operator-disclosed ids lets omission pass every balance check. Transfer-log reconstruction is the only completeness argument available from public data, and it is exactly what a hostile auditor would do. The standard just makes the operator do it first.
- **Why "displayed-book cross mark" and not "realizable".** A resting book is unsigned, cancellable intent. The mark is a defined, reproducible function of a disclosed ladder. Calling it realizable would smuggle in a fill guarantee nobody can give.
- **Why capture/compute.** Every nondeterminism complaint against off-chain valuation (clocks, caches, retries, floats, API drift) lands in capture. Freezing capture output as the record's inputs is what turns "trust our engine" into "run the engine yourself".
- **Why the write-off rules are conservative in both directions.** Refusing to invent fallback prices prevents NAV inflation; persistence and materiality caps prevent NAV deflation. Both directions move money between depositor and withdrawer cohorts. Neither is benign.

## Copyright

Copyright and related rights on this document's text are waived via CC0-1.0. No license to any implementation code, trademark, or patent is granted or implied.
