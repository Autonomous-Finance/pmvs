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

This Part specifies asynchronous conversion between the accounting asset and the ERC-20 vault share. Deposits escrow the accounting asset. Redemptions escrow vault shares. Settlement applies one price, mints or burns the aggregate share amount, funds the aggregate claims, and makes each selected user amount claimable. Outcome positions remain in strategy custody.

The `settlement/epoch-merkle/1` profile groups requests into epochs. An off-chain engine computes each selected allocation, and the contract commits those allocations with a Merkle root.

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
| Share vault | Implements the ERC-20 share and holds any temporary accounting-asset buffer |
| Strategy custody | Holds working collateral and prediction-market outcome positions |
| Accountant | Publishes the gross price per share once for the frozen epoch |
| Fee module | Converts gross price into final price and accounts for manager fees |
| Teller | Mints deposit shares, burns redemption shares, and transfers the accounting asset |
| Strategy manager | Raises accounting assets from the position portfolio and controls transfers to or from strategy custody |
| Request adapter | Escrows requests, freezes epochs, commits allocations, funds claims, and verifies claim proofs |

This profile adds asynchronous request states and Merkle claims to the modular Boring Vault roles. Strategy custody sells or redeems positions when the vault needs accounting assets for withdrawals. Exiting investors receive the accounting asset under the settled price and rounding rules. Outcome positions remain outside the share-vault contract in declared vault custody.

## Required settlement lifecycle

Every settlement profile defines these stages:

| Stage | Required record or state |
|---|---|
| Request | Owner or controller, input amount, input asset, request identifier, timestamp or block, and initial state |
| Freeze or transition | The event or state change that closes the request set or makes a result claimable |
| Price | Valuation-record hash, settlement price, units, fees, and rounding |
| Allocation | The selected requests, exclusions with reason codes, and each output amount |
| Commitment | The on-chain state or event that binds the allocation |
| Claim or delivery | Recipient, delivered amount, claimed state, and replay protection |
| Receipt | Canonical transaction, block, event positions, state changes, and archive hash |
| Escape | Timeout, cancellation, rescue, migration, and retirement behavior |

A profile MUST define a deterministic verifier for every row. It MUST state which properties the chain enforces and which properties the archive exposes.

## Relationship to Ethereum vault interfaces

ERC-4626 defines synchronous tokenized-vault entry, exit, estimates, and previews. ERC-7540 adds asynchronous deposit and redemption requests. ERC-7575 permits an external share token and multiple entry points. A PMVS deployment MAY claim any of these standards only when its contracts satisfy that full standard.

New asynchronous settlement profiles SHOULD use the ERC-7540 request model and ERC-165 detection where their accounting can meet the standard. PMVS adds the external valuation and allocation records. A custom request interface is allowed under its own profile, but it MUST NOT be labeled ERC-7540 by analogy.

## Profile `settlement/epoch-merkle/1`

Users enqueue deposits or withdrawals and escrow the input. The settlement authority freezes an epoch, computes outputs, publishes an archive, and submits one roll. The roll marks selected requests, processes fees, mints or burns aggregate shares, and commits two Merkle roots. Owners later claim with proofs. Roll cost does not grow with the request count; each claimant supplies its own proof.

```
epoch E open        E frozen              E settled          claim window
     |                  |                      |                    |
requests enter    capture and price       commit roots         owners prove
epoch E           build and anchor        mint or burn         and receive
                  the archive             aggregate legs       outputs
```

### Contract interface

A system claiming this profile exposes the following ABI at one or more addresses. A monolith or a component system may conform. The active component record identifies every address.

#### Share token

This profile uses 18 share decimals and a `10^18` price scale. The share MUST meet the ERC-20 requirement in Part I. EIP-2612 is optional. Pauses, allow-lists, transfer fees, rebases, and hooks are permitted only when the component record reports them and the settlement math accounts for their effects. An implementation claims ERC-4626, ERC-7540, or ERC-7575 separately.

#### Request surface

