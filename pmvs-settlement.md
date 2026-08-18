# PMVS Part II. Epoch settlement: interface, Merkle commitments, archives

```
pmvs-part:      settlement
version:        1 (draft)
status:         Draft
author:         Ivan Morozov (Zeit Finance)
created:        2026-08-18
requires:       PMVS Part I (core)
```

RFC 2119 / RFC 8174 keywords as in Part I.

## Abstract

This Part specifies epoch-batched settlement for prediction-market vaults: a request-and-claim contract interface, exact Merkle commitment encodings, the settlement price computation including performance fees, the published settlement archive, the roll lifecycle with a byte-exact commitment chronology, claims semantics, and retirement. Every amount a user ultimately receives is computed off-chain and committed as a Merkle root. The chain enforces integrity: proofs match roots, each request is claimable once, epochs settle in strict sequence, and every privileged path is role-gated. The chain does not enforce correctness of the committed amounts. Correctness is made independently checkable through the archive and the conservation rules below.

## Design summary

Users never mint or burn shares directly. They enqueue requests, escrowing assets on deposit and shares on withdrawal, each stamped with the live epoch. The settlement authority freezes an epoch, prices it (Part III), computes every request's outcome, publishes the archive, and executes one `rollEpoch` transaction that marks selections, mints and burns each leg's aggregate, commits two Merkle roots plus totals, processes the performance fee, and seeds the next epoch's start price. Users later claim individually with O(log n) proofs. Roll cost is O(1) in the request count; the long tail pays for itself.

```
 epoch E open          E frozen                E settled           claims (any time)
 ────────────┬──────────────┬──────────────────────┬─────────────────────────▶ time
             │              │                      │
   requests  │  advanceEpoch(E)             rollEpoch(E):
   bind to E │              │  value + price        ├─ mark selections
             │              │  archive + anchor     ├─ fees (mint or final asset fee)
             │              │  (BEFORE the roll)    ├─ aggregate mint + burn
             │              │                       ├─ commit roots + totals + dataURI
             │              │                       └─ seed epoch E+1 start PPS
             └─ new requests bind to E+1 from the freeze on
```

## Contract interface

A conforming Vault Contract System exposes the following surface at one or more addresses; a monolith MAY conform, and the reference decomposition is informative (see the precursor section). Solidity is given normatively; equal-ABI equivalents conform.

### Share token

The share token MUST be ERC-20 with 18 decimals and EIP-2612 `permit`, with no transfer hooks, pause, or allow-list. Implementations MUST NOT advertise ERC-4626 conformance (see Rationale).

### Request surface

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
3. Cancellation, when enabled, is owner-only and only before the request is marked solved. It refunds escrow in full and tombstones the request: owner zeroed, amount zeroed, `cancelled` set.
4. Lifecycle gates are distinct capabilities and MUST NOT be conflated with the settlement version. `sunsetting` blocks new deposits only. `requestsPaused` blocks all four queue entry points while claims and cancellations keep working. `cancellationsEnabled` gates the cancel paths and MUST be forced on at terminal retirement. `retired` (terminal) blocks deposits, withdrawal requests, and rolls permanently.

### Epoch control

```solidity
function currentEpoch() external view returns (uint64);
function lastProcessedEpoch() external view returns (uint64);
function advanceEpoch(uint64 expectedCurrentEpoch) external returns (bool executed, uint64 newEpoch);
event EpochAdvanced(uint64 indexed newEpoch);
```

1. `advanceEpoch` is restricted to the settlement authority or governance. It requires `expectedCurrentEpoch == currentEpoch` (stale calls revert; an already-advanced expected epoch reverts distinctly), requires `currentEpoch == lastProcessedEpoch + 1` (at most one frozen epoch at a time), and is one-shot per epoch.
2. Epochs start at 1. A migration-replacement adapter MAY initialize its cursor once, only while virgin (no requests, no advances, no rolls), to continue the predecessor's numbering: `initializeEpochCursor(uint64)`, owner-only, emitting `EpochCursorInitialized(currentEpoch, lastProcessedEpoch)`.

### Settlement commitment

