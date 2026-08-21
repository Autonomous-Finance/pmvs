# PMVS: Prediction Market Vault Standard

**Status:** pre-EIP review draft. **Author:** Ivan Morozov (Zeit Finance). **First published:** 2026-08-18. No EIP or ERC number has been assigned, and no official discussion thread has been opened.

PMVS is a proposed audit and settlement standard for tokenized vaults that trade on prediction-market venues. It defines what a vault must publish so an independent verifier can reproduce each valuation and check each settlement against Ethereum state.

The proposal is written for Ethereum and EVM chains. Its venue, storage, valuation, anchor, and settlement profiles are separate, so another EVM chain or venue can adopt the model without copying Polygon or Polymarket facts into the core. A non-EVM port can reuse the layer boundaries, but it needs new identity, signature, and anchor rules and cannot claim PMVS Core v1 unchanged.

## The problem

A prediction-market strategy may hold hundreds of outcome tokens. Each token answers one question, such as whether an event will happen. It matures when that market resolves. This is useful for trading the event, but it is a poor unit for funding a strategy that moves from one market to the next.

An investor in a managed strategy needs a different token: one durable share of the whole portfolio. The share should remain the same ERC-20 while the vault buys, sells, merges, and redeems many short-lived outcome tokens underneath it.

Creating that ERC-20 is the easy part. Giving it a checkable economic meaning is harder. Positions may sit in an external custody account, and the venue supplies the order book. An operator chooses the valuation inputs. The operator later commits the amounts that depositors and redeemers can claim. Ethereum can enforce that commitment. It cannot prove that an unsigned venue order book was true at a past moment.

PMVS addresses that gap. It does not replace outcome tokens and does not make a centralized venue trustless. It requires the operator to publish the full evidence behind each price and settlement in a form that another implementation can hash, replay, and compare with the chain.

## Two token layers

| Layer | Holder | Purpose | Lifetime |
|---|---|---|---|
| Outcome position | Vault custody account | A claim tied to one market outcome | Ends through sale, merge, or redemption |
| Vault share | Investor | A proportional economic interest in the declared vault subject | Continues while the portfolio changes |

The vault share is an ERC-20. It is meaningful only with the rest of the system:

- minting and burning follow a disclosed settlement;
- the share token and its current vault components are identified on-chain;
- each valuation states which cash, positions, liabilities, books, and policy parameters it used;
- each settlement publishes the request set, claim amounts, Merkle proofs, totals, and fee calculation;
- signed records form a history that an operator cannot rewrite without leaving conflicting evidence.

An ERC-20 share is not a promise of instant redemption. It does not prove that the operator is honest, that displayed bids will remain available, or that the venue will stay online. PMVS states these limits because wallets, exchanges, and investors need to know what the token does and does not represent.

## Why this matters for fundraising

One outcome token funds one event position. A vault share can fund a continuing strategy that moves through many events. The same ERC-20 can remain in an investor's wallet while the portfolio changes beneath it, which makes recurring subscriptions, redemptions, accounting, and protocol integration possible.

That continuity is useful only when investors can inspect the rules. Before accepting capital, a deployment must answer six questions:

1. What does one share represent?
2. Where are the assets held?
3. How do entry and exit work?
4. When can a request be delayed or trapped?
5. How do fees move value between holders and the manager?
6. What happens after a loss, migration, or closure?

PMVS gives those answers a common evidence format. It can reduce repeated technical diligence. It cannot create liquidity, demand, or legal rights that the deployment has not supplied.

## A deposit, step by step

1. An investor requests a deposit of the accounting asset, such as USDC.
2. The vault escrows the asset and records the request in the open epoch.
3. The settlement authority freezes the epoch. New requests enter the next epoch.
4. The operator captures the vault's on-chain balances and venue books at declared times and blocks.
5. The PMVS-M1 engine computes NAV and gross price per share from those captured inputs.
6. The operator builds a settlement archive. It contains every selected request, the output amount, both Merkle trees, totals, fees, and the valuation-record hash.
7. The relevant authority signs the record. The settlement transaction or an append-only registry anchors its hash on-chain.
8. The investor claims ERC-20 vault shares with the committed proof.

The same share can represent a portfolio that later trades different markets. A redemption follows the reverse request, settlement, and claim flow. The outcome tokens remain inside the custody perimeter until the strategy sells or redeems them.

## What PMVS standardizes

PMVS has four portable layers:

1. **Core records.** Subject identity, canonical JSON, hashing, signatures, record streams, on-chain anchors, correction rules, verifier verdicts, and conformance claims.
2. **Settlement evidence.** The request lifecycle, selection commitments, Merkle encodings, integer conversion and fee rules, receipts, escape paths, and retirement.
3. **Valuation.** A capture stage that pins external inputs and a pure compute stage that reproduces NAV and price per share without a network or clock.
4. **Profiles.** Versioned bindings for a settlement interface, venue, storage system, and optional watcher method.

The core does not hard-code Polymarket, Arweave, Polygon, a particular custodian, or one vault implementation. Those facts belong in profiles and component records.

## What PMVS proves

PMVS separates three claims:

- **T1, commitment integrity:** the authority signed these bytes, the chain anchored their hash, and the settlement matches the committed roots and totals.
- **T2, deterministic reproduction:** the published outputs are exactly what the named method computes from the published inputs.
- **T3, outside corroboration:** independent observers may show that the venue reported similar books near the capture time.

T1 and T2 can expose a false or inconsistent record. They do not prove that an unsigned venue response was genuine. T3 adds evidence, not proof. This version also has no challenge period, fraud proof, bond, or veto. An atomic anchor can make publication a condition of settlement, but it cannot make the published venue data true.

## Relationship to Ethereum standards

PMVS composes with existing standards instead of redefining them:

- [ERC-20](https://eips.ethereum.org/EIPS/eip-20) supplies the durable, transferable vault share.
- [ERC-1155](https://eips.ethereum.org/EIPS/eip-1155) is commonly used for the outcome positions held by the vault. PMVS does not replace those positions with ERC-20s.
- [ERC-4626](https://eips.ethereum.org/EIPS/eip-4626) defines tokenized-vault accounting and synchronous entry and exit. A PMVS deployment may claim ERC-4626 only if every ERC-4626 requirement holds. Publishing a cached operator valuation does not by itself establish conformance.
- [ERC-7540](https://eips.ethereum.org/EIPS/eip-7540) extends ERC-4626 with asynchronous deposit and redemption requests. New PMVS settlement profiles should use its request state model and interface detection where the implementation can satisfy the full standard.
- [ERC-7575](https://eips.ethereum.org/EIPS/eip-7575) allows an external share token and multiple vault entry points. Its separation of the share from a replaceable vault component matches PMVS subject identity.
- [EIP-712](https://eips.ethereum.org/EIPS/eip-712) and [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271) provide typed attestations for EOAs and contract accounts.
- [ERC-8330](https://eips.ethereum.org/EIPS/eip-8330), currently in Review, defines subject-linked NAV snapshot publication. It is related work, not a PMVS dependency. PMVS defines how a prediction-market valuation can be reproduced; ERC-8330 defines a general on-chain NAV publication and query interface.

The current Zeit request-and-claim ABI predates ERC-7540 conformance. PMVS keeps it as a named legacy settlement profile. A deployment using that profile must not claim ERC-7540 support.

## Documents

| Document | Scope |
|---|---|
| [`pmvs-core.md`](./pmvs-core.md) | Identity, records, attestations, anchoring, verification, trust, and conformance |
| [`pmvs-settlement.md`](./pmvs-settlement.md) | Epoch settlement, Merkle commitments, pricing, fees, claims, escape paths, receipts, and retirement |
| [`pmvs-m1.md`](./pmvs-m1.md) | PMVS-M1 inventory, book capture, valuation, illiquidity, and deterministic replay |
| [`profiles/anchor-evm-1.md`](./profiles/anchor-evm-1.md) | EVM registry and atomic anchor interface, state transition, and authority validation |
| [`profiles/venue-polymarket-1.md`](./profiles/venue-polymarket-1.md) | Polymarket CLOB v2 contracts, inventory, books, resolution, fees, and degraded modes |
| [`profiles/storage-arweave-1.md`](./profiles/storage-arweave-1.md) | Arweave upload, read-back, repair, bundling, and retention claims |
| [`profiles/watcher-0-experimental.md`](./profiles/watcher-0-experimental.md) | Independent observations and the limits of statistical corroboration |
| [`standards-map.md`](./standards-map.md) | Scope boundaries and design lessons from related EIPs and ERCs |
| [`schemas/pmvs-envelope-v1.schema.json`](./schemas/pmvs-envelope-v1.schema.json) | JSON Schema 2020-12 base envelope and common record shapes |
| [`src/reference.ts`](./src/reference.ts) | Small reference functions for canonicalization, identity, commitments, and fee vectors |
| [`tests/spec.test.ts`](./tests/spec.test.ts) | Executable positive and negative vectors |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Change classification, evidence rules, writing gate, and required checks |
| [`REVIEW.md`](./REVIEW.md) | Focused iteration log, research evidence, and production boundary |

## Conformance

Conformance has a level and independent profile choices:

| Level | Required result |
|---|---|
| L1 | Every executed settlement has a reachable, signed, on-chain-anchored archive that passes settlement verification. |
| L2 | L1 plus a pre-settlement valuation record and receipt. Pure re-execution reproduces every settlement-bearing output. |
| L3 | L2 plus complete cadence slots, explicit gap records, bounded publication delay, and correction discipline. |

The anchor mode is stated separately as `registry` or `atomic`. Only `atomic` means the contract cannot execute the covered action without committing the record hash.

Request liveness is also separate. `bounded` means every request state has a declared on-chain deadline and remedy. `operator-dependent` means an operator or governance actor can leave a request pending or unclaimable. Evidence quality does not turn operator-dependent custody into bounded custody.

A complete claim has this form:

> Conforms to PMVS Core v1 at L2; anchor mode `atomic`; request liveness `bounded`; settlement profile `…`; valuation method `pmvs-m1`; venue profile `…`; storage profile `…`.

The parameters required by those profiles are part of the claim. A bare statement such as "PMVS compliant" is not a conformance claim.

## Current implementation status

The Zeit deployment that motivated this proposal does not yet conform to PMVS. It publishes an older archive format without PMVS record hashes, authority attestations, retirement records, or a public verifier. The gap tables in Parts II and III document that migration without treating the deployment as the universal design.

The safety fixes listed as closed in those tables apply to the precursor implementation. They do not prove PMVS conformance. Pre-standard records remain `UNVERIFIABLE_INPUTS` because later publication cannot reconstruct inputs that were never pinned.

## Review and publication gates

This repository is ready for technical review, not for a claim of adoption or EIP status. Before an EIP submission or production conformance claim, the project still needs:

1. a public discussion thread and named editors;
2. closed schemas for every profile-owned object, independent schema review, and a larger fixture corpus;
3. a complete open verifier and a second independent implementation;
4. an audited atomic anchor or registry implementation;
5. owner approval of the final language;
6. a license grant for any referenced implementation code;
7. review of venue data rights, database rights, and privacy obligations; and
8. legal and regulatory review for the target deployment.

The proposal text and reference files in this repository are released under CC0. See [`LICENSE`](./LICENSE). Referenced precursor implementation code is not covered by this repository's license.