```solidity
function depositAsset(uint256 amount) external returns (uint256 requestId);
function depositAssetFor(address owner, uint256 amount) external returns (uint256 requestId);
function requestWithdraw(uint256 sharesAmount) external returns (uint256 requestId);
function cancelDeposit(uint256 requestId) external returns (uint256 refundedAssets);
function cancelWithdraw(uint256 requestId) external returns (uint256 returnedShares);

event DepositQueued (uint256 indexed requestId, uint64 indexed epoch, address indexed owner, uint256 assets);
event WithdrawQueued(uint256 indexed requestId, uint64 indexed epoch, address indexed owner, uint256 shares);
event DepositCancelled (uint256 indexed requestId, uint64 indexed epoch, address indexed owner, uint256 assets);
event WithdrawCancelled(uint256 indexed requestId, uint64 indexed epoch, address indexed owner, uint256 shares);
```

Requirements:

1. Enqueue escrows the amount (assets on deposit, shares on withdrawal) and binds the request to the live epoch at enqueue time. Zero amounts revert.
2. Request ids are strictly increasing per leg from 1 (`nextDepositRequestId`, `nextWithdrawRequestId`). Ids MUST be treated as `uint256` end to end (see the 2^53 hazard below).
3. Cancellation, when enabled, is owner-only and only before the request is marked solved. It refunds escrow in full and tombstones the request: owner zeroed, amount zeroed, and `cancelled` set.
4. Lifecycle gates are distinct capabilities and MUST NOT be conflated with the settlement version. `sunsetting` blocks new deposits only. `requestsPaused` blocks all four queue entry points while claims and cancellations keep working. `cancellationsEnabled` gates the cancel paths and MUST be forced on at terminal retirement. `retired` (terminal) blocks deposits, withdrawal requests, and rolls permanently.
5. The component record declares whether cancellation is enabled, who can change it, the maximum pending time, and every state in which the owner cannot recover the escrowed input without operator or governance action.

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

function rollEpoch(uint64 epoch, DepositSettlementInput calldata depositData, WithdrawSettlementInput calldata withdrawData)
    external returns (bool executed, uint64);
function rollEpochZeroNav(uint64 epoch) external returns (bool executed, uint64);
function ROLL_SETTLEMENT_VERSION() external view returns (uint64);

event DepositSelection (uint64 indexed epoch, bytes32 selectionHash);
event WithdrawSelection(uint64 indexed epoch, bytes32 selectionHash);
event DepositRollCommitted (uint64 indexed epoch, bytes32 merkleRoot, uint256 leafCount, uint256 totalAssets, uint256 totalShares, string dataURI);
event WithdrawRollCommitted(uint64 indexed epoch, bytes32 merkleRoot, uint256 leafCount, uint256 totalShares, uint256 totalAssets, string dataURI);
event VaultRetired(uint8 reason);              // 0 = withdraw-leg supply exhaustion, 1 = zero-NAV
event FinalRollAssetFeeAccrued(uint64 indexed epoch, uint256 ppsGross, uint256 ppsFinal, uint256 feeAssets);

function depositLeafCount(uint64 epoch) external view returns (uint256);
function withdrawLeafCount(uint64 epoch) external view returns (uint256);
```

Sequencing invariants (all revert):

1. `rollEpoch(epoch, …)` requires `epoch != 0`, `epoch == lastProcessedEpoch + 1`, `epoch < currentEpoch` (the epoch is frozen), and not already rolled (`rollProcessed[epoch]`). The same holds for `rollEpochZeroNav`.
2. Selection marking: every listed request id must exist, be uncancelled, and not already be selected. The request's queued epoch must satisfy `request.epoch <= epoch`: requests queued in earlier epochs MAY be settled later (carried forward), and requests from later epochs MUST NOT settle early. Marked requests record `solvedAt = block.timestamp`.
3. `selectionHash = keccak256(abi.encode(requestIds))`: the ABI encoding of the `uint256[]` ordered list (offset word, length word, items). Vectors: `[1,2,3]` gives `0x62e243217b24f0adeab63b697d9c38d64bd4cbf540c9915772ddc377b45b411c`; `[]` gives `0x569e75fc77c1a856f6daaf9e69d8a9566ca34aa47f9133711ce065a571af0cfd`.
4. A non-empty leg (`requestIds.length > 0`) with a zero Merkle root reverts. A non-empty leg with both totals zero reverts.
5. **Empty-leg check.** An empty `requestIds` array with nonzero totals can mint unclaimable shares or burn escrowed shares. The contract MUST revert unless an empty leg has a zero root and zero totals. Archive conservation can expose the defect but cannot prevent the transaction loss.
6. For each leg, the contract derives `leafCount` from `requestIds.length`, stores it with the root, and emits it. The root MUST be the `pmvs-merkle/1` count-bound root for that count.
7. `ROLL_SETTLEMENT_VERSION` introspection is REQUIRED on new deployments. For compatibility contracts without the getter, callers MUST infer version 1 only from a positively identified missing selector (empty revert data or zero-length return) on fingerprinted bytecode listed in the component-generation record. Transport errors, timeouts, and unknown bytecode MUST NOT be read as version 1 because misclassification changes withdrawal prices.

#### Claims

```solidity
struct DepositClaim  { uint64 epoch; uint256 requestId; uint256 shares; bytes32[] proof; }
struct WithdrawClaim { uint64 epoch; uint256 requestId; uint256 assets; bytes32[] proof; }

