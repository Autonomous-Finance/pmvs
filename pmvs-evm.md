# PMVS EVM implementation annex

| Field | Value |
|---|---|
| Annex | EVM wire format and machine rules |
| Version | 1 (draft) |
| Status | Pre-EIP review draft |
| Authors | [Ivan Morozov (allquantor)](https://github.com/allquantor), [Christian (smowden)](https://github.com/smowden), [Dinu Barbu (dvinubius)](https://github.com/dvinubius), [Ovidiu Miclea (micovi)](https://github.com/micovi) |
| Created | 2026-08-24 |
| Requires | PMVS Parts I, II, and III |

Capitalized requirement words follow [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

Most readers do not need this file. Read [Core](./pmvs-core.md), [Settlement](./pmvs-settlement.md), and [M1](./pmvs-m1.md) first.

> Parts + selected profiles -> EVM annex -> exact hashes, ABI, calls, and events

**Contents:** [Common encoding](#common-encoding) · [Interface registry](#interface-registry) · [Configuration activation](#configuration-activation) · [Record anchor](#record-anchor) · [M1 valuation mechanics](#m1-valuation-mechanics) · [Settlement interface](#settlement-interface) · [Settlement mechanics](#settlement-mechanics) · [Merkle claims](#merkle-claims) · [Polymarket settlement call plan](#polymarket-settlement-call-plan) · [Verification result codes](#verification-result-codes)

This annex defines the exact EVM wire format and settlement mechanics. Implementations and verifiers MUST use the types, field order, hashes, calls, and events below. The [schemas](./schemas/README.md) define record shapes.

**Compatibility note.** This is the v1 target wire format. The first Zeit reference deployment predates it: its settlement inputs carry a `dataURI` string this annex drops, its Merkle leaves are undomained 92-byte packed fields, and its zero-NAV roll permanently retires instead of winddown-and-restart. Those deployments conform to an earlier iteration, not this annex; a migration path is future work.

## Common encoding

The vault subject is the share token on one chain:

```text
subjectId = keccak256(abi.encodePacked(uint256(chainId), address(shareToken)))
```

PMVS-JCS/1 produces canonical UTF-8 record bytes. The record hash is:

```text
recordHash = keccak256(UTF8(PMVS-JCS(record)))
```

PMVS-JCS/1 tightens [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785). It forbids JSON numbers, insignificant whitespace, a BOM, invalid Unicode, duplicate keys, sparse arrays, and noncanonical address or hash casing. Integers use bounded decimal strings; object keys use UTF-16 order.

Subject attestations use [EIP-712](https://eips.ethereum.org/EIPS/eip-712) with name `PMVS-Attestation`, version `1`, the subject chain id, and the active anchor as verifying contract. The exact primary type is:

```text
Attestation(bytes32 recordHash,uint8 kind,bytes32 subjectId,bytes32 streamId,uint64 sequence,bytes32 prev,bytes32 previousAnchor)
```

EOA signatures MUST satisfy [EIP-2](https://eips.ethereum.org/EIPS/eip-2) low-`s` rules. Contract signatures MUST return [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271) magic value `0x1626ba7e` for this digest.

### Record kinds

Every record kind has one permanent number. The number is the `kind` in attestations, authority lookups, heads, and anchor events. The envelope schema names kinds by string, except watcher heads inside migrations, which carry the number directly.

| Number | Record kind | String name |
|---|---|---|
| 0 | Gap | `gap` |
| 1 | Correction | `correction` |
| 2 | Receipt | `receipt` |
| 3 | Valuation | `valuation` |
| 4 | Components | `components` |
| 5 | Winddown opened | `winddown-opened` |
| 6 | — reserved, never assign | — |
| 7 | Settlement archive | `settlement-archive` |
| 8 | Retirement final | `retirement-final` |
| 9 | — reserved for future kinds | — |
| 10 | Watcher observation | `watcher-observation` |

## Interface registry

### Subject discovery

```solidity
interface IPMVSSubjectDiscovery {
    function pmvsAnchor() external view returns (address);
    function pmvsComponents() external view returns (bytes32 recordHash, uint64 generation);
    function pmvsActivationNonce() external view returns (uint64);
}
```

The share token MUST report [ERC-165](https://eips.ethereum.org/EIPS/eip-165) id `0x354fe243`.

### Backend boundary

```solidity
interface IPMVSBackendBoundary {
    function publishSettlementPrice(
        bytes32 components,
        uint64 epoch,
        uint64 priceAttempt,
        uint256 grossPps,
        bytes32 valuationRecord,
        uint64 validUntil
    ) external;

    function currentPriceAttempt(uint64 epoch) external view returns (uint64);

    function epochSettlementPrice(uint64 epoch, uint64 priceAttempt)
        external view
        returns (bytes32 components, uint256 grossPps, bytes32 valuationRecord, uint64 validUntil);
}
```

The settlement contract MUST report ERC-165 id `0x88629c78`. The publication selector is `0x9ea8f33d`.

### Authority and anchor

```solidity
struct PMVSAnchorInput {
    bytes32 subjectId;
    bytes32 streamId;
    uint8 kind;
    uint64 sequence;
    bytes32 recordPrev;
    bytes32 previousAnchor;
    bytes32 recordHash;
    address signer;
    uint8 signatureScheme;
    string uri;
}

interface IPMVSAuthorityResolver {
    function pmvsAuthority(bytes32 subjectId, uint8 kind) external view returns (address);
    function pmvsActionWrapper(bytes32 subjectId, uint8 kind) external view returns (address);
}

interface IPMVSAnchor {
    function commit(PMVSAnchorInput calldata input, bytes calldata signature) external;
    function head(bytes32 subjectId, bytes32 streamId)
        external view
        returns (bool exists, uint64 sequence, uint8 kind, bytes32 recordHash);
    function subjectFinalized(bytes32 subjectId) external view returns (bool);
    function subjectId() external view returns (bytes32);
    function authorityResolver() external view returns (address);
}
```

| Function | Selector |
|---|---|
| `commit` | `0x25678da7` |
| `head` | `0x0b804aca` |
| `subjectFinalized` | `0x2991cbd8` |
| `subjectId` | `0x24574d4d` |
| `authorityResolver` | `0xddbff5a9` |
| `pmvsAuthority` | `0xcfa1a519` |
| `pmvsActionWrapper` | `0x795bc2d4` |

The anchor MUST report ERC-165 id `0xfe9eb451`. The resolver MUST report id `0xb6fa67cd`.

An ERC-165 check uses a 30,000-gas `STATICCALL`. `supportsInterface(0x01ffc9a7)` and the claimed id MUST return a valid ABI Boolean `true`; `supportsInterface(0xffffffff)` MUST return `false`. Interface detection does not replace behavior checks.

## Configuration activation

Components records MUST contain no future transaction, block, or log locator. Activation checks strictly increase by `id`; duplicates are invalid. PMVS-JCS encodes the closed migration object.

```text
CHECK_DOMAIN      = keccak256(UTF8("PMVS:ACTIVATION-CHECK:1"))
ACTIVATION_DOMAIN = keccak256(UTF8("PMVS:ACTIVATION:1"))
MIGRATION_DOMAIN  = keccak256(UTF8("PMVS:ANCHOR-MIGRATION:1"))

checkHash[i] = keccak256(abi.encode(
  CHECK_DOMAIN, keccak256(bytes(checks[i].id)), checks[i].target,
  keccak256(checks[i].callData), checks[i].expectedReturnDataHash))
checksHash    = keccak256(abi.encode(checkHash[]))

headHash[i]   = keccak256(abi.encode(streamId, sequence, uint8(10), recordHash))
headsHash     = keccak256(abi.encode(headHash[]))
migrationHash = migration == null ? bytes32(0) : keccak256(abi.encode(
  MIGRATION_DOMAIN, oldAnchor, newAnchor, headsHash))

actionCommitment = keccak256(abi.encode(
  ACTIVATION_DOMAIN, uint256(chainId), address(shareToken), subjectId,
  context.sequence, context.prev, activation.nonce, expectedActive != null,
  expectedRecordHash, expectedGeneration, expectedAnchor, generation,
  declaredNewAnchor, validFromBlock, validThroughBlock, migrationHash, checksHash))
```

Null `expectedActive` encodes zero predecessor fields. Genesis migration is null. A non-genesis null migration encodes `migrationExists = false`, zero anchors, and an empty head list. A transition requires:

```text
oldAnchor == expectedActive.anchor == current discovery anchor
newAnchor == declaredNewAnchor == ComponentActivationCall.newAnchor
oldAnchor != newAnchor
```

`declaredNewAnchor` is the sole candidate contract with role `anchor`. Watcher heads strictly increase by unsigned `streamId`; duplicates fail.

The activation types and field order are exact:

```text
ComponentActivationCall{recordHash:bytes32,actionCommitment:bytes32,sequence:uint64,prev:bytes32,nonce:uint64,expectedActiveExists:bool,expectedRecordHash:bytes32,expectedGeneration:uint64,expectedAnchor:address,generation:uint64,newAnchor:address,validFromBlock:uint64,validThroughBlock:uint64,migrationExists:bool}
ComponentActivationCheck{idHash:bytes32,target:address,callData:bytes,expectedReturnDataHash:bytes32}
ComponentWatcherHead{streamId:bytes32,sequence:uint64,kind:uint8,recordHash:bytes32}
ComponentAnchorTransition{oldAnchor:address,newAnchor:address,heads:ComponentWatcherHead[]}
activatePMVSComponents(ComponentActivationCall,ComponentActivationCheck[],ComponentAnchorTransition)
```

Initialization binds once. `subjectId()` and `authorityResolver()` MUST return the record's subject and sole resolver. The sequence-zero components record uses generation `0`, activation nonce `1`, zero `components` and `supersedes`, null `expectedActive`, and null migration. It reproduces the subject, anchor, resolver, anchor mode, settlement wrapper, and their code and proxy identities. Bootstrap governance from `pmvsAuthority(subjectId,4)` signs it.

A later record requires:

```text
expectedActive.recordHash == components == supersedes
expectedActive.generation == current generation
expectedActive.anchor == current discovery anchor
generation == current generation + 1
activation.nonce == current activation nonce + 1
```

The candidate is attested through the current anchor. The governance-only activation call requires the selected anchor's subject head to equal `(true, sequence, 4, recordHash)`. It matches active state, recomputes `actionCommitment`, checks the inclusive block window, runs each declared `STATICCALL`, performs only the declared transition, updates discovery, and emits once:

```solidity
event PMVSComponentsUpdated(
    bytes32 indexed recordHash,
    uint64 indexed generation,
    address indexed anchor,
    uint64 nonce,
    bytes32 actionCommitment
);
```

Calldata checks have the record's length and order. Each row requires:

```text
idHash == keccak256(bytes(record.activation.conditions.checks[i].id))
```

Target, calldata, and expected return-data hash MUST also match. Transition calldata carries only the sorted watcher heads. Before the anchor calls, activation prepends the subject head `(streamId=0, sequence, kind=4, recordHash)`. A verifier binds the record, calldata, recomputed commitment, canonical receipt, state change, and event. A revert preserves the prior configuration.

## Record anchor

`i(...)` lists zero-based indexed event fields.

```text
PMVSRecordAnchored(subjectId:bytes32,streamId:bytes32,recordHash:bytes32,sequence:uint64,kind:uint8,recordPrev:bytes32,previousAnchor:bytes32,signer:address,signatureScheme:uint8,signatureHash:bytes32,uri:string) i(0,1,2)
```

The event stores `signatureHash = keccak256(signature)`. Watcher streams use:

```text
streamId = keccak256(abi.encodePacked("PMVS:WATCHER:1", signer))
```

A finalized subject accepts commits only for records whose kind is `correction` (`1`).

Anchor migration uses these exact types and signatures:

```text
PMVSHead{streamId:bytes32,sequence:uint64,kind:uint8,recordHash:bytes32}
freezeHeads(subjectId:bytes32,recordHash:bytes32,heads:PMVSHead[])
importHeads(subjectId:bytes32,oldAnchor:address,recordHash:bytes32,heads:PMVSHead[])
subjectFrozen(subjectId:bytes32)->bool
```

Activation prepends the subject head, then appends watcher heads in unsigned `streamId` order. The new anchor emits one event for each head in that order:

```solidity
event PMVSAnchorMigrated(
    bytes32 indexed subjectId,
    bytes32 indexed streamId,
    address indexed oldAnchor,
    uint64 sequence,
    uint8 kind,
    bytes32 recordHash
);
```

## M1 valuation mechanics

The active method names its engine, version, source commit, artifact hash, and parameters. The named source and artifact MUST be publicly retrievable and hash-match the record. Its parameters are:

| Parameter | Meaning |
|---|---|
| `maxSkewMs` | Capture-window span limit: `endedAtMs - startedAtMs` MUST NOT exceed it. |
| `maxVenueResponseLagMs` | How long after its venue timestamp a captured response may still end (`responseEndMs - venueTimeMs`). |
| `maxCaptureAgeMs` | How long after `endedAtMs` a price stays settleable; sets `validUntil`. |
| `minPositionSize` | Minimum held size in the venue's native quantity unit. Smaller live positions are disclosed as `excluded_negligible`, marked zero, and counted toward both unfilled-exposure caps by their maximum payout. |
| `zeroBidObservations` / `zeroBidWindowMs` | A live position MAY use `writeoff_zero_bid` only when at least `zeroBidObservations` valid book captures, each at least `zeroBidWindowMs` after the previous one, ALL show an empty book within `[startedAtMs, endedAtMs]`. A missing response never proves zero bids. |
| `maxPositionUnfilledPayout` / `maxAggregateUnfilledPayout` | Per-position and portfolio-wide caps on maximum payout of unsold exposure; exceeding either fails valuation. |

Every observation MUST fall within `[startedAtMs, endedAtMs]`. A venue response MUST end no earlier than its venue timestamp and no more than `maxVenueResponseLagMs` later. Settlement expiry is:

```text
validUntil = floor((endedAtMs + maxCaptureAgeMs) / 1000)
```

The verifier rebuilds every declared custody account from genesis or a proved checkpoint, then reads all balances at the pinned block. Venue lists may classify assets but MUST NOT limit discovery. Missing pages, failed calls, unknown positions, or incomplete custody fail valuation. Every supported nonzero balance is included.

Resolved positions use their pinned payout. Live positions cross the captured bids in descending price order:

```text
grossMark = floor(sum(filledQuantity * bidPrice) / PRICE_SCALE)
mark      = grossMark - venueExitCost
```

The venue profile fixes the scale, exit cost, collateral conversion, payout rules, and exposure caps. Resolved collateral follows its complete declared route into the accounting asset. The record stores filled and unfilled size, exit cost, mark, and maximum payout. A position below `minPositionSize` remains disclosed as `excluded_negligible`, is marked zero, and adds its maximum payout to both unfilled-exposure caps. Bad levels, overflow, impossible payouts, stale books, or material unsold exposure fail. Valid repeated empty books may prove zero bids; a missing response cannot.

```text
grossAssets = cashValue + positionsValue
navSigned   = grossAssets - liabilities
nav         = max(navSigned, 0)

pps = floor(nav * 10^shareDecimals * 10^18
            / (totalSupply * 10^assetDecimals))
```

Cash includes every controlled accounting-asset balance, including escrow and reserves. Overlay lines are out of scope in v1: any nonzero overlay line fails valuation (`UNVERIFIABLE_INPUTS`). Asset-denominated escrow, funded withdrawals, asset fee claims, debt, and operating obligations are liabilities. Share-denominated claims remain in supply and MUST NOT reduce NAV again. Internal transfers do not change NAV. Positive supply with zero NAV gives zero PPS; such an epoch settles as zero NAV until NAV recovers above one unit of PPS precision. Zero supply uses `initialPps`. Unexplained assets with zero supply return `UNALLOCATED_ASSETS`. `referencePps` is display-only and MUST NOT settle requests. Arithmetic uses bounded integers and exact decimal parsing, never IEEE-754.

Positions sort by numeric chain id, contract, and numeric token id. Holdings sort by account, accounting lines by UTF-16 `id`, and bids by descending price. Settlement records use an epoch and null slot. Periodic records use a slot and null epoch; missing periodic observations use gap records.

The components publication declares the periodic-capture parameters: `captureWindowSeconds` bounds how long one valuation's capture may span (consistent with `maxSkewMs`); `graceSeconds` extends each expected slot before it counts as missed; `cadence` names the slot origin, interval, evaluation window, and `maxConsecutiveGaps`. More than `maxConsecutiveGaps` consecutive missed slots within one evaluation window invalidates any L3 claim until a valuation fills a later slot. A behavior-changing valuation or fee rule requires a new method or profile id.

The selected venue profile defines the settlement freeze. If custody or trading can change after capture without an onchain recheck, the result is diagnostic and cannot claim L1.

## Settlement interface

### Price, request, and claim types

Selection commits to the ordered ids:

```text
selectionHash = keccak256(abi.encode(requestIds))
```

Delegated withdrawals use EIP-712 domain `PMVS-WithdrawIntent`, version `1`, and this primary type:

```text
WithdrawIntent(address investor,uint256 shares,uint256 nonce,uint256 deadline,uint256 chainId,address settlementContract)
```

The settlement types and field order are exact:

```text
DepositSettlementInput{requestIds:uint256[],root:bytes32,totalAssets:uint256,totalShares:uint256}
WithdrawSettlementInput{requestIds:uint256[],root:bytes32,totalShares:uint256,totalAssets:uint256}
DepositClaim{epoch:uint64,requestId:uint256,shares:uint256,leafIndex:uint256,proof:bytes32[]}
WithdrawClaim{epoch:uint64,requestId:uint256,assets:uint256,leafIndex:uint256,proof:bytes32[]}
```

### Contract surface

```text
depositAsset(uint256)->uint256; depositAssetFor(address,uint256)->uint256;
requestWithdraw(uint256)->uint256; requestWithdrawFor(address,uint256,uint256,uint256,uint8,bytes32,bytes32)->uint256;
cancelDeposit(uint256)->uint256; cancelWithdraw(uint256)->uint256;
depositQueuedAt(uint256)->uint64; withdrawQueuedAt(uint256)->uint64; withdrawAssetsDue(uint256)->uint256;
maxPendingDuration()->uint64; claimRemedyDelay()->uint64;
refundExpiredDeposit(uint256)->uint256; refundExpiredWithdraw(uint256)->uint256;
deliverExpiredDeposit(uint256)->uint256; deliverExpiredWithdraw(uint256)->uint256;
currentEpoch()->uint64; lastProcessedEpoch()->uint64; advanceEpoch(uint64)->(bool,uint64);
rollEpoch(uint64,uint64,DepositSettlementInput,WithdrawSettlementInput)->(bool,uint64);
rollEpochZeroNav(uint64,uint64)->(bool,uint64);
claimDeposits(DepositClaim[])->uint256; claimWithdrawals(WithdrawClaim[])->uint256;
epochFinalPps(uint64)->uint256; depositLeafCount(uint64)->uint256; withdrawLeafCount(uint64)->uint256;
epochArchiveHash(uint64)->bytes32; epochActionRecordHash(uint64)->bytes32; retirementFinalRecordHash()->bytes32;
ROLL_SETTLEMENT_VERSION()->uint64; pmvsRetirementState()->(uint256,uint256,uint256,uint256);
supportsFinalRoll()->bool; finalRollReady()->bool;
rollEpochWithAnchor(uint64,uint64,DepositSettlementInput,WithdrawSettlementInput,PMVSAnchorInput,bytes)->(bool,uint64);
rollEpochZeroNavWithAnchor(uint64,uint64,PMVSAnchorInput,bytes)->(bool,uint64);
finalizeRetirementWithAnchor(PMVSAnchorInput,bytes);
```

Functions are `external`; getters are `view`. Declared components MAY divide the functions among contracts. Atomic wrappers accept `PMVSAnchorInput` from this annex.

### Settlement events

```text
DepositQueued(requestId:uint256,epoch:uint64,owner:address,assets:uint256,queuedAt:uint64) i(0,1,2)
WithdrawQueued(requestId:uint256,epoch:uint64,owner:address,shares:uint256,queuedAt:uint64) i(0,1,2)
DepositCancelled(requestId:uint256,epoch:uint64,owner:address,assets:uint256) i(0,1,2)
WithdrawCancelled(requestId:uint256,epoch:uint64,owner:address,shares:uint256) i(0,1,2)
EpochAdvanced(newEpoch:uint64) i(0)
EpochSettlementPricePublished(components:bytes32,epoch:uint64,priceAttempt:uint64,grossPps:uint256,valuationRecord:bytes32,validUntil:uint64) i(0,1,2)
EpochSettlementPriceUsed(epoch:uint64,priceAttempt:uint64,valuationRecord:bytes32,grossPps:uint256,ppsFinal:uint256) i(0,1,2)
DepositSelection(epoch:uint64,selectionHash:bytes32) i(0)
WithdrawSelection(epoch:uint64,selectionHash:bytes32) i(0)
DepositRollCommitted(epoch:uint64,root:bytes32,leafCount:uint256,totalAssets:uint256,totalShares:uint256) i(0)
WithdrawRollCommitted(epoch:uint64,root:bytes32,leafCount:uint256,totalShares:uint256,totalAssets:uint256) i(0)
DepositClaimProcessed(epoch:uint64,requestId:uint256,owner:address,shares:uint256) i(0,1,2)
WithdrawClaimProcessed(epoch:uint64,requestId:uint256,owner:address,assets:uint256) i(0,1,2)
FeeMintBasis(epoch:uint64,grossPps:uint256,highWaterMark:uint256,feeRate:uint256,supplyBefore:uint256,delta:uint256,sharesMinted:uint256) i(0)
FeeProcessed(epoch:uint64,highWaterMark:uint256,grossPps:uint256,sharesMinted:uint256) i(0)
FinalRollAssetFeeAccrued(epoch:uint64,grossPps:uint256,ppsFinal:uint256,feeAssets:uint256) i(0)
ZeroNavWinddownOpened(epoch:uint64,priceAttempt:uint64,valuationRecord:bytes32) i(0,1,2)
EpochArchiveBound(epoch:uint64,priceAttempt:uint64,recordHash:bytes32) i(0,1,2)
EpochActionRecordBound(epoch:uint64,priceAttempt:uint64,recordHash:bytes32) i(0,1,2)
RetirementFinalRecordBound(sequence:uint64,recordHash:bytes32) i(0,1)
VaultRetired(subjectId:bytes32) i(0)
```

Events MUST match declared components, stored state, records, and effect order. Each `queuedAt` MUST match its getter.

## Settlement mechanics

All integer operations are checked. Products and quotients use full-precision floor `mulDiv` unless a formula says `ceil`.

### Queue, epochs, and attempts

A deposit locks accounting assets. A withdrawal locks shares. The request owner and input MUST be nonzero. `queuedAt = uint64(block.timestamp)` and every deadline addition MUST fit. A delegated withdrawal MUST use the nonce-bound, expiring EIP-712 intent defined above. Before selection, cancellation returns the exact stored input to the owner.

Epochs start at `1`. Advancing requires the supplied epoch to equal both `currentEpoch` and `lastProcessedEpoch + 1`. Only one epoch may await settlement. Only the declared settlement authority may freeze an epoch or submit a roll.

Price attempts are consecutive positive integers. Publication stores an immutable `(components, grossPps, valuationRecord, validUntil)` tuple. A roll MUST load the current tuple via `currentPriceAttempt(epoch)`, match the active components and that exact attempt, and execute no later than `validUntil`. An expired attempt may be followed by the next attempt; no attempt may be overwritten; a roll MUST NOT settle against any earlier attempt it does not name.

### Price and fee math

Let `WAD = 10^18`, let the accounting asset use `D` decimals with `0 <= D <= 18`, and let `BRIDGE = 10^(18-D)`. `hwm` is the prior high-water mark and `r` is the WAD-scaled performance-fee rate.

```text
netPps(gross, hwm, r):
    if gross <= hwm: return gross
    delta = gross - hwm
    keep  = (r == 0) ? delta : floor((WAD - r) * delta / WAD)
    return hwm + keep

ppsFinal          = netPps(grossPps, hwm, feeRate)
depositSharesOut  = floor(assets * BRIDGE * WAD / ppsFinal)
withdrawAssetsOut = floor(shares * ppsFinal / (WAD * BRIDGE))
```

Without a fee module, `ppsFinal = grossPps`. A non-final fee requires `grossPps > hwm`, `feeRate != 0`, `feeRate < WAD`, and nonzero pre-flow supply:

```text
feePerShare  = ceil(feeRate * (grossPps - hwm) / WAD)
sharesMinted = ceil(preFlowSupply * feePerShare / ppsFinal)
```

Version `2` uses pre-flow supply and raises `hwm` to a higher `ppsFinal`. A stored flag prevents a second final fee.

### Roll and reserves

A normal roll requires `epoch != 0`, `epoch == lastProcessedEpoch + 1`, `epoch < currentEpoch`, and unprocessed state. Request ids strictly increase. Selection is oldest-first: a batch takes settleable pending requests by ascending `queuedAt` (ties by ascending id), up to `maxSelectedRequestsPerLeg`. A withdrawal whose output would be zero on a non-final roll is not settleable this epoch: it stores a zero output and stays pending. Excluding an older settleable request while selecting a younger one is invalid. The contract MUST reload every request, reject ineligible entries, calculate each output, and match roots, counts, totals, transfers, reserves, events, and final state.

An empty leg has no ids and zero root, totals, and claims. A nonempty deposit leg and a non-final withdrawal leg require nonzero input and output totals. A zero non-final output stays pending. A final withdrawal may store zero asset outputs under the final-roll rules below.

Validation is `O(n)` and MUST enforce a gas-tested batch cap, `maxSelectedRequestsPerLeg`, declared in `profileParameters["settlement/epoch-merkle/1"]` next to the liveness parameters. New deployments use `ROLL_SETTLEMENT_VERSION() == 2`. Version `1` requires pinned bytecode and proof that the v2 selector is absent.

After the roll:

```text
controlled shares >= pending withdrawal shares
                   + outstanding deposit-claim shares
                   + fee-claim shares

controlled assets >= pending deposit assets
                   + outstanding withdrawal-claim assets
                   + fee-claim assets
                   + other declared encumbrances
```

`controlled` means held by declared settlement components. Each unit is assigned once. Claim reserves cannot serve another request, fee, liability, approval, or strategy.

### Records, retries, and deadlines

| Action | Record | Stored hash |
|---|---|---|
| Normal roll | `settlement-archive` | `epochArchiveHash(epoch)` |
| Zero NAV | `winddown-opened` | `epochActionRecordHash(epoch)` |
| Retirement | `retirement-final` | `retirementFinalRecordHash()` |

A normal or zero-NAV retry uses the next attempt. After an unused registry record, its successor names the latest unused archive or zero-NAV record for the same subject and epoch with an earlier sequence and attempt. It uses `null` if none exists.

`components.profiles.requestLiveness` selects `bounded` or `operator-dependent`. Bounded mode stores positive immutable `uint64` values at `profileParameters["settlement/epoch-merkle/1"].maxPendingDuration` and `.claimRemedyDelay`:

```text
pendingDeadline = checkedAdd(queuedAt, maxPendingDuration)
claimDeadline   = checkedAdd(validUntil, claimRemedyDelay)
```

After the relevant deadline, anyone may refund an unselected input or deliver a stored output. Normal ownership, reserve, replay, event, and reentrancy checks still apply. Operator-dependent mode omits both parameters, returns zero from both getters, and reverts the remedy calls.

`sunsetting` stops new deposits but permits withdrawals. `requestsPaused` stops both request types. Neither condition may block cancellation, a funded claim, or a bounded deadline remedy.

### Zero NAV, final withdrawal, and retirement

`rollEpochZeroNav` applies the normal components, attempt, evidence, and expiry checks with `grossPps = ppsFinal = 0`. It selects no request and changes no funds, requests, claims, reserves, asset balances, supply, fees, or retirement state.

A final withdrawal requires no deposits, selected withdrawal shares equal to pre-fee supply, and code-pinned enumeration proving that complete custody holds no position or non-accounting asset. Both `supportsFinalRoll()` and `finalRollReady()` MUST return `true` before shares burn. The roll mints no fee shares and pays the fee in assets.

```text
K                = WAD * BRIDGE
S                = selected withdrawal shares
sourceAssets     = sum(accounting-asset balances across complete custody)
encumberedBefore = sum(each assigned asset obligation once)
freeBefore       = sourceAssets - encumberedBefore
quotedUserAssets = floor(S * ppsFinal / K)
feeAssets        = floor(S * (grossPps - ppsFinal) / K)
userAssets       = freeBefore - feeAssets
```

Require `sourceAssets >= encumberedBefore`, `freeBefore >= quotedUserAssets + feeAssets`, and `userAssets + feeAssets == freeBefore`. For sorted ids, let `P[0] = 0` and `P[i] = P[i-1] + storedShares(id[i])`. Store:

```text
assets[i] = floor(P[i] * userAssets / S) - floor(P[i-1] * userAssets / S)
```

Require `P[n] == S` and `sum(assets[i]) == userAssets`. Claims and deadline delivery use the stored amount.

Retirement requires zero supply, pending requests, outstanding claims, claim funding, positions, liabilities, and unresolved recovery rights. The atomic wrapper checks the four onchain counters before and after committing `retirement-final`, sets the subject-finalized and retired flags, stores its hash and sequence, and emits `RetirementFinalRecordBound` and `VaultRetired`. It MUST NOT call tokens, arbitrary targets, hooks, or `delegatecall`. Other retirement paths revert. Registry mode must migrate to atomic mode first. A failed transaction leaves the vault Active.

## Merkle claims

New deployments MUST use `pmvs-merkle/1`:

```text
tag  = keccak256(utf8("PMVS:MERKLE:1"))
leaf = keccak256(
    0x00 || tag || be(chainId,32) || settlementContract(20) || leg(1) ||
    be(epoch,8) || be(requestId,32) || owner(20) || be(amount,32)
)
node = keccak256(0x01 || min(left,right) || max(left,right))
root = count == 0 ? bytes32(0) : keccak256(0x02 || be(count,32) || rawTreeRoot)
```

`be(x,n)` is the `n`-byte big-endian encoding. `rawTreeRoot` is the complete unprefixed root. `leg` is `0` for deposits and `1` for withdrawals. Leaves follow selected request ids. Siblings sort bytewise; odd nodes self-pair. [Test vectors](./fixtures/test-vectors.md) cover a full three-leaf tree.

Verification checks count, zero-based index, tree size, and self-pairs. Onchain selection stores `leafIndex + 1`, so zero means unselected. Archive ids, transaction ids, and leaves MUST match in order.

## Polymarket settlement call plan

Legacy Safe custody uses the pinned PolySafeLib derivation:

```text
salt = keccak256(abi.encode(accountSignerAddress))
custodyAccount = CREATE2(
  0xaacfeea03eb1561c4e67d661e40682bd20e3541b,
  salt,
  0x2bce2127ff07fb632d16c8347c4ebf501f4841168bed00d9e6ef715ddb6fcecf)
```

The proxy runtime hash is `0x92565062fdea8761e07d9df2fcdbd66c0582af6ddf0e0355bc07754ad97400b0`; the singleton is `0xe51abdf814f8854941b9fe8e3a4f65cab4e7a4a8`. The venue schema pins the remaining addresses and runtime code hashes; the CREATE2 init-code hash above lives only here.

Negative-risk question ids decode as:

```text
marketId      = bytes32(uint256(questionId) & ~uint256(0xff))
questionIndex = uint8(uint256(questionId))
require 2 <= questionCount <= 255 and questionIndex < questionCount
```

Route evidence binds these exposure bounds:

```text
maxRedemptionExposure = sum(maximum WCOL output of negative-risk executions)
maxUsdceSettlementExposure = sum(custody pUSD)
                              + sum(maximum pUSD output of all executions)
```

`USDC.e.balanceOf(WCOL)` MUST cover `maxRedemptionExposure`. `USDC.e.balanceOf(pUSD.VAULT())` and the pUSD allowance MUST cover `maxUsdceSettlementExposure`.

The `venue/polymarket/1` freeze rows bind one protected call before the record is anchored.

```text
DOMAIN = keccak256(UTF8("PMVS:VENUE-POLYMARKET:SETTLEMENT-CALL-PLAN:1"))
idsHash(ids:uint256[]) = keccak256(abi.encode(ids))

registryNormal="rollEpoch(uint64,uint64,(uint256[],bytes32,uint256,uint256),(uint256[],bytes32,uint256,uint256))"
registryZeroNav="rollEpochZeroNav(uint64,uint64)"
atomicNormal="rollEpochWithAnchor(uint64,uint64,(uint256[],bytes32,uint256,uint256),(uint256[],bytes32,uint256,uint256),(bytes32,bytes32,uint8,uint64,bytes32,bytes32,bytes32,address,uint8,string),bytes)"
atomicZeroNav="rollEpochZeroNavWithAnchor(uint64,uint64,(bytes32,bytes32,uint8,uint64,bytes32,bytes32,bytes32,address,uint8,string),bytes)"

selectors = bytes4(keccak256(UTF8(signature)))
registry: normal=0x0572cba6, zeroNAV=0x81c7d9c6
atomic:   normal=0x894b93e1, zeroNAV=0xa1ca4aa2
branch:   normal=uint8(1), zeroNAV=uint8(2)

normal fields =
  depositIdsHash=idsHash(deposit.requestIds), depositRoot=deposit.root,
  depositAssets=deposit.totalAssets, depositShares=deposit.totalShares,
  withdrawIdsHash=idsHash(withdraw.requestIds), withdrawRoot=withdraw.root,
  withdrawShares=withdraw.totalShares, withdrawAssets=withdraw.totalAssets

zero-NAV fields = bytes32(0), bytes32(0), uint256(0), uint256(0),
                  bytes32(0), bytes32(0), uint256(0), uint256(0)

settlementCallPlanHash = keccak256(abi.encode(
  DOMAIN, uint256(block.chainid), address(enforcer), bytes4(settlementFunctionSelector),
  uint64(epoch), uint64(priceAttempt), uint8(branch),
  bytes32(depositIdsHash), bytes32(depositRoot), uint256(depositAssets), uint256(depositShares),
  bytes32(withdrawIdsHash), bytes32(withdrawRoot), uint256(withdrawShares), uint256(withdrawAssets)))
```

The signature MUST match `profiles.anchorMode`. The hash excludes `PMVSAnchorInput`, record hash, URI, and signature. Reconstruct it from the action record and protected call before checking the receipt.

## Verification result codes

Verifiers SHOULD return every independent failure. Required codes are:

```text
INVALID_ENCODING,INVALID_HASH,INVALID_SIGNATURE,UNVERIFIABLE_AUTHORITY,
UNSUPPORTED_PROFILE,UNSUPPORTED_POSITION_FORMAT,CHAIN_STATE_MISMATCH,
CHAIN_BROKEN,EQUIVOCATION,UNANCHORED,UNEXECUTED_ANCHOR,
UNEXECUTED_ACTIVATION,ARITHMETIC_MISMATCH,SETTLEMENT_MISMATCH,
UNDERFUNDED_CLAIMS,STRANDED_SHARE_SUPPLY,UNALLOCATED_ASSETS,
MISSING_RECORD,STALE,DATA_UNAVAILABLE,INCOMPLETE_CAPTURE,
INCOMPLETE_INVENTORY,UNVERIFIABLE_INVENTORY,UNVERIFIABLE_INPUTS
```

## References

- [Solidity ABI](https://docs.soliditylang.org/en/latest/abi-spec.html)
- [ERC-165](https://eips.ethereum.org/EIPS/eip-165)
- [Core](./pmvs-core.md)
- [Settlement](./pmvs-settlement.md)
- [PMVS-M1 valuation](./pmvs-m1.md)
- [EVM anchor profile](./profiles/anchor-evm-1.md)
- [Polymarket venue profile](./profiles/venue-polymarket-1.md)
- [Schemas](./schemas/README.md)

## Copyright

Copyright and related rights in this document are waived under CC0-1.0. Third-party material remains under its own license.