```solidity
struct DepositSettlementInput  { uint256[] requestIds; bytes32 merkleRoot; string dataURI; uint256 totalAssets; uint256 totalShares; }
struct WithdrawSettlementInput { uint256[] requestIds; bytes32 merkleRoot; string dataURI; uint256 totalShares; uint256 totalAssets; }

function rollEpoch(uint64 epoch, DepositSettlementInput calldata depositData, WithdrawSettlementInput calldata withdrawData)
    external returns (bool executed, uint64);
function rollEpochZeroNav(uint64 epoch) external returns (bool executed, uint64);
function ROLL_SETTLEMENT_VERSION() external view returns (uint64);

event DepositSelection (uint64 indexed epoch, bytes32 selectionHash);
event WithdrawSelection(uint64 indexed epoch, bytes32 selectionHash);
event DepositRollCommitted (uint64 indexed epoch, bytes32 merkleRoot, uint256 totalAssets, uint256 totalShares, string dataURI);
event WithdrawRollCommitted(uint64 indexed epoch, bytes32 merkleRoot, uint256 totalShares, uint256 totalAssets, string dataURI);
event VaultRetired(uint8 reason);              // 0 = withdraw-leg supply exhaustion, 1 = zero-NAV
event FinalRollAssetFeeAccrued(uint64 indexed epoch, uint256 ppsGross, uint256 ppsFinal, uint256 feeAssets);
```

Sequencing invariants (all revert):

1. `rollEpoch(epoch, …)` requires `epoch != 0`, `epoch == lastProcessedEpoch + 1`, `epoch < currentEpoch` (the epoch is frozen), and not already rolled (`rollProcessed[epoch]`). The same holds for `rollEpochZeroNav`.
2. Selection marking: every listed request id must exist, be uncancelled, and not already be selected. The request's queued epoch must satisfy `request.epoch <= epoch`: requests queued in earlier epochs MAY be settled later (carried forward), and requests from later epochs MUST NOT settle early. Marked requests record `solvedAt = block.timestamp`.
3. `selectionHash = keccak256(abi.encode(requestIds))`: the ABI encoding of the `uint256[]` ordered list (offset word, length word, items). Vectors: `[1,2,3]` gives `0x62e243217b24f0adeab63b697d9c38d64bd4cbf540c9915772ddc377b45b411c`; `[]` gives `0x569e75fc77c1a856f6daaf9e69d8a9566ca34aa47f9133711ce065a571af0cfd`.
4. A non-empty leg (`requestIds.length > 0`) with a zero Merkle root reverts. A non-empty leg with both totals zero reverts.
5. **A known integrity hole in the precursor, closed by archive rules.** The contract checks shapes only for non-empty legs. An empty `requestIds` array with non-zero totals passes the contract: for deposits it mints unclaimable shares, for withdrawals it burns operator-held escrow. A conforming archive makes this impossible to hide, because the conservation equations below MUST hold and a verifier reports any violation as `SETTLEMENT_MISMATCH`. New deployments SHOULD additionally revert on empty ids with non-zero totals.
6. `ROLL_SETTLEMENT_VERSION` introspection is REQUIRED on new deployments. For legacy contracts without the getter, callers MUST infer version 1 only from a positively identified missing selector (empty revert data or zero-length return) on fingerprinted bytecode (runtime code hash listed in the component-generation record). Transport errors, timeouts, and unknown bytecode MUST NOT be read as version 1: misclassification misprices withdrawal claims.

### Claims

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

1. Claims are operator-independent but owner-initiated: the claimant must equal the request's stored owner. Claiming a correct, available proof requires only an RPC and the archive, with no operator service in the path. This property MUST NOT be described as "permissionless claims" (third parties cannot claim for an owner without a signed intent), and it is not unconditional liveness: payment additionally requires that the committed leaf is correct, the proof retrievable, and the leg's aggregate funding sufficient.
2. Per-claim checks: owner match; not cancelled; marked solved; not already claimed. Claimed-state is per request id; the storage is a packed bitmap, and the normative surface is the per-id getters above. The claim's `epoch` selects the committed roll data (a zero root means uncommitted, so revert), and the recomputed leaf must verify against the root.
3. The leaf's `epoch` field is the settlement (solved) epoch, which for carried-forward requests differs from the queued epoch.
4. A zero-amount withdraw leaf is claimable (marks claimed, pays zero). Batch deposit claims revert if the batch nets zero shares.
5. The deployed system provides no timeout, forced-exit, or rescue path. A selected request can no longer be cancelled, and an owner whose leaf was omitted or mis-committed has no contract remedy, only the detectability guarantees of this standard. New deployments SHOULD add a maximum request age with permissionless cancellation after timeout, and a governance rescue path for mis-committed legs. Selection is operator discretion. Verifiers MUST reconstruct the pending-request set from Queued and Cancelled events and report requests repeatedly carried forward, which makes censorship visible.

