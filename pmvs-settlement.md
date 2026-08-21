# PMVS Part II. Asynchronous vault settlement and epoch-Merkle profile

```
pmvs-part:      settlement
version:        1 (draft)
status:         Pre-EIP review draft
author:         Ivan Morozov (Zeit Finance)
created:        2026-08-18
requires:       PMVS Part I (core)
```

RFC 2119 / RFC 8174 keywords as in Part I.

## Abstract

This Part specifies asynchronous conversion between the accounting asset and the ERC-20 vault share. Deposits escrow the accounting asset. Redemptions escrow vault shares. Settlement applies one price, mints or burns the aggregate share amount, funds the aggregate claims, and makes each selected user amount claimable. Outcome positions remain in the custody declared by the active component generation. This profile does not distribute them to withdrawing investors.

For normal rolls, the `settlement/epoch-merkle/1` profile groups requests into epochs. An off-chain archive builder proposes the selected requests and Merkle roots. The contract checks the selected inputs, recomputes every selected output, funds separate claim reserves, and commits the roots. The separate zero-NAV branch selects no requests and commits a `winddown-opened` action record instead of a settlement archive.

Other settlement designs may conform through versioned profiles that map their request states, accounting, events, funding, and claim paths to this Part.

## Economic meaning of the share

The ERC-20 share persists while outcome positions resolve, merge, or leave the portfolio. A settlement profile MUST state:

1. which assets or rights an accepted deposit receives;
2. when shares are minted and burned;
3. how a request moves through pending, selected or claimable, claimed, cancelled, and failed states;
4. which price and fee rules determine the result;
5. who may delay, select, cancel, or rescue a request;
6. how a holder exits during normal operation and wind-down; and
7. what happens to residual assets, liabilities, pending requests, and outstanding shares at migration or closure.

An ERC-20 balance is not a promise of immediate liquidity. The component record and user interface MUST state request delays, cancellation rules, fees, transfer restrictions, valuation dependence, custody assumptions, and known loss paths. PMVS conformance is not an investment recommendation.

## Modular settlement architecture

The epoch-Merkle profile follows the component split in Part I:

| Component | Settlement responsibility |
|---|---|
| Share vault | Implements the ERC-20 share, holds any temporary accounting-asset buffer, and may hold declared positions under direct or hybrid custody |
| Separate strategy custody, when declared | Holds working collateral and prediction-market outcome positions outside the share vault |
| Accountant | Publishes immutable, attempt-indexed gross prices for the frozen epoch |
| Fee module | Converts gross price into final price and accounts for fee-beneficiary accrual |
| Teller | Mints deposit shares, burns redemption shares, and transfers the accounting asset |
| Strategy operator, when the custody model uses one | Raises accounting assets from the position portfolio and controls transfers to or from separate strategy custody |
| Request adapter | Holds pending asset and share escrow, holds user and fee claim reserves, freezes epochs, commits allocations, and verifies claims |

This profile maps asynchronous requests and Merkle claims to the component roles in Part I. It does not require a Boring Vault interface or separate strategy custody. The active generation can use direct, external, or hybrid custody as defined in Part I. When it declares separate strategy custody, the authorized strategy path sells or redeems positions to raise accounting assets for withdrawals. Exiting investors receive the accounting asset under the settled price and rounding rules. This settlement profile does not transfer outcome positions to them.

### Actor and authority separation

The following terms name different roles even when one deployment assigns more than one role to the same address:

- The **request owner** owns the escrowed input and receives the output or refund.
- The **payer** supplies assets to a deposit made for another owner. Payment does not give the payer cancellation or claim rights.
- The **investor** signs a delegated withdrawal or claim intent. The relayer only submits that intent.
- The **valuation authority** authenticates each immutable epoch-price attempt and its expiry.
- The **normal-roll archive builder** captures inputs, computes the proposed allocation, and constructs and publishes the settlement archive. That work grants no on-chain authority.
- The **settlement authority** chooses requests and submits the roll.
- The **strategy operator** moves portfolio assets and raises liquidity.
- The **fee-policy authority** sets the fee rate within its declared bounds.
- The **fee beneficiary** receives accrued fee shares or assets.
- **Governance** assigns and replaces authorities under the declared control policy.

Each request or intent binds its request owner, payer, investor, and relayer. The component record MUST name every protocol authority and service role, its address or authorization rule, and every overlap. Naming an address as fee beneficiary MUST NOT grant it fee-policy, valuation, settlement, governance, or strategy authority. Naming an address as strategy operator MUST NOT grant it settlement or valuation authority. A production deployment SHOULD use distinct operational keys for valuation, settlement, strategy custody, and governance. Any overlap is a material trust assumption and MUST appear in user-facing risk disclosures.

## Required settlement lifecycle

Every settlement profile defines these stages:

| Stage | Required record or state |
|---|---|
| Request | Owner or controller, input amount, input asset, request identifier, timestamp or block, and initial state |
| Freeze or transition | The event or state change that closes the request set or makes a result claimable |
| Price | Positive `uint64` attempt, immutable keyed price tuple, pre-settlement valuation record, nonzero authenticated valuation-record hash, expiry, units, fees, and rounding |
| Allocation | For a normal roll, the selected requests, exclusions with reason codes, and each output amount; for zero NAV, proof that no request was selected |
| Commitment | The on-chain state or event that binds the branch-specific pre-action record |
| Claim or delivery | For a normal roll, recipient, delivered amount, claimed state, and replay protection; for zero NAV, preservation of every pending request and existing claim path |
| Receipt | Canonical transaction, block, event positions, state changes, and branch-specific action-record hash |
| Escape | Timeout, cancellation, rescue, migration, and retirement behavior |

A profile MUST define a deterministic verifier for every row. It MUST state which properties the chain enforces and which properties the branch-specific pre-action record exposes. Merkle allocation, root, and claim checks apply only when that record is a normal-roll settlement archive.

## Relationship to Ethereum vault interfaces

ERC-4626 defines synchronous tokenized-vault entry, exit, estimates, and previews. ERC-7540 adds asynchronous deposit and redemption requests. ERC-7575 permits an external share token and multiple entry points. A PMVS deployment MAY claim any of these standards only when its contracts satisfy that full standard.

New asynchronous settlement profiles SHOULD use the ERC-7540 request model and ERC-165 detection where their accounting can meet the standard. PMVS adds the external valuation and allocation records. A custom request interface is allowed under its own profile, but it MUST NOT be labeled ERC-7540 by analogy.

## Profile `settlement/epoch-merkle/1`

Users enqueue deposits or withdrawals and escrow the input. For a normal roll, the archive builder captures inputs and constructs the proposed allocation and settlement archive. The settlement authority authorizes the selected requests and submits the epoch advance and roll. These roles may overlap only when the component record declares that overlap. For `n` selected requests, the normal roll performs `O(n)` validation and conversion work before it mints or burns aggregate shares and commits two Merkle roots. A single claim uses an `O(log n)` proof. Deployments MUST cap the selected count per leg so a worst-case normal roll fits within the target chain's gas limit. The zero-NAV branch instead selects no requests and uses a `winddown-opened` pre-action record.

```
normal epoch E open E frozen              E settled          claim window
     |                  |                      |                    |
requests enter    capture and price       commit roots         owners prove
epoch E           build and anchor        mint or burn         and receive
                  the archive             aggregate legs       outputs
```

### Contract interface and source scope

The signatures below define the logical settlement surface. They do not prescribe filenames, inheritance, or one contract per role. A monolith or a component system may conform. The active component-generation record MUST map each required operation to its deployed address and selector and MUST identify the bytecode or source artifact used for that generation. Repository layout, inactive source files, comments, and older design documents do not enlarge the deployed interface or its authority set.

Function names do not merge the fee beneficiary with the strategy operator or governance, and a matching signature does not prove conformance. The deployed behavior must satisfy every invariant in this profile. A generation with different safety behavior needs a separately versioned compatibility profile and an explicit deviation record. Optional bridge, offramp, batching, and convenience selectors are extensions unless this Part names them.

#### Share token

This profile uses 18 share decimals and a `10^18` price scale. The share MUST meet the ERC-20 requirement in Part I. EIP-2612 is optional. The base profile requires exact share transfers and stable share balances. It prohibits share transfer fees, share rebases, share transfer hooks that can alter balances or call untrusted code, and mutable share allow-list or pause behavior that can alter escrowed balances or block cancellation, proof claims, or deadline remedies. A system with any such behavior needs a separately versioned extension with exact accounting, balance-delta, and liveness rules. Reporting the behavior does not make it conform to this base profile. An implementation claims ERC-4626, ERC-7540, or ERC-7575 separately.

#### Request surface

```solidity
function depositAsset(uint256 amount) external returns (uint256 requestId);
function depositAssetFor(address owner, uint256 amount) external returns (uint256 requestId);
function requestWithdraw(uint256 sharesAmount) external returns (uint256 requestId);
function requestWithdrawFor(
    address investor,
    uint256 sharesAmount,
    uint256 intentNonce,
    uint256 intentDeadline,
    uint8 v,
    bytes32 r,
    bytes32 s
) external returns (uint256 requestId);
function cancelDeposit(uint256 requestId) external returns (uint256 refundedAssets);
function cancelWithdraw(uint256 requestId) external returns (uint256 returnedShares);

event DepositQueued (uint256 indexed requestId, uint64 indexed epoch, address indexed owner, uint256 assets);
event WithdrawQueued(uint256 indexed requestId, uint64 indexed epoch, address indexed owner, uint256 shares);
event DepositCancelled (uint256 indexed requestId, uint64 indexed epoch, address indexed owner, uint256 assets);
event WithdrawCancelled(uint256 indexed requestId, uint64 indexed epoch, address indexed owner, uint256 shares);
event WithdrawRequestedFor(address indexed caller, address indexed investor, uint256 indexed requestId, uint256 shares);
```

Requirements:

