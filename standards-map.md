# Standards map

PMVS has one narrow purpose: make externally valued prediction-market vault settlements reproducible and attributable. Existing ERCs already define the tokens and common vault interfaces around that purpose.

This map favors Final standards with deployed, composable interfaces. Draft and Review proposals appear only as related work. Statuses were checked on 2026-08-21 and must be checked again before publication. An idea does not become a PMVS dependency until its interface and status are stable enough for that role.

## Design boundaries

| Standard | What it provides | PMVS use | What PMVS must not claim |
|---|---|---|---|
| [ERC-20](https://eips.ethereum.org/EIPS/eip-20) | Fungible balances, transfers, allowances, and events | The investor's durable vault share | ERC-20 alone does not define NAV, redemption, backing, or settlement safety. |
| [ERC-165](https://eips.ethereum.org/EIPS/eip-165) | Interface detection | Detects optional vault and settlement interfaces | A successful call or matching function name is not interface detection. |
| [ERC-1155](https://eips.ethereum.org/EIPS/eip-1155) | Many token types in one contract | Event-specific outcome positions held by custody | An outcome token is not the same economic object as a vault share. |
| [ERC-2612](https://eips.ethereum.org/EIPS/eip-2612) | Signed ERC-20 approvals | Optional share-token convenience | PMVS does not require permit, and permit does not authorize settlement records. |
| [ERC-4626](https://eips.ethereum.org/EIPS/eip-4626) | A tokenized-vault interface for one accounting asset | Optional interface for a fully conforming implementation | `totalAssets()` must not revert, and PMVS records do not excuse any method, preview, limit, or rounding rule. |
| [ERC-7540](https://eips.ethereum.org/EIPS/eip-7540) | Pending, claimable, and claimed states for asynchronous vault requests | Preferred request model for new settlement profiles | The standard builds on ERC-7575. The Zeit ABI is not ERC-7540 merely because both systems use requests. |
| [ERC-7575](https://eips.ethereum.org/EIPS/eip-7575) | External ERC-20 shares and multiple asset entry points | Keeps one share identity across component or entry-point changes | A shared token does not prove that every linked vault uses the same accounting correctly. |
| [EIP-712](https://eips.ethereum.org/EIPS/eip-712) | Typed structured-data signing | Binds a record hash, subject, stream, kind, sequence, record predecessor, prior anchor, chain, and anchor contract | EIP-712 does not add replay protection on its own. |
| [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271) | Signature validation for contract accounts | Lets a Safe or another contract authority attest records | A current `isValidSignature` result may differ from the result at anchor time. The anchor contract must validate it on-chain. |
| [ERC-5267](https://eips.ethereum.org/EIPS/eip-5267) | Discovery of an EIP-712 domain from a contract | Useful for an on-chain PMVS attestation verifier | It applies only when a contract exposes and uses the domain. |
| [ERC-8330](https://eips.ethereum.org/EIPS/eip-8330) | Provider-attributed NAV streams, corrections, staleness, and optional aggregation | Possible adapter target for PMVS valuation outputs | It is in Review and does not calculate or verify NAV. PMVS does not depend on it. |

## Lessons applied from final ERCs

### Keep the base small

ERC-20 succeeded by standardizing a small interface that many applications could reuse. PMVS follows that pattern by keeping venue endpoints, storage networks, and settlement ABIs out of the core record rules.

### Extend instead of renaming

ERC-4626, ERC-7540, and ERC-7575 form a clear extension chain. PMVS names compatibility with each standard separately. Similar concepts or method names do not establish conformance.

### Make optional behavior detectable

ERC-7540 uses ERC-165 because a vault may support an asynchronous deposit flow, redemption flow, or both. PMVS applies the same lesson to profiles and anchor modes: a verifier reads explicit identifiers instead of guessing behavior from a reverted call.

### Separate a durable share from replaceable machinery

ERC-7575 allows the share token to live outside a vault entry point. PMVS therefore identifies the economic subject by the share token and chain, then records the current adapter, accountant, custody account, and authorities as replaceable components.

### Do not turn an estimate into a promise

ERC-4626 distinguishes estimates, previews, limits, and executed transfers. PMVS likewise distinguishes NAV, a displayed-book cross mark, a settlement price, and an amount committed for a claim. None of these terms is a synonym for guaranteed market liquidity.

### Describe the state machine

ERC-7540 names Pending, Claimable, and Claimed states and requires users to pull claims. PMVS settlement profiles must map every request state and failure path, including cancellation, timeout, rescue, and retirement. A selected request with no valid claim is a custody failure, not an edge case.

### Treat signatures as one control, not the trust model

EIP-712 makes the signed message unambiguous. ERC-1271 supports contract authorities. PMVS still records which authority was valid at the anchor, how it could rotate, and what happens when a signing policy changes.

## Related drafts

[ERC-8113](https://eips.ethereum.org/EIPS/eip-8113) proposes series accounting for performance fees in ERC-4626 and ERC-7540 vaults. Its free-rider analysis is relevant to PMVS deployments that use one vault-wide high-water mark. Because ERC-8113 is a Draft and changes the share-accounting model, PMVS v1 records the deployed fee method exactly and requires the deployment to disclose cohort effects. A later fee profile can adopt series accounting without changing the core record protocol.

ERC-8330 is closer to PMVS valuation records, but the scopes differ. ERC-8330 standardizes an on-chain NAV publication and query lifecycle. PMVS-M1 defines a reproducible method for a particular class of prediction-market portfolios and binds the detailed evidence needed to audit settlement. An adapter may publish a PMVS output to an ERC-8330 stream after the adapter fixes the NAV basis, decimals, methodology-hash derivation, and staleness policy.

## EIP process status

Under [EIP-1](https://eips.ethereum.org/EIPS/eip-1), a Standards Track proposal needs one focused idea, a complete interoperable specification, rationale, backwards compatibility, security considerations, and a public discussion venue. PMVS is still a pre-EIP suite. The portable record protocol may become one ERC proposal. Venue, storage, valuation, and legacy settlement profiles should remain auxiliary specifications so mutable operational facts do not enter a Final ERC.

## Backwards compatibility

PMVS does not reinterpret old archives as conforming records. A deployment begins conformance with a new component genesis, schema, authority attestation, and anchor. Earlier bytes retain their old meaning and receive `UNVERIFIABLE_INPUTS` where evidence is missing.

The custom Zeit ABI remains readable through `settlement/zeit-epoch-merkle/1`. New ERC-7540 or ERC-7575 entry points use different settlement profiles. A component migration can keep the same ERC-20 subject only when it preserves every pending request, funded claim, and holder right.
