# Contributing to PMVS

Normative edits may redistribute value. Read the [proposal](./README.md#read-the-proposal). By contributing, you license your work under [CC0-1.0](./LICENSE).

A proposal must identify:

1. the problem, affected rules, records, and interfaces;
2. primary sources and whether reused work is adopted, adapted, a profile dependency, or related only;
3. compatibility, migration, security, and investor effects;
4. each changed machine field; and
5. positive, boundary, and negative examples for changed arithmetic or encoding.

Never reinterpret a record. Use a new schema, method, or profile id for new semantics. A material venue or storage change requires a new profile id. Pin source code and check dates. Verify addresses, implementations, code hashes, decimals, roles, fees, API fields, and resolution paths against chain state.

Keep the reader-facing Parts focused on the model, flow, and guarantees. Keep exact EVM hashes, ABI, selectors, machine formulas, and events only in [`pmvs-evm.md`](./pmvs-evm.md). Asset identity and offchain valuation rules stay in their profiles; schemas define record shape. Do not duplicate a normative rule. Define each term before use.

Before submission, read each edited file, validate changed JSON with a 2020-12 validator, resolve relative links, and run `git diff --check`. Report sensitive errors through [`SECURITY.md`](./SECURITY.md). Do not claim EIP status, adoption, audit coverage, production readiness, or conformance without evidence.