1. Enqueue escrows the amount, assets on deposit and shares on withdrawal, and binds the request to the live epoch at enqueue time. Zero amounts revert.
2. `depositAsset` takes assets from the caller and makes the caller the request owner. `depositAssetFor` takes assets from the caller and makes the explicit `owner` the request owner. The payer gains no cancellation, claim, or refund right. A zero owner reverts.
3. `requestWithdraw` takes shares from the caller and makes the caller the request owner. `requestWithdrawFor` takes shares from the explicit `investor` only after verifying that investor's exact EIP-712 `WithdrawIntent`, nonce, and deadline. The caller is a relayer and gains no ownership right. A zero investor, expired intent, bad signature, or wrong nonce reverts.
4. Request ids are strictly increasing per leg from 1 (`nextDepositRequestId`, `nextWithdrawRequestId`). Ids MUST be treated as `uint256` end to end (see the 2^53 hazard below).
5. Cancellation, when enabled, is owner-only and only before the request is marked solved. It refunds escrow in full and tombstones the request: owner zeroed, amount zeroed, and `cancelled` set.
6. Lifecycle gates are distinct capabilities and MUST NOT be conflated with the settlement version. `sunsetting` blocks both deposit entry points only. `requestsPaused` blocks all four queue entry points: `depositAsset`, `depositAssetFor`, `requestWithdraw`, and `requestWithdrawFor`. Claims and cancellations keep working. `cancellationsEnabled` gates ordinary cancel paths and MUST be forced on during wind-down and terminal retirement. `retired` is terminal and blocks every queue entry point and every roll permanently.
7. The component record declares whether cancellation is enabled, who can change it, the maximum pending time, and every state in which the owner cannot recover the escrowed input without settlement-authority or governance action.

#### Epoch control

```solidity
function currentEpoch() external view returns (uint64);
function lastProcessedEpoch() external view returns (uint64);
function advanceEpoch(uint64 expectedCurrentEpoch) external returns (bool executed, uint64 newEpoch);
event EpochAdvanced(uint64 indexed newEpoch);
```

1. `advanceEpoch` is restricted to the settlement authority or governance. It requires `expectedCurrentEpoch == currentEpoch` (stale calls revert; an already-advanced expected epoch reverts distinctly), requires `currentEpoch == lastProcessedEpoch + 1` (at most one frozen epoch at a time), and is one-shot per epoch.
2. Epochs start at 1. A migration-replacement adapter MAY initialize its cursor once, only while virgin (no requests, no advances, no rolls), to continue the predecessor's numbering: `initializeEpochCursor(uint64)`, owner-only, emitting `EpochCursorInitialized(currentEpoch, lastProcessedEpoch)`.

#### Settlement commitment

```solidity
struct DepositSettlementInput  { uint256[] requestIds; bytes32 merkleRoot; string dataURI; uint256 totalAssets; uint256 totalShares; }
struct WithdrawSettlementInput { uint256[] requestIds; bytes32 merkleRoot; string dataURI; uint256 totalShares; uint256 totalAssets; }
struct PMVSRetirementState {
    uint256 finalSupply;
    uint256 pendingRequests;
    uint256 outstandingClaims;
    uint256 claimFunding;
}

function currentPriceAttempt(uint64 epoch) external view returns (uint64);
function epochSettlementPrice(uint64 epoch, uint64 priceAttempt)
    external view returns (uint256 grossPps, bytes32 valuationRecord, uint64 validUntil);
function rollEpoch(uint64 epoch, uint64 expectedPriceAttempt, DepositSettlementInput calldata depositData, WithdrawSettlementInput calldata withdrawData)
    external returns (bool executed, uint64);
function rollEpochZeroNav(uint64 epoch, uint64 expectedPriceAttempt) external returns (bool executed, uint64);
function ROLL_SETTLEMENT_VERSION() external view returns (uint64);
function pmvsRetirementState() external view returns (PMVSRetirementState memory);

event DepositSelection (uint64 indexed epoch, bytes32 selectionHash);
event WithdrawSelection(uint64 indexed epoch, bytes32 selectionHash);
event EpochSettlementPricePublished(uint64 indexed epoch, uint64 indexed priceAttempt, bytes32 indexed valuationRecord, uint256 grossPps, uint64 validUntil);
event EpochSettlementPriceUsed(uint64 indexed epoch, uint64 indexed priceAttempt, bytes32 indexed valuationRecord, uint256 grossPps, uint64 validUntil);
event DepositRollCommitted (uint64 indexed epoch, bytes32 merkleRoot, uint256 leafCount, uint256 totalAssets, uint256 totalShares, string dataURI);
event WithdrawRollCommitted(uint64 indexed epoch, bytes32 merkleRoot, uint256 leafCount, uint256 totalShares, uint256 totalAssets, string dataURI);
event ZeroNavWinddownOpened(uint64 indexed epoch, uint64 indexed priceAttempt, bytes32 indexed valuationRecord);
event VaultRetired(bytes32 indexed subjectId); // terminal closure after obligations are resolved
event FinalRollAssetFeeAccrued(uint64 indexed epoch, uint256 ppsGross, uint256 ppsFinal, uint256 feeAssets);

function depositLeafCount(uint64 epoch) external view returns (uint256);
function withdrawLeafCount(uint64 epoch) external view returns (uint256);
function epochFinalPps(uint64 epoch) external view returns (uint256);
```

Price publication is attempt-indexed. Before publication, `currentPriceAttempt(epoch)` returns zero. The first publication for a frozen, unprocessed epoch uses attempt `1`. Each tuple at `(epoch, priceAttempt)` is immutable: it cannot be overwritten, deleted, or extended. A retry MUST use exactly `priceAttempt + 1`, and the valuation authority may publish it only when `block.timestamp > validUntil` for the current attempt. It MUST NOT publish any attempt after the epoch is processed or after either epoch-action branch has succeeded. Attempt zero and values above `type(uint64).max` are invalid; a current attempt of `type(uint64).max` cannot advance. Every successful publication updates `currentPriceAttempt(epoch)` and emits `EpochSettlementPricePublished` with that exact attempt and tuple.

The contract enforces the sequencing and arithmetic checks below. The text identifies the branch-specific pre-action-record comparisons that a verifier must perform off-chain. Settlement-archive, request-list, total, and root comparisons apply only to normal rolls. A contract failure reverts the whole transaction.

1. `rollEpoch(epoch, expectedPriceAttempt, ...)` requires `epoch != 0`, `epoch == lastProcessedEpoch + 1`, `epoch < currentEpoch`, and `rollProcessed[epoch] == false`. The same sequence rule applies to `rollEpochZeroNav`.
2. `expectedPriceAttempt` MUST be a positive `uint64` and equal `currentPriceAttempt(epoch)`. The roll then reads `(grossPps, valuationRecord, validUntil)` from `epochSettlementPrice(epoch, expectedPriceAttempt)`. The selected tuple is immutable and MUST bind all three values; `valuationRecord` MUST be nonzero. `validUntil` is a nonzero Unix-seconds value derived by the exact conversion below. The roll MUST check `block.timestamp <= validUntil` in the same transaction, after reading the record and before marking requests, processing fees, or moving value. The EVM block timestamp is constant for the transaction, so this check covers every later call in that execution. Anchor time, pre-action-record publication time, or a prior simulation does not satisfy this requirement. A stale expected attempt, missing tuple, zero valuation hash, expired tuple, failed read, zero-length return, or malformed return MUST revert. The implementation MUST NOT use another attempt, a cached tuple, a caller-supplied price, or a default price after such a failure. A normal-roll settlement archive MUST repeat the exact `priceAttempt`, `grossPps`, `valuationRecord`, and `validUntil`; the verifier checks those equalities because an off-chain archive field is not itself visible to the settlement contract. The zero-NAV branch binds the same four fields through its `winddown-opened` record, canonical action events, and receipt.
3. The normal roll snapshots the on-chain high-water mark and fee rate once. Its settlement archive MUST repeat those values. A normal `rollEpoch` requires `grossPps > 0`, `ppsFinal > 0`, and `feeRate < WAD`. These checks are exact. `grossPps == 0`, `ppsFinal == 0`, and `feeRate >= WAD` revert before any selection or transfer. A zero-price record can only open the nonterminal zero-NAV wind-down path described below.
   Items 4 through 11 apply to normal rolls. The zero-NAV branch takes no settlement input lists and MUST select no request.
4. Each request-id list MUST be strictly increasing in unsigned numeric order. This rule also excludes duplicates. For every listed id, the contract reads the stored request. It requires a nonzero owner and input, an uncancelled and unselected state, and `request.epoch <= epoch`. Requests from earlier epochs MAY be carried forward. Requests from later epochs MUST NOT settle early.
5. Using checked arithmetic, the contract sums stored deposit assets and stored withdrawal shares across the selected ids. It MUST require these sums to equal `depositData.totalAssets` and `withdrawData.totalShares` exactly. Caller-supplied totals never authorize moving more input than the selected requests escrowed.
6. The contract recomputes each selected output from the stored input and the on-chain `ppsFinal`, using this Part's exact version and rounding rules. A selected request with a zero output reverts. Using checked arithmetic, it sums those outputs and MUST require exact equality with `depositData.totalShares` and `withdrawData.totalAssets`. The contract does not trust settlement-archive amounts or aggregate output totals. An implementation that marks request ids and trusts caller-supplied totals does not implement this production profile.
7. A non-empty leg requires a nonzero Merkle root and positive input and output totals. An empty `requestIds` array requires a zero root and zero totals. This uniform empty-leg check prevents unclaimable minting or burning.
8. For each leg, the contract derives `leafCount` from `requestIds.length`, stores it with the root, and emits it. While marking request id at zero-based array index `i`, it also stores `i + 1` in the leg's leaf-index mapping; zero continues to mean unselected. Claim verification interprets the stored count and index only under `pmvs-merkle/1`. The normal roll does not rebuild the tree, so the settlement-archive verifier must prove that the submitted root contains the exact selected list. The contract records `solvedAt = block.timestamp` only after the preceding checks pass. A revert rolls back every mark and index.
9. `selectionHash = keccak256(abi.encode(requestIds))`: the ABI encoding of the `uint256[]` ordered list, including offset, length, and items. Vectors: `[1,2,3]` gives `0x62e243217b24f0adeab63b697d9c38d64bd4cbf540c9915772ddc377b45b411c`; `[]` gives `0x569e75fc77c1a856f6daaf9e69d8a9566ca34aa47f9133711ce065a571af0cfd`.
10. The validation in items 4 through 6 is `O(n)` in selected ids. `maxSelectedRequestsPerLeg` MUST be an on-chain bound or an immutable deployment parameter. The component record reports the value and the gas test used to show that a maximum-size roll executes on the target chain.
11. `ROLL_SETTLEMENT_VERSION` introspection is REQUIRED on new deployments. For compatibility contracts without the getter, callers MUST infer version 1 only from a positively identified missing selector, meaning empty revert data or a zero-length return, on fingerprinted bytecode listed in the component-generation record. Transport errors, timeouts, and unknown bytecode MUST NOT be read as version 1 because misclassification changes withdrawal prices.

#### Registry and atomic record binding

The base `rollEpoch` and `rollEpochZeroNav` selectors above are the registry-mode surface. Before any covered effect, the contract reads the current subject-stream `(sequence, kind, recordHash)` head from the declared `IPMVSAnchor`. It requires a nonzero hash, the action's exact record kind, and a sequence greater than the last subject-stream sequence consumed by a covered action. It then stores the exact sequence and record hash for the epoch. The normal roll stores `epochArchiveHash`; the zero-NAV transition stores `epochActionRecordHash`. These values are immutable after the action succeeds, and one head cannot cover two actions. Registry mode has no terminal-retirement action in Core v1.

