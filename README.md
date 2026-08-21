# PMVS: Prediction Market Vault Standard

**Status:** pre-EIP review draft. **Author:** Ivan Morozov (Zeit Finance). **First published:** 2026-08-18. No EIP or ERC number has been assigned, and no official discussion thread has been opened.

PMVS defines a tokenized vault that holds prediction-market shares, called outcome positions in this proposal. Its custody perimeter can also hold trading collateral, cash, and claims. Its NAV accounts for liabilities. Investors hold one fungible ERC-20 share of the whole vault. That share remains the same as the strategy enters new markets and old markets resolve.

The standard covers the complete vault: share accounting, custody, valuation, asynchronous entry and exit, fees, settlement, migration, and closure. Signed records and on-chain commitments make those functions verifiable.

PMVS is written for Ethereum and EVM chains. Venue, storage, valuation, anchor, and settlement details live in versioned profiles. This keeps the vault model portable across EVM chains and prediction-market venues. A non-EVM port needs its own identity, signature, and anchor rules.

## The vault being standardized

A PMVS vault has two token layers:

| Layer | Holder | Meaning | Lifetime |
|---|---|---|---|
| Outcome position | Declared vault custody | A claim on one prediction-market outcome | Ends through sale, merge, or redemption |
| Vault share | Investor | A proportional unit of the vault's net assets | Continues while the portfolio changes |

Prediction-market shares are often ERC-1155 tokens, although a venue can define another representation through a profile. PMVS calls them **outcome positions** to distinguish them from the investor's ERC-20 vault share. Investors receive the ERC-20 share while the outcome positions remain in declared vault custody.

The vault holds the prediction-market shares; the investor holds the vault share.

The vault is the full economic and custody perimeter. The ERC-20 contract is one component and may hold only a temporary accounting-asset buffer. A separate strategy wallet may hold the outcome positions. Those positions remain part of vault NAV when the active component record identifies the custody account and the valuation method verifies its balances.

## A prediction-market extension of the Boring Vault pattern

