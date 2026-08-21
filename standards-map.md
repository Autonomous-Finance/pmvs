# Standards map

PMVS specifies a prediction-market vault with ERC-20 investor shares and changing outcome positions inside a declared custody perimeter. The first position profile uses the Gnosis Conditional Tokens Framework (CTF), whose `ConditionalTokens` contract implements ERC-1155. PMVS defines the vault share, custody, NAV, asynchronous settlement, and lifecycle around those positions.

This map prefers Final Ethereum standards with deployed interfaces. Draft and Review proposals appear only as related work. The statuses below were checked on 2026-08-21 and must be checked again before publication. PMVS does not depend on a proposal merely because its subject is related.

## Design boundaries

| Standard or protocol | Status on 2026-08-21 | Exact scope | PMVS use and boundary |
|---|---|---|---|
| [ERC-20](https://eips.ethereum.org/EIPS/eip-20) | Final ERC | Token balances, transfers, allowances, return values, and events | Defines the investor share interface. It does not define NAV, backing, entry, redemption, or settlement. A PMVS disclosure cannot excuse an ERC-20 semantic violation. |
| [ERC-165](https://eips.ethereum.org/EIPS/eip-165) | Final ERC | Publication and detection of interface identifiers | Detects declared support only for standards that specify ERC-165. It does not prove that a contract behaves correctly. |
| [ERC-1155](https://eips.ethereum.org/EIPS/eip-1155) | Final ERC | Balances, safe transfers, batch operations, events, and operator approvals for multiple token IDs | Supplies the token interface beneath CTF positions. It does not define conditions, payouts, splitting, merging, or redemption. |
| [Gnosis CTF](https://github.com/gnosis/conditional-tokens-contracts/blob/eeefca66eb46c800a9aaab88db2064a99026fde5/docs/developer-guide.rst) | Application protocol, not an EIP or ERC | Condition, collection, and position IDs, plus collateral splitting, merging, resolution, and redemption | `position/gnosis-ctf/1` binds these semantics above ERC-1155. An ERC-1155 token is not a CTF position merely because it exposes the same token interface. |
| [Polymarket Positions Framework](https://docs.polymarket.com/trading/positions/combinatorial) | Venue protocol, not an EIP or ERC | ERC-1155 YES and NO tokens for combinatorial positions under `PositionManager` | Combo positions are distinct from CTF positions, and their RFQ execution is outside `venue/polymarket/1`. |
| [ERC-2612](https://eips.ethereum.org/EIPS/eip-2612) | Final ERC | EIP-712-signed ERC-20 allowance changes through `permit`, `nonces`, and `DOMAIN_SEPARATOR` | Optional share-token capability. A function named `permit` is not enough, and a permit does not authorize a PMVS settlement record. |
| [ERC-4626](https://eips.ethereum.org/EIPS/eip-4626) | Final ERC | Tokenized-vault entry, exit, conversion, limit, preview, and accounting rules for one underlying EIP-20 asset | Optional only for an implementation that satisfies the complete interface and semantics. A PMVS accounting denomination is not automatically the ERC-4626 asset returned by `asset()`. |
| [ERC-7575](https://eips.ethereum.org/EIPS/eip-7575) | Final ERC | Adapts ERC-4626 so a vault entry point can use an external ERC-20 share; multiple asset entry points can link to one common share | Useful when the share and entry point are separate. It does not standardize replacement of accountants, custody accounts, authorities, or other PMVS components. |
| [ERC-7540](https://eips.ethereum.org/EIPS/eip-7540) | Final ERC | Extends ERC-4626 and ERC-7575 with asynchronous deposit requests, redemption requests, or both | Preferred model for a new asynchronous profile that implements every applicable method and state rule. A custom epoch request ABI is not ERC-7540 by analogy. |
| [EIP-712](https://eips.ethereum.org/EIPS/eip-712) | Final Standards Track Interface | Typed structured-data hashing and signing with domain separation | Defines the PMVS attestation digest. It does not provide replay protection. PMVS adds chain, contract, subject, stream, sequence, and prior-head bindings. |
| [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271) | Final ERC | Contract-account validation through `isValidSignature(bytes32,bytes)` | Lets a contract authority validate a PMVS digest. The result can depend on mutable policy, so the anchor validates it in the anchoring transaction. |
| [ERC-5267](https://eips.ethereum.org/EIPS/eip-5267) | Final ERC | Retrieval of the EIP-712 domain that a contract uses | Optional discovery for an on-chain PMVS verifier. A claim requires the exact `eip712Domain()` return shape and values. |
| [ERC-8330](https://eips.ethereum.org/EIPS/eip-8330) | Review ERC | Subject-linked NAV publication, corrections, invalidation, staleness, and optional aggregation | Possible future adapter target. It does not calculate NAV, verify a methodology, establish backing, or guarantee an executable price. PMVS does not depend on it. |

## How to verify a standards claim

ERC-165 is a detection protocol, not a general conformance test. A verifier that does not already trust ERC-165 support performs the specified calls with 30,000 gas:

1. `STATICCALL supportsInterface(0x01ffc9a7)`. Failure or `false` means the contract does not implement ERC-165.
2. `STATICCALL supportsInterface(0xffffffff)`. Failure or `true` means the contract does not implement ERC-165.
3. Query the target interface identifier. Failure, a malformed Boolean return, or `false` means the interface is unsupported. A `true` result is the contract's declaration of support. The verifier must still apply the target standard's required behavior and any PMVS profile checks.

ERC-7540 uses separate identifiers because asynchronous deposit and redemption support are independent:

| Claim | Required ERC-165 response |
|---|---|
| Every ERC-7540 vault | `0xe3bc4e65` and the ERC-7575 vault identifier `0x2f0a18c5` |
| Asynchronous deposit flow | `0xce3bbe50` |
| Asynchronous redemption flow | `0x620ee8e4` |

An ERC-7540 claim also requires the applicable request, state, claim, operator, preview, and event behavior. All ERC-7540 vaults implement ERC-7575, including `share()`.

An ERC-7575 vault must return `true` for `0x2f0a18c5`. The share-side interface identifier is `0xf815c03d`. The standard makes ERC-165 support on the share contract a recommendation, while the vault-side response is mandatory. The record must identify which contract is the vault and which contract is the share.

ERC-20, ERC-2612, and ERC-4626 do not define ERC-165 identifiers for their conformance claims. A verifier checks their exact ABI and behavior. For example, ERC-2612 requires the specified `permit` state transition, per-owner nonce, domain separator, deadline rule, signature rule, and `Approval` event. ERC-4626 requires all applicable conversion, preview, limit, transfer, event, and rounding semantics. Matching names or successful calls do not establish conformance.

The same boundary applies to CTF. ERC-1155 support for `0xd9b67a26` establishes the token interface. The CTF profile separately verifies the permitted contract, condition preparation, ID derivations, balance, lifecycle, and payout state.

## Design lessons

### Reuse the outcome-position protocol

PMVS does not create another prediction-market token. The `position/gnosis-ctf/1` profile binds the existing CTF position model. PMVS adds one ERC-20 share over the NAV of a changing CTF portfolio.

### Keep the base small

ERC-20 defines a small interface that many applications can reuse. PMVS keeps its core model narrow: one durable share, one accounting unit, a declared custody perimeter, component roles, and versioned settlement and valuation profiles.

### Follow the dependency order

The vault dependency order is ERC-4626, then ERC-7575, then ERC-7540. ERC-7575 adapts the ERC-4626 interface for an external share and multiple entry points. ERC-7540 requires both and overrides specified ERC-4626 behavior for each supported asynchronous flow. Similar method names do not establish conformance.

### Make optional behavior detectable

ERC-7540 uses ERC-165 because a vault can support asynchronous deposits, asynchronous redemptions, or both. PMVS profiles must also expose exact identifiers instead of making a verifier infer behavior from a function name or revert.

### Separate the share from the entry point

ERC-7575 allows the ERC-20 share to live outside a vault entry point. PMVS uses that separation as a design precedent for identifying the economic subject by share token and chain. PMVS, not ERC-7575, defines how other components can change while holder rights remain intact.

### Do not turn an estimate into a promise

ERC-4626 distinguishes conversions, previews, limits, and executed transfers. PMVS likewise distinguishes NAV, a displayed-book cross mark, a settlement price, and an amount funded for a claim. None proves market liquidity.

### Describe the request state machine

ERC-7540 defines Pending, Claimable, and Claimed states and requires users to pull claims. A PMVS settlement profile must also define every supported cancellation, timeout, rescue, migration, and retirement path. ERC-7540 does not itself standardize request cancellation.

### Bind signatures to an application state transition

EIP-712 makes the signed data unambiguous but does not prevent replay. ERC-1271 lets a contract account validate the digest but permits policy-dependent logic. PMVS therefore binds each digest to its chain, anchor contract, stream position, and prior anchor head, and validates contract signatures in the anchoring transaction.

## Non-final related work

[ERC-8113](https://eips.ethereum.org/EIPS/eip-8113) is a Draft. It proposes series accounting to address performance-fee free riders in ERC-4626-type and ERC-7540-type flows. The draft also states that it is not backward compatible with ERC-4626 or ERC-7540. Shares are not fungible across series before consolidation, which conflicts with Core v1's requirement that every unit of one share token represents the same proportional NAV interest. Its fee analysis is relevant, but adopting ERC-8113 as written requires a new core and share-accounting version. A fee profile alone cannot make Core v1 compatible.

[ERC-8330](https://eips.ethereum.org/EIPS/eip-8330) is in Review. It proposes an on-chain NAV publication and query lifecycle. PMVS-M1 defines prediction-market inventory and valuation. A future adapter could publish a PMVS output to an ERC-8330 stream only after it fixes the NAV basis, decimals, methodology-hash derivation, and staleness policy required by that integration.

## Architecture provenance

PMVS was informed by [Boring Vault designs](https://docs.veda.tech/architecture-and-flow-of-funds), but it does not require that layout. Design ancestry does not establish conformance, dependency, a fork, or API compatibility.

The [current Veda `BoringVault` source](https://github.com/Veda-Labs/boring-vault/blob/39f9d3144fd0416fdcb467ecec916b31457c915d/src/base/BoringVault.sol) can receive ERC-1155 assets and lets authorized callers execute `manage`, `enter`, and `exit`. A PMVS layout may instead keep CTF positions in a separate strategy custody wallet while its share vault controls ERC-20 supply and buffers the accounting asset. PMVS therefore requires explicit component and custody records. This design choice does not prove conformance.

An implementation can use another contract suite only if it declares every component and satisfies the PMVS requirements.

## EIP process status

[EIP-1](https://eips.ethereum.org/EIPS/eip-1) is a Living Meta EIP. It strongly recommends that one EIP contain one focused proposal. A Standards Track submission needs a clear and complete description, an interoperable specification, rationale, sufficient security considerations, the required preamble and copyright waiver, and a public discussion venue. A Backwards Compatibility section is required only when the proposal introduces an incompatibility.

PMVS remains a pre-EIP suite. A future submission could put the portable vault model and discovery surface in one ERC proposal. Venue, storage, valuation, and compatibility profiles should remain auxiliary documents so mutable operational facts do not enter a Final ERC.

## Backwards compatibility

PMVS does not reinterpret old records as conforming records. A deployment begins conformance with a new component genesis, schema, authority attestation, and anchor. Earlier bytes retain their old meaning and receive `UNVERIFIABLE_INPUTS` when the required inputs are missing.

The custom epoch interface remains readable through its compatibility leaf profile. A future ERC-7540 or ERC-7575 entry point requires its own profile and exact conformance checks. A component migration can keep the same ERC-20 subject only when it preserves every pending request, funded claim, custody position, and holder right.