```solidity
function finalizeRetirement() external;
function epochArchiveHash(uint64 epoch) external view returns (bytes32);
function epochActionRecordHash(uint64 epoch) external view returns (bytes32);
function retirementFinalRecordHash() external view returns (bytes32);
function retirementFinalRecordSequence() external view returns (uint64);

event EpochArchiveBound(uint64 indexed epoch, uint64 indexed sequence, bytes32 indexed archiveHash);
event EpochActionRecordBound(uint64 indexed epoch, uint8 indexed kind, uint64 sequence, bytes32 indexed recordHash);
event RetirementFinalRecordBound(uint64 indexed sequence, bytes32 indexed recordHash);
```

The selector of `pmvsRetirementState()` is `0xa951d032`. The getter returns
the live state that the retirement wrapper reads. The four values have these
meanings:

1. `finalSupply` is the ERC-20 share token's current `totalSupply`.
2. `pendingRequests` counts every uncancelled and unselected deposit or
   withdrawal request.
3. `outstandingClaims` counts every selected but undelivered user or fee
   entitlement.
4. `claimFunding` is the total number of accounting-asset units encumbered in
   the disjoint user-claim and fee-claim buckets.

The share token and settlement component maintain these values on every mint,
burn, request, selection, cancellation, claim, fee claim, and migration
transition. `finalSupply` MUST equal the share token's direct `totalSupply`
result. A caller cannot supply or override any value. A deployment that
derives them from an unbounded finalization-time scan does not implement this
interface.

For a normal registry roll, the head kind MUST be 2, `settlement-archive`. For a registry zero-NAV transition, it MUST be 5, `winddown-opened`. The base `finalizeRetirement()` selector MUST revert on every call in every v1 generation. A registry settlement generation MUST complete a conforming migration to an atomic generation before terminal retirement. The settlement contract cannot parse canonical JSON, so for kinds `2` and `5` the verifier loads the record named by the selected getter, checks its canonical hash and `context.epoch`, and compares it with the action. For a normal roll, it also compares every archived id, root, total, price attempt, and deadline. For a zero-NAV transition, it checks the wind-down decision and the authenticated zero-price attempt. Kind `7` has no `context.epoch`; its separate atomic verification is defined below. A verifier MUST NOT treat a `winddown-opened` record as a settlement archive, or a settlement archive as a wind-down action. A `dataURI` value and same-transaction log proximity do not create this binding.

Atomic mode uses `PMVSAnchorInput` from `anchor/evm/1` and exposes these logical wrappers:

```solidity
function rollEpochWithAnchor(
    uint64 epoch,
    uint64 expectedPriceAttempt,
    DepositSettlementInput calldata depositData,
    WithdrawSettlementInput calldata withdrawData,
    PMVSAnchorInput calldata anchorInput,
    bytes calldata signature
) external returns (bool executed, uint64);

function rollEpochZeroNavWithAnchor(
    uint64 epoch,
    uint64 expectedPriceAttempt,
    PMVSAnchorInput calldata anchorInput,
    bytes calldata signature
) external returns (bool executed, uint64);

function finalizeRetirementWithAnchor(
    PMVSAnchorInput calldata anchorInput,
    bytes calldata signature
) external;
```

`rollEpochWithAnchor` requires `anchorInput.kind == 2`, the settlement-archive kind. `rollEpochZeroNavWithAnchor` requires `anchorInput.kind == 5`, the `winddown-opened` kind. Both require a positive `expectedPriceAttempt`, select that exact current attempt, and bind it to the branch record and action events. `finalizeRetirementWithAnchor` requires `anchorInput.kind == 7`, the `retirement-final` kind. Each wrapper checks the subject, subject stream, authority, sequence, predecessor, record hash, and signature under `anchor/evm/1`.

Kinds `2`, `5`, and `7` are protected in an atomic generation. The generic anchor `commit` MUST reject them unless the call comes from the registered covered wrapper, or the wrapper invokes the transition internally. Core v1 kind `7` is subject-only.

`finalizeRetirementWithAnchor` is `nonReentrant`. It reads
`pmvsRetirementState()` from maintained state and requires all four values to
be zero. It then performs the protected kind-7 anchor transition, which MUST
change the anchor's persisted `subjectFinalized(subjectId)` flag from `false`
to `true`, and reads the same state again. The second read MUST match the first
zero state. The wrapper stores the exact record hash and sequence, sets the
settlement `retired` flag, checks the anchor's finalized flag, and emits
`RetirementFinalRecordBound` and `VaultRetired(subjectId)`. All steps succeed
or revert together.

The wrapper MUST NOT accept or execute a resolution call list. It MUST NOT
perform a residual transfer, state-changing token call, arbitrary target call,
hook, or `delegatecall`. Its only external state-changing call is the protected
transition through the pinned active anchor when that transition is not
internal. Fixed interface reads use `staticcall` and require exact return
lengths. A trace that contains another state-changing external call is not a
conforming retirement transaction.

The wrapper treats the canonical JSON as opaque. The exact stored `recordHash`
binds the transaction to those bytes. An independent verifier checks the
record, all pre-finalization resolution evidence, and the complete custody and
accounting perimeters. Component generation replacement uses a separate
anchored `components` migration.

A signed, published, or unanchored `retirement-final` record is nonterminal. So is a kind-7 anchor produced through a contract or call path that does not satisfy this atomic wrapper rule. Neither record publication nor a nearby anchor event can replace the stored hash and sequence, terminal flag, and canonical wrapper transaction.

An atomic deployment MUST make the registry-only base selectors and every other unwrapped path revert, including `finalizeRetirement`. An external registry call counts as atomic only when the covered contract makes that call and requires its success in the same transaction. The component-generation capability map states the active anchor mode, registered wrapper selectors, anchor and resolver addresses, accepted record kinds, and disabled base selectors. No settlement or retirement authority can bypass that map.

#### Claims

```solidity
struct DepositClaim  { uint64 epoch; uint256 requestId; uint256 shares; uint256 leafIndex; bytes32[] proof; }
struct WithdrawClaim { uint64 epoch; uint256 requestId; uint256 assets; uint256 leafIndex; bytes32[] proof; }

function claimDeposits(DepositClaim[] calldata claims) external returns (uint256 totalShares);
function claimWithdrawals(WithdrawClaim[] calldata claims) external returns (uint256 totalAssets);
function isDepositClaimed(uint256 requestId) external view returns (bool);
function isWithdrawClaimed(uint256 requestId) external view returns (bool);
function depositLeafIndex(uint256 requestId) external view returns (uint256 indexPlusOne);
function withdrawLeafIndex(uint256 requestId) external view returns (uint256 indexPlusOne);

event DepositClaimProcessed (uint64 indexed epoch, uint256 indexed requestId, address indexed owner, uint256 amount);
event WithdrawClaimProcessed(uint64 indexed epoch, uint256 indexed requestId, address indexed owner, uint256 amount);
```

1. Base proof claims are owner-initiated. The caller MUST equal the stored request owner unless a separately authenticated delegated-claim extension is used. Claims remain callable while requests are paused, during wind-down, after terminal retirement of request intake, and after the bounded-remedy deadline when that extension is active.
2. Each claim requires an existing request, matching stored owner, uncancelled state, recorded settlement epoch, committed nonzero root, and unclaimed id. The claim epoch MUST equal the request's recorded settlement epoch. For a carried request, this differs from its queued epoch.
3. The contract MUST recompute the expected amount from the stored request input and `epochFinalPps(settlementEpoch)`. The roll stores that positive price once, and no later call can change it. Claim computation uses the same version, decimals, and round-down conversion used during the roll. It requires `expectedAmount > 0` and exact equality between the submitted amount and `expectedAmount`. The roll stores each selected request's one-based ordinal in its leg. A claim requires `leafIndex + 1` to equal that stored value. The leaf is built from the expected amount, not from unchecked claim calldata, and its proof must verify against the count-bound root with that index.
4. Claimed state is per request id. A proof claim and any deadline remedy share the same claimed state and reserve entry. The contract marks the id claimed and decrements the matching reserve before transfer, under reentrancy protection. A duplicate id in one batch therefore reverts rather than paying twice.
5. A zero-amount leaf is invalid on both legs. A batch with no claims or a zero total MUST follow the implementation's declared no-op or revert rule, but it MUST NOT alter claimed state or reserves.
6. A correct proof claim needs no settlement-authority service after commitment. That fact does not by itself give bounded liveness. A bad root, omitted leaf, unavailable proof, or blocked transfer can still prevent proof delivery.

#### Segregated claim reserves

Settlement creates six different accounting buckets: pending deposit assets, pending withdrawal shares, deposit-claim shares, withdrawal-claim assets, fee-beneficiary shares, and fee-beneficiary assets. An amount MUST belong to only one bucket at a time.

The logical reserve surface is:

```solidity
function pendingDepositAssets() external view returns (uint256);
function pendingWithdrawalShares() external view returns (uint256);
function outstandingDepositClaimShares(uint64 epoch) external view returns (uint256);
function outstandingWithdrawalClaimAssets(uint64 epoch) external view returns (uint256);
function totalOutstandingDepositClaimShares() external view returns (uint256);
function totalOutstandingWithdrawalClaimAssets() external view returns (uint256);
function feeBeneficiaryClaimableShares() external view returns (uint256);
function feeBeneficiaryClaimableAssets() external view returns (uint256);
```

The pending getters sum uncancelled, unselected stored inputs. The per-epoch claim getters sum selected, unclaimed outputs. The aggregate claim getters sum those per-epoch values. Every enqueue, cancellation, roll, claim, remedy, fee accrual, fee payment, and migration updates the affected getter in the same transaction.

At a normal roll, the following actions are atomic:

1. The deposit leg moves exactly the selected stored assets out of pending-deposit escrow and mints exactly `depositData.totalShares` into the deposit-claim reserve.
2. The withdrawal leg burns exactly the selected stored shares from pending-withdrawal escrow and transfers exactly `withdrawData.totalAssets` into the withdrawal-claim reserve.
3. Any fee shares or fee assets enter a separate fee-beneficiary bucket. They never enter a user-claim reserve.
4. The roots and solved states commit only after the required reserve funding succeeds. A short transfer, fee-on-transfer result, failed mint, failed burn, or failed balance-delta check reverts the whole roll.

An implementation MAY isolate these buckets in separate contracts or in one contract with separate ledgers. The component record maps the logical getters above to the active addresses and selectors. At every reachable state:

