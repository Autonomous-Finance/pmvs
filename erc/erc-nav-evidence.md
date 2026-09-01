---
eip: TBD
title: Evidence-Backed NAV Snapshots
description: Adds a per-snapshot evidence commitment and validity window to ERC-8330 NAV oracles, so anyone can re-run a published valuation.
author: Ivan Morozov (@allquantor)
discussions-to: TBD
status: Draft
type: Standards Track
category: ERC
created: 2026-09-01
requires: 165, 8330
---

## Abstract

[ERC-8330](https://eips.ethereum.org/EIPS/eip-8330) lets a provider publish a net asset value with a hash of its methodology. This ERC adds what a reader needs to check the value: a hash of a canonical record of every input and output of that valuation, a hint for fetching the record, a hash of the configuration it was produced under, and a deadline after which the snapshot must not be used. It fixes the canonical form of the record, the least it must contain, and the results a verifier reports. It does not compute NAV, vet providers, or offer recourse.

## Motivation

Many vaults hold assets whose prices are not on the chain the vault lives on: tokenised funds, private credit, real-world assets, prediction-market positions. Their share price comes from an offchain calculation. ERC-8330 gives that calculation a home onchain and a methodology hash. The methodology hash says how the number was computed. It does not say what it was computed from this time: which block was read, which accounts were counted, which market data was captured and when, what each position was marked at.

Without that, two patterns are common in production today. A trusted reporter writes a number with a hash nobody can open. Or an operator publishes a settlement archive that contains no valuation data at all. Both are unverifiable by construction, and both look identical to a correct publication.

This ERC adds the missing commitment as a small extension. Any ERC-8330 provider can make its snapshots checkable, and one verifier can serve many vaults.

## Specification

The key words "MUST", "MUST NOT", "SHOULD" and "MAY" are to be interpreted as described in RFC 2119 and RFC 8174.

### Interface

```solidity
/// @dev Extends ERC-8330 INAVSnapshotOracle. ERC-165 id: type(INAVEvidence).interfaceId
interface INAVEvidence {
    event NAVEvidenceCommitted(
        bytes32 indexed subjectId,
        bytes32 indexed currency,
        uint256 indexed snapshotIndex,
        bytes32 evidenceHash,
        string  evidenceURI,
        bytes32 configHash,
        uint64  validUntil
    );

    function publishNAVWithEvidence(
        bytes32 subjectId,
        bytes32 currency,
        bytes32 navBasis,
        int256  nav,
        uint8   decimals,
        uint64  valuationTimestamp,
        bytes32 methodologyHash,
        string calldata methodologyURI,
        uint256 correctsIndex,
        bytes32 evidenceHash,
        string calldata evidenceURI,
        bytes32 configHash,
        uint64  validUntil
    ) external returns (uint256 snapshotIndex);

    function evidenceOf(bytes32 subjectId, bytes32 currency, uint256 snapshotIndex)
        external view
        returns (bytes32 evidenceHash, string memory evidenceURI, bytes32 configHash, uint64 validUntil);
}
```

`publishNAVWithEvidence` MUST behave as ERC-8330 `publishNAV` for its first nine parameters. It MUST store the four evidence fields for the returned `snapshotIndex` and emit `NAVEvidenceCommitted` in the same transaction. `evidenceHash` and `configHash` MUST NOT be zero. `validUntil` MUST be greater than `valuationTimestamp` and MUST NOT exceed `valuationTimestamp` plus the stream's `maxValuationAge` when one is configured.

A snapshot published through plain `publishNAV` on an oracle that also implements this interface has no evidence. `evidenceOf` MUST return zero values for it.

### Consumers

A contract that converts, settles or prices against a snapshot from an oracle implementing this interface MUST NOT do so when `block.timestamp > validUntil`, and SHOULD NOT do so when the snapshot has no evidence. A consumer MAY additionally require `configHash` to equal the hash of its own active configuration.

### The evidence record

`evidenceHash` is `keccak256` of the UTF-8 bytes of the record serialised under [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785), with these extra rules: integers are decimal strings; byte values are lowercase `0x`-prefixed hex; addresses are lowercase; arrays this ERC calls sorted are sorted before serialisation; duplicate keys and JSON numbers are invalid.

The record MUST be a JSON object containing at least:

| Field | Contents |
|---|---|
| `subjectId`, `currency`, `navBasis` | As published |
| `valuationTimestamp`, `validUntil` | As published |
| `reads` | Every chain read the valuation depended on, as `{chainId, blockNumber, blockHash}`, sorted by chain id |
| `accounts` | Every custody account whose holdings were counted, sorted |
| `positions` | Every position as `{id, quantity, mark, source}`, sorted by id; `source` is `"payout"`, `"book"`, or a method-defined string |
| `cash` | Every cash line as `{account, asset, amount}`, sorted |
| `liabilities` | Every liability as `{id, amount}`, sorted |
| `nav`, `pps` | The published values; `pps` MAY be null for a total-basis stream |
| `method` | `{id, version, parameters}` naming the exact engine and its parameters; `methodologyHash` MUST equal the hash of the document `method.id` names |
| `inputs` | Every offchain input as `{hash, retrievalHint, capturedAt}`; the hash covers the raw bytes as received |

A method MAY add fields. A verifier MUST fail a record whose required fields are missing.

### Retrieval

`evidenceURI` says where the record bytes can be fetched. It MAY be empty when the deployment documents an out-of-band route. A record whose bytes cannot be fetched is reported as `DATA_UNAVAILABLE`; the hash alone proves nothing. A deployment whose inputs cannot lawfully be republished SHOULD publish their hashes together with a retrieval procedure for parties entitled to the bytes.

### Verifier results

A verifier reports at least these results and SHOULD report every failure it can establish independently:

```text
OK, INVALID_ENCODING, INVALID_HASH, MISSING_FIELD, DATA_UNAVAILABLE, STALE,
CHAIN_STATE_MISMATCH, INCOMPLETE_INVENTORY, ARITHMETIC_MISMATCH, UNSUPPORTED_METHOD
```

Where the names coincide, their meaning follows the PMVS verification result codes.

## Rationale

Evidence and methodology are separate because they answer different questions. `methodologyHash` says how a value is computed. `evidenceHash` says what it was computed from, this time. Verification needs both, and only the second changes with every snapshot.

`validUntil` is per snapshot, not only per stream, because the useful life of a valuation depends on what it captured. A snapshot built from a five-minute market capture should not be settleable a day later, even if the stream's heartbeat allows a day between publications.

Signatures stay out of the interface, as ERC-8330 leaves provider authorisation to the implementation. A deployment that wants attested records can attest the record hash with an attestation service; that is outside this ERC.

The record is canonical JSON rather than ABI-encoded because its inputs are HTTP responses, order books and account listings, not EVM values. RFC 8785 with the extra rules is the smallest specification under which two independent implementations hash the same bytes.

The ERC is general rather than specific to one asset class because the problem is general. Venue-specific capture rules belong in the methodology document, not here.

## Backwards Compatibility

This is a pure extension. ERC-8330 consumers that do not know this interface see ordinary snapshots. Oracles MAY implement both `publishNAV` and `publishNAVWithEvidence`.

## Reference Implementation

To be provided with two independent producers: an adapter that publishes a prediction-market vault's per-epoch valuation record, and an adapter that publishes a trusted-reporter vault's NAV report as a record of the same shape. A verifier that fetches, canonicalises, re-hashes and re-checks the chain reads will accompany them, together with test vectors in `assets/`.

## Security Considerations

Evidence proves consistency, not truth. A provider can publish a wrong value with a perfectly consistent record; this ERC makes that provable afterwards and does nothing to prevent it. A hash of bytes nobody can fetch is worthless, which is why `DATA_UNAVAILABLE` is a normal result rather than an error. Records may reference inputs that are contractually unpublishable; the retrieval hint exists for that case and does not resolve it. Nothing here provides recourse, reverses a settlement, or bounds how wrong a value may be. Consumers that need bounds should use ERC-8330 aggregation with a deviation threshold, or their own circuit breaker.

## Copyright

Copyright and related rights waived via [CC0](https://creativecommons.org/publicdomain/zero/1.0/).
