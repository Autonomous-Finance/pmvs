# PMVS storage profile: `storage/arweave/1`

```
pmvs-part:      profile (storage)
profile-id:     storage/arweave/1
version:        1 (draft)
status:         Draft
author:         Ivan Morozov (Zeit Finance)
created:        2026-08-18
requires:       PMVS Part I (core)
```

This profile binds Part I's storage abstraction to Arweave. Like all profiles, it is versioned independently of the core.

## What an Arweave transaction id is, and is not

An Arweave L1 transaction id is `SHA-256(signature)`. The (randomized RSA-PSS) signature covers a deep-hash of the transaction fields, including `data_root`, the Merkle root of the data chunks. ANS-104 DataItem ids are analogous: `SHA-256` of a signature over the content. The consequences this profile draws:

```
 recordHash = keccak256(bytes)      ◀── the PMVS commitment (EVM-checkable)
 ar://<txid>                        ◀── a locator only
      txid = SHA-256(signature(deepHash(fields incl. data_root)))
      binds content two crypto hops deep, through Arweave-internal schemes
 same bytes re-uploaded ⇒ SAME recordHash, DIFFERENT txid
      ⇒ anchors commit the hash; locators are repairable
```

1. A txid binds content only through Arweave-internal cryptography, two hops deep, and is not an EVM-checkable content hash. The PMVS commitment is always `recordHash = keccak256(bytes)`; the txid is a locator.
2. Re-uploading identical bytes yields a different txid and the same `recordHash`, which is exactly why anchors commit the hash and treat locators as repairable (`ArtifactLocationAdded`, Part I).
3. URIs in anchors and records use the gateway-agnostic form `ar://<txid>`. Gateway-specific URLs (`https://arweave.net/<txid>`) MAY appear only in the unhashed `locations`. Resolution MUST work by txid against arbitrary gateways.

## Upload lifecycle (all MUST)

1. **Persist first.** The exact canonical bytes are durably stored operator-side before submission. The operator's retention duty (Part I) is independent of network behavior.
2. **Submit and confirm.** Check the post and status responses; a fire-and-forget upload that ignores the response is non-conformant. Inclusion is confirmed at a declared confirmation depth (`arweaveConfirmations`, declared in the component-generation record) before the upload counts for any grace window.
3. **Read back.** After confirmation, fetch the bytes by txid and verify `keccak256` equality with the submitted bytes.
4. **Two read paths.** Retrievability (Part I) is demonstrated against at least two independent read paths: distinct gateways, or a gateway plus a direct node. A record retrievable from fewer is not yet "published" for grace purposes.
5. **Repair.** If the bytes become unretrievable (a dropped transaction, gateway loss), re-upload the identical bytes and register the new locator via `ArtifactLocationAdded`. The anchor never changes.

**Precursor status (2026-08-18).** The precursor uploader asserts the post status and confirms network acceptance through the transaction status endpoint (accepting 200 seeded or 202 pending, with a bounded retry window of roughly 30 seconds) before returning a URI; it previously ignored the post response entirely. Persist-first, byte-level read-back, the two-read-path demonstration, and locator repair remain open work.

## Bundling (periodic records)

Intraday and periodic records MAY be batched as ANS-104 DataItems in one bundle per subject-day. ANS-104 is a serialization format: it provides ids and signatures for items inside a bundle and nothing else, with no indexing SLA and no availability guarantee. Each bundled record therefore keeps its own `recordHash` and chain position (bundling costs nothing in integrity), and the bundle's parent txid is recorded so items are recoverable by raw parent extraction, parsing the ANS-104 container from the parent transaction's data without relying on gateway unbundling or GraphQL indexes.

## Discovery tags

Tags are unauthenticated hints for GraphQL-style discovery. They are signed by the uploading Arweave key, which carries no PMVS trust. Verification never depends on tags, and tag absence or corruption is a discovery inconvenience, not a verdict.

| Tag | Value |
|---|---|
| `Protocol-Name` | `PMVS` |
| `Protocol-Version` | `1` |
| `Record-Kind` | Part I kind enum name |
| `Chain-Id` / `Share-Token` | subject identity (lowercase) |
| `Subject-Id` | `subjectId` hex |
| `Sequence` | record sequence |
| `Record-Hash` / `Prev-Record-Hash` | hex |
| `Epoch` | settlement records only |
| `Content-Type` | `application/json` (records) / `application/octet-stream` (raw sidecars) |

GraphQL indexing is non-canonical. Discovery falls back to anchors (events and the registry), which are authoritative for existence.

## Identity

The Arweave signing key (JWK) is pure transport. It authenticates nothing in PMVS, because attestation is the operator's EVM signature (Part I). Key rotation needs no ceremony, and compromise of the JWK alone cannot forge records; at most it publishes junk under the tags, which fails the hash and attestation checks.

## Size and cost discipline

Record sizes are dominated by bid ladders and claim sets and vary widely, so the profile mandates measurement rather than assumptions. Deployments MUST track p50/p95/p99 published-record sizes, MUST bound per-record size by capturing only what Parts II and III require (ladders to fill or exhaustion, no ask side in records, claims scaling with users), and MUST price uploads against the live network fee endpoint at submission time. Static cost claims do not belong in records or conformance statements. Where a record would exceed transaction-practical size, it splits into the record proper plus content-addressed sidecars (raw responses), each hash-referenced from the record.

## Retention assumptions (disclosure)

Arweave's durability is an economic endowment model. Nodes and gateways may apply content policies, and initial seeding responsibility lies with the uploader. The profile therefore treats the network as one redundant read path with a documented retention thesis, never as a trust anchor, and never described with the word "permanent". The operator's own retained copy plus the on-chain hash is always sufficient to re-establish everything.

## Copyright

Copyright and related rights on this document's text are waived via CC0-1.0.
