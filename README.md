# PMVS: Prediction Market Vault Standard

**Status:** pre-EIP review draft. **Author:** Ivan Morozov (Zeit Finance). **First published:** 2026-08-18. No EIP or ERC number has been assigned, and no official discussion thread has been opened.

PMVS specifies a prediction-market vault. It issues fungible ERC-20 **vault shares** to investors and holds prediction-market **outcome positions** inside a declared custody perimeter. Each vault share is a pro-rata unit of declared net asset value (NAV). It remains the same token while the portfolio changes.

The reference architecture keeps these two token layers in different contracts. A per-vault Strategy Safe holds working collateral and Gnosis Conditional Tokens Framework (CTF) positions. The share-vault contract controls the ERC-20 supply and temporarily buffers pUSD during settlement. It does not hold the outcome positions.

The standard covers the whole vault: share accounting, custody, valuation, asynchronous entry and exit, fees, settlement, migration, and closure. Signed records and on-chain commitments make the relevant state and arithmetic checkable.

Core v1 targets Ethereum and EVM chains. Versioned profiles define venue, storage, valuation, anchor, and settlement details. A non-EVM port needs new identity, signature, and anchor rules.

## Vault model

The portfolio and the investor use different tokens:

| Layer | Standard or protocol | Holder | Meaning | Lifetime |
|---|---|---|---|---|
| Outcome position | Gnosis CTF on ERC-1155 in the reference profile | Declared strategy custody | A claim on one prediction-market result | Leaves the portfolio through sale, merge, or redemption |
| Vault share | ERC-20 | Investor | A pro-rata unit of declared vault NAV | Continues while the portfolio changes |

CTF defines condition, collection, and position ids. It also defines how collateral is split into positions, how complete sets merge back into collateral, and how resolved positions redeem. ERC-1155 defines balances, transfers, batch operations, and operator approvals. PMVS defines the vault that holds these positions and issues one ERC-20 share over their combined NAV. A different venue can select another versioned position profile.

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

## Reference implementation and Boring Vault lineage

PMVS does not require a Boring Vault interface or claim compatibility with one. Boring Vault is a contract architecture, not an ERC. The reference implementation adapts its separation of share issuance, accounting, and privileged asset movement for prediction markets, but the contracts are not interchangeable.

The contract named `BoringVault` in the reference implementation is a purpose-built share-vault component. It is not a fork of, or API-compatible with, the current [Veda BoringVault](https://github.com/Veda-Labs/boring-vault/blob/39f9d3144fd0416fdcb467ecec916b31457c915d/src/base/BoringVault.sol).

| Question | Veda BoringVault | Reference `BoringVault` |
|---|---|---|
| What does the contract custody? | Strategy assets in the vault contract; it accepts ERC-721 and ERC-1155 transfers | Its declared custody role is the configured ERC-20 settlement buffer; the Strategy Safe holds CTF positions |
| How are privileged actions expressed? | Authorized arbitrary `manage` calls plus `enter` and `exit` | Fixed `mintShares`, `burnShares`, `distributeAsset`, and `vaultToStrategy` functions |
| How is access controlled? | Solmate `Auth` and an external authority | Explicit owner, manager, and Teller caller checks, plus a configured strategy destination |
| Does PMVS require this interface? | No | No; PMVS specifies roles and economic invariants |

The reference share-vault has no ERC-1155 receiver hooks and no arbitrary-call `manage` function. A CTF safe transfer or mint to that contract would revert. The Strategy Safe is the outcome-position custodian.

The prediction-market reference suite adds:

1. a declared custody perimeter for outcome positions and trading collateral;
2. venue-aware inventory and valuation;
3. asynchronous deposit and redemption requests;
4. epoch settlement with funded claims;
5. rules for resolved, illiquid, or unavailable positions; and
6. migration and closure rules for a share that can outlive its current contracts.

The reference contracts map to those roles as follows:

| Reference module | PMVS role |
|---|---|
| `BoringVault` | 18-decimal ERC-20 share with EIP-2612 permit and a temporary pUSD buffer; only the Teller can mint or burn shares |
| `Teller` | Aggregate deposit and redemption transfers plus share mint and burn operations |
| `Accountant` | Gross and final epoch price per share plus the high-water mark |
| `FeeManager` | Performance-fee calculation and manager fee accrual |
| `EscrowAdapter` | Deposit and redemption queues, epoch control, aggregate settlement, Merkle commitments, and claims |
| Strategy Safe | Working collateral and CTF ERC-1155 outcome positions used by the strategy |

The reference `BoringVault.manager` name must not be used to infer PMVS authority. That Solidity role, together with the owner, can send the temporary buffer to the configured strategy address. It does not direct prediction-market trades. PMVS calls the authority that directs position operations the strategy manager. Component records declare each power instead of mapping roles by name.

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

## Normative scope

| Area | Required rules |
|---|---|
| Vault | Share meaning, accounting asset, custody perimeter, component roles, authorities, migration, and closure |
| Settlement | Request states, epoch transitions, prices, fees, aggregate mint and burn, claim funding, cancellation, and retirement |
| Valuation | Outcome-position inventory, resolution, order-book capture, illiquidity, liabilities, NAV, and price per share |
| Verification | Canonical records, signatures, on-chain anchors, venue and storage profiles, and deterministic replay |

The core does not select a chain deployment, venue, storage network, custodian, or contract suite. Component records and profiles make those choices explicit.

## Trust boundaries

| Result | Meaning |
|---|---|
| Commitment integrity | The named authority signed specific bytes, the chain committed their hash, and settlement matches the committed allocation. |
| Deterministic reproduction | Another implementation gets the same NAV, price, fees, and claim amounts from the published inputs. |
| Outside corroboration | Independent observers compare their venue observations with the operator's capture. |

The first two results can expose inconsistent accounting. They cannot prove that an unsigned venue response was true. Displayed orders can disappear before execution. Version 1 has no challenge period, fraud proof, bond, or veto.

## Relationship to Ethereum standards

PMVS builds on existing Ethereum standards:

- [ERC-20](https://eips.ethereum.org/EIPS/eip-20) defines the fungible investor share.
- [ERC-1155](https://eips.ethereum.org/EIPS/eip-1155) defines the multi-token interface used by the reference outcome positions.
- The [Gnosis Conditional Tokens Framework](https://github.com/gnosis/conditional-tokens-contracts/blob/master/docs/developer-guide.rst) defines the condition, position-id, split, merge, resolution, and redemption rules used by Polymarket outcome tokens. Polymarket calls CTF an open standard. CTF has no EIP or ERC number, so PMVS binds it as the application protocol `position/gnosis-ctf/1` above ERC-1155.
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
| [`pmvs-settlement.md`](./pmvs-settlement.md) | Asynchronous requests, epoch settlement, pricing, fees, claims, funding, and retirement |
| [`pmvs-m1.md`](./pmvs-m1.md) | Outcome-position inventory, venue capture, valuation, illiquidity, NAV, and deterministic replay |
| [`profiles/position-gnosis-ctf-1.md`](./profiles/position-gnosis-ctf-1.md) | Gnosis CTF position identity, ERC-1155 balances, lifecycle, and profile boundaries |
| [`schemas/position-gnosis-ctf-1.schema.json`](./schemas/position-gnosis-ctf-1.schema.json) | Closed machine shape for the CTF `position` subobject |
| [`fixtures/position-gnosis-ctf-1.json`](./fixtures/position-gnosis-ctf-1.json) | Gnosis CTF condition, collection, position, and payout vector |
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