### Delegated claims (OPTIONAL extension)

EIP-712 intents let a relayer submit on behalf of a signing investor. Domain: `{ name: "EscrowAdapterIntent", version: "1", chainId, verifyingContract }`, with the separator cached at deploy and recomputed on a chain-id fork. Types:

```
WithdrawIntent(address investor,uint256 sharesAmount,uint256 nonce,uint256 deadline)
ClaimAndBridgeIntent(address investor,bytes32 claimsHash,bytes32 sendParamHash,uint256 nonce,uint256 deadline)
ClaimAssetIntent(address investor,bytes32 claimsHash,address depositAddress,uint256 nonce,uint256 deadline)
```

Replay protection is strict sequential per-investor nonces (`provided == expected`, then increment, with `IntentNonceConsumed` emitted). Authorization is ECDSA recovery against the explicit `investor` argument, never `msg.sender`; recovery of `address(0)` rejects. `claimsHash = keccak256(abi.encode(claims))`. Deadlines are inclusive of `block.timestamp`. Bridge- and offramp-specific intent semantics are implementation extensions outside PMVS.

## Merkle commitment encoding

### Leaf (legacy profile `zeit-leaf/1`, the deployed encoding)

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
negative — uint256 epoch (116-byte preimage), id=1  → 0x3d3ad2013e6697286981f29171731c69312e749a0f9d8c5ff07e579af32912cf  (MUST differ)
```

### Tree

```
                     root  (committed on-chain)
                    /    \
              h(a,b)      h(c,d)         parent = keccak256(min ‖ max)
              /    \      /    \         (pairs sorted bytewise, no flags)
          leaf1  leaf2  leaf3  leaf4
                                         odd node pairs with itself:
          leaf = keccak256(              root([A,B,C]) == root([A,B,C,C])
            id ‖ owner ‖ amount ‖ e64)   — the root does not bind leaf count
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

Security properties, stated exactly:

- **Count ambiguity.** Odd-node duplication makes `root([A,B,C]) == root([A,B,C,C])` (vector: the n=3 root above equals the root of `[leaf1, leaf2, leaf3, leaf3]`). The root therefore does not bind leaf count or multiplicity. Double payment is excluded by the per-request claimed state, not by the tree: request ids are unique and claimable once.
- **Leaf/node separation.** The 92-byte leaf preimage is structurally distinct from the 64-byte interior-node preimage. The second-preimage argument rests on Keccak-256 and this length difference, not on a semantic domain tag. There is no chain-id, contract, leg, or standard-version tag inside the deployed leaf.
- **New-deployment profile (`pmvs-leaf/1`).** New systems SHOULD adopt a domain-separated leaf: `keccak256( 0x00 ‖ tag ‖ be(chainId,8) ‖ adapter(20) ‖ leg(1) ‖ be(epoch,8) ‖ be(requestId,32) ‖ owner(20) ‖ be(amount,32) )` with `tag = "PMVS1"`. The leading `0x00` byte and the length distinguish leaves from 64-byte nodes explicitly. The legacy 92-byte encoding remains valid under its own profile name for deployed systems.

### Archive/selection bijection

For each leg, the archive's claim list, the transaction's `requestIds`, and the leaf set MUST be equal as ordered lists: one claim per selected id, same order, no duplicates. Request ids SHOULD be ascending. Duplicated ids cannot settle on-chain (`AlreadySelected` reverts), so a conforming archive never contains them.

### The 2^53 hazard

Request ids and epochs are `uint256` and `uint64`. Tooling that routes ids through IEEE-754 doubles corrupts them: `Number(9007199254740993) == 9007199254740992`. Archives MUST carry ids as decimal strings (PMVS-JCS). The precursor archive builder converts ids through JS numbers; since 2026-08-18 every such conversion is guarded and throws on any id at or above 2^53 instead of corrupting silently (gap G7), though the wire format itself still awaits the decimal-string migration.

