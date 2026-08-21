# PMVS review record

This record tracks focused passes over the pre-EIP proposal. A pass has one main question and one recorded result. After each prose pass, the text was checked with the Humanizer claim-preservation rules, the No AI Slop pattern list, and the Orwell rules for short, concrete technical English. The final automated prose gate rejects the clearest stock terms and em or en dashes.

## Iterations

| Pass | Question | Result |
|---:|---|---|
| 1 | What belongs in the standalone repository? | Separated the portable proposal from implementation-specific history and mutable deployment facts. |
| 2 | What human problem does PMVS solve? | Rewrote the opening around durable strategy shares, short-lived outcome positions, and independently checkable settlement. |
| 3 | Why is an ERC-20 useful for fundraising? | Added the continuing-capital use case and the disclosures needed before accepting investor funds. |
| 4 | Is PMVS claiming an EIP status it does not have? | Marked every Part as pre-EIP, stated that no number or official thread exists, and added EIP-1 submission gates. |
| 5 | Which Ethereum standards should PMVS compose with? | Mapped ERC-20, ERC-1155, ERC-165, ERC-2612, ERC-4626, ERC-7540, ERC-7575, EIP-712, ERC-1271, ERC-5267, and related ERC-8330. |
| 6 | Is the core one focused idea? | Defined the prediction-market vault, its durable share, custody perimeter, components, lifecycle, records, and conformance. Moved mutable facts to profiles. |
| 7 | What remains stable when contracts migrate? | Made `(chainId, shareToken)` the subject and defined versioned component generations with pending-request and claim migration duties. |
| 8 | Can two implementations hash the same record? | Tightened PMVS-JCS ranges, Unicode handling, closed schemas, critical extensions, and canonical-byte checks. |
| 9 | Do watcher records corrupt the operator sequence? | Split the subject stream from one stream per watcher and introduced `streamId` in EVM anchors. |
| 10 | Can gaps or corrections rewrite history? | Defined cadence slots, gap reasons, late status, additive corrections, and permanent effects of executed mismatches. |
| 11 | Can a signature be replayed to another anchor contract? | Added `verifyingContract` to the EIP-712 domain and regenerated its digest and signature vectors. |
| 12 | Can ERC-1271 history be verified after policy rotation? | Required on-chain signature validation at anchor time and individual or batched validation of each ERC-1271 record. |
| 13 | Is anchoring implementable? | Defined stream heads, compare-and-set rules, registry and atomic modes, unexecuted-anchor handling, and `anchor/evm/1`. |
| 14 | Did the old conformance ladder contradict itself? | Replaced L1a and L1b nesting with L1 through L3 plus independent anchor, request-liveness, and watcher claims. |
| 15 | Does PMVS replace ERC-4626 or ERC-7540? | Kept exact ERC conformance as a separate claim and defined a versioned epoch-Merkle profile for custom asynchronous settlement. |
| 16 | Can a request remain locked forever? | Added `bounded` and `operator-dependent` liveness classes and required disclosure of every no-recovery state. |
| 17 | Does the Merkle root bind its domain and leaf count? | Preserved a read-only compatibility vector under `settlement/epoch-merkle-compat/0` and added domain-separated, count-bound `pmvs-merkle/1` vectors for new contracts. |
| 18 | Are fee transfers reproducible and fair across cohorts? | Preserved two-stage ceiling math, added range and overflow rules, and disclosed the global high-water-mark cohort subsidy. |
| 19 | Can retirement strand a meaningful ERC-20? | Required funded pins, residual policies, clean subject-closure conditions, and `STRANDED_SHARE_SUPPLY` for dead-end shares. |
| 20 | Can a one-unit sentinel become an economic price? | Removed the sentinel from M1. Added explicit liabilities, signed NAV, zero NAV, deficit, and zero-supply asset handling. |
| 21 | Can partial book depth dilute existing holders? | Made material unfilled exposure block deposits and withdrawals and required a separate rights-allocation profile for side pockets. |
| 22 | Can capture silently lose precision or change under retries? | Required raw bytes, exact decimal lexeme parsing, pinned blocks, pure compute, fixed ordering, and no IEEE-754 value path. |
| 23 | Are Polymarket facts current? | Checked primary documentation on 2026-08-21, marked the old neg-risk adapter deprecated, added current collateral adapters, and corrected the changed fee formula. |
| 24 | Is pUSD treated as an unsupported market peg? | Bound 1:1 treatment to the documented on-chain conversion path and required pinned availability checks. |
| 25 | Does Arweave replace the PMVS content hash? | Kept transaction and DataItem ids as locators, defined parent-bundle verification, read-back, two read paths, and repair. |
| 26 | Can watcher agreement be overstated? | Downgraded exact matches to opaque correlation, required scheduled-sample gaps, timely watcher anchors, and dependency disclosure. |
| 27 | Are common record shapes machine-readable? | Added a strict JSON Schema 2020-12 base envelope covering ten record kinds and a signed component-genesis fixture. |
| 28 | Do the published vectors execute? | Added reference code and tests for canonicalization, subject identity, typed data, both Merkle profiles, selection hashes, venue cost caps, and fee arithmetic. |
| 29 | Does the prose still contain stock AI patterns? | Added a repository test for the requested banned terms, dash rule, and broken relative links. |
| 30 | Does a signature bind the exact stream and anchor state? | Added `streamId` and `previousAnchor` to the typed message, bound the exact signature in the event, and regenerated the vectors. |
| 31 | Can an anchor migration reset watcher history? | Required import of the subject head and every continuing watcher head at one declared activation boundary. |
| 32 | Do verifier codes have one consistent effect? | Replaced the conflicting warning rule with scope-specific effects for timeliness, missing inputs, incomplete capture, and unexecuted anchors. |
| 33 | Is a live pUSD ramp enough to assume par value? | Inspected pinned contract source, identified privileged mint and upgrade paths, and required code, role, reserve, allowance, and pause checks. |
| 34 | Can reference code silently narrow a chain id or misorder numeric keys? | Changed chain ids to `bigint` and added negative tests for prior-anchor replay, undeclared schema fields, and UTF-16 key order. |
| 35 | Will later changes preserve the same protocol discipline? | Added contribution rules, immutable profile-version discipline, a pinned toolchain, and a CI workflow. |
| 36 | Can dense conditions be read without losing a requirement? | Split long authority, claim, retirement, storage, and watcher rules into short statements and ordered lists. |
| 37 | Does settlement consume a field that the valuation schema defines? | Replaced the undefined `crossPps` name with `outputs.pps` and updated the canonicalization vector. |
| 38 | Can an EVM contract verify an old event directly during migration? | Removed that impossible claim. The new anchor now reads a frozen old head through its contract interface and uses an authenticated import path. |
| 39 | Does transitive coverage imply on-chain signature validation? | Defined direct and transitive anchors separately, limited transitive coverage to ECDSA, and required direct anchors for component and ERC-1271 records. |
| 40 | Does the base schema overstate what it closes? | Named every profile-owned open object and made a missing profile schema return `UNSUPPORTED_PROFILE`. |
| 41 | Can correct commitments still leave claims unpaid or enable first-deposit theft? | Added `UNDERFUNDED_CLAIMS`, aggregate funding checks, and explicit donation, rounding, and initial-supply controls. |
| 42 | Can gross book proceeds overstate value when the venue charges taker fees? | Subtracted the pinned exchange's enforceable fee cap, handled its unlimited zero setting, and added executable vectors. |
| 43 | Does the complete proposal pass its verification and prose gates? | Applied all three writing checks, reviewed cross-document terms, installed from the lockfile, and ran the complete local suite. |
| 44 | Does the proposal define a vault or a record-review process? | Reframed PMVS around the ERC-20 share, portfolio, custody perimeter, accounting asset, and lifecycle. Records now support the vault instead of defining its category. |
| 45 | Does the architecture match the reference contracts? | Traced the share vault, Teller, Accountant, strategy custody, fee module, and request adapter from source. The text now treats external strategy custody as part of the vault perimeter. |
| 46 | Are prediction-market positions distinct from investor shares? | Defined outcome positions as portfolio assets and the ERC-20 as the durable proportional NAV unit. Removed language that could collapse the two layers. |
| 47 | Does the machine-readable record carry the new vault model? | Added the portfolio kind, custody model, position formats, entry and exit asset modes, and `pro-rata-nav` share semantics to the component schema and fixture. |
| 48 | Did the final vault rewrite survive technical and prose review? | Reapplied Orwell Writing, No AI Slop, and Humanizer in that order. Preserved the two-token model and normative rules, tightened the framing regression test, and passed the full local suite. |
| 49 | Does the opening name the standardized object without a preamble? | Opened with the ERC-20 vault, named market shares as outcome positions, named the investor token as the vault share, and stated its pro-rata NAV basis in three sentences. |
| 50 | Do the supporting Parts keep vault economics ahead of verification machinery? | Tightened Core, settlement, M1, and the standards map around custody, NAV, entry, exit, and the Boring Vault role split. Records now appear only where the required state must be reproduced or committed. |
| 51 | Did compression remove a technical claim or reintroduce stock prose? | Restored the operator-control and off-chain-allocation facts found by the claim-preservation check. Re-ran Orwell Writing, No AI Slop, Humanizer, the lockfile install, and the full local suite. |