```
controlled settlement shares >= pending withdrawal shares
                              + outstanding deposit-claim shares
                              + fee-beneficiary claimable shares

controlled settlement assets >= pending deposit assets
                              + outstanding withdrawal-claim assets
                              + fee-beneficiary claimable assets
                              + other declared asset encumbrances
```

The terms on the right are disjoint. Claim reserves MUST NOT be approved, lent, staked, bridged, used as strategy collateral, counted as free NAV, paid as fees, or swept as surplus. A fee-beneficiary claim can debit only its fee bucket. A user claim can debit only its leg and epoch reserve. A direct token transfer to a settlement address creates unassigned surplus under the declared donation policy; it does not create a request, reserve, fee, or claim. Tokens at addresses other than the declared accounting asset and share token are ignored for these invariants, even if they copy a symbol or decimals value.

Every bucket uses the exact accounting-asset and share-token addresses in the active component generation. A component MUST NOT change either token address while another active component keeps the old address. A token change requires an atomic migration or a new component generation that moves every pending input, reserve, fee bucket, and claim rule together. Any mixed-asset intermediate state reverts.

Migration MAY move a reserve only in an atomic handoff that fully funds the successor, transfers the claim state, and disables the same claim on the predecessor. Terminal closure cannot sweep a residual reserve. It must first deliver every claim, complete such a handoff, or install a separately specified recovery contract with the same beneficiary and amount.

#### Liveness classification

Every deployment states exactly one of these values in its component record:

- `requestLiveness: "bounded"` means the deployment implements `settlement/bounded-remedy/1` below for every request and claim state.
- `requestLiveness: "operator-dependent"` means at least one request can remain pending or unclaimable until the settlement authority or governance intervenes.

The base proof path in `settlement/epoch-merkle/1`, without the following extension, is `operator-dependent`. An owner-executable proof, a monitor alarm, or a possible governance upgrade does not change that status. The archive example below therefore declares `operator-dependent`. A deployment presented as production-ready under this profile MUST implement the bounded extension. A deployment without it may still declare the base profile, but it MUST use the `operator-dependent` status and disclose the missing guarantee.

The bounded extension exposes these logical operations:

```solidity
function pendingDepositDeadline(uint256 requestId) external view returns (uint64);
function pendingWithdrawDeadline(uint256 requestId) external view returns (uint64);
function claimDeadline(uint64 epoch) external view returns (uint64);
function refundExpiredDeposit(uint256 requestId) external returns (uint256 assets);
function refundExpiredWithdraw(uint256 requestId) external returns (uint256 shares);
function deliverExpiredDeposit(uint256 requestId) external returns (uint256 shares);
function deliverExpiredWithdraw(uint256 requestId) external returns (uint256 assets);
```

Each pending deadline is `queuedAt + maxPendingDuration`, using a positive immutable duration and checked addition. Each claim deadline is `validUntil + claimRemedyDelay`, also using a positive immutable duration and checked addition. These values are deterministic before execution and cannot later be extended. At `block.timestamp >= pendingDeadline`, any caller can trigger a refund of an unselected request, but payment goes only to the stored owner. At `block.timestamp >= claimDeadline`, any caller can trigger delivery of a selected, unclaimed request without a Merkle proof. Delivery goes only to the stored owner. It recomputes the amount from the stored input and `epochFinalPps(settlementEpoch)`, marks the same claim id used by proof claims, and debits the same segregated reserve. It does not trust the root or caller-supplied amounts. Proof claims remain available at all times.

An expired refund uses the same terminal state as ordinary cancellation, without depending on `cancellationsEnabled`. It requires a live, uncancelled, unselected request. Before transfer, it copies the stored owner and amount, marks the request cancelled, zeros the stored owner and input, and decrements the matching pending bucket by the exact amount. Ordinary cancellation and expired refund share this state and replay guard. After either succeeds, selection and every later refund or cancellation for that id revert.

The deadline operations MUST remain callable through request pauses, wind-down, retirement, and migration. They MUST update state before external transfer and use the same reentrancy guard as ordinary claims. A deployment cannot declare `bounded` if an external token pause, allow-list, hook, bridge, or missing reserve can block both direct delivery and a fully funded owner-preserving recovery path past the declared bound. Request liveness is independent of the L1 through L3 conformance levels.

#### Delegated claims (OPTIONAL extension)

EIP-712 intents let a relayer submit on behalf of a signing investor. Domain: `{ name: "PMVSSettlementIntent", version: "1", chainId, verifyingContract }`, with the separator cached at deploy and recomputed on a chain-id fork. Types:

```
WithdrawIntent(address investor,uint256 sharesAmount,uint256 nonce,uint256 deadline)
ClaimAndBridgeIntent(address investor,bytes32 claimsHash,bytes32 sendParamHash,uint256 nonce,uint256 deadline)
ClaimAssetIntent(address investor,bytes32 claimsHash,address depositAddress,uint256 nonce,uint256 deadline)
```

Replay protection is strict sequential per-investor nonces (`provided == expected`, then increment, with `IntentNonceConsumed` emitted). Authorization is ECDSA recovery against the explicit `investor` argument, never `msg.sender`; recovery of `address(0)` rejects. `claimsHash = keccak256(abi.encode(claims))`. Deadlines are inclusive of `block.timestamp`. Bridge- and offramp-specific intent semantics are implementation extensions outside PMVS.

### Normal-roll Merkle commitment encoding

#### Compatibility leaf profile `settlement/epoch-merkle-compat/0`

This encoding is retained only so a verifier can read older epoch-Merkle contracts. A new deployment MUST NOT use it for a production PMVS conformance claim because it does not bind the chain, settlement contract, leg, or leaf count. The normative leaf for `settlement/epoch-merkle/1` is `pmvs-merkle/1` below.

```
leaf = keccak256( be(requestId, 32) ‖ owner(20) ‖ be(amount, 32) ‖ be(settlementEpoch, 8) )
```

A 92-byte preimage: `uint256 requestId`, `address owner` (20 bytes), `uint256 amount` (deposit leg: shares out, 18 decimals; withdraw leg: assets out, asset base units), `uint64 settlementEpoch`. Big-endian throughout. The epoch is 8 bytes. An encoder using `uint256` for the epoch produces a 116-byte preimage and an incompatible root (negative vector below). On-chain the leaf is hashed in assembly over exactly `0x5c` (92) bytes, and the epoch argument is masked to its low 64 bits.

Leaf vectors (epoch 7):

```
(id=1, owner=0x…00a1, amount=250000000000000000000) → 0xbaa954825ec8395047c72ef1147add579dc65b03d0bc4ff998ebf5b0678a9feb
(id=2, owner=0x…00b2, amount=1000000)               → 0xe0c95a7921186802ddabb1c1ad02e7e20dc714871bd416cf346de8f2cb0e0354
(id=3, owner=0x…00c3, amount=123456789012345678)    → 0xdda630ba305851387c6b9c87d0c2494379125fc352f910dbb9fdc38d072c265e
(id=4, owner=0x…00d4, amount=1)                     → 0x5928010a4f0e5614fb61395f269bbc8944e6fbf5691c2b87629df799097601a7
negative, uint256 epoch (116-byte preimage), id=1   -> 0x3d3ad2013e6697286981f29171731c69312e749a0f9d8c5ff07e579af32912cf  (MUST differ)
```

#### Tree

```
                     root  (committed on-chain)
                    /    \
              h(a,b)      h(c,d)         parent = keccak256(min ‖ max)
              /    \      /    \         (pairs sorted bytewise, no flags)
          leaf1  leaf2  leaf3  leaf4
                                         odd node pairs with itself:
          leaf = keccak256(              root([A,B,C]) == root([A,B,C,C])
            id | owner | amount | e64)    the root does not bind leaf count
```