## Settlement computation

All arithmetic is unsigned integer math; `floor` and `ceil` denote division rounding. `WAD = 10^18`; `BRIDGE = 10^(18−D)` for asset decimals D (the precursor has D = 6, so BRIDGE = 10^12).

### Gross and net price per share

The gross settlement price is the displayed-book cross PPS of the epoch's valuation record (Part III): `settlementGrossPps := crossPps`. It is published on-chain once per epoch (one-shot per epoch id) by the valuation authority before the roll, and read back inside the roll.

```
netPps(gross, hwm, r):
    if gross <= hwm:  return gross
    delta = gross − hwm
    keep  = (r == 0) ? delta : floor((WAD − r) · delta / WAD)
    return hwm + keep
```

Version semantics (`ROLL_SETTLEMENT_VERSION`):

- **Version 2, normative for new deployments.** The performance fee is processed on the pre-flow supply, before this roll's deposit mint and withdrawal burn, and both legs settle at `netPps`: deposit shares and withdrawal assets are priced post-fee, so NAV divided by total supply lands on the next epoch's start rate.
- **Version 1, historical.** Fees on the post-deposit supply; both legs settle at `gross`. Documented for verifying legacy history only. New deployments MUST NOT implement version 1.

### Performance-fee share mint (non-final rolls)

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

### Final-roll asset fee (version 2)

A roll is final if and only if its withdraw leg executes, its deposit leg mints nothing, and `withdrawData.totalShares >= totalSupply()`. On a final roll no fee shares are minted, since supply is going to zero. The fee instead crystallizes in assets, atomically:

```
candidate = floor(withdrawTotalShares · (gross − ppsFinal) / (WAD · BRIDGE))     # 1e30 for D=6
headroom  = max(vaultAssetBalance − withdrawTotalAssets, 0)
feeAssets = min(candidate, headroom)
```

`feeAssets` is pulled alongside the withdrawal assets, accrued to the manager, and `FinalRollAssetFeeAccrued(epoch, gross, ppsFinal, feeAssets)` is emitted. The crystallization flag blocks the legacy asset-fee relay from charging twice. The headroom cap exists because the prefund is sized from per-request floors while the fee is an aggregate floor: rounding dust stays with the claims, and dust can never revert a final roll.

Vector: `withdrawShares=500e18, gross=1.2e18, hwm=1.0e18, r=0.2e18` gives `ppsFinal=1.16e18` and `candidate=20000000` (20 asset units at D=6). With `vaultAssets = withdrawTotalAssets + candidate − 7`, `feeAssets = candidate − 7`.

### Per-request conversions

```
deposit:  sharesOut = floor(assets · BRIDGE · WAD / pps)      # pps = netPps (v2) or gross (v1)
withdraw: assetsOut = floor(shares · pps / (WAD · BRIDGE))
```

Vectors (pps = 1.05e18, D = 6): `assets=250000000` gives `sharesOut=238095238095238095238`; `shares=238095238095238095238` gives `assetsOut=249999999`.

The zero-output policy is normative, with two lanes:

- **Normal lane.** A deposit converting to zero shares is invalid; the encoder MUST reject the leg build. A withdrawal converting to zero assets MUST be excluded from the leg: the request stays pending and re-evaluates next roll. It MUST NOT be included as a zero leaf, because the chain would accept it and burn the shares for nothing.
- **Wind-down settlement lane** (after a retirement pin; see Retirement below). A sub-unit payout is floored up to exactly 1 asset base unit. Vector: `shares=9e11, pps=1.05e18` gives `assetsOut=0`, paid as `1`. This is a declared, funded exception, paid from the estate and sized into the prefund. Without it, dust requests re-arm wind-down settlement forever and terminal retirement is unreachable. It is the single exception to round-down, and implementations MUST label it in the archive (`dustFloorApplied: true` per affected claim).

Rounding direction table:

| Quantity | Direction | Exception |
|---|---|---|
| Deposit shares out | down | zero result: reject the leg |
| Withdrawal assets out | down | zero result: exclude (normal) / floor to 1 unit (wind-down) |
| Fee share mint | up (both stages) | none |
| Final-roll asset fee | down, then capped by headroom | none |
| Investor portion of gain (netPps) | down | none |

