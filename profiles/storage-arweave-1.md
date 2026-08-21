# PMVS storage profile: `storage/arweave/1`

```
pmvs-part:      profile (storage)
profile-id:     storage/arweave/1
version:        1 (draft)
status:         Pre-EIP review draft
author:         Ivan Morozov (Zeit Finance)
created:        2026-08-18
requires:       PMVS Part I (core)
```

This profile binds Part I's storage rules to Arweave. The protocol facts were checked against the Arweave HTTP documentation and ANS-104 specification on 2026-08-21.

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

1. A txid is not the Keccak-256 content hash that the EVM anchor stores. The PMVS commitment is always `recordHash = keccak256(bytes)`; the txid is a locator with its own Arweave verification path.
2. Re-uploading identical bytes yields a different txid and the same `recordHash`, which is exactly why anchors commit the hash and treat locators as repairable (`ArtifactLocationAdded`, Part I).
3. URIs in anchors and records use the gateway-agnostic form `ar://<txid>`. Gateway-specific URLs (`https://arweave.net/<txid>`) MAY appear only in the unhashed `locations`. Resolution MUST work by txid against arbitrary gateways.

## Upload lifecycle (all MUST)

1. **Persist first.** The exact canonical bytes are durably stored operator-side before submission. The operator's retention duty (Part I) is independent of network behavior.
2. **Submit and confirm.** Check the submission and status responses. Confirm the transaction at the declared `arweaveConfirmations` depth before it counts as published. For an ANS-104 item, confirm the parent transaction and verify the item's presence in the parent bytes.
3. **Read back.** After confirmation, fetch the bytes by txid and verify `keccak256` equality with the submitted bytes.
4. **Two read paths.** Retrievability (Part I) is demonstrated against at least two independent read paths: distinct gateways, or a gateway plus a direct node. A record retrievable from fewer is not yet "published" for grace purposes.
5. **Repair.** If the bytes become unretrievable (a dropped transaction, gateway loss), re-upload the identical bytes and register the new locator via `ArtifactLocationAdded`. The anchor never changes.

**Precursor status (2026-08-18).** The precursor uploader asserts the post status and confirms network acceptance through the transaction status endpoint (accepting 200 seeded or 202 pending, with a bounded retry window of roughly 30 seconds) before returning a URI; it previously ignored the post response entirely. Persist-first, byte-level read-back, the two-read-path demonstration, and locator repair remain open work.

## Bundling (periodic records)

Intraday records MAY be ANS-104 DataItems in a bundle. Each item keeps its own PMVS record hash and stream position. The location metadata records parent transaction id, DataItem id, byte offset, and byte length. A reader fetches the parent bytes, parses the container, verifies the DataItem id and signature, extracts its data, and then checks the PMVS record hash. Gateway unbundling and GraphQL indexing are optional discovery aids.

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

Bid ladders and claim sets dominate record size, and their size varies widely. Deployments MUST track p50, p95, and p99 published-record sizes. Capture only the data that Parts II and III require: bids through fill or exhaustion, no ask side in the record, and the actual claim set. Price each upload against the live network fee endpoint at submission time. Static cost claims do not belong in records or conformance statements. If a record is too large for a practical transaction, split raw responses into content-addressed sidecars and bind each sidecar hash from the record.

## Retention assumptions (disclosure)

Arweave uses an economic endowment model. Nodes and gateways may apply content policies, and the uploader must seed the data. PMVS treats the network as transport with a stated retention assumption, not as a trust anchor. If network copies disappear but the operator still has the canonical bytes, the operator can re-upload them under the same PMVS hash.

## Primary references

- [Arweave HTTP API](https://docs.arweave.org/developers/arweave-node-server/http-api)
- [ANS-104 bundle and DataItem format at `986f9e9`](https://github.com/ArweaveTeam/arweave-standards/blob/986f9e9a9b5952d8a869161209cd68d8b51c4626/ans/ANS-104.md)

## Copyright

Copyright and related rights on this document's text are waived via CC0-1.0.