The reference architecture follows the modular [Boring Vault architecture](https://docs.veda.tech/architecture-and-flow-of-funds): a small share vault delegates strategy actions to a Manager, deposits and withdrawals to a Teller, and price publication to an Accountant. PMVS keeps that separation and adds the parts required for prediction markets:

1. a declared custody perimeter for outcome positions and trading collateral;
2. venue-aware inventory and valuation;
3. asynchronous deposit and redemption requests;
4. epoch settlement with funded claims;
5. rules for resolved, illiquid, or unavailable positions; and
6. migration and closure rules for a share that can outlive its current contracts.

The contracts may be modular or monolithic. Conformance tests the required behavior and declared interfaces regardless of contract names or code lineage.

The reference contracts map to the standard as follows:

| Reference module | PMVS role |
|---|---|
| `BoringVault` | ERC-20 share token and temporary accounting-asset buffer; only the Teller can mint or burn shares |
| `Teller` | Aggregate deposit and redemption transfers plus share mint and burn operations |
| `Accountant` | Gross and final epoch price per share plus the high-water mark |
| `FeeManager` | Performance-fee calculation and manager fee accrual |
| `EscrowAdapter` | Deposit and redemption queues, epoch control, aggregate settlement, Merkle commitments, and claims |
| Strategy custody account | Working collateral and ERC-1155 outcome positions used by the strategy |

This mapping is informative. Implementations can combine or rename modules while preserving the required roles and invariants.

```text
investor
   |  accounting asset in / ERC-20 vault share out
   v
request and settlement component
   |
   v
teller  <------  accountant and valuation method
   |
   v
share vault and accounting-asset buffer
   |
   v
strategy custody  <------  strategy manager
   |-- trading collateral
   |-- live outcome positions
   `-- resolved claims and receivables
```

## The problem

An outcome position answers one market question. It is useful for trading that event, but it is a poor funding instrument for a strategy that moves from market to market. It expires economically when the position is sold or the market resolves.

A vault share solves the continuity problem. Capital can remain represented by one ERC-20 while the strategy changes its underlying positions. Wallets, accounting systems, governance contracts, and other protocols can integrate that stable share without tracking every outcome position.

The ERC-20 interface alone does not give the share a reliable economic meaning. A prediction-market vault must still answer:

1. Which custody accounts and positions belong to the vault?
2. How are live, illiquid, and resolved positions valued?
3. Which price applies when an investor enters or exits?
4. When can a request wait, be cancelled, or become claimable?
5. How do fees change price per share and total supply?
6. What happens to pending requests and outstanding shares during migration or closure?

PMVS gives each answer a common, testable form.

## Why the ERC-20 share matters for funding

One outcome position represents exposure to one result. One vault share can fund a continuing strategy across many markets. An investor can subscribe in the accounting asset, hold one fungible token, and redeem into the accounting asset after the vault settles the request.

That structure gives a managed prediction-market strategy one continuing funding instrument and one integration surface. Demand, liquidity, and legal rights remain deployment-specific. Before accepting capital, a deployment must state its custody controls, request delays, fee terms, transfer restrictions, loss paths, and redemption rules.

## Vault lifecycle

### Deposit

1. The investor requests a deposit in the accounting asset.
2. The settlement component escrows the asset in the open epoch.
3. The operator freezes the epoch. Later requests enter the next epoch.
4. The valuation method reads every declared cash balance, outcome position, liability, and fee input at pinned blocks and capture times.
5. The vault computes net asset value and the price per share.
6. Settlement converts each accepted deposit into ERC-20 vault shares under the declared rounding and fee rules.
7. The contract funds the claims and commits the allocation.
8. The investor claims the shares.

### Portfolio operation

The strategy manager can direct the custody component to buy, sell, merge, and redeem outcome positions within its declared permissions. These actions change the assets behind the ERC-20 share. They do not create a new investor token for each market.

### Redemption

1. The investor escrows vault shares in a redemption request.
2. The strategy raises enough accounting asset to fund the accepted request.
3. The same valuation and fee rules determine the redemption amount.
4. Settlement burns the accepted shares and funds the asset claims.
5. The investor claims the accounting asset.

## What PMVS standardizes

PMVS has four layers:

1. **Vault model.** The durable share, accounting asset, custody perimeter, component roles, authorities, lifecycle, migration, and closure rules.
2. **Asynchronous settlement.** Request states, epoch transitions, pricing, fees, aggregate mint and burn operations, claim funding, Merkle commitments, cancellation, and retirement.
3. **Prediction-market valuation.** Outcome-position inventory, resolution, order-book capture, illiquidity policy, liabilities, NAV, and price per share.
4. **Records and profiles.** Canonical records, signatures, on-chain anchors, venue bindings, storage bindings, and deterministic verification.

The core does not hard-code Polygon, Polymarket, Arweave, one custodian, or one contract suite. Those choices belong in component records and profiles.

## Trust boundaries

PMVS can establish three different results:

- **Commitment integrity:** the named authority signed specific bytes, the chain committed their hash, and settlement matches the committed allocation.
- **Deterministic reproduction:** another implementation gets the same NAV, price, fees, and claim amounts from the published inputs.
- **Outside corroboration:** independent observers may compare their venue observations with the operator's capture.

The first two results can expose inconsistent accounting. They cannot prove that an unsigned venue response was true. Displayed orders can disappear before execution. Version 1 has no challenge period, fraud proof, bond, or veto.

## Relationship to Ethereum standards

PMVS builds on existing Ethereum standards:

- [ERC-20](https://eips.ethereum.org/EIPS/eip-20) defines the fungible investor share.
- [ERC-1155](https://eips.ethereum.org/EIPS/eip-1155) commonly represents the outcome positions in custody. The [Conditional Tokens reference contracts](https://github.com/gnosis/conditional-tokens-contracts) use ERC-1155 positions that can be split, merged, and redeemed after resolution.
- [ERC-4626](https://eips.ethereum.org/EIPS/eip-4626) defines tokenized-vault accounting for one ERC-20 asset and synchronous entry and exit. A deployment claims ERC-4626 only when it implements the complete interface and semantics.
- [ERC-7540](https://eips.ethereum.org/EIPS/eip-7540) adds pending, claimable, and claimed states for asynchronous vault requests. New PMVS request profiles should use it when their behavior satisfies the full standard.
- [ERC-7575](https://eips.ethereum.org/EIPS/eip-7575) permits an external share token and multiple entry points. Its separation between the durable share and replaceable entry components fits the PMVS subject model.
- [EIP-712](https://eips.ethereum.org/EIPS/eip-712) and [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271) support typed attestations by EOAs and contract accounts.
- [ERC-8330](https://eips.ethereum.org/EIPS/eip-8330), currently in Review, defines subject-linked NAV snapshot publication. PMVS-M1 supplies prediction-market inventory and valuation rules that a NAV stream can carry.

PMVS conformance does not imply conformance to ERC-4626, ERC-7540, or ERC-7575. Each interface claim is tested separately.

## Documents

| Document | Scope |
|---|---|
| [`pmvs-core.md`](./pmvs-core.md) | Vault model, subject identity, components, records, authorities, anchoring, and conformance |
| [`pmvs-settlement.md`](./pmvs-settlement.md) | Asynchronous requests, epoch settlement, pricing, fees, claims, funding, and retirement |
| [`pmvs-m1.md`](./pmvs-m1.md) | Outcome-position inventory, venue capture, valuation, illiquidity, NAV, and deterministic replay |
| [`profiles/anchor-evm-1.md`](./profiles/anchor-evm-1.md) | EVM registry and atomic anchor behavior |
| [`profiles/venue-polymarket-1.md`](./profiles/venue-polymarket-1.md) | Polymarket contracts, inventory, books, resolution, fees, and degraded modes |
| [`profiles/storage-arweave-1.md`](./profiles/storage-arweave-1.md) | Arweave upload, read-back, repair, bundling, and retention assumptions |
| [`profiles/watcher-0-experimental.md`](./profiles/watcher-0-experimental.md) | Independent observations and the limits of statistical corroboration |
| [`standards-map.md`](./standards-map.md) | Boundaries and design choices from related Ethereum standards |
| [`schemas/pmvs-envelope-v1.schema.json`](./schemas/pmvs-envelope-v1.schema.json) | JSON Schema 2020-12 base envelope and common record shapes |
| [`src/reference.ts`](./src/reference.ts) | Reference functions for canonicalization, identity, commitments, and fee vectors |
| [`tests/spec.test.ts`](./tests/spec.test.ts) | Executable positive and negative vectors |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Change rules, source requirements, writing gate, and local checks |
| [`REVIEW.md`](./REVIEW.md) | Iteration log, sources, and publication boundary |

## Conformance

Conformance has a level and separate profile choices:

| Level | Required result |
|---|---|
| L1, settlement-complete | Every executed settlement has a funded claim path and a reachable, signed, on-chain-anchored archive that passes settlement verification. |
| L2, valuation-reproducible | L1 plus a pre-settlement valuation and receipt. Pure re-execution reproduces every settlement-bearing output. |
| L3, continuous-record | L2 plus complete cadence slots, explicit gaps, bounded publication delay, and additive corrections. |

Anchor mode is stated separately as `registry` or `atomic`. Request liveness is also separate. `bounded` means every request state has a declared on-chain deadline and remedy. `operator-dependent` means an operator or governance actor can leave a request pending or unclaimable.

A complete claim has this form:

> Conforms to PMVS Core v1 at L2; anchor mode `atomic`; request liveness `bounded`; settlement profile `settlement/epoch-merkle/1`; valuation method `pmvs-m1`; venue profile `...`; storage profile `...`.

The profile parameters are part of the claim. A bare statement such as "PMVS compliant" has no defined meaning.

## Review and publication gates

This repository is ready for technical review. It does not claim adoption or EIP status. Before an EIP submission or production conformance claim, the project still needs:

1. a public discussion thread and named editors;
2. closed schemas for every profile-owned object and a larger fixture corpus;
3. a complete open verifier and a second independent implementation;
4. independent security review of the anchor and settlement contracts;
5. owner approval of the final language;
6. a license grant for referenced implementation code;
7. review of venue data rights, database rights, and privacy duties; and
8. legal and regulatory review for the target deployment.

The proposal text and reference files are released under CC0. See [`LICENSE`](./LICENSE).