function claimDeposits(DepositClaim[] calldata claims) external returns (uint256 totalShares);
function claimWithdrawals(WithdrawClaim[] calldata claims) external returns (uint256 totalAssets);
function isDepositClaimed(uint256 requestId) external view returns (bool);
function isWithdrawClaimed(uint256 requestId) external view returns (bool);

event DepositClaimProcessed (uint64 indexed epoch, uint256 indexed requestId, address indexed owner, uint256 amount);
event WithdrawClaimProcessed(uint64 indexed epoch, uint256 indexed requestId, address indexed owner, uint256 amount);
```

1. Claims are operator-independent but owner-initiated. The claimant must equal the request's stored owner. A correct and available proof can be claimed with an RPC and the archive; no operator service is in that path. This is not a "permissionless claim" because a third party cannot claim for an owner without signed authority. It is also not unconditional liveness. Payment still depends on a correct committed leaf, a retrievable proof, and enough aggregate funding for the leg.
2. Per-claim checks: owner match; not cancelled; marked solved; not already claimed. Claimed-state is per request id; the storage is a packed bitmap, and the normative surface is the per-id getters above. The claim's `epoch` selects the committed roll data (a zero root means uncommitted, so revert), and the recomputed leaf must verify against the root.
3. The leaf's `epoch` field is the settlement (solved) epoch, which for carried-forward requests differs from the queued epoch.
4. The contract can accept a zero-amount withdrawal leaf, but a conforming archive MUST NOT create one. Batch deposit claims revert if the batch nets zero shares.
5. A deployment with no timeout, forced exit, or rescue path after selection is `operator-dependent`. An omitted or bad leaf can strand the owner. Verifiers MUST reconstruct the pending set from queue, cancellation, selection, commitment, and claim events and report repeated carry-forward or an expired claim remedy.

#### Liveness classification

Every deployment states one of these values in its component record:

- `requestLiveness: "bounded"` means every request state has a declared maximum duration. An owner can cancel an unselected request after the pending deadline. A selected request with no valid funded claim has an on-chain remedy after the claim deadline. The remedy prevents both double payment and loss of escrow. Its ABI, delay, authority, and solvency rule are part of the settlement profile.
- `requestLiveness: "operator-dependent"` means some request can remain pending or unclaimable until an operator or governance actor intervenes.

A monitor alarm or a possible governance upgrade does not provide bounded liveness. New production deployments SHOULD provide an on-chain remedy and obtain a separate security review of it. Request liveness is independent of the L1 through L3 conformance levels.

#### Delegated claims (OPTIONAL extension)

EIP-712 intents let a relayer submit on behalf of a signing investor. Domain: `{ name: "EscrowAdapterIntent", version: "1", chainId, verifyingContract }`, with the separator cached at deploy and recomputed on a chain-id fork. Types:

```
WithdrawIntent(address investor,uint256 sharesAmount,uint256 nonce,uint256 deadline)
ClaimAndBridgeIntent(address investor,bytes32 claimsHash,bytes32 sendParamHash,uint256 nonce,uint256 deadline)
ClaimAssetIntent(address investor,bytes32 claimsHash,address depositAddress,uint256 nonce,uint256 deadline)
```

Replay protection is strict sequential per-investor nonces (`provided == expected`, then increment, with `IntentNonceConsumed` emitted). Authorization is ECDSA recovery against the explicit `investor` argument, never `msg.sender`; recovery of `address(0)` rejects. `claimsHash = keccak256(abi.encode(claims))`. Deadlines are inclusive of `block.timestamp`. Bridge- and offramp-specific intent semantics are implementation extensions outside PMVS.

### Merkle commitment encoding

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

1. Leaves are placed in builder order (the archive's claim order); leaves are not sorted.
2. Parent = `keccak256(min(a,b) ‖ max(a,b))`: sibling pairs are sorted bytewise before hashing (solmate `MerkleProofLib` compatible, so proofs need no left/right flags).
3. An odd node at any level is paired with itself (duplicated).
4. An empty leg has root `bytes32(0)`. A single leaf is its own root, with an empty proof.
5. The proof for index i takes, at each level, the sibling at `i XOR 1` (self if out of range), then shifts `i` right by one.

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

`leg` is `0` for deposit and `1` for withdrawal. Odd nodes are still paired with themselves. A claim first reconstructs `rawTreeRoot`, then wraps it with the committed `count`. The contract stores both count and root. A proof with the wrong count fails. A compatibility contract cannot switch to this encoding under its old identifier. It must use a new settlement contract or versioned claim entry point and preserve all pending requests during migration.

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

#### Archive/selection bijection

For each leg, the archive's claim list, the transaction's `requestIds`, and the leaf set MUST be equal as ordered lists: one claim per selected id, same order, no duplicates. Request ids SHOULD be ascending. Duplicated ids cannot settle on-chain (`AlreadySelected` reverts), so a conforming archive never contains them.

#### The 2^53 hazard

Request ids and epochs are `uint256` and `uint64`. Tooling that routes ids through IEEE-754 doubles corrupts them: `Number(9007199254740993) == 9007199254740992`. Archives MUST carry ids as decimal strings under PMVS-JCS. A producer MUST reject any path that converts them through a host-language number.

### Settlement computation

All arithmetic is unsigned integer math. `floor` and `ceil` state division rounding. This profile requires accounting-asset decimals `0 <= D <= 18`, sets `WAD = 10^18`, and sets `BRIDGE = 10^(18-D)`. For a 6-decimal accounting asset, `BRIDGE = 10^12`. `gross`, `hwm`, and `r` are `uint256`, with `0 <= r <= WAD`. Implementations MUST use checked full-precision multiplication and division. An intermediate overflow is not a rounding rule.

#### Gross and net price per share

The gross settlement price is `outputs.pps` in the epoch's PMVS-M1 valuation record. "Gross" here means before the manager performance fee. Its position marks already subtract the venue profile's execution-cost cap. The valuation authority publishes this `grossPps` on-chain once for the epoch before the roll, and the roll reads it back.

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

The mint is directed to the settlement contract and accounted as manager-claimable. `FeeMintBasis(epoch, ppsGross, hwm, feeRate, supplyBeforeFees, delta, sharesMinted)` and `FeeProcessed` are emitted. If no fee module is configured, `ppsFinal = gross` and no mint occurs.

This profile has one vault-wide high-water mark. Shares issued after a loss enter at the current price but may benefit from recovery below the old high-water mark without a performance fee. Different entry cohorts can therefore subsidize one another. A deployment using this fee model MUST disclose that effect. A series-accounting or equalization method needs a different fee profile and separate vectors; it MUST NOT silently change these equations.

#### Final-roll asset fee (version 2)

A roll is final if and only if its withdraw leg executes, its deposit leg mints nothing, and `withdrawData.totalShares >= totalSupply()`. On a final roll no fee shares are minted, since supply is going to zero. The fee instead crystallizes in assets, atomically:

```
candidate = floor(withdrawTotalShares · (gross − ppsFinal) / (WAD · BRIDGE))     # 1e30 for D=6
headroom  = max(vaultAssetBalance − withdrawTotalAssets, 0)
feeAssets = min(candidate, headroom)
```

`feeAssets` is pulled alongside the withdrawal assets, accrued to the manager, and `FinalRollAssetFeeAccrued(epoch, gross, ppsFinal, feeAssets)` is emitted. The crystallization flag blocks a separate asset-fee relay from charging twice. The headroom cap exists because the prefund is sized from per-request floors while the fee is an aggregate floor: rounding dust stays with the claims, and dust can never revert a final roll.

Vector: `withdrawShares=500e18, gross=1.2e18, hwm=1.0e18, r=0.2e18` gives `ppsFinal=1.16e18` and `candidate=20000000` (20 asset units at D=6). With `vaultAssets = withdrawTotalAssets + candidate − 7`, `feeAssets = candidate − 7`.

#### Per-request conversions

```
deposit:  sharesOut = floor(assets · BRIDGE · WAD / pps)      # pps = netPps (v2) or gross (v1)
withdraw: assetsOut = floor(shares · pps / (WAD · BRIDGE))
```

Vectors (pps = 1.05e18, D = 6): `assets=250000000` gives `sharesOut=238095238095238095238`; `shares=238095238095238095238` gives `assetsOut=249999999`.

The zero-output policy has two lanes:

- **Normal lane.** A request whose conversion is zero remains pending and appears in `excluded` with reason `zero_output`. It MUST NOT be selected or placed in a zero leaf. A zero withdrawal leaf would burn shares for no asset. A zero deposit leaf would retain assets without issuing a share.
- **Wind-down settlement lane.** After a funded retirement pin, a sub-unit withdrawal payout is raised to exactly 1 accounting-asset base unit. Vector: `shares=9e11, pps=1.05e18` gives `assetsOut=0`, paid as `1`. The pin record MUST reserve enough assets for every possible dust floor. Each affected claim carries `dustFloorApplied: true`. This is the only exception to round-down in this profile.

Rounding direction table:

| Quantity | Direction | Exception |
|---|---|---|
| Deposit shares out | down | zero result: leave the request pending |
| Withdrawal assets out | down | zero result: exclude (normal) / floor to 1 unit (wind-down) |
| Fee share mint | up (both stages) | none |
| Final-roll asset fee | down, then capped by headroom | none |
| Investor portion of gain (netPps) | down | none |

#### Conservation equations (archive-verifiable, not chain-enforced)

For every roll, over the archive's claims:

```
deposit.totalAssets  == Σ queued assets of selected deposit requests      (from DepositQueued events)
deposit.totalShares  == Σ deposit leaf amounts (shares out)
withdraw.totalShares == Σ queued shares of selected withdraw requests     (from WithdrawQueued events)
withdraw.totalAssets == Σ withdraw leaf amounts (assets out)
```

In addition: empty ids imply a zero root AND zero totals for that leg, which closes the contract's empty-array hole; per-claim amounts re-derive exactly from the settlement pps, the version rule, and the zero-output policy; and the leaf sets rebuild both on-chain roots. Any violation is `SETTLEMENT_MISMATCH`. These are disclosures the chain accepts unchecked, which is exactly why the archive is mandatory.

### Settlement archive, schema version 1

One archive per roll, published as a Part I record (`kind: "settlement-archive"`, hashed, attested, anchored). Schema (PMVS-JCS; every quantity a decimal string in base units):

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
    "grossPps": "…", "ppsFinal": "…", "highWaterMark": "…", "feeRate": "…",
    "valuationRecord": "0x…",           // recordHash of the pre-roll valuation record (L2; "0x00…00" at L1)
    "merkleProfile": "pmvs-merkle/1",
    "requestLiveness": "operator-dependent"
  },
  "deposit": {
    "requestIds": ["…"], "root": "0x…", "totalAssets": "…", "totalShares": "…",
    "claims": [ { "requestId": "…", "owner": "0x…", "queuedEpoch": "…", "settlementEpoch": "…",
                  "queuedAssets": "…", "shares": "…", "proof": ["0x…"] } ]
  },
  "withdraw": {
    "requestIds": ["…"], "root": "0x…", "totalShares": "…", "totalAssets": "…",
    "claims": [ { "requestId": "…", "owner": "0x…", "queuedEpoch": "…", "settlementEpoch": "…",
                  "queuedShares": "…", "assets": "…", "dustFloorApplied": false, "proof": ["0x…"] } ]
  },
  "excluded": [ { "leg": "withdraw", "requestId": "…", "reason": "zero_output" } ],
  "supersedesUnexecuted": null,
  "winddownPin": null,
  "extensions": [],
  "meta": {}
}
```

