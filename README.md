# PMVS: Prediction Market Vault Standard

| Field | Value |
|---|---|
| Status | Pre-EIP review draft |
| Authors | [Ivan Morozov (allquantor)](https://github.com/allquantor), [Christian (smowden)](https://github.com/smowden), [Dinu Barbu (dvinubius)](https://github.com/dvinubius), [Ovidiu Miclea (micovi)](https://github.com/micovi) |
| Created | 2026-08-18 |
| Scope | ERC-20 vault shares backed by prediction-market positions |

PMVS adapts the [Boring Vault architecture](https://github.com/Veda-Labs/boring-vault/blob/39f9d3144fd0416fdcb467ecec916b31457c915d/README.md) separation of shares, accounting, and asset control. It uses [ERC-4626](https://eips.ethereum.org/EIPS/eip-4626) units, conversion, and rounding.

Settlement adapts [ERC-7540's asynchronous request lifecycle](https://eips.ethereum.org/EIPS/eip-7540#request-lifecycle) and [Uniswap's MerkleDistributor](https://github.com/Uniswap/merkle-distributor/blob/25a79e8ec8c22076a735b1a675b961c8184e7931/contracts/MerkleDistributor.sol) claim pattern. PMVS adds epoch batching, price evidence, reserved funding, cancellation, and deadlines through a custom ABI. These are design sources, not conformance claims.

> Public method + frozen market and vault data -> reproducible net asset value (NAV) -> onchain settlement -> shares or funded withdrawal claims

## Why PMVS

A [prediction-market outcome token](https://github.com/gnosis/conditional-tokens-contracts/blob/eeefca66eb46c800a9aaab88db2064a99026fde5/docs/developer-guide.rst#defining-positions) is a collateral-backed claim. A winner-take-all binary token resolves to 0 or 1 unit of collateral. It then stops changing with the market and is redeemed or worthless.

A rolling strategy needs one investor token that survives those resolutions. The strategy can exit old positions and move capital into new markets without issuing investors a new token each time. A PMVS vault may also hold just one outcome position. In either case, its share represents the investor's proportional part of the complete vault NAV and can remain active as long as the vault does.

Wallets, AMMs, lending markets, and aggregators can integrate one stable ERC-20 address. PMVS defines the custody, accounting, settlement, and replacement rules that preserve its meaning.

## How PMVS works

Vault contracts hold requests, issue shares, and fund claims. A replaceable backend publishes its method and snapshot, values every declared custody account, and proposes a price and batch. The valuation authority publishes the price; the settlement authority submits the batch.

```mermaid
%%{init: {"theme": "base", "flowchart": {"curve": "linear", "nodeSpacing": 48, "rankSpacing": 64}, "themeVariables": {"fontSize": "18px", "textColor": "#111827", "primaryTextColor": "#111827", "secondaryTextColor": "#111827", "tertiaryTextColor": "#111827", "lineColor": "#334155", "edgeLabelBackground": "#d9e2ec"}}}%%
flowchart TB
    U["1. USER REQUEST<br/>Lock assets or shares"] --> E["2. VAULT ESCROW<br/>Store request onchain"]
    E -.->|"Public request state"| B["3. BACKEND<br/>Publish method and snapshot<br/>Inventory custody<br/>Calculate NAV"]
    B --> I["4. BACKEND BOUNDARY<br/>Authorized price commitment"]
    I --> V["5. VAULT ROLL<br/>Reload selected requests<br/>Fund claim reserves"]
    B -.->|"Ordered request IDs"| V
    V --> C["6. USER CLAIM<br/>Receive shares or assets"]
    B -.-> X["INDEPENDENT CHECK<br/>Retrieve the same inputs<br/>Recalculate NAV and price<br/>Compare the commitment"]
    V -.-> X

    classDef user fill:#fff1c2,stroke:#6b5200,color:#111827,stroke-width:2px;
    classDef backend fill:#dff3e4,stroke:#27643a,color:#111827,stroke-width:2px;
    classDef boundary fill:#e8e3ff,stroke:#57469c,color:#111827,stroke-width:2px;
    classDef vault fill:#dbeafe,stroke:#315b96,color:#111827,stroke-width:2px;
    classDef check fill:#e5e7eb,stroke:#4b5563,color:#111827,stroke-width:2px;
    class U,C user;
    class B backend;
    class I boundary;
    class E,V vault;
    class X check;
```

The vault recalculates each request output and funds it before a claim. A verifier recomputes NAV and compares the evidence, transaction, and resulting state.

Another backend may use a centralized engine, a different venue, or fully onchain data through the same boundary.

## What PMVS does not do

PMVS makes a vault's claims checkable. It does not make them safe:

- An operator can still publish wrong numbers. PMVS guarantees you can **prove they were wrong after the fact** — not that anyone stops them in time, and not that lost funds come back.
- Verification only sees what the vault declares plus what the public chain shows. Value held on an undeclared account is invisible to it.
- Venue prices arrive through APIs whose bytes PMVS cannot authenticate end to end.
- Detection is never automatic: someone must run the checks.

If those limits are acceptable for your vault, keep reading. If not, this standard cannot help you yet — see [PMVS-CHALLENGE](./standards-map.md), reserved future work on challenges and recourse.

## Lifecycle

```mermaid
%%{init: {"theme": "base", "flowchart": {"curve": "linear", "nodeSpacing": 56, "rankSpacing": 64}, "themeVariables": {"fontSize": "18px", "textColor": "#111827", "primaryTextColor": "#111827", "secondaryTextColor": "#111827", "tertiaryTextColor": "#111827", "lineColor": "#334155", "edgeLabelBackground": "#d9e2ec"}}}%%
flowchart LR
    C["CREATED<br/>Vault is not live yet"] -->|"Initial setup succeeds"| A["ACTIVE<br/>Shares and user rights continue"]
    A -->|"No shares, claims, liabilities,<br/>or value remain; final transaction succeeds"| R["RETIRED<br/>Permanent"]

    classDef created fill:#e8e3ff,stroke:#57469c,color:#111827,stroke-width:2px;
    classDef active fill:#dff3e4,stroke:#27643a,color:#111827,stroke-width:2px;
    classDef retired fill:#e5e7eb,stroke:#4b5563,color:#111827,stroke-width:2px;
    class C created;
    class A active;
    class R retired;
```

Zero NAV is a condition while the vault is Active. It restricts settlement but does not create another lifecycle state. A configuration change also leaves the vault Active and must preserve every share, request, funded claim, and recovery path.

## Read the proposal

Read the main explanation in order:

1. [Core](./pmvs-core.md): what the vault share means and what must never break.
2. [Settlement](./pmvs-settlement.md): how the vault uses a price to turn a request into a funded claim.
3. [PMVS-M1](./pmvs-m1.md): how anyone can reproduce and check that price.

Most readers can stop there. A deployment then selects only the profiles it uses:

- [Gnosis CTF positions](./profiles/position-gnosis-ctf-1.md)
- [Polymarket on Polygon](./profiles/venue-polymarket-1.md)
- [EVM record anchoring](./profiles/anchor-evm-1.md)
- [Arweave record storage](./profiles/storage-arweave-1.md)

Contract implementers and verifier authors use the [EVM implementation annex](./pmvs-evm.md) for exact hashes, structs, calls, selectors, formulas, and events. The [schemas](./schemas/README.md) define machine-readable records. These annexes are reference material, not the introductory reading path.

The [standards and design lineage map](./standards-map.md) says what PMVS adopts, adapts, depends on, or cites as related work. How the standard is maintained and how profile ids are governed: [GOVERNANCE.md](./GOVERNANCE.md).

## Glossary

Plain words for the terms this standard uses most:

| Term | Meaning |
|---|---|
| Share | The vault's single ERC-20 token; each share is the same proportional claim on the whole vault. |
| NAV / price per share | What the vault owns minus what it owes; the per-share slice of that value. |
| Custody account | An address where the strategy holds venue positions or cash. |
| Accounting asset | The currency NAV is measured in (for a Polymarket vault, pUSD). |
| Backend | The offchain engine that finds every asset, computes NAV, and proposes a settlement batch. It never holds user funds. |
| Components record | The signed configuration naming every contract, role, and profile a vault uses. |
| Epoch | One settlement round: one snapshot, one price, one batch of queued requests. |
| Batch / selection | The ordered set of pending requests an epoch settles. |
| Roll | The transaction that applies one batch at its epoch's price. |
| Record / anchor | A signed JSON document describing what happened; anchoring stores its hash onchain in order. |
| Leaf / Merkle claim | A user's stored payout in a settled batch, provable with a short proof path. |
| Profile | A versioned rule set (venue, anchor, storage) selected by name in the components record. |
| Watcher | An independent observer who publishes their own records about a vault. |
| Recovery right | A recorded claim on vault value outside normal requests — e.g. funds sent to a wrong address. |

## Authors

- [Ivan Morozov (allquantor)](https://github.com/allquantor)
- [Christian (smowden)](https://github.com/smowden), [X: @bettercallsmo](https://x.com/bettercallsmo)
- [Dinu Barbu (dvinubius)](https://github.com/dvinubius), [X: @dvinubius](https://x.com/dvinubius)
- [Ovidiu Miclea (micovi)](https://github.com/micovi), [X: @micovi7](https://x.com/micovi7)

The proposal and schemas are released under [CC0-1.0](./LICENSE).
