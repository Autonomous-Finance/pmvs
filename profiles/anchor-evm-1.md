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

This profile gives Part I anchors one EVM interface. A subject can use a separate registry or embed the same transition in a settlement contract. Both modes validate the PMVS attestation on-chain. Only the embedded transition is atomic with the covered action.

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
        external view returns (bool exists, uint64 sequence, bytes32 recordHash);
}
```

`commit` emits the `PMVSRecordAnchored` event in Part I. The contract SHOULD expose this interface through ERC-165. The component record states the contract address, interface id, runtime-code hash, proxy data, resolver address, and resolver code hash.

## State transition

The contract performs these checks in order:

1. `input.subjectId` equals the immutable or registered subject id.
2. `recordHash` is nonzero and the UTF-8 `uri` is no more than 256 bytes.
3. For a new stream, `sequence == 0` and `previousAnchor == bytes32(0)`. Otherwise, `sequence` is greater than the stored anchor sequence and `previousAnchor` equals the stored hash.
4. For the subject stream, `streamId == bytes32(0)` and `signer == resolver.pmvsAuthority(subjectId, kind)`.
5. For a watcher stream, `kind == 10`, `streamId == keccak256(abi.encodePacked("PMVS:WATCHER:1", signer))`, and the record's `producer` equals `signer` when the bytes are later verified.
6. The EIP-712 digest uses the Part I domain and `Attestation` type, including `streamId` and `previousAnchor`. Scheme 0 recovers `signer` from a low-`s` ECDSA signature. Scheme 1 uses `staticcall` for `signer.isValidSignature(digest, signature)` and requires `0x1626ba7e`.
7. The contract stores `(true, sequence, recordHash)` for the stream and emits the event with `signatureHash = keccak256(signature)`. A verifier matches that hash with the envelope signature. Any failed check reverts without changing the head.

The contract cannot check `recordPrev` ancestry without the record bytes. Off-chain verification walks that chain to `previousAnchor`. A sequence jump with missing records is still `CHAIN_BROKEN` even though the anchor transaction succeeded.

## Registry mode

A registry deployment is bound to one subject and one authority resolver. Governance rotates authorities through the resolver's existing on-chain process, not through an unsigned registry setting. The resolver MUST expose historical changes through state or events so a verifier can reconstruct the value used by the anchor transaction.

The operator anchors a settlement archive before submitting the covered settlement. A failed settlement leaves `UNEXECUTED_ANCHOR` history. The next attempt advances the record stream and anchor head.

## Atomic mode

The settlement entry point performs the same checks and state update before its irreversible effects, then emits the same event. A revert anywhere in the transaction removes both action and anchor. Every action that can settle value or end redemption rights, including zero-NAV and retirement paths, MUST call the anchor transition.

An external call to a registry from the same transaction is atomic only when the covered contract itself requires that call to succeed on every path. A bot sending two independent transactions is registry mode.

## Anchor migration

An anchor change uses this order:

1. Governance builds a component record that names the old and new anchors and supersedes the active component generation. It lists the final old-contract head for the subject stream and for each watcher stream that will continue.
2. Governance signs that record with the old anchor contract in the EIP-712 domain and anchors it through the old contract.
3. The old contract freezes each listed stream at the declared activation boundary. Its `head` getter must continue to return the frozen value.
4. The new anchor performs a one-time import for each listed head. In that transaction, it reads `oldAnchor.head(subjectId, streamId)` and requires an exact match. The call must arrive through the authenticated migration path declared by the active component record. The new anchor then emits `PMVSAnchorMigrated(subjectId, streamId, oldAnchor, sequence, recordHash)`.
5. Later records use the new anchor contract in their domain and use the imported record hash as `previousAnchor` until the next anchor.

The freeze function, import function, activation boundary, and authentication path are implementation-specific and MUST be described by the component record. An EVM contract cannot inspect a past log directly, so an event alone is not an on-chain proof. An import cannot reset an existing head. A verifier rejects a migration if an imported head differs from the final old-contract head at the activation boundary. A watcher that does not continue needs no import. If the same producer later resumes its old watcher stream, its old head MUST first be imported; it cannot restart at sequence zero.

```solidity
event PMVSAnchorMigrated(
    bytes32 indexed subjectId,
    bytes32 indexed streamId,
    address indexed oldAnchor,
    uint64 sequence,
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

## Copyright

Copyright and related rights on this document's text are waived via CC0-1.0.