Empty legs use `requestIds: []`, a zero root, zero totals, and `claims: []`; they never use `null`. A claim client submits the committed post-rounding amount. A verifier re-derives that amount and reports any difference. The schema is closed under Part I's extension rule. The `excluded` list makes non-selection reasons checkable. The archive never relies on filenames, tags, or database ids.

### Roll lifecycle: commitment chronology

Pre-state evidence and post-state evidence are separate because a record built before execution cannot know the transaction hash or resulting block.

```
1. Freeze     advanceEpoch(E); later requests enter E+1
2. Value      build V_E from pinned inputs
3. Price      publish the one-shot gross price and read it back
4. Solve      select requests and compute both legs
5. Archive    build A_E, which references V_E; canonicalize and sign both
6. Publish    upload the bytes and verify read-back
7. Commit     registry mode: anchor A_E before execution
              atomic mode: prepare A_E for the roll transaction
8. Execute    atomic mode anchors A_E and rolls in one transaction
              registry mode rolls only after the archive anchor is final enough
9. Receipt    build R_E from the canonical transaction and resulting state
10. Publish   publish and anchor R_E within the receipt grace
```

Inside `rollEpoch`, this profile orders effects as follows: mark selections, emit selection hashes, check leg shapes, read the gross price, determine a final roll, process fees, mint or burn the aggregate legs, store roots and totals, emit commitments, seed the next start price, mark the epoch processed, and evaluate retirement.

