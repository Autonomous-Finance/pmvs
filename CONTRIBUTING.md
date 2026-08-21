# Contributing to PMVS

PMVS defines a prediction-market vault whose ERC-20 share depends on position inventory, NAV, and asynchronous settlement. A vague sentence, stale address, or changed rounding rule can alter what a share represents or who receives value. Treat normative edits as protocol changes, not copy edits.

## Change classes

Every pull request identifies one primary class:

- **Core:** vault semantics, custody perimeter, components, identity, encoding, signatures, anchors, verdicts, or conformance.
- **Settlement:** request states, commitments, arithmetic, claims, receipts, or retirement.
- **Valuation:** inventory, capture, marking, NAV, policy gates, or replay.
- **Profile:** a chain, contract interface, venue, storage system, or watcher binding.
- **Editorial:** wording that changes no requirement or claim.

If an editorial change alters a requirement in practice, reclassify it.

## Required change record

A normative change includes:

1. one concrete problem statement;
2. the affected records, contracts, and verifier steps;
3. primary sources for external facts;
4. backwards-compatibility and migration effects;
5. security and investor-impact analysis;
6. schema changes for every changed machine field;
7. positive, boundary, and negative vectors for changed arithmetic or encoding; and
8. one new entry in [`REVIEW.md`](./REVIEW.md).

Never edit an old record's meaning to fit new behavior. Create a new schema, method, or profile id when the behavior that selects verification or arithmetic changes.

## External facts

Mutable facts do not belong in the core. A venue or storage profile records the date checked and links to first-party documentation or pinned source. Before release, confirm contract addresses, proxy implementations, runtime-code hashes, decimals, roles, pause state, API response fields, fee rules, and resolution paths against chain state where possible.

A material change after release creates a new profile id. Old records retain the old profile and meaning. A documentation claim is not a substitute for a chain check when the contract state is readable.

## Writing gate

After each prose pass:

1. preserve every technical claim unless the change record explains its removal;
2. use one term for one concept;
3. put conditions before consequences;
4. prefer short active sentences and concrete nouns;
5. remove promotional claims, stock transitions, and unsupported certainty; and
6. define each acronym and uncommon term before first use.

Normative keywords use the meanings in RFC 2119 and RFC 8174. Use them only for testable requirements. Plain explanations should remain readable without those keywords.

## Local checks

Use the pinned Bun version. Run:

```sh
bun install --frozen-lockfile
bun test
git diff --check
```

The suite validates the JSON Schema, canonicalization, EIP-712 signatures, subject identity, Merkle vectors, fee arithmetic, relative links, and the repository prose gate. Passing tests do not replace contract security review, independent implementations, or economic review.

## Review boundary

Do not claim EIP status, adoption, security-review coverage, or production conformance without direct evidence. A production conformance claim still needs the gates in [`README.md`](./README.md), including two independent verifiers and independently reviewed anchor and settlement contracts.
