# PMVS v1 schemas

[`pmvs-envelope-v1.schema.json`](./pmvs-envelope-v1.schema.json) is the machine-readable base shape for the ten v1 record kinds and their envelope. It uses JSON Schema 2020-12 and closes each record at the top level. The component record also fixes the vault's share semantics, prediction-market portfolio type, custody model, position formats, accounting asset, interfaces, and active modules.

[`position-gnosis-ctf-1.schema.json`](./position-gnosis-ctf-1.schema.json) closes the `position` subobject selected by `position/gnosis-ctf/1`. The venue profile owns the surrounding inventory entry and must supply its closed schema before release. Numeric range and cross-field derivation checks still run in the profile verifier.

The base schema leaves these profile-owned objects open: publication grace by record kind, profile parameters, migration evidence, methodology parameters, venue positions and books, venue correlation fields, transaction events, observed asset balances, wind-down gates, residual-asset lines, and watcher books. The named profile supplies their closed shape and meaning. A verifier that lacks that profile schema returns `UNSUPPORTED_PROFILE`; passing only the base schema is not record conformance.

JSON Schema is only the first check. A conforming verifier must also:

1. inspect raw JSON bytes for duplicate keys and invalid Unicode;
2. require PMVS-JCS canonical bytes;
3. apply every named profile schema;
4. enforce integer bit widths and cross-field equations;
5. check the record hash and typed attestation;
6. resolve authority and anchor state; and
7. compare records with chain state and one another.

The component-genesis fixture uses illustrative addresses and zero code hashes. It tests serialization, schema selection, hashing, and signing. It does not describe a deployment.

Run the executable vectors with:

```sh
bun install --frozen-lockfile
bun test
```