Selection events do not prove pre-disclosure because they occur inside the roll. The pre-roll archive lists the same ids, and the verifier compares the emitted hashes afterward. A `dataURI` event field is only a location hint.

In registry mode, a failed roll leaves the archive anchor in history as `UNEXECUTED_ANCHOR`. A later attempt creates a new archive at a new subject-stream sequence, names the earlier archive in `supersedesUnexecuted`, and never rewrites it. In atomic mode, a failed transaction leaves neither the roll nor its anchor.

The receipt contains subject, component hash, epoch, archive hash, transaction hash, block number and hash, event log indices and values, observed final price, fee result, supply before and after, relevant accounting-asset balances, retirement result, extensions, and metadata. Integer values use decimal strings. The transaction receipt, not the archive URI, binds the committed plan to execution.

### Retirement in this profile

Three records describe distinct steps:

1. **`winddown-opened`** records the decision, reason, time, affected components, request gates, cancellation state, and plan for open positions and pending requests. It is reversible only under the rule declared in that record.
2. **`retirement-pin`** fixes the net price used by this profile's wind-down lane. It records the gross price, high-water mark, fee rate, first pinned epoch, reserve amount, dust reserve, and residual-asset policy. Before using the pin, the operator MUST show that controlled accounting assets cover every selected and forecast pinned claim. Every later archive references the pin and uses exactly its net price. The pin becomes irrevocable when the first settlement uses it. If coverage is insufficient, the operator stops. It must use a separately specified pro-rata loss profile because first-come payment at an insolvent fixed price is not conforming.
3. **`retirement-final`** records closure of one component generation or of the whole subject. A generation may be `superseded` only if the next component record gives every request, claim, balance, and share a complete migration path. Subject closure requires all of the following: no pending request, zero ERC-20 share supply, full funding for outstanding asset claims, and a disposition statement for every residual position, cash balance, liability, and later recovery.