### Conservation equations (archive-verifiable, not chain-enforced)

For every roll, over the archive's claims:

```
deposit.totalAssets  == Σ queued assets of selected deposit requests      (from DepositQueued events)
deposit.totalShares  == Σ deposit leaf amounts (shares out)
withdraw.totalShares == Σ queued shares of selected withdraw requests     (from WithdrawQueued events)
withdraw.totalAssets == Σ withdraw leaf amounts (assets out)
```

In addition: empty ids imply a zero root AND zero totals for that leg, which closes the contract's empty-array hole; per-claim amounts re-derive exactly from the settlement pps, the version rule, and the zero-output policy; and the leaf sets rebuild both on-chain roots. Any violation is `SETTLEMENT_MISMATCH`. These are disclosures the chain accepts unchecked, which is exactly why the archive is mandatory.

## PMVS-SettlementArchive/1

One archive per roll, published as a Part I record (`kind: "settlement-archive"`, hashed, attested, anchored). Schema (PMVS-JCS; every quantity a decimal string in base units):

```jsonc
{
  "schema": "pmvs/settlement-archive", "schemaVersion": "1",
  "subject": { "chainId": "137", "shareToken": "0x…" },
  "components": "0x…",                  // recordHash of the governing component-generation record
  "context": { "kind": "settlement-archive", "sequence": "…", "prev": "0x…", "epoch": "…" },
  "settlement": {
    "settlementVersion": "2",
    "grossPps": "…", "ppsFinal": "…", "highWaterMark": "…", "feeRate": "…",
    "valuationRecord": "0x…",           // recordHash of the pre-roll valuation record (L2; "0x00…00" at L1)
    "leafProfile": "zeit-leaf/1"
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
  "meta": { }
}
```

Rules: empty legs encode uniformly (`requestIds: []`, `root: "0x00…00"`, totals `"0"`, `claims: []`, never `null`); verifiers use archived post-rounding amounts and never re-derive claim amounts to pay; unknown fields are hash-bound and ignored for verification; the `excluded` list makes the zero-output policy auditable. The archive is self-identifying. It never relies on filenames, tags, or database ids.

**Legacy shape.** The precursor uploads a pre-standard payload (`Zeit-Legacy-Archive/0`, informative): a root-level database `vaultId` (a UUID), no chain id, adapter, schema version, settlement version, or net PPS, JSON-number request ids and epochs (the 2^53 hazard), and asymmetric empty-leg encoding (a zero deposit root next to a `null` withdraw root). Tooling can read it, but it cannot satisfy this Part and must not be re-blessed byte for byte.

## Roll lifecycle: commitment chronology

The chronology is byte-exact and resolves what can be committed when. Two records cover one roll, because a pre-state record cannot contain post-state facts.

```
1. Freeze          advanceEpoch(E) — epoch E now frozen (currentEpoch = E+1)
2. Value           build pre-roll valuation record V_E at a pinned block (Part III)
3. Price           publish gross PPS on-chain (one-shot per epoch)
4. Solve           select requests; compute both legs at the version's settlement pps
5. Archive         build PMVS-SettlementArchive/1 A_E (references V_E by hash); canonicalize, sign
6. Publish         upload V_E and A_E; verify read-back (storage profile)
7. Anchor          L1b: pass/emit recordHash(A_E) in the roll transaction itself
                   L1a: registry.commit(...) BEFORE sending the roll (post-hoc semantics disclosed)
8. Execute         rollEpoch(E, …) — inside this one transaction, in order:
                     mark selections → Selection events → shape checks → read gross PPS →
                     final-roll determination → fee processing (mint or asset fee) →
                     aggregate mint / aggregate burn+pay → store roll data →
                     RollCommitted events (carrying dataURI) → seed epoch E+1 start pps →
                     mark rolled → retirement check
9. Receipt         build SettlementReceiptRecord R_E: transaction hash, block number/hash,
                   log indices, emitted roots/totals/selection hashes, ppsFinal, fee results
                   (sharesMinted or feeAssets), pre/post totalSupply, vault asset balance
10. Anchor receipt registry commit or next canonical anchor; R_E references A_E by hash
```

