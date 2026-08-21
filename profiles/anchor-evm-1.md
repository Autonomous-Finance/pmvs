# PMVS anchor profile: `anchor/evm/1`

```
pmvs-part:      profile (anchor)
profile-id:     anchor/evm/1
version:        1 (draft)
status:         Pre-EIP review draft
author:         Ivan Morozov (Zeit Finance)
created:        2026-08-21
requires:       PMVS Part I (core)
```

This profile gives Part I anchors one EVM interface. A subject can use a separate registry or place the same transition in a settlement contract. Both modes validate the PMVS attestation on-chain. An anchor is atomic with a covered action only when the covered contract performs the transition internally or requires an external anchor call to succeed in the same transaction.

## Interface

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
    uint8 signatureScheme; // 0: ECDSA, 1: ERC-1271
    string uri;
}

interface IPMVSAuthorityResolver {
    function pmvsAuthority(bytes32 subjectId, uint8 kind) external view returns (address);
}

interface IPMVSAnchor {
    function commit(PMVSAnchorInput calldata input, bytes calldata signature) external;
    function head(bytes32 subjectId, bytes32 streamId)
        external view returns (bool exists, uint64 sequence, uint8 kind, bytes32 recordHash);
    function subjectFinalized(bytes32 subjectId) external view returns (bool);
}
```

`commit` emits the `PMVSRecordAnchored` event in Part I. The selector of
`commit((bytes32,bytes32,uint8,uint64,bytes32,bytes32,bytes32,address,uint8,string),bytes)`
is `0x25678da7`; the selector of `head(bytes32,bytes32)` is `0x0b804aca`.
The selector of `subjectFinalized(bytes32)` is `0x2991cbd8`. The
`IPMVSAnchor` ERC-165 interface id is the XOR of all three selectors,
`0x07760cb5`.

The selector and ERC-165 interface id of
`pmvsAuthority(bytes32,uint8)` are both `0xcfa1a519`. A conforming
implementation MUST expose the applicable interface ids through ERC-165. The
component record states the contract address, interface ids, runtime-code
hash, proxy data, resolver address, and resolver code hash.

## State transition

The contract performs these checks in order:

1. `input.subjectId` equals the immutable or registered subject id.
2. If `subjectFinalized(input.subjectId)` is true, the call requires the subject stream and kind `8`, `correction`. Every other kind and every watcher-stream commit reverts.
3. `recordHash` is nonzero, `kind` is one of `1`, `2`, `3`, `4`, `5`, `7`, `8`, `9`, or `10`, `signatureScheme` is 0 or 1, and the UTF-8 `uri` is no more than 256 bytes. Kind `6` is reserved for a future versioned profile and is invalid under `anchor/evm/1`. An unknown kind or scheme reverts; this profile never guesses an extension.
4. `streamId == bytes32(0)` selects the subject stream. A new subject stream MUST start with kind `4`, `components`, at sequence zero with both predecessors zero. Kind `10` is invalid in this stream. For an existing subject stream, the stored sequence MUST be less than `type(uint64).max`, `sequence == storedSequence + 1`, and `recordPrev == previousAnchor == storedRecordHash`.
5. A nonzero `streamId` selects a watcher stream and requires kind `10`, `watcher-observation`. It MUST equal `keccak256(abi.encodePacked("PMVS:WATCHER:1", signer))`. A new watcher stream starts at sequence zero with both predecessors zero. For an existing watcher stream, the same exact-next sequence, exhaustion, and predecessor checks apply. The record's `producer` equals `signer` when the bytes are later verified.
6. For a subject-stream record, `signer == resolver.pmvsAuthority(subjectId, kind)`.
7. The EIP-712 digest uses the Part I domain and `Attestation` type, including `streamId` and `previousAnchor`. Scheme 0 recovers `signer` from a low-`s` ECDSA signature. Scheme 1 uses `staticcall` for `signer.isValidSignature(digest, signature)` and requires `0x1626ba7e`.
8. The contract stores `(true, sequence, kind, recordHash)` for the stream. A successful protected kind-7 transition from the registered retirement wrapper, or the equivalent internal covered path, also changes `subjectFinalized[subjectId]` from `false` to `true` before returning. No registry call, unregistered caller, watcher-stream record, or other kind can set the flag. Because step 2 rejects kind 7 after the flag is true, retirement cannot repeat. Other successful transitions leave the flag unchanged. The contract emits the event with `signatureHash = keccak256(signature)`, and a verifier matches that hash with the envelope signature. Any later revert removes the head, event, and flag change.

The exact sequence and predecessor checks make every accepted record the next
directly anchored item. A batch entry point MAY reduce transaction overhead,
but it MUST run these checks and update the head after each item, in array
order. Any failed item reverts the whole batch.

## Registry mode

A registry deployment is bound to one subject and one authority resolver. Governance rotates authorities through the resolver's existing on-chain process, not through an unsigned registry setting. The resolver MUST expose historical changes through state or events so a verifier can reconstruct the value used by the anchor transaction.

For genesis, the registry and resolver are initialized with the subject id and
bootstrap governance before any PMVS claim. That governance commits the
sequence-zero component record. Core subject discovery activates the record
only after reading the resulting head. The component record must reproduce the
bootstrap state; it cannot appoint its own unauthenticated signer.

The operator anchors a settlement archive or `winddown-opened` record before submitting the corresponding covered action. A failed action leaves `UNEXECUTED_ANCHOR` history. Attempt `1` is the first price attempt. A retry is exactly `n + 1` and may be published only strictly after attempt `n` expires, before epoch processing, before either branch succeeds, and before `uint64` exhaustion. Its branch record advances the subject-stream sequence and names the latest unresolved registry-anchored, receipt-less pre-action record for the same subject and epoch under `supersedesUnexecuted`, even if the branch changes. The stream sequence and price attempt are separate counters; both must satisfy Part II's rules.

Registry mode MAY commit kinds `2` and `5` for those pre-action records. It MUST reject kind `7`. Core v1 has no registry-mode terminal finalizer. A registry settlement generation must complete a conforming migration to an atomic generation before terminal closure.

Part II gives the protected settlement kinds different effects. A normal roll consumes kind `2`, stores its hash in `epochArchiveHash`, leaves `epochActionRecordHash` zero, and requires positive gross and final prices. A zero-NAV action consumes kind `5`, stores its hash in `epochActionRecordHash`, leaves `epochArchiveHash` zero, and requires zero gross and final prices. It selects no request, charges no fee, mints and burns nothing, leaves supply unchanged, and opens or continues nonterminal wind-down. Receipts for both branches use `retirement: {"triggered": false, "reason": null}`. The covered action and semantic verifier, not the generic anchor transition, enforce these branch rules.

## Atomic mode

The covered wrapper performs the same checks and state update before its irreversible effects, then emits the same event. A revert anywhere in the transaction removes both action and anchor. Kinds `2`, `5`, and `7` are protected. The generic `commit` entry point MUST reject any of those kinds unless `msg.sender` is the registered covered wrapper. An implementation MAY instead expose the transition only as an internal function called by that wrapper. It MUST NOT expose another path that can anchor a protected kind without executing the covered action.

For kind `7`, the registered retirement wrapper uses the fixed terminal-state interface in Part II. It reads `pmvsRetirementState()` before and after the anchor call and requires zero share supply, pending requests, outstanding claims, and claim funding on both reads. The protected anchor transition sets `subjectFinalized[subjectId]` from `false` to `true`. The wrapper checks the getter after that call. The wrapper is `nonReentrant`. It accepts no resolution call list and performs no residual transfer, state-changing token call, arbitrary target call, hook, or `delegatecall`. Its only external state-changing call is the protected transition through the pinned active anchor when that transition is not internal.

The wrapper then stores the exact subject-only record hash and sequence, sets settlement terminal state, requires `subjectFinalized(subjectId)`, and emits `RetirementFinalRecordBound` and `VaultRetired(subjectId)` in the same transaction. A later revert removes every effect. The anchor and wrapper do not parse the record or prove its residual and recovery declarations. An independent verifier binds the stored hash to canonical record bytes, checks that every declared resolution happened before the finalization transaction, and proves that the complete custody and accounting perimeters are empty.

Once the flag is true, the anchor accepts only subject-stream kind-8 corrections. The semantic verifier also requires `changesSettlementBearingOutput: false` on every such correction because the anchor sees only its kind and hash. A generation-scoped record, a signed or published record, an unanchored record, or a record committed through a nonconforming path has no terminal effect. Component generation replacement uses an anchored `components` migration, not kind `7`.

An external call to a registry from the same transaction is atomic only when the covered contract itself requires that call to succeed on every path. A bot sending two independent transactions is registry mode.

## Anchor migration

An anchor change is part of component activation, not a separate later action:

The component migration contains this closed field. The watcher rows are
strictly ordered by `streamId` and contain no subject-stream row:

```json
{
  "anchorTransition": {
    "oldAnchor": "0x...",
    "newAnchor": "0x...",
    "continuingWatcherHeads": [
      {
        "streamId": "0x...",
        "sequence": "7",
        "kind": "10",
        "recordHash": "0x..."
      }
    ]
  }
}
```

The addresses MUST equal `expectedActive.anchor` and the newly declared anchor.
The subject head is omitted because its hash is the candidate's own future
`recordHash`; the activation derives that row after the record is hashed.

1. Governance builds a component record whose `expectedActive.anchor` is the old
   anchor and whose declared anchor component is the new anchor. `components`
   and `supersedes` name the active component record. The migration declaration
   lists each watcher stream that will continue and its current
   `(sequence, kind, recordHash)` head. It does not repeat the candidate's own
   future `recordHash` as a field.
2. Governance signs the candidate with the old anchor in the EIP-712 domain and
   commits it through the old anchor. The old subject-stream head is now the
   candidate's `(sequence, kind 4, recordHash)` tuple. If any listed stream
   advances, this candidate can never activate. A later component candidate
   then advances the subject sequence and predecessor but may reuse the still
   unconsumed component generation and activation nonce.
3. One activation transaction authenticates governance from the active
   generation and requires the exact expected active tuple, activation nonce,
   block window, and action commitment. It reads the old anchor and requires
   the candidate subject head plus every declared continuing watcher head.
4. In that same transaction, the old anchor freezes those exact heads and the
   new anchor imports them once. The new anchor derives the subject import from
   the activation's `recordHash`, stream sequence, and kind 4. It imports
   watcher tuples from the migration declaration. Each import reads the frozen
   old head and requires an exact match before emitting
   `PMVSAnchorMigrated(subjectId, streamId, oldAnchor, sequence, kind, recordHash)`.
5. The transaction performs the declared migration, runs every committed
   `STATICCALL` condition, requires the new anchor's subject head to equal the
   candidate tuple, updates share-token discovery, and emits the exact
   `PMVSComponentsUpdated` event from Part I. A revert restores the old anchor
   and generation to usable state.
6. A later record uses the new anchor in its EIP-712 domain. Its `recordPrev`
   and `previousAnchor` equal the imported head for that stream.

The freeze and import paths MUST accept calls only from the authenticated
activation path declared by the active generation. An import cannot replace an
existing different head. The transaction MUST import every continuing watcher
stream, but no inactive watcher. If a producer later resumes an old watcher
stream, its frozen old head MUST first be imported; the producer cannot restart
at sequence zero.

Receipt evidence, including the activation transaction hash, block number,
block hash, transaction index, log index, and import events, is collected only
after the transaction. None of those future locators appears in the candidate
record. The verifier checks the canonical candidate-anchor receipt and the
canonical activation receipt with every required import event, then waits for
the declared confirmation depth. A reorganization that removes any required
transition leaves no verified activation.

For an anchor change, receipt verification compares four exact head sets: the
subject head derived from the candidate plus every continuing watcher head
declared by the migration; the frozen old-anchor heads; the imported new-anchor
heads; and the new anchor's post-import heads. All four sets MUST match with no
missing, extra, reordered, or duplicate stream. The activation receipt MUST
contain one `PMVSAnchorMigrated` event per head, in that order, before the
single `PMVSComponentsUpdated` event. Each migration event MUST come from the
new anchor and bind the subject id, stream id, old anchor, sequence, kind, and
record hash. Every migration event, state transition, and discovery update
MUST share the same successful canonical activation transaction. A Boolean
claim that an import succeeded is not evidence.

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

## Location repair

The anchor contract MAY expose an authenticated location-addition function and emit `ArtifactLocationAdded`. It MUST NOT change the stream head or record hash. A verifier rejects a locator whose bytes do not match the anchored hash.

## Security considerations

- A faulty or upgradeable resolver can authorize the wrong signer. The component record pins its code and upgrade authority.
- An ERC-1271 signer can execute arbitrary validation logic. The anchor records that the call succeeded at that transaction; it does not assess the policy's quality.
- A long URI can waste gas and make event processing costly, so this profile caps its byte length.
- Atomic commitment proves that a hash was supplied before the action completed. It does not prove that the bytes were available or that external inputs were true.
- The anchor transition sees the hash, kind, stream position, authority, and signature. For kind `7`, the registered wrapper checks only the fixed on-chain zero-state predicate and atomic terminal transition. The independent verifier checks the record-owned resolution evidence and custody and accounting completeness. For the other protected kinds, the registered wrapper and verifier check `priceAttempt`, retry supersession, and zero-NAV effects against the record bytes and canonical action state.

## Copyright

Copyright and related rights in this document and repository-owned reference
code are waived under CC0-1.0. Third-party material remains under its own
license. CC0 does not grant trademark or patent rights.