Late cash must not change the price only for later redeemers. The pin's residual policy states whether a supplemental pro-rata distribution, recovery contract, or another named rule handles later proceeds. It also states who bears later expenses.

Zero NAV is a distressed state, not a shortcut to clean closure. Before `rollEpochZeroNav`, the operator publishes and anchors a post-redemption valuation under Part III and a wind-down decision record. The post-transaction receipt records the terminal event. If transferable shares remain without an enforceable redemption, migration, burn, or recovery right, the verifier reports `STRANDED_SHARE_SUPPLY`. The subject cannot claim final closure. A zero-NAV entry point that cannot carry or verify an atomic anchor supports registry mode only.

## Verification procedure (settlement scope)

Given a subject, an archive-capable RPC, and storage access:

1. **Discover.** Collect RollCommitted, Selection, EpochAdvanced, VaultRetired, and fee events plus registry anchors; collect published records by tag or index. Cross-check both directions: every rolled epoch has an anchored archive (else `MISSING_RECORD` or `UNANCHORED`), and every anchored archive corresponds to a rolled epoch (else flag it).
2. **Integrity (Part I).** Hash, canonicality, attestation, authority-at-anchor, chain walk.
3. **Roots.** Rebuild both trees from the archived claims under the declared leaf profile; compare to the event and storage roots. Recompute selection hashes from the archived id lists; compare to the Selection events.
4. **Conservation and funding.** Check the four equations against Queued events; check empty-leg uniformity; check the exclusion list against the zero-output policy; check bijection and id uniqueness. At the receipt block, require the claim contract's unencumbered shares and accounting assets to cover all committed, unclaimed amounts. Return `UNDERFUNDED_CLAIMS` on a shortfall.
5. **Pricing.** Recompute `netPps` from `(grossPps, hwm, feeRate)`; check the version rule against `ROLL_SETTLEMENT_VERSION`; re-derive every claim amount; on final rolls recompute `feeAssets` with the headroom cap against the receipt's balances; on fee rolls recompute the two-stage mint and compare with `FeeMintBasis`.
6. **Receipt.** Match the receipt's transaction to the chain (block hash canonical at the confirmation depth; log indices and values verbatim); match `archiveHash`.
7. **Liveness.** Reconstruct every request state. Compare pending and claimable ages with the declared bounds. Test the stated cancellation and remedy paths from chain state.
8. **Retirement.** Check reserve coverage at the pin, exact pinned pricing, residual policy, pending requests, outstanding claim funding, final supply, residual positions, and any migration or recovery path. Report `STRANDED_SHARE_SUPPLY` when applicable.
9. **Continuity.** Require an unbroken epoch sequence across archives. Track carried-forward requests and report expired bounds. Classify an anchored archive with no canonical receipt as `UNEXECUTED_ANCHOR`.