1. Leaves are placed in normal-roll archive-builder order (the settlement archive's claim order); leaves are not sorted.
2. Parent = `keccak256(min(a,b) ‖ max(a,b))`: sibling pairs are sorted bytewise before hashing (solmate `MerkleProofLib` compatible, so proofs need no left/right flags).
3. An odd node at any level is paired with itself (duplicated).
4. An empty leg has root `bytes32(0)`. A single leaf is its own root, with an empty proof.
5. The proof for index i takes, at each level, the sibling at `i XOR 1` (self if out of range), then shifts `i` right by one. Verification also tracks the level width. If the sibling index is out of range, the proof item MUST equal the current node. A claim index MUST be below the stored leaf count.

Tree vectors (fixture leaves 1 through 4 above):

```
n=0: root = 0x0000000000000000000000000000000000000000000000000000000000000000
n=1: root = leaf[1];  proof = []
n=2: root = 0x878e7da2f65f70b23b49f40f32411a8e23f01e56a421dabedb8d464dd545953d
n=3: root = 0xd7c85455641afe8fe037a3b54faffd2a668c485f06db51ecdba88f329abfc468
n=4: root = 0xa41524fd008f5c3eba4ffbd27870441729f6a92713ee620a2da01dc855136092
     proof[0] = [leaf[2], 0x07cdf7afae552a57b7b25a900f30abc9adc7fca261783e959168c24c4309dbff]
     proof[1] = [leaf[1], 0x07cdf7afae552a57b7b25a900f30abc9adc7fca261783e959168c24c4309dbff]
     proof[2] = [leaf[4], 0x878e7da2f65f70b23b49f40f32411a8e23f01e56a421dabedb8d464dd545953d]
     proof[3] = [leaf[3], 0x878e7da2f65f70b23b49f40f32411a8e23f01e56a421dabedb8d464dd545953d]
```

Security properties of `settlement/epoch-merkle-compat/0`:

- **Count ambiguity.** Odd-node duplication makes `root([A,B,C]) == root([A,B,C,C])` (vector: the n=3 root above equals the root of `[leaf1, leaf2, leaf3, leaf3]`). The root therefore does not bind leaf count or multiplicity. Double payment is excluded by the per-request claimed state, not by the tree: request ids are unique and claimable once.
- **Leaf/node separation.** The 92-byte compatibility leaf preimage is structurally distinct from the 64-byte interior-node preimage. The second-preimage argument rests on Keccak-256 and this length difference, not on a semantic domain tag. There is no chain id, contract, leg, or standard-version tag inside this leaf.

New contracts claiming `settlement/epoch-merkle/1` MUST use `pmvs-merkle/1`, which binds the chain, settlement contract, leg, and leaf count:

```
tag  = keccak256(utf8("PMVS:MERKLE:1"))
leaf = keccak256(
    0x00 || tag || be(chainId, 32) || settlementContract(20) || leg(1) ||
    be(epoch, 8) || be(requestId, 32) || owner(20) || be(amount, 32)
)
node = keccak256(0x01 || min(left, right) || max(left, right))
root = count == 0
    ? bytes32(0)
    : keccak256(0x02 || be(count, 32) || rawTreeRoot)
```

`leg` is `0` for deposit and `1` for withdrawal. Odd nodes are still paired with themselves. A claim uses the selected request's stored zero-based ordinal as `leafIndex`, checks it against `count`, and enforces self-pairing at every out-of-range sibling. It then reconstructs `rawTreeRoot` and wraps it with the committed `count`. The count wrapper separates roots that otherwise collide through odd duplication. It does not prove that the normal-roll archive builder included every selected leaf; the settlement-archive verifier rebuilds the complete tree, and the bounded-remedy path delivers an omitted claim after its deadline without relying on a proof. A compatibility contract cannot switch to this encoding under its old identifier. It must use a new settlement contract or versioned claim entry point and preserve all pending requests during migration.

Vector parameters: chain id 137, settlement contract `0x0000000000000000000000000000000000000001`, deposit leg, epoch 7, and the four `(id, owner, amount)` fixtures above. `tag = 0x71df0d2930a2279d0a8f0e38b7a9f5ceadeed5d0b250f4eaf38541b6fd7bf8ed`.

```
leaf[1] = 0xe3828f4a0e565bd31934728c919720da50e3b04fcbb420acd383553630020347
leaf[2] = 0x7738c2cfac6cdd7016602440c642ba8df866083d503fbba24b2efca819263674
leaf[3] = 0x2a874628b9362eef99979257cbfa686e5e87fcf459947420b0148543c3d4bd1f
leaf[4] = 0xe0c39d2f2648281792cfac2ffccf0e477763ffc4f6001ced2945a43142b0b03e
root n=0 = 0x0000000000000000000000000000000000000000000000000000000000000000
root n=1 = 0x327bf84a9831b47cbdb17b933faf58d4d97dd740f09e62829a51044c6927e5ce
root n=2 = 0xd550b747cd129527e35a6bf8dc52efd0855c2f883e715f6d38ffc33cd2439481
root n=3 = 0x50fae70f5d14d28d9a0f99890dc162a0bc85367e3c8d398f7e00b8c1883b07db
root n=4 = 0xfba7ece31939e2cbf77a8f6b0dbeae5087f7df283828fcb463f42f59dd41e033
```

#### Normal-roll archive/selection bijection

For each normal-roll leg, the settlement archive's claim list, the transaction's `requestIds`, and the leaf set MUST be equal as ordered lists: one claim per selected id in strictly increasing unsigned numeric order. Each claim's `leafIndex` MUST equal its zero-based position in those lists and its proof MUST equal the proof derived from the complete canonical leaf set. A non-increasing id list reverts on-chain.

#### The 2^53 hazard

Request ids and epochs are `uint256` and `uint64`. Tooling that routes ids through IEEE-754 doubles corrupts them: `Number(9007199254740993) == 9007199254740992`. Normal-roll settlement archives MUST carry ids as decimal strings under PMVS-JCS. A producer MUST reject any path that converts them through a host-language number.

### Settlement computation

#### Time units and expiry conversion

`capture.startedAtMs`, `capture.endedAtMs`, `maxSkewMs`, `maxVenueResponseLagMs`, and `maxCaptureAgeMs` are Unix milliseconds. `validUntil`, `executionTimestamp`, `queuedAt`, intent deadlines, pending deadlines, and claim deadlines are Unix seconds. Normal-roll settlement archives and receipts encode each value as a decimal string. Contract getters use `uint64` seconds.

The producer and verifier derive the settlement deadline exactly:

```
expiryMs          = checkedAdd(capture.endedAtMs, maxCaptureAgeMs)
validUntil        = floor(expiryMs / 1000)
executionTimestamp = block.timestamp
fresh             = checkedMul(executionTimestamp, 1000) <= expiryMs
                  = executionTimestamp <= validUntil
```

`checkedAdd` and `checkedMul` use checked `uint256` arithmetic. The derived `validUntil` MUST be nonzero and fit `uint64`; otherwise the record is invalid. The price publisher MUST store the derived value in the immutable attempt tuple; it cannot round up or choose a later second. The roll enforces the final comparison for the exact selected attempt in the execution transaction. The receipt stores `executionTimestamp = block.timestamp`, not a wall-clock observation from the builder. A verifier checks the millisecond formula against the valuation record and checks both second-valued fields against the canonical settlement block.

All arithmetic is unsigned integer math. `floor` and `ceil` state division rounding. This profile requires accounting-asset decimals `0 <= D <= 18`, sets `WAD = 10^18`, and sets `BRIDGE = 10^(18-D)`. For a 6-decimal accounting asset, `BRIDGE = 10^12`. `gross`, `hwm`, and `r` are `uint256`. A normal roll requires `gross > 0`, `netPps(gross, hwm, r) > 0`, and `r < WAD`. Implementations MUST use checked full-precision multiplication and division. An intermediate overflow is not a rounding rule.

#### Gross and net price per share

The gross settlement price is `outputs.pps` in the attempt's PMVS-M1 valuation record. "Gross" here means before the performance fee owed to the fee beneficiary. Its position marks already subtract the venue profile's execution-cost cap. The valuation authority publishes `(grossPps, valuationRecord, validUntil)` under a positive `priceAttempt`. If that attempt expires before execution, the authority may publish the next attempt only under the immutable retry rule above. The roll reads the exact expected attempt back and enforces its expiry in the execution transaction.

```
netPps(gross, hwm, r):
    if gross <= hwm:  return gross
    delta = gross − hwm
    keep  = (r == 0) ? delta : floor((WAD − r) · delta / WAD)
    return hwm + keep
```

Version semantics (`ROLL_SETTLEMENT_VERSION`):

- **Version 2, normative for new deployments.** The performance fee is processed on the pre-flow supply, before this roll's deposit mint and withdrawal burn, and both legs settle at `netPps`: deposit shares and withdrawal assets are priced post-fee, so NAV divided by total supply lands on the next epoch's start rate.
- **Version 1, compatibility only.** Fees apply to the post-deposit supply, and both legs settle at `gross`. New deployments MUST NOT implement version 1.

#### Performance-fee share mint (non-final rolls)

Two separately-rounded ceilings. This is not equal to a single-ceiling formula:

```
if gross > hwm and r != 0 and not finalRoll and supply != 0:
    delta        = gross − hwm
    ppsFinal     = netPps(gross, hwm, r)
    feePerShare  = ceil(r · delta / WAD)                   # stage 1
    sharesMinted = ceil(supply · feePerShare / ppsFinal)   # stage 2
new HWM = ppsFinal whenever gross > hwm (raise-only; enforced on-chain)
```

Vectors:

```
gross=1.1e18 hwm=1.0e18 r=0.2e18 supply=1000e18 → ppsFinal=1.08e18, sharesMinted=18518518518518518519
finalRoll=true, same inputs                     → sharesMinted=0 (fee taken in assets, below)
adversarial r=1, delta=1, supply=100e18, ppsFinal=1e18:
    two-stage  → feePerShare=1, sharesMinted=100
    single-ceil ceil(supply·r·delta/(WAD·ppsFinal)) → 1        # WRONG; MUST NOT be used
```

The mint is directed to the settlement contract and accounted in the fee-beneficiary share bucket. It MUST NOT increase the deposit-claim reserve. `FeeMintBasis(epoch, ppsGross, hwm, feeRate, supplyBeforeFees, delta, sharesMinted)` and `FeeProcessed` are emitted. If no fee module is configured, `ppsFinal = gross` and no mint occurs.

This profile has one vault-wide high-water mark. Shares issued after a loss enter at the current price but may benefit from recovery below the old high-water mark without a performance fee. Different entry cohorts can therefore subsidize one another. A deployment using this fee model MUST disclose that effect. A series-accounting or equalization method needs a different fee profile and separate vectors; it MUST NOT silently change these equations.

#### Final-roll asset fee (version 2)

A roll is final if and only if the deposit leg is empty and zero, the withdrawal leg is nonempty, and `withdrawData.totalShares == supplyBeforeFees`. Equality is required. On a final roll no fee shares are minted because supply goes to zero. The fee instead crystallizes in assets, atomically.

The logical funding-source surface is:

```solidity
function fundingSourceCount() external view returns (uint256);
function fundingSourceAt(uint256 index) external view returns (address);
function assetEncumbrance(address source) external view returns (uint256);
```

The source list contains no zero address or duplicate. `assetEncumbrance` returns the complete accounting-asset obligation assigned to that source before the current roll.

```
candidate = floor(withdrawTotalShares · (gross − ppsFinal) / (WAD · BRIDGE))     # 1e30 for D=6
sourceAssets = sum of accounting-asset balances in the declared funding-source set
encumberedBefore = obligations already allocated to those same balances
freeBefore = max(sourceAssets − encumberedBefore, 0)
headroom  = max(freeBefore − withdrawTotalAssets, 0)
feeAssets = min(candidate, headroom)
```

The funding-source set is stored on-chain for the active component generation. The roll cannot accept a caller-supplied source set. Each asset bucket and liability is assigned to exactly one source account when it is created or migrated. The assignment can change only in an atomic move of both balance and ledger state. The union of assignments MUST include every obligation that any listed source can be required to pay.

The set includes only addresses from which the roll can transfer the accounting asset atomically. It excludes outcome positions, unsettled venue balances, unsupported tokens, and unreachable balances. The contract computes `sourceAssets` from the canonical accounting-asset balances at those addresses. It computes `encumberedBefore` from the stored bucket and liability assignments. This value includes every prior withdrawal-claim reserve, pending-deposit escrow, accrued fee-beneficiary asset balance, debt, and other declared liability assigned to a source. Each unit of balance and each obligation is counted once. A normal-roll settlement-archive label cannot move an obligation outside this computation. A raw balance is not headroom merely because it sits at a controlled address.

The roll first proves that `freeBefore` can fund `withdrawTotalAssets`. It then caps the fee from what remains. It transfers both amounts atomically into separate withdrawal-claim and fee-beneficiary reserves and verifies exact balance deltas. The claim reserve is never fee headroom. `FinalRollAssetFeeAccrued(epoch, gross, ppsFinal, feeAssets)` records the fee. A one-shot crystallization flag blocks every later fee path for the same economic gain.

Any alternate fee entrypoint that accepts a caller-chosen payer or fee amount does not implement this formula. A deployment claiming this profile MUST disable that entrypoint for the same fee or place it under a separately versioned fee profile with an on-chain derivation, explicit payer authorization, segregated funding, and duplicate-charge protection.

Vector: `withdrawShares=500e18, gross=1.2e18, hwm=1.0e18, r=0.2e18` gives `ppsFinal=1.16e18` and `candidate=20000000` (20 asset units at D=6). If `sourceAssets - encumberedBefore = withdrawTotalAssets + candidate - 7`, then `feeAssets = candidate - 7`. Adding a prior claim reserve to the raw source balance does not increase this result because the same amount also increases `encumberedBefore`.

#### Per-request conversions

```
deposit:  sharesOut = floor(assets · BRIDGE · WAD / pps)      # pps = netPps (v2) or gross (v1)
withdraw: assetsOut = floor(shares · pps / (WAD · BRIDGE))
```

Vectors (pps = 1.05e18, D = 6): `assets=250000000` gives `sharesOut=238095238095238095238`; `shares=238095238095238095238` gives `assetsOut=249999999`.

The zero-output rule is the same during normal operation and wind-down. A request whose conversion is zero remains pending and appears in `excluded` with reason `zero_output`. It MUST NOT be selected, burned, or placed in a zero leaf. It can use cancellation, migration, or a separately specified residual-recovery profile.

This profile never raises an individual payout to one base unit. A per-request minimum can be multiplied by splitting one holding into many requests, so reserve sizing does not make that rule safe. If wind-down distributes sub-unit residual value, it MUST use a separate aggregate pro-rata rule with a fixed holder or request snapshot and an explicit remainder rule. That distribution is not an epoch-Merkle conversion under this profile. The compatibility field `dustFloorApplied`, where an archive schema retains it, MUST always be `false`.

Rounding direction table:

| Quantity | Direction | Exception |
|---|---|---|
| Deposit shares out | down | zero result: leave the request pending |
| Withdrawal assets out | down | zero result: leave the request pending |
| Fee share mint | up (both stages) | none |
| Final-roll asset fee | down, then capped by headroom | none |
| Investor portion of gain (netPps) | down | none |

#### Normal-roll on-chain conservation and archive verification

For every normal roll, over the settlement archive's claims:

```
deposit.totalAssets  == Σ queued assets of selected deposit requests      (from DepositQueued events)
deposit.totalShares  == Σ deposit leaf amounts (shares out)
withdraw.totalShares == Σ queued shares of selected withdraw requests     (from WithdrawQueued events)
withdraw.totalAssets == Σ withdraw leaf amounts (assets out)
```

The contract enforces all four equalities before moving value. For the input equalities, it sums stored requests. For the output equalities, it sums the per-request conversions that it recomputes from `ppsFinal`. Empty ids imply a zero root and zero totals. The settlement archive then proves the ordered request-to-leaf mapping and rebuilds both roots. A verifier reports `SETTLEMENT_MISMATCH` for any archive, event, stored total, or recomputed amount that differs, even if the transaction itself reverted before value moved. The zero-NAV branch has no conservation equation, allocation, or root; its required invariant is that it selects no requests and changes no request, fee, reserve, or supply state.

### Settlement archive, schema version 1

One settlement archive per normal roll, published as a Part I record (`kind: "settlement-archive"`, hashed, attested, anchored). Schema (PMVS-JCS; every quantity a decimal string in base units):

```jsonc
{
  "schema": "pmvs/settlement-archive", "schemaVersion": "1",
  "subject": { "chainId": "137", "shareToken": "0x…" },
  "components": "0x…",                  // recordHash of the governing component-generation record
  "context": { "stream": "subject", "kind": "settlement-archive", "sequence": "…",
               "prev": "0x…", "producedAt": "…", "epoch": "…" },
  "settlement": {
    "settlementProfile": "settlement/epoch-merkle/1",
    "settlementVersion": "2",
    "priceAttempt": "…",
    "grossPps": "…", "ppsFinal": "…", "highWaterMark": "…", "feeRate": "…",
    "validUntil": "…",                  // Unix seconds, derived from capture millisecond fields
    "valuationRecord": "0x…",           // nonzero recordHash of the required pre-roll evidence valuation record
    "merkleProfile": "pmvs-merkle/1",
    "requestLiveness": "operator-dependent",
    "claimDeadline": null                // decimal Unix seconds when bounded; null when operator-dependent
  },
  "deposit": {
    "requestIds": ["…"], "root": "0x…", "totalAssets": "…", "totalShares": "…",
    "claims": [ { "requestId": "…", "owner": "0x…", "queuedEpoch": "…", "settlementEpoch": "…",
                  "queuedAssets": "…", "shares": "…", "leafIndex": "…", "proof": ["0x…"] } ]
  },
  "withdraw": {
    "requestIds": ["…"], "root": "0x…", "totalShares": "…", "totalAssets": "…",
    "claims": [ { "requestId": "…", "owner": "0x…", "queuedEpoch": "…", "settlementEpoch": "…",
                  "queuedShares": "…", "assets": "…", "dustFloorApplied": false,
                  "leafIndex": "…", "proof": ["0x…"] } ]
  },
  "excluded": [ { "leg": "withdraw", "requestId": "…", "reason": "zero_output" } ],
  "supersedesUnexecuted": null,
  "extensions": [],
  "meta": {}
}
```

Empty legs use `requestIds: []`, a zero root, zero totals, and `claims: []`; they never use `null`. `priceAttempt` MUST be a positive `uint64` and equal the on-chain attempt selected by the roll. `valuationRecord` MUST be nonzero. `validUntil` is decimal Unix seconds and MUST equal both the millisecond-derived valuation expiry and the expiry stored for that exact attempt. A bounded deployment records the immutable on-chain claim deadline in Unix seconds. An operator-dependent deployment uses `null` and MUST NOT advertise a deadline remedy. A claim client submits the committed post-rounding amount, but the contract and verifier both re-derive it. `dustFloorApplied` is a compatibility field and MUST be `false`; it never authorizes a payout floor. A zero-output request remains unselected and pending under every lifecycle state in this profile. The schema is closed under Part I's extension rule. The `excluded` list makes non-selection reasons checkable. The archive never relies on filenames, tags, or database ids. `supersedesUnexecuted` is required and nullable on both branch-record kinds. It names the latest unresolved registry-anchored, receipt-less pre-action record for the same subject and epoch, across both branch kinds, and that record must have an earlier stream sequence and price attempt. It is `null` only when no such record exists.

### Epoch-action lifecycle: commitment chronology

Pre-state evidence and post-state evidence are separate because a record built before execution cannot know the transaction hash or resulting block.

Let `P_(E,n)` denote the branch-specific pre-action record for epoch `E` and price attempt `n`: `A_(E,n)`, a `settlement-archive`, for a normal roll; or `W_(E,n)`, a `winddown-opened` record, for a zero-NAV action.

```
1. Freeze     advanceEpoch(E); later requests enter E+1
2. Value      build V_(E,n); canonicalize, sign, publish, verify read-back, and directly anchor it
3. Price      publish immutable attempt n with nonzero H(V_(E,n)), grossPps, and validUntil
4. Branch     normal: select requests, compute both legs, and build A_(E,n) referencing V_(E,n)
              zero NAV: select no requests and build W_(E,n) for the wind-down decision
5. Prepare    canonicalize, sign, publish, and verify read-back of P_(E,n)
6. Commit     registry mode: anchor P_(E,n) before execution
              atomic mode: prepare P_(E,n) for the action transaction
7. Execute    require expectedPriceAttempt == currentPriceAttempt(E)
              load attempt n and check its validUntil in this transaction
              atomic mode anchors P_(E,n) and executes the action in one transaction
              registry mode executes only after the P_(E,n) anchor is final enough
8. Receipt    build R_(E,n) from the canonical transaction and resulting state
9. Publish    canonicalize, sign, publish, and anchor R_(E,n) within the receipt grace
```

L1 is an evidence-bound settlement claim. It requires `V_(E,n)` to have a
nonzero authenticated hash and to pass Part III's complete custody-perimeter,
position-inventory, pinned-input, capture, quiescence, and applicable
settlement-policy checks. Record validity or diagnostic profile validation is
not enough. The branch-specific pre-action record, immutable price attempt,
action, events, funded claims, and anchored post-action receipt must bind to
that valuation. L1 does not reproduce the complete NAV or PPS computation.
L2 adds a closed compute profile and deterministic replay of every
settlement-bearing output without trusting the recorded outputs.

Inside a normal `rollEpoch`, this profile first checks authority and sequence, then reads and validates the authenticated price and expiry. It validates every selected request, sums stored inputs, recomputes and sums outputs, and checks the leg shapes and roots. It then determines final-roll status and processes fees. With the reentrancy guard active, it records the selections, roots, counts, totals, `ppsFinal`, reserve changes, and bounded-remedy deadlines when that extension is active. It records these effects before calls that can invoke external code. It moves the exact aggregate inputs, funds separate claim reserves, and checks the balance deltas. It then emits the commitments, seeds the next start price, and marks the epoch processed. Any failure reverts every step, including the recorded effects.

Normal-roll selection events do not prove pre-disclosure because they occur inside the roll. The pre-roll settlement archive lists the same ids, and the verifier compares the emitted hashes afterward. A `dataURI` event field is only a location hint.

In registry mode, a failed or expired normal roll or zero-NAV action leaves its branch-specific pre-action-record anchor in history as `UNEXECUTED_ANCHOR`. The settlement authority cannot extend or overwrite that price tuple. Only after attempt `n` expires may the valuation authority publish attempt `n + 1`, with a fresh valuation and expiry, provided the epoch remains unprocessed and neither branch has succeeded. The new branch-specific pre-action record uses that exact attempt at a new subject-stream sequence. Its required `supersedesUnexecuted` field names the latest unresolved `settlement-archive` or `winddown-opened` record for the subject and epoch, even if the retry changes branches. The earlier record and price tuple are never rewritten. The field is `null` when no earlier unexecuted record is superseded. In atomic mode, a failed transaction leaves neither the action nor its anchor.

Every receipt contains exactly one `action` object with three fields: `type`, `recordKind`, and `recordHash`. It has no top-level `archiveHash` field.

| `action.type` | `action.recordKind` | Required getter | Price gate |
|---|---|---|---|
| `normal-roll` | `settlement-archive` | `epochArchiveHash(epoch)` | `observed.grossPps > 0` and `observed.ppsFinal > 0` |
| `zero-nav` | `winddown-opened` | `epochActionRecordHash(epoch)` | `observed.grossPps == 0` and `observed.ppsFinal == 0` |

`action.recordHash` MUST be nonzero and equal the selected getter, the canonical hash of the loaded record, and the record hash consumed by the action. In atomic mode, it MUST also equal `anchorInput.recordHash` and the updated anchor head. The receipt's `context.epoch` MUST be a positive `uint64`. It MUST equal the loaded record's `context.epoch` and the epoch in the canonical action events. The action type and record kind MUST match the same row of the table. A verifier MUST reject any type, kind, hash, getter, or epoch combination that mixes the two rows.

The receipt also contains the subject, component hash, transaction hash, block number and hash, and event log indices and values. Its `observed` object records `priceAttempt`, `valuationRecord`, `grossPps`, `validUntil`, `executionTimestamp`, `ppsFinal`, fee results, supply before and after, `sourceAssets`, `encumberedBefore`, `freeBefore`, `reserveBuckets`, `fundingSources`, and `assetBalances`. The record ends with the retirement result, extensions, and metadata.

`observed.priceAttempt` MUST be a positive `uint64` and equal the attempt in the authenticated tuple, the branch-specific action record, the expected attempt selected on-chain, and the canonical action events. The observed valuation hash, gross price, and expiry MUST equal that same attempt tuple. `observed.ppsFinal` MUST equal the on-chain action result and satisfy the selected row's price gate. `validUntil` and `executionTimestamp` are decimal Unix seconds. `executionTimestamp` MUST equal the canonical settlement block's `block.timestamp`. Each `reserveBuckets` item records `{id, asset, before, after}`. Each `fundingSources` item records `{account, assetBalanceBefore, encumberedBefore, freeBefore}`. Each `assetBalances` item records `{account, asset, before, after}`. Other integer values also use decimal strings.

For `zero-nav`, the receipt and canonical transaction MUST show no deposit or withdrawal selection, no fee-share mint, no final asset fee, no change in total share supply, and `retirement: {triggered: false, reason: null}`. A `normal-roll` receipt also has `retirement: {triggered: false, reason: null}` because terminal retirement is a separate action. The stored record hash, not a URI or nearby log order, binds the committed record to execution.

### Retirement in this profile

Two records describe distinct steps:

1. **`winddown-opened`** records the decision, reason, time, request gates, cancellation state, and plans for open positions and pending requests. Its `context.epoch`, `priceAttempt`, and `validUntil` are positive `uint64` values. Its `grossPps` is exactly `"0"`, and `valuationRecord` is a nonzero record hash. These four top-level price fields repeat the exact immutable tuple that opens or continues wind-down. Its required nullable `supersedesUnexecuted` field names the latest unresolved registry pre-action record for the same subject and epoch, across both branch kinds, when this is a retry. It is `null` only when no such record exists. Wind-down is reversible only under the rule declared in the record.
2. **`retirement-final`** carries the assertion that the whole subject can close. In Core v1, `scope` MUST be `"subject"`; `reason` is one of `supply-exhausted`, `zero-nav`, `governance-closure`, or `other`; and `migration` MUST be `null`. The reason `superseded` and every generation-scoped kind-7 record are invalid. `finalSupply`, `pendingRequests`, `outstandingClaims`, and `claimFunding` MUST each equal `"0"`. The verifier matches `lastArchiveHash` to the subject's settlement history.

The record has four closed arrays, each strictly ordered by unique `id`: `residualPositions`, `residualCash`, `feeAccruals`, and `liabilities`. Every listed quantity or amount is positive and has a closed `resolution`. Its action is `redeem`, `burn`, `transfer`, `distribute`, `pay`, `release`, or `waive`; `beneficiary` is a nonzero address or `null`. Every resolution uses `timing: "before-finalization"` and a nonzero evidence hash. Each entry records a completed action that the wrapper does not consume as an instruction. An empty array asserts that no nonzero item of that class required resolution. The independent verifier proves completeness against the custody and accounting perimeter.

`recovery` is either `{status: "none", rightsCount: "0", manifestHash: null}` or a fully resolved declaration. A resolved declaration uses `resolved-before-finalization`, a positive rights count, and a nonzero exhaustive manifest hash. Core v1 permits no open, migrated, or finalization-time recovery right at retirement. The manifest records evidence that every named right was resolved before the wrapper transaction. The wrapper does not consume the manifest as calldata. The record alone does not close anything; the atomic finalization below must consume it successfully. A component generation is replaced only through the anchored `components` migration in Part I.

If NAV becomes positive during wind-down, each later normal roll uses a fresh valuation and a positive immutable price attempt for that epoch. No wind-down price carries across epochs, and an expired tuple is never replaced. Later proceeds, expenses, losses, and residual assets enter that fresh valuation or a separately specified migration, pro-rata loss, or recovery profile.

Zero NAV is a distressed state, not terminal retirement. Before
`rollEpochZeroNav`, the valuation authority publishes a post-redemption
valuation under Part III with `grossPps == 0`, a nonzero valuation-record hash,
an unexpired `validUntil`, and a positive `priceAttempt`. For L1, that valuation
must pass the same complete perimeter, inventory, input, capture, quiescence,
and policy checks as a positive valuation. Complete NAV and PPS replay remains
an L2 requirement. The `winddown-opened` record repeats all four fields of that
exact attempt tuple. The entry point requires its `expectedPriceAttempt` to
equal the current attempt, reads the keyed tuple, and matches the attempt in
its events. The wind-down decision is anchored before execution in registry
mode or in the same transaction in atomic mode. The entry point selects no
request, burns no share, pays no zero-value claim, and sets no terminal
`retired` flag.

`rollEpochZeroNav` advances the epoch cursor, opens or continues wind-down, blocks new deposits, and enables cancellation of every unselected request. It preserves prior claim reserves and all claim and deadline-remedy paths. Withdrawal requests remain pending until assets recover, a positive-price roll becomes possible, or a separately specified migration, pro-rata loss, or recovery profile takes control. The event is `ZeroNavWinddownOpened`, not `VaultRetired`.

An implementation whose zero-NAV path omits an L1 valuation gate, or whose
ordinary zero-supply withdrawal sets terminal retirement without checking
every pending request and outstanding claim, does not implement this
production profile.

A final withdrawal roll never creates terminal retirement. The base `finalizeRetirement` selector always reverts. Only `finalizeRetirementWithAnchor` in an atomic generation can close the subject. It reads and rechecks the four zero counters, consumes and anchors the exact subject-only kind-7 record, stores its hash and sequence, sets `retired` and `subjectFinalized(subjectId)`, and emits the binding and retirement events in one transaction. It executes no resolution. The independent verifier checks that every declared resolution predates this transaction and that the complete custody and accounting perimeters are empty. Any failed on-chain check reverts the anchor, stored binding, terminal flags, and events. After success, the anchor accepts only subject-stream kind-8 corrections whose `changesSettlementBearingOutput` is `false`. A signed, published, unanchored, generation-scoped, or otherwise nonconforming kind-7 record is nonterminal.

A registry settlement generation cannot retire in place under Core v1. It must first complete the migration rules in Part I and move every request, claim, reserve, balance, share, and recovery right to an atomic generation. Only that successor generation can run terminal finalization. If transferable shares remain without an enforceable redemption, migration, burn, or recovery right, the verifier reports `STRANDED_SHARE_SUPPLY`; the subject cannot claim final closure.

## Verification procedure (settlement scope)

Given a subject, an archive-capable RPC, and storage access:

1. **Discover.** Collect price-publication, RollCommitted, Selection, EpochAdvanced, EpochSettlementPriceUsed, ZeroNavWinddownOpened, RetirementFinalRecordBound, VaultRetired, reserve, claim, and fee events plus registry and atomic anchors; collect published records by tag or index. Classify each successful epoch action and terminal finalization. Both settlement branches MUST have the required pre-settlement valuation record identified by the nonzero authenticated valuation hash and an anchored post-action receipt. A normal roll MUST also have an anchored `settlement-archive` and a funded claim path. A zero-NAV transition MUST instead have an anchored `winddown-opened` record and select no requests. Cross-check both directions and report `MISSING_RECORD`, `UNANCHORED`, or `UNEXECUTED_ANCHOR` as applicable. Do not infer terminal state from a kind-7 record without its canonical atomic finalization.
2. **Integrity (Part I).** Hash, canonicality, attestation, authority-at-anchor, chain walk.
3. **Valuation evidence (Part III).** For every positive or zero-NAV settlement, derive the active custody perimeter from the component generation and run the chain-state, inventory, capture, quiescence, continuity, staleness, and applicable policy checks. Require every profile verifier to use its settlement scope. An incomplete or unverifiable inventory, missing required input, failed read, incomplete capture, unsupported position, weak capture mode, stale evidence, or failed settlement policy prevents L1 and every higher level. A record-valid or diagnostic-only result cannot pass this step. Do not report complete NAV or PPS reproduction unless the selected method also satisfies L2.
4. **Roots.** For a normal roll, rebuild both trees from the archived claims under the declared leaf profile; compare them with the event and storage roots. Recompute selection hashes from the archived id lists and compare them with the Selection events. A zero-NAV transition MUST have no selection on either leg.
5. **Conservation and funding.** For a normal roll, recompute the four on-chain equations from stored requests and Queued events. Check empty-leg uniformity, selected-id uniqueness, the exclusion list, and the archive-to-root bijection. Reconcile every pending, claim, and fee bucket before and after the roll. Require the canonical token balances to cover all disjoint obligations across every epoch. Return `UNDERFUNDED_CLAIMS` on a shortfall or bucket overlap. For a zero-NAV transition, confirm that request selections, fee buckets, claim reserves, and total share supply did not change.
6. **Pricing and freshness.** Reconstruct the immutable attempt history for the epoch. Require positive `uint64` attempts starting at one, exact increments, no overwrite, and each retry publication strictly after the prior expiry and before any successful processing. For a normal roll, match `(priceAttempt, grossPps, valuationRecord, validUntil)` across the keyed authenticated tuple, archive, expected on-chain attempt, events, and receipt. Require positive `grossPps` and `ppsFinal`, recompute `netPps`, require `feeRate < WAD`, check the version rule against `ROLL_SETTLEMENT_VERSION`, and re-derive every claim amount. On final rolls, recompute `feeAssets` only from the declared source balances after every prior encumbrance. On fee-share rolls, recompute the two-stage mint and compare it with `FeeMintBasis`. For a zero-NAV transition, match the same four attempt fields across the keyed tuple, wind-down record, expected on-chain attempt, events, and receipt, and require both receipt prices to be zero. For either branch, require the canonical execution timestamp to be no later than that attempt's `validUntil`.
7. **Receipt.** Match the receipt's transaction to the chain, including the canonical block hash at the confirmation depth and verbatim log indices and values. Check the action type, record kind, positive epoch and `priceAttempt`, canonical record hash, and branch-specific price gate. A normal receipt uses `epochArchiveHash(epoch)`. A zero-NAV receipt uses `epochActionRecordHash(epoch)`. In atomic mode, also require equality with `anchorInput.recordHash` and the updated anchor head. Reject any receipt that crosses the two rows or names a different price attempt.
8. **Liveness.** Reconstruct every request state. An operator-dependent deployment gets no deadline guarantee. For a bounded declaration, compare ages with immutable on-chain deadlines and test permissionless owner-directed refunds and proofless deliveries from current chain state. Confirm that both routes share claimed state and reserve accounting with ordinary claims.
9. **Retirement.** Confirm that zero NAV opened wind-down without setting terminal retirement and that every later positive settlement used a fresh attempt valuation. Require `scope: "subject"`, an allowed reason other than `superseded`, `migration: null`, and exact zero values for final supply, pending requests, outstanding claims, and claim funding. Reconstruct the four live counters and confirm that the wrapper read the same zero state before and after the anchor call. Check all four residual arrays for closed shape, id order, completeness, valid resolution action, beneficiary, `before-finalization` timing, and nonzero evidence hash. Prove that every evidence transaction is canonical and precedes the wrapper transaction. Check the recovery status, count, exhaustive manifest, and completed rights. Prove independently that the complete custody and accounting perimeters are empty. The wrapper trace must contain no resolution, state-changing token, arbitrary target, hook, or `delegatecall` execution. A terminal claim also requires the canonical successful registered atomic wrapper transaction, protected kind-7 anchor, stored matching record hash and sequence, settlement `retired` flag, anchor `subjectFinalized(subjectId)` flag, and exact `RetirementFinalRecordBound` and `VaultRetired(subjectId)` events. Confirm that every later accepted anchor is a subject-stream kind-8 correction with `changesSettlementBearingOutput: false`. A registry generation must migrate to an atomic generation before this step. Treat any dangling or nonconforming kind-7 record as nonterminal. Report `STRANDED_SHARE_SUPPLY` when applicable.
10. **Continuity.** Require an unbroken epoch sequence across successful normal and zero-NAV actions and an immutable, ordered price-attempt history within each epoch. Track carried-forward requests and report expired bounds. Classify any registry-anchored branch-specific pre-action record, whether a `settlement-archive` or `winddown-opened` record, with no matching canonical receipt as `UNEXECUTED_ANCHOR`.

Result codes are defined in Part I. For normal rolls, roots, conservation, and pricing make an internally wrong committed amount independently demonstrable. For zero-NAV actions, the no-selection and unchanged-state checks make a conflicting transition demonstrable. Neither branch proves an external venue input true.

### Required state-transition tests

A production implementation of this profile MUST pass and publish results for these tests against deployed bytecode or an exact build:

1. Change either selected input total by one unit. The roll reverts and leaves requests, supply, reserves, fee state, and epoch state unchanged.
2. Change either recomputed output total by one unit. The roll reverts with the same unchanged-state checks.
3. Commit a root that omits one selected request while all totals are correct. Proof delivery for that id fails, its reserve stays intact, and `deliverExpiredDeposit` or `deliverExpiredWithdraw` pays the exact recomputed amount at the deadline. A later proof or remedy call for the same id reverts as claimed.
4. Execute once at `block.timestamp == validUntil` and once at `validUntil + 1`. The boundary execution succeeds when all other inputs are valid. The later execution reverts before any mark, fee, or transfer. Publish attempt `n + 1` at each boundary: it reverts at `validUntil[n]` and succeeds at `validUntil[n] + 1` only while the epoch remains unprocessed. Confirm that attempt `n` is unchanged.
5. Test `grossPps == 0`, `ppsFinal == 0`, `feeRate == WAD`, and `feeRate > WAD` on the normal roll. Each case reverts. Test the separate zero-NAV path and confirm that it selects no request, charges no fee, preserves total share supply, and opens wind-down without setting `retired`.
6. Fund two prior claim epochs and a fee-beneficiary bucket, then run a final roll. The headroom calculation subtracts all three encumbrances. Fee claims, user claims, cancellation, and surplus recovery can debit only their own buckets.
7. Split a sub-unit holding across many withdrawal requests. Every zero conversion remains pending. No request receives a one-unit minimum.
8. Pause requests and open wind-down. Confirm that all four queue entry points follow the required gate matrix while ordinary claims, expired refunds, and proofless deliveries remain available. After all obligations are resolved, enter terminal retirement and confirm that every queue entry point and roll remains blocked.
9. Run a maximum-size selected list for each leg under the target chain's block gas rules. The roll completes. A list above `maxSelectedRequestsPerLeg` reverts before iteration over unbounded calldata. Duplicate and descending request ids also revert before any request mark.
10. Migrate with pending inputs and outstanding claims. The test must show an atomic reserve handoff, no duplicate claim path, no changed beneficiary or amount, and no window in which either predecessor or successor is underfunded.
11. In registry mode, consume one archive head and confirm the normal roll stores that exact hash and sequence. Consume one wind-down head and confirm the zero-NAV action stores it in `epochActionRecordHash`. Reusing either head for another covered action reverts. A receipt with a swapped action type, record kind, hash, getter, epoch, or price attempt fails verification. In atomic mode, confirm that the anchor and action succeed together, that a later action failure removes the anchor update, and that every unwrapped settlement selector reverts.
12. Use a capture expiry that is not divisible by 1000. Confirm `validUntil == floor(expiryMs / 1000)`, accept the equal `block.timestamp` boundary, reject the next second, and require the receipt's `executionTimestamp` to equal the canonical block value.
13. Publish attempt 1, then reject attempt 0, a repeated attempt, a skipped attempt, an overwrite, a retry without the prior expiry, and a value above `uint64`. After attempt 2 exists, call each branch with expected attempt 1 and require a revert. Execute with attempt 2, then match that value in the branch record, price-used and branch events, keyed getter, and receipt. Reject every one-field attempt mismatch. Reject any later price publication after the successful action.
14. On a registry generation, require `finalizeRetirement` and a generic kind-7 commit to revert. Migrate all obligations to an atomic generation. There, require generic commits of kinds 2, 5, and 7 from an unregistered caller to revert. Reject a generation scope, reason `superseded`, non-null migration, each nonzero maintained counter, unsorted or duplicate residual id, incomplete residual inventory, finalization-time or noncanonical resolution evidence, and open, migrated, zero-count, finalization-time, or non-exhaustive recovery. Reject missing custody or accounting items and any wrapper trace with a resolution, state-changing token, arbitrary target, hook, or `delegatecall`. Make each wrapper or chain-state check fail in turn and confirm that no anchor, stored final hash or sequence, terminal flag, or event survives. Then satisfy every check and confirm that the `nonReentrant` wrapper reads the zero state before and after the protected anchor call, stores the exact hash and sequence, sets both `retired` and `subjectFinalized(subjectId)`, and emits exact binding and subject-id retirement events. Afterward, accept the next valid kind-8 correction with `changesSettlementBearingOutput: false`; reject a settlement-bearing correction and every other subject or watcher record. A signed but unanchored kind-7 record and a kind-7 record anchored through a nonconforming path remain nonterminal.

## Security considerations

- **Commitment is not solvency.** A correct root can still be underfunded. Each roll must fund segregated reserves, and verification must reconcile every outstanding epoch rather than inspect one raw balance.
- **A root cannot choose the payout.** The contract recomputes each amount from stored input and price. A malformed root can still block proof delivery, so a deployment without the proofless deadline remedy remains operator-dependent.
- **Selected totals are value-bearing inputs.** On a normal roll, the contract must sum stored inputs and recomputed outputs. Empty legs must have zero roots and totals. Detecting a settlement archive after execution is not a substitute for these checks.
- **Fee headroom excludes obligations.** Pending deposits, earlier claim reserves, accrued fees, debts, and other encumbrances cannot fund a new withdrawal or final fee merely because they appear in a raw balance.
- **One-unit floors are splittable.** Paying a minimum for each request lets one holder manufacture value by splitting. Zero conversions remain pending under this profile.
- **Zero NAV is not closure.** It opens wind-down and preserves shares, requests, reserves, cancellations, and recovery rights. Terminal retirement requires resolved obligations.
- **First-deposit and donation attacks need an allocation rule.** A subject with zero shares and nonzero NAV blocks with `UNALLOCATED_ASSETS`. New deployments also set a minimum initial share supply or another reviewed anti-inflation rule, plus minimum request sizes that bound rounding loss. A zero-output deposit remains pending; it never becomes a free transfer to existing holders.
- **Version guessing changes payouts.** A failed RPC is not evidence of an older settlement version. Only fingerprinted bytecode and the exact missing-selector behavior permit a compatibility fallback.
- **One high-water mark shifts fees between cohorts.** The equations are reproducible but do not remove that subsidy. Fundraising disclosures must state it.
- **Retirement binds a fixed zero state.** The terminal wrapper rechecks the four maintained counters and commits the record in the transaction that sets terminal state. The independent verifier checks residual, recovery, custody, and accounting evidence.

## Rationale

- **Why PMVS composes with ERC-4626 and ERC-7540.** ERC-4626 defines synchronous vault operations, and ERC-7540 defines asynchronous request states. Prediction-market NAV can still depend on external position and venue inputs. PMVS adds the portfolio, valuation, funding, and settlement rules without weakening either ERC's interface requirements.
- **Why epoch settlement is a vault profile.** Prediction-market positions may need time to sell, merge, or redeem before a withdrawal can be funded. The epoch freezes one request set, applies one valuation context, and gives every accepted request a deterministic result.
- **Why the normal-roll archive is mandatory and published first.** A normal roll spends `O(n)` gas to validate selected requests and recompute totals. It does not need to store every output because the settlement archive supplies the ordered request-to-claim mapping and proofs. Registry mode commits that mapping before execution. Atomic mode makes commitment part of execution. A zero-NAV action has no allocation or root and uses a `winddown-opened` pre-action record instead.
- **Why pre-action and post-action records differ.** A branch-specific pre-action record cannot know the future transaction hash, block, logs, or post-state. A receipt cannot serve as pre-disclosure.
- **Why price attempts are immutable.** A failed transaction must not let an authority rewrite its expired evidence. A numbered retry preserves the old tuple and forces every record, event, getter, and receipt to identify the settlement price.
- **Why terminal retirement is atomic-only.** Publishing a closure assertion cannot end holder rights. The kind-7 anchor, fixed zero-state checks, stored binding, terminal flag, and events must succeed or revert together.
- **Why the global high-water mark is disclosed.** It is simple, but it does not equalize fee treatment across entry cohorts.
- **Why version introspection is bytecode-gated.** Interpreting any RPC failure as an older settlement version could price withdrawal claims at gross while the contract settles at net. Compatibility depends on positively identified code and behavior.

## Copyright

Copyright and related rights in this document and repository-owned reference
code are waived under CC0-1.0. Third-party material remains under its own
license. CC0 does not grant trademark or patent rights.