Notes. Selection events are emitted inside `rollEpoch`, not before; pre-roll selection disclosure lives in the archive, and the verifier checks the emitted selection hashes against it afterward. The `dataURI` carried by the RollCommitted events is an unauthenticated pointer: content is validated against roots and the anchored hash, never trusted from the URI. A failure between steps 7 and 8 (anchored but never executed) resolves as a void anchor once the epoch is rolled by a later attempt with a new archive; the receipt is what binds an archive to an executed transaction.

The `SettlementReceiptRecord` schema (`kind: "receipt"`): subject, epoch, `archiveHash`, `txHash`, `blockNumber`, `blockHash`, per-event log indices, emitted values verbatim, `ppsFinalObserved`, `feeSharesMinted` or `finalFeeAssets`, `totalSupplyBefore` and `totalSupplyAfter`, `retirementTriggered` (bool plus reason). All decimal-string encoded.

## Retirement

Three distinct states, three record kinds, in order:

1. **`winddown-opened`**: the application decision to stop normal operation, for example sunsetting on, requests paused, positions being unwound. The record carries the reason and the gates toggled. Reversible.
2. **`retirement-pin`**: the wind-down settlement price is fixed. The record carries the pinned settlement pps (net, with its gross, HWM, and feeRate inputs), the epoch of the first pinned settlement, and the funding rule for the dust floor. From this record on, every wind-down settlement archive MUST reference the pin record's hash and price redemptions at exactly the pinned pps. The rationale: without a pin, late cash arriving into a wind-down (rebates, dust, donations) would reprice each roll and pay later redeemers more than earlier ones for identical shares. **Enforcement locus disclosure:** in the precursor the pin lives in an operator database column (nullable, privileged-mutable, first-writer-wins by application convention); the contracts do not enforce it. The record makes the pin public and its violations detectable, not impossible. This state is non-terminal: a deployment MAY declare an un-pin rule (the precursor permits un-retiring only while no pin exists).
3. **`retirement-final`**: only after the on-chain terminal event `VaultRetired(reason)`. The record distinguishes the three terminal shapes: supply-exhausted (reason 0: the final withdraw leg burned the entire supply, the clean ending), zero-NAV write-off (reason 1: `rollEpochZeroNav` skipped settlement and fees entirely), and superseded (adapter migration, cross-referencing the component-generation records). It carries the last archive hash, the final supply, a residual position statement, and, for zero-NAV, the valuation evidence for worthlessness (the Part III record at the decision block).

Hard facts the records must not contradict: after terminal retirement the contract rejects new withdrawal requests, so a zero-NAV retirement strands any still-outstanding transferable shares with no contract redemption path (cancellations are force-enabled so queued escrows can exit). "All post-retirement redemptions price at the pin" is a statement about the operator's off-chain wind-down settlement lane, not a contract guarantee, and MUST always be written with that qualification. The zero-NAV path publishes nothing by itself, since it has no legs; that is exactly why `retirement-final` with valuation evidence is mandatory, as the only disclosure that decision gets. Part III additionally requires that zero-NAV decisions be made on post-redemption state (see the false-retirement guard there).

## Verification procedure (settlement scope)

Given a subject, an archive-capable RPC, and storage access:

1. **Discover.** Collect RollCommitted, Selection, EpochAdvanced, VaultRetired, and fee events plus registry anchors; collect published records by tag or index. Cross-check both directions: every rolled epoch has an anchored archive (else `MISSING_RECORD` or `UNANCHORED`), and every anchored archive corresponds to a rolled epoch (else flag it).
2. **Integrity (Part I).** Hash, canonicality, attestation, authority-at-anchor, chain walk.
3. **Roots.** Rebuild both trees from the archived claims under the declared leaf profile; compare to the event and storage roots. Recompute selection hashes from the archived id lists; compare to the Selection events.
4. **Conservation.** Check the four equations against Queued events; check empty-leg uniformity; check the exclusion list against the zero-output policy; check bijection and id uniqueness.
5. **Pricing.** Recompute `netPps` from `(grossPps, hwm, feeRate)`; check the version rule against `ROLL_SETTLEMENT_VERSION`; re-derive every claim amount; on final rolls recompute `feeAssets` with the headroom cap against the receipt's balances; on fee rolls recompute the two-stage mint and compare with `FeeMintBasis`.
6. **Receipt.** Match the receipt's transaction to the chain (block hash canonical at the confirmation depth; log indices and values verbatim); match `archiveHash`.
7. **Retirement.** A state-machine check: pin before pinned settlements; the pinned price used exactly; `retirement-final` after `VaultRetired` with the matching reason; nothing but corrections afterward.
8. **Continuity.** The epoch sequence unbroken across archives; carried-forward requests tracked; perpetual carry-forwards reported.