Result codes are defined in Part I. Roots, conservation, and pricing make an internally wrong committed amount independently demonstrable. They do not prove an external venue input true.

## Security considerations

- **Commitment is not solvency.** A correct root can still be underfunded. Verification checks aggregate funding and claim balances separately.
- **A bad selected leaf can trap an owner.** A profile with no forced correction remains operator-dependent. New contracts should add the bounded remedy described above and review it against double payment.
- **Empty legs are value-bearing inputs.** New contracts must reject nonzero totals beside an empty id list. Archive detection alone does not prevent the transaction loss.
- **First-deposit and donation attacks need an allocation rule.** A subject with zero shares and nonzero NAV blocks with `UNALLOCATED_ASSETS`. New deployments also set a minimum initial share supply or another reviewed anti-inflation rule, plus minimum request sizes that bound rounding loss. A zero-output deposit remains pending; it never becomes a free transfer to existing holders.
- **Version guessing changes payouts.** A failed RPC is not evidence of an older settlement version. Only fingerprinted bytecode and the exact missing-selector behavior permit a compatibility fallback.
- **One high-water mark shifts fees between cohorts.** The equations are reproducible but do not remove that subsidy. Fundraising disclosures must state it.
- **Retirement is a solvency event.** A fixed pin is safe only with full reserve coverage and a rule for later proceeds, expenses, and stranded shares.

## Rationale

- **Why PMVS composes with ERC-4626 and ERC-7540.** ERC-4626 defines synchronous vault operations, and ERC-7540 defines asynchronous request states. Prediction-market NAV can still depend on external position and venue inputs. PMVS adds the portfolio, valuation, funding, and settlement rules without weakening either ERC's interface requirements.
- **Why epoch settlement is a vault profile.** Prediction-market positions may need time to sell, merge, or redeem before a withdrawal can be funded. The epoch freezes one request set, applies one valuation context, and gives every accepted request a deterministic result.
- **Why the archive is mandatory and published first.** Aggregate settlement keeps roll cost independent of request count, but the contract may not compare aggregate totals with every leaf or recompute every user amount. The archive supplies the request-to-claim mapping. Registry mode commits it before execution. Atomic mode makes commitment part of execution.
- **Why pre-state and post-state records differ.** A pre-settlement archive cannot know the future transaction hash, block, logs, or post-state. A receipt cannot serve as pre-disclosure.
- **Why a funded pin is required.** A fixed price treats equal shares equally across the covered wind-down settlements only when the reserve can pay them all. An insolvent fixed price rewards early claims. Later proceeds need a separate residual rule.
- **Why the global high-water mark is disclosed.** It is simple, but it does not equalize fee treatment across entry cohorts.
- **Why version introspection is bytecode-gated.** Interpreting any RPC failure as an older settlement version could price withdrawal claims at gross while the contract settles at net. Compatibility depends on positively identified code and behavior.

## Copyright

Copyright and related rights on this document's text are waived via CC0-1.0. No license to any implementation code, trademark, or patent is granted or implied.
