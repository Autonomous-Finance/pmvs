# PMVS: Prediction Market Vault Standard

| Field | Value |
|---|---|
| Status | Pre-EIP review draft. This repository has no end-to-end deployment-level L1 verifier. L2 and L3 claims are unavailable in this version. |
| Author | Ivan Morozov (Zeit Finance) |
| Created | 2026-08-18 |
| Release candidate prepared | 2026-08-21 |
| EIP process | No EIP or ERC number has been assigned. No official discussion thread has been opened. |

PMVS specifies a prediction-market vault. It issues fungible ERC-20 **vault shares** to investors and holds prediction-market **outcome positions** inside a declared custody perimeter. Each vault share is a pro-rata unit of declared net asset value (NAV). It remains the same token while the portfolio changes.

A common modular layout keeps these token layers in different contracts. A strategy custody wallet holds trading collateral and outcome positions. A settlement component holds pending deposits, claim reserves, and fee assets. The share-vault contract controls the ERC-20 supply and may hold a temporary accounting-asset buffer. PMVS does not require this exact module split.

The standard covers the whole vault: share accounting, custody, valuation, asynchronous entry and exit, fees, settlement, migration, and closure. Signed records and on-chain commitments make recorded state and the implemented arithmetic checks reproducible.

Core v1 targets Ethereum and EVM chains. Versioned profiles define venue, storage, valuation, anchor, and settlement details. A non-EVM port needs new identity, signature, and anchor rules.

> [!IMPORTANT]
> This repository contains a draft specification, schemas, fixtures, and
> reference validation code. It contains no audited deployable vault contracts
> and does not certify any deployment. Passing its record, schema, or profile
> checks is not a PMVS conformance result.

## Start here

Read [`pmvs-core.md`](./pmvs-core.md) first for the vault model and common
requirements. Then read [`pmvs-settlement.md`](./pmvs-settlement.md) for request
and claim mechanics, followed by [`pmvs-m1.md`](./pmvs-m1.md) for the current
valuation method and its explicit replay limit. The CTF position and Polymarket
venue profiles bind those rules to the first supported market stack. The
schemas, fixtures, and TypeScript reference functions make the machine rules
executable.

The TypeScript under [`src/`](./src/) is reference validation code, not vault
or settlement contracts. It makes hashes, arithmetic, record relationships,
and failure cases testable. The JSON Schemas define record shape, and the
fixtures and tests provide reproducible examples.

To verify a checkout, install the pinned toolchain dependencies and run every
positive, boundary, adversarial, prose, and relative-link vector:

```sh
bun install --frozen-lockfile
bun run check
```

Passing these checks does not replace an independent implementation, contract
security review, economic review, or deployment-specific legal review.

## Vault model

The portfolio and the investor use different tokens:

| Layer | Standard or protocol | Holder | Meaning | Lifetime |
|---|---|---|---|---|
| Outcome position | Gnosis CTF on ERC-1155 in the first position profile | Declared strategy custody | A claim whose payout depends on declared prediction-market outcomes | Leaves the portfolio through sale, merge, or redemption |
| Vault share | ERC-20 | Investor | A pro-rata unit of declared vault NAV | Continues while the portfolio changes |

CTF defines condition, collection, and position ids. It also defines how collateral is split into positions, how complete sets merge back into collateral, and how resolved positions redeem. ERC-1155 defines balances, transfers, batch operations, and operator approvals. PMVS defines the vault subject whose ERC-20 share represents proportional NAV across the full declared custody perimeter, including positions, cash, claims, and liabilities. A different venue can select another versioned position profile.

In the Polymarket profile, pUSD is the vault accounting and venue wrapper asset, not a universal CTF position-id input. Standard CTF positions use USDC.e as their raw collateral token. Negative-risk CTF positions use the legacy adapter's wrapped collateral. The position profile recovers these fields and the condition oracle from pinned on-chain evidence. It does not assume that the accounting asset is the raw collateral.

Venue interfaces may call the same CTF asset an outcome share or outcome token. PMVS uses one normative term: outcome position. Current Polymarket Combo positions are also ERC-1155 tokens, but they use a separate Positions Framework and an RFQ venue. They are not CTF positions and are outside `venue/polymarket/1`.