Verdicts are per Part I. Steps 3 through 5 are what make a wrong committed amount provable by anyone, which is the point of this Part.

## Precursor implementation and migration gaps

The reference decomposition (informative): `BoringVault` (share ERC-20 plus custody buffer), `Teller` (mint/burn plus asset legs; the production aggregate legs perform no on-chain price check, per the source comment "caller is trusted to provide the correct share amount"), `Accountant` (PPS store, one-shot epoch writes, raise-only HWM), `FeeManager` (the fee math above), `EscrowAdapter` (everything else in this Part). Compiler `solc 0.8.23+commit.f704f362`. ABI fingerprints come from the generated manifest, for example `EscrowAdapter abiHash sha256:e9faca1a…d28e5ed1` and `deployedBytecodeHash sha256:496466e2…d79d0982`. Hub chain: Polygon PoS (137).

| # | Gap (verified in source) | Status | Blocks |
|---|---|---|---|
| G1 | No anchoring: `dataURI` is an unhashed event string; no registry; nothing commits archive bytes | open | L1a |
| G2 | No attestation: archives carry no operator signature; publisher identity is a storage-network key | open | L1a |
| G3 | Archive shape is `Zeit-Legacy-Archive/0` (DB UUID identity, JSON numbers, asymmetric empty legs, no version or net-PPS fields) | open | L1a |
| G4 | Retirement records absent; the zero-NAV path publishes nothing; the pin is a privileged-mutable DB column | open | L1a |
| G5 | No verifier implementation exists (no read-back, no root-rebuild tooling) | open | L1a (operationally) |
| G6 | The roll ABI cannot carry an anchor; Selection events fire inside the roll | open | L1b (registry path only) |
| G7 | The archive builder converted request ids via `Number()`, silently unsafe at 2^53 and above | closed 2026-08-18: every conversion now guards and throws on loss; the decimal-string wire migration remains | L1a (latent) |
| G8 | The contract accepts empty-ids legs with non-zero totals (shape checks gated on non-empty arrays) | disclosed; the archive conservation rules compensate | none |
| G9 | No timeout or rescue for selected-but-mis-committed requests | disclosed | none |

The precursor's Arweave uploader also gained post-status assertion and network-acceptance confirmation on 2026-08-18 (it previously ignored the post response entirely); the storage profile's full upload lifecycle, including byte-level read-back, remains open.

## Rationale

- **Why not ERC-4626 or ERC-7540.** ERC-4626 requires on-chain `totalAssets` and conversion math; this system's assets are venue-side and its price is asserted per epoch, so advertising 4626 would promise semantics that cannot hold. ERC-7540's per-request claimable balances put per-user state on-chain at settlement; the Merkle design keeps roll cost O(1) in request count and moves the O(log n) cost to self-paying claimants. Batch settlement of hundreds of requests in one transaction is the scalability case.
- **Why the archive is mandatory and publish-before-execute.** The chain deliberately does not check totals against leaves or per-user amounts; the archive is the only thing standing between users and unverifiable settlement. Publishing before execution (and, at L1b, making execution impossible without the anchor) removes the "settle now, disclose maybe" failure mode. At L1a the ordering is still required, and its weaker guarantee is stated rather than papered over.
- **Why two records per roll.** A single record cannot contain both the settlement inputs (needed before execution) and the execution facts (unknowable before mining: transaction hash, block, post-state). Pretending otherwise produces unverifiable chronology.
- **Why the pinned wind-down price.** Equal shares must redeem equally across a wind-down regardless of when late cash arrives. The pin is the only order-independent rule.
- **Why version introspection is bytecode-gated for legacy.** Interpreting any RPC failure as "version 1" would price withdrawal claims at gross while a v2 contract settles at net, a funds-extraction bug rather than a compatibility fallback.

## Copyright

Copyright and related rights on this document's text are waived via CC0-1.0. No license to any implementation code, trademark, or patent is granted or implied.
