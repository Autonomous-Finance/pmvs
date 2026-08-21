# PMVS v1 schemas

[`pmvs-envelope-v1.schema.json`](./pmvs-envelope-v1.schema.json) is the machine-readable base shape for the nine accepted v1 record kinds and their envelope. Numeric kind 6 is reserved and invalid. The schema uses JSON Schema 2020-12 and closes each record at the top level. The component record fixes the vault's share semantics, prediction-market portfolio type, custody model, position formats, accounting asset, interfaces, and active modules.

The closed `activation` object commits the exact-next nonce and non-circular action commitment. `conditions` names the expected active tuple, an inclusive block window, and ordered `STATICCALL` checks. Future activation transaction, block, and log locators are invalid record fields. The semantic verifier applies this locator ban recursively to every open object in a component record, including `migration`, `profileParameters`, extension values, and `meta`.

The canonical schema identifiers are pinned to Git tag `v0.1.0-rc.1`, not to
the mutable `main` branch. Local validators should register the bundled files
by their `$id`; network retrieval becomes available when that tag is public.

The activation receipt is separate evidence gathered after the component record
has been hashed, signed, and anchored. It binds `recordHash` to the committed
action through the canonical
`PMVSComponentsUpdated(bytes32,uint64,address,uint64,bytes32)` event. The
verifier also checks the successful receipt, canonical block, confirmation
depth, exact-next prior nonce, kind-4 anchor head, discovery post-state,
governance authorization, condition results, and absence of an ordinary
covered action. `pmvsActivationNonce()` makes the stored nonce independently
readable. Genesis requires empty discovery and nonce zero before activation.
An anchored record without a matching receipt returns the valid `unexecuted`
component status. Here, valid means that the candidate remains in
history. It has no active component effect and is not a conformance result.

[`position-gnosis-ctf-1.schema.json`](./position-gnosis-ctf-1.schema.json) closes the `position` subobject selected by `position/gnosis-ctf/1`. [`venue-polymarket-1.schema.json`](./venue-polymarket-1.schema.json) closes the surrounding `venueState` object selected by `venue/polymarket/1`. It covers positions, books, routes, redemption executions, disclosed order commitments, settlement freeze configurations, collateral, approvals, and authorities. [`venue-polymarket-1.ts`](../src/venue-polymarket-1.ts) checks cross-field references, order hashes and reserves, redemption coverage and route authority, canonical ordering, and freeze relations that JSON Schema cannot express.

The venue semantic verifier is not a chain verifier. Its caller must select an explicit `diagnostic` or `settlement` scope; there is no default. Diagnostic scope checks internal profile relations and is nonconforming. Settlement scope applies the venue-side checks required for L1 and higher levels. An outer verifier must still complete the remaining checks before it can produce an end-to-end conformance result.

The outer verifier must bind each normalized on-chain value to one exact target, calldata, return-data, and valuation-block read in `inputs.chainState`. It supplies the independently derived strategy-custody accounts, complete authority-identity candidate set, authenticated Core funding-source accounts, and complete pUSD custody balance. Before a normal roll, it authenticates funding-source balances and encumbrances at the capture block. It then binds the canonical successful transaction, receipt arrays, reserve changes, and exact balance deltas to that evidence. The protected transaction cannot target or originate from strategy custody, enter a Safe proxy, execute a Safe delegate call, or make a state-changing V2 exchange call. Complete pre-state and post-state proofs show that every Safe control and nonce remained unchanged. Version 1 permits only the effective-user-pause predicate for settlement at L1 or a higher level and requires claims and fees to be prefunded outside strategy custody. Redemption executions are separate valuation and wind-down plans, not calls made by the normal roll. A copied `signatureValid`, balance, allowance, approval, pause, getter, code hash, or authority value is not evidence by itself.

The base schema leaves these profile-owned objects open: publication grace by record kind, profile parameters, migration evidence, methodology parameters, venue positions and books, venue correlation fields, transaction events, observed asset balances, wind-down gates, residual-asset lines, and watcher books. The named profile supplies their closed shape and meaning. A verifier that lacks that profile schema returns `UNSUPPORTED_PROFILE`. Passing only the base schema establishes base shape, not record validity or PMVS conformance.

JSON Schema is only the first check. A verifier that evaluates a conformance claim must also:

1. inspect raw JSON bytes for duplicate keys and invalid Unicode;
2. require PMVS-JCS canonical bytes;
3. apply every named profile schema;
4. enforce integer bit widths and cross-field equations;
5. check the record hash and typed attestation;
6. resolve authority and anchor state;
7. for a component record, recompute its activation commitment and verify the
   later canonical activation receipt;
8. compare records with chain state and one another; and
9. for L1 or a higher level, complete the custody, inventory, pinned-input,
   capture, quiescence, policy, settlement-action, and receipt checks.

[`envelope-semantics.ts`](../src/envelope-semantics.ts) supplies the current
record-level checks for exact integer bounds, canonical array order, duplicate
sort keys, raw-byte and record-hash binding, context, and independently
confirmed authentication, anchor, and component-activation results. Its
activation callback receives the hash-bound intent only after authentication
and anchor verification. The callback must recover the receipt, logs, trace,
prior nonce, discovery state, and any anchor imports from canonical chain data.
The module does not replace signature recovery, ERC-1271 calls, chain reads, or
profile-specific verification. This repository does not contain the
end-to-end deployment-level verifier required to produce an L1 result.

The valuation envelope is an evidence shape, not a closed PMVS-M1 compute
schema. Schema-valid or diagnostic-only evidence is not an L1 result. An L1
verifier must also complete every custody, inventory, pinned-input, capture,
quiescence, and applicable policy check and bind the authenticated valuation
to the settlement action and receipt. Current PMVS-M1 has no standalone engine
for the complete `outputs` object and cannot support an L2 or L3 claim. A later
compute profile must close the method parameters and every typed accounting,
resolution, supply, materiality, decimal, and component input before complete
output replay is defined.

The component-genesis fixture uses illustrative addresses and placeholder code hashes. It tests serialization, schema selection, hashing, signing, and the nonce-one genesis activation commitment. It does not describe a deployment or a completed activation.

The standalone [`venue-polymarket-1` fixture](../fixtures/venue-polymarket-1.json)
uses synthetic identities and a standard binary CTF market. It demonstrates the
closed diagnostic shape, book and response evidence, complementary positions,
and complete redemption-plan coverage. It does not describe a live account,
market, or deployment. The venue semantic tests validate it at the declared
illustrative timestamp.

Run the executable vectors with:

```sh
bun install --frozen-lockfile
bun run check
```