The custody perimeter includes every account whose cash, outcome positions, receivables, claim reserves, or liabilities belong to the vault. Valuation includes the full perimeter. Moving an asset between declared custody accounts does not change NAV.

## Why a vault standard is needed

Each outcome position is tied to one market and one payout condition. The vault sells, merges, or redeems it before moving capital into another market. A managed strategy rotates through many such positions. Direct ownership would force each investor and integration to track changing ERC-1155 ids, market resolutions, and venue actions.

An individual outcome position is designed to settle and be redeemed when one market resolves. It is therefore a poor long-term fundraising token. The ERC-20 vault share gives the strategy one continuing funding unit. Investors subscribe and redeem in the accounting asset. The strategy can redeploy capital across markets while wallets, governance systems, and other protocols continue to use the same token.

ERC-20 defines balances, transfers, and allowances. It does not define the share's assets, NAV, entry price, exit price, fees, or recovery path. A prediction-market vault must answer:

1. Which accounts, assets, claims, and liabilities belong to the vault?
2. How are live, illiquid, and resolved outcome positions valued?
3. Which NAV and price per share apply to each deposit or redemption?
4. When may a request wait, be cancelled, or become claimable?
5. How do fees affect price per share and total supply?
6. How are pending requests, claims, shares, and residual assets handled during migration or closure?

Demand, liquidity, and legal rights remain deployment-specific. Before accepting capital, a deployment must disclose its custody controls, request delays, fees, transfer restrictions, loss paths, and redemption rules.

## Boring Vault lineage

Boring Vault is a modular contract architecture, not an ERC. PMVS borrows the
separation of share issuance, accounting, and controlled asset movement, but it
does not require or claim compatibility with a Boring Vault interface.

