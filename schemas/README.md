# PMVS v1 schemas

This is implementer and verifier reference material. Most readers should start with [Core](../pmvs-core.md), [Settlement](../pmvs-settlement.md), and [M1](../pmvs-m1.md).

These machine-readable schemas support those Parts and the selected profiles. The [EVM annex](../pmvs-evm.md) defines hashes, calls, and events; the [standards map](../standards-map.md) records their design sources.

Schema validation checks shape, not truth. Passing a validator is not conformance. Some `$comment` annotations in these files are normative: uniqueness, sorting, and completeness rules the PMVS verifier enforces even though a JSON-Schema validator ignores them. The [record-kind numbers](../pmvs-evm.md#common-encoding) live in the annex, not here. Semantic and evidence checks follow in the order below.

| File | Purpose |
|---|---|
| [`pmvs-envelope-v1.schema.json`](./pmvs-envelope-v1.schema.json) | Envelope and nine record kinds; numbers 6 and 9 are reserved |
| [`position-gnosis-ctf-1.schema.json`](./position-gnosis-ctf-1.schema.json) | `position/gnosis-ctf/1` positions |
| [`venue-polymarket-1.schema.json`](./venue-polymarket-1.schema.json) | `venue/polymarket/1` venue state |

The files use [JSON Schema 2020-12](https://json-schema.org/draft/2020-12). Their `$id` values pin tag `v0.1.0-rc.4`. Register each file by `$id` before resolving references.

## Validation order

1. Reject duplicate JSON keys and invalid Unicode. Reproduce PMVS-JCS bytes and hashes.
2. Validate the envelope, record kind, and selected profile schemas.
3. Check bounds, ordering, unique keys, profile rules, and cross-field equations.
4. Verify attestations, authorities, anchors, active configuration, retries, and retirement.
5. Bind the claim to pinned chain state and the canonical settlement transaction and receipt.

Unknown selected profiles return `UNSUPPORTED_PROFILE`.

Vault contracts do not parse these schemas. The [backend boundary](../pmvs-settlement.md#backend-boundary) explains the commitment; the [EVM annex](../pmvs-evm.md#backend-boundary) defines its calls.

These schemas cover PMVS-M1; another backend may define evidence behind this boundary.