## Evidence used

Research used primary specifications and current first-party documentation:

- [EIP-1](https://eips.ethereum.org/EIPS/eip-1) and the ERCs linked from [`standards-map.md`](./standards-map.md)
- [Veda Boring Vault architecture](https://docs.veda.tech/architecture-and-flow-of-funds) and the [Boring Vault source repository](https://github.com/Se7en-Seas/boring-vault)
- [Gnosis Conditional Tokens developer guide](https://github.com/gnosis/conditional-tokens-contracts/blob/master/docs/developer-guide.rst) for ERC-1155 position, split, merge, and redemption semantics
- [Polymarket contracts](https://docs.polymarket.com/resources/contracts), [order books](https://docs.polymarket.com/api-reference/market-data/get-order-book), [pUSD](https://docs.polymarket.com/concepts/pusd), [resolution](https://docs.polymarket.com/concepts/resolution), and [fees](https://docs.polymarket.com/trading/fees)
- Pinned Polymarket [`CollateralToken`](https://github.com/Polymarket/ctf-exchange-v2/blob/ccc0596074f4dfd62c944fbca4de252893b82b4b/src/collateral/CollateralToken.sol) and [`CollateralOfframp`](https://github.com/Polymarket/ctf-exchange-v2/blob/ccc0596074f4dfd62c944fbca4de252893b82b4b/src/collateral/CollateralOfframp.sol) source at commit `ccc0596`
- [Arweave HTTP API](https://docs.arweave.org/developers/arweave-node-server/http-api) and [ANS-104](https://github.com/ArweaveTeam/arweave-standards/blob/master/ans/ANS-104.md)
- Read-only reference contracts for the ERC-20 share vault, Teller, Accountant, strategy custody, fee module, and epoch request adapter

## Boundary of this review

The repository is a production-oriented proposal, schema, and vector suite. It does not certify a deployment. A production conformance claim still needs complete implementation code, two independent verifiers, independent security review of the anchor and settlement contracts, venue-data rights review, legal review, and an observed run beginning with a conforming component genesis.