The [Veda `BoringVault` source pinned at commit
`39f9d3`](https://github.com/Veda-Labs/boring-vault/blob/39f9d3144fd0416fdcb467ecec916b31457c915d/src/base/BoringVault.sol)
can receive ERC-721 and ERC-1155 assets and exposes authorized `manage`,
`enter`, and `exit` operations. A PMVS prediction-market layout may instead
place CTF outcome positions in a declared strategy custody wallet while the
share-vault controls ERC-20 supply and buffers only the accounting asset. The
two layouts are not interchangeable.

PMVS adds these requirements around any chosen contract architecture:

1. a declared custody perimeter for outcome positions and trading collateral;
2. venue-aware inventory and valuation;
3. asynchronous deposit and redemption requests;
4. epoch settlement with funded claims;
5. rules for resolved, illiquid, or unavailable positions; and
6. migration and closure rules for a share that can outlive its current contracts.

A contract name does not establish a PMVS role. A field named `manager` does
not identify the strategy manager or fee beneficiary unless the component
record declares the corresponding powers and value rights. Conformance depends
on the declared interfaces, custody perimeter, authority graph, and behavior,
not on module names or design ancestry.

## Current v1 constraints

Core can be extended by other EVM profiles, but `venue/polymarket/1` is scoped
to Polygon. Until this repository defines cross-chain asset and share profiles,
a claim under that venue profile must disable remote custody, bridge transit,
and remote share supply. Recording only the Polygon hub would omit part of the
subject.

A conforming PMVS share token MUST expose the active anchor and component-record
hash through the Core discovery interface. A conforming PMVS implementation
MUST directly anchor every v1 record at the next exact stream sequence. A
signer cannot skip to a later sequence, and a batch must validate and advance
the head once per record.

Settlement prices use immutable attempts. Attempt 1 is the first price for a
frozen epoch. If it expires before execution, attempt 2 can be published only
after that expiry and before the epoch is processed; the old tuple remains
available. Each roll names the expected attempt, and the keyed price getter,
branch record, events, and receipt must all identify the same positive
`uint64` value.

Core v1 never carries a wind-down price forward. A later positive roll during
wind-down uses a fresh valuation attempt. Subject retirement is atomic-only.
The registered wrapper reads and requires zero supply, pending requests,
outstanding claims, and claim funding before and after the kind-7 anchor call.
The protected anchor transition sets the `subjectFinalized` flag. The wrapper
then stores the exact record hash and sequence, sets the settlement `retired`
flag, and emits the binding and
`VaultRetired(bytes32 indexed subjectId)` events. These steps succeed or revert
together. The wrapper executes no residual or recovery resolution. An
independent verifier proves that every resolution predates finalization and
that the complete custody and accounting perimeters are empty. A retirement
record on its own has no terminal effect. A registry settlement generation
must migrate every outstanding right and obligation to an atomic generation
before subject closure. Component replacement itself uses an anchored
`components` migration, not kind 7. After successful retirement, the anchor's
`subjectFinalized(subjectId)` getter is true and only subject-stream kind-8
corrections with `changesSettlementBearingOutput: false` can extend history.

An implementation may combine or rename modules. Conformance depends on the declared powers, interfaces, custody perimeter, and invariants.

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

## Vault lifecycle

### Deposit

1. The investor requests a deposit in the accounting asset.
2. The settlement component escrows the asset in the open epoch.
3. The operator freezes the epoch. Later requests enter the next epoch.
4. The valuation method reads every declared cash balance, outcome position, liability, and fee input at pinned blocks and capture times.
5. The valuation engine computes net asset value and the price per share.
6. A normal roll selects the expected price attempt and converts each accepted deposit into ERC-20 vault shares under the declared rounding and fee rules.
7. That transaction funds the claims and commits the allocation.
8. The investor claims the shares.

### Portfolio operation

The strategy manager can direct the custody component to buy, sell, merge, and redeem outcome positions within its declared permissions. These actions change the assets behind the ERC-20 share. They do not create a new investor token for each market.

### Redemption

1. The investor escrows vault shares in a redemption request.
2. The strategy raises enough accounting asset to fund the accepted request.
3. A normal roll selects an immutable price attempt under the same valuation and fee rules to determine the redemption amount.
4. That transaction burns the accepted shares and funds the asset claims.
5. The investor claims the accounting asset.

### Wind-down and closure

A zero-NAV attempt selects no request, charges no fee, changes no share supply,
and does not retire the vault. It anchors a `winddown-opened` record and keeps
requests, cancellations, funded claims, and recovery rights alive. If value
later recovers, a positive normal roll uses a fresh attempt valuation rather
than a fixed retirement price.

No epoch roll can retire the vault. Subject closure needs zero supply,
pending requests, outstanding claims, and claim funding. Its subject-only
`retirement-final` record sets `migration` to null and records completed,
pre-finalization evidence for every residual position, cash balance, fee
accrual, liability, and recovery right. The registered atomic wrapper does not
execute those resolutions. It reads and rechecks the four maintained zero
counters, consumes the exact record, stores its hash and sequence, and sets
terminal state. The independent verifier checks the resolution evidence and
proves that the full custody and accounting perimeters are empty.
Replacing one component generation while shares remain live is a different
operation governed by an anchored `components` migration.

## Normative scope

| Area | Required rules |
|---|---|
| Vault | Share meaning, accounting asset, custody perimeter, component roles, authorities, migration, and closure |
| Settlement | Request states, epoch transitions, immutable price attempts, cross-branch retries, fees, aggregate mint and burn, claim funding, cancellation, wind-down, and atomic subject retirement |
| Valuation | Outcome-position inventory, resolution, order-book capture, illiquidity, liabilities, NAV, and price per share |
| Verification | Canonical records, signatures, on-chain anchors, venue and storage profiles, and deterministic replay |

The core does not select a chain deployment, venue, storage network, custodian, or contract suite. Component records and profiles make those choices explicit.

## Trust boundaries

| Result | Meaning |
|---|---|
| Evidence-bound settlement | The verifier checked the complete profile-defined custody perimeter, inventory, pinned inputs, capture, quiescence, and applicable policy gates, then matched the authenticated price and records to the action. This does not reproduce the complete NAV or PPS calculation. |
| Deterministic reproduction | Another implementation gets the same NAV, price, fees, and claim amounts from the published inputs. |
| Outside corroboration | Independent observers compare their venue observations with the operator's capture. |

Evidence binding and deterministic reproduction can expose different failures.
PMVS-M1 does not yet provide complete deterministic reproduction. Neither
result proves that an unsigned venue response was true or that a declared
valuation policy is fair. Displayed orders can disappear before execution.
Version 1 has no challenge period, fraud proof, bond, or veto.

## Relationship to Ethereum standards

PMVS builds on existing Ethereum standards:

- [ERC-20](https://eips.ethereum.org/EIPS/eip-20) defines the fungible investor share.
- [ERC-1155](https://eips.ethereum.org/EIPS/eip-1155) defines the multi-token interface used by the first outcome-position profile.
- The [Gnosis Conditional Tokens Framework](https://github.com/gnosis/conditional-tokens-contracts/blob/eeefca66eb46c800a9aaab88db2064a99026fde5/docs/developer-guide.rst) defines the condition, position-id, split, merge, resolution, and redemption rules used by Polymarket outcome tokens. Polymarket calls CTF an open standard. CTF has no EIP or ERC number, so PMVS binds it as the application protocol `position/gnosis-ctf/1` above ERC-1155.
- Polymarket's [Positions Framework](https://docs.polymarket.com/trading/positions/combinatorial) issues separate ERC-1155 Combo positions through `PositionManager`. Combo positions are not CTF positions and need their own PMVS position, venue, and valuation profiles.
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
| [`pmvs-settlement.md`](./pmvs-settlement.md) | Asynchronous requests, attempt-indexed epoch pricing, claims, funding, wind-down, and atomic subject retirement |
| [`pmvs-m1.md`](./pmvs-m1.md) | Outcome-position inventory, venue capture, valuation formulas, illiquidity, NAV, and the current arithmetic-replay boundary |
| [`profiles/position-gnosis-ctf-1.md`](./profiles/position-gnosis-ctf-1.md) | Gnosis CTF position identity, ERC-1155 balances, lifecycle, and profile boundaries |
| [`schemas/position-gnosis-ctf-1.schema.json`](./schemas/position-gnosis-ctf-1.schema.json) | Closed machine shape for the CTF `position` subobject |
| [`fixtures/position-gnosis-ctf-1.json`](./fixtures/position-gnosis-ctf-1.json) | Gnosis CTF condition, collection, position, and payout vector |
| [`profiles/anchor-evm-1.md`](./profiles/anchor-evm-1.md) | EVM registry and atomic anchor behavior |
| [`profiles/venue-polymarket-1.md`](./profiles/venue-polymarket-1.md) | Polymarket contracts, inventory, books, resolution, fees, and degraded modes |
| [`schemas/venue-polymarket-1.schema.json`](./schemas/venue-polymarket-1.schema.json) | Closed machine shape for `venue/polymarket/1` capture state |
| [`fixtures/venue-polymarket-1.json`](./fixtures/venue-polymarket-1.json) | Standalone synthetic diagnostic capture with two complementary CTF positions |
| [`profiles/storage-arweave-1.md`](./profiles/storage-arweave-1.md) | Arweave upload, read-back, repair, bundling, and retention assumptions |
| [`profiles/watcher-0-experimental.md`](./profiles/watcher-0-experimental.md) | Independent observations and the limits of statistical corroboration |
| [`standards-map.md`](./standards-map.md) | Boundaries and design choices from related Ethereum standards |
| [`schemas/README.md`](./schemas/README.md) | Schema composition, semantic-verifier boundary, and local validation |
| [`schemas/pmvs-envelope-v1.schema.json`](./schemas/pmvs-envelope-v1.schema.json) | JSON Schema 2020-12 base envelope and common record shapes |
| [`fixtures/components-genesis-record.json`](./fixtures/components-genesis-record.json) | Illustrative signed component-genesis serialization and attestation vector |
| [`src/reference.ts`](./src/reference.ts) | Reference functions for canonicalization, identity, commitments, price-attempt publication, receipt binding, and fee vectors |
| [`src/envelope-semantics.ts`](./src/envelope-semantics.ts) | Record-level numeric, ordering, hash, context, authentication, anchor, retry-supersession, and retirement-finalization checks beyond JSON Schema |
| [`src/venue-polymarket-1.ts`](./src/venue-polymarket-1.ts) | Partial cross-field verifier with explicit diagnostic and settlement scopes; neither scope is an end-to-end conformance result |
| [`tests/spec.test.ts`](./tests/spec.test.ts) | Executable positive and negative vectors |
| [`tests/envelope-semantics.test.ts`](./tests/envelope-semantics.test.ts) | Adversarial record-envelope, integer-boundary, and canonical-array vectors |
| [`tests/venue-profile.test.ts`](./tests/venue-profile.test.ts) | Closed-schema vectors for `venue/polymarket/1` |
| [`tests/venue-semantics.test.ts`](./tests/venue-semantics.test.ts) | Cross-field and adversarial vectors for `venue/polymarket/1` |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Change rules, source requirements, writing gate, and local checks |
| [`SECURITY.md`](./SECURITY.md) | Private reporting scope and deployment-incident boundary |
| [`REVIEW.md`](./REVIEW.md) | Iteration log, sources, and publication boundary |

## Conformance

Conformance has a level and separate profile choices. Neither a valid record
nor a diagnostic profile result is a conformance result. The levels are
cumulative. A lower level never permits an omitted custody account, position,
cash balance, receivable, reserve, liability, required input, or applicable
policy check. This table is a summary; the normative gates are in the [Core
conformance section](./pmvs-core.md#conformance) and the selected profiles.

| Level | Required result |
|---|---|
| L1, evidence-bound settlement | Every executed epoch action uses a pre-settlement valuation that passes the active profiles' complete custody-perimeter, position-inventory, pinned-input, capture, quiescence, and applicable settlement-policy checks. The authenticated price attempt, valuation, branch-specific pre-action record, action, events, funded claims, and post-action receipt are timely, retrievable, anchored as required, and mutually consistent. A zero-NAV action also passes the post-redemption and no-effect rules. L1 proves which complete disclosed evidence and authenticated price drove settlement. It does not reproduce the complete NAV or PPS calculation or prove venue truth or price fairness. |
| L2, valuation-reproducible | L1 plus a closed compute profile. Starting from the active component record and complete bound inputs, pure re-execution derives the valuation without trusting `record.outputs` and reproduces every settlement-bearing output. |
| L3, continuous-record | L2 plus complete cadence slots, explicit gaps, bounded publication delay, and additive corrections. |

These levels define target claims. The repository's schema validators and
record-level semantic helpers do not form an end-to-end deployment-level L1
verifier. No valuation method in this draft can satisfy L2: PMVS-M1 does not
yet have a closed end-to-end compute input or a standalone engine for the
complete valuation output. An L2 claim using `pmvs-m1` is invalid, and L3 is
therefore also unavailable.

Anchor mode is stated separately as `registry` or `atomic`. Request liveness is also separate. `bounded` means every request state has a declared on-chain deadline and remedy. `operator-dependent` means an operator or governance actor can leave a request pending or unclaimable.

A complete claim has this form:

> PMVS Core v1 verification: L1, evidence-bound settlement; complete valuation replay unavailable for `pmvs-m1`; anchor profile `anchor/evm/1`; anchor mode `atomic`; request liveness `bounded`; settlement profile `settlement/epoch-merkle/1`; venue profile `venue/polymarket/1`; storage profile `...`.

The profile parameters are part of the claim. A bare statement such as "PMVS compliant" has no defined meaning.

## Review and publication gates

This repository is ready for technical review. It does not claim adoption or EIP status. Before an EIP submission or production conformance claim, the project still needs:

1. a public discussion thread and named editors;
2. closed schemas for every profile-owned object and a larger fixture corpus;
3. a closed M1 compute profile, standalone engine, normative vectors, and two independent valuation implementations before any L2 claim;
4. a complete open verifier and a second independent verifier;
5. a conforming contract implementation plus independent security review of its anchor and settlement paths;
6. the `settlement/bounded-remedy/1` request-liveness guarantees for any deployment presented as production-ready;
7. an enforcer that atomically rechecks captured strategy-custody balances and wallet-control state before settlement effects; the current Polymarket profile can only detect that race after execution, so it is not a production authorization boundary;
8. maintainer and editor approval of the final language;
9. pinned and licensed source for any contract presented as an implementation;
10. review of venue data rights, database rights, and privacy duties; and
11. legal and regulatory review for the target deployment.

The proposal text and reference files are released under CC0. See [`LICENSE`](./LICENSE).
