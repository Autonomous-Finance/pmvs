# Standards and design lineage

This map records design sources and boundaries. `Adopted` means exact use; `adapted` means a changed pattern; `dependency` is profile-specific; `related` confers no PMVS conformance. EIP statuses were checked on 2026-08-24.

## Sources and boundaries

| Source | Relation | PMVS use and boundary |
|---|---|---|
| [Boring Vault architecture](https://github.com/Veda-Labs/boring-vault/blob/39f9d3144fd0416fdcb467ecec916b31457c915d/README.md) and [Accountant](https://github.com/Veda-Labs/boring-vault/blob/39f9d3144fd0416fdcb467ecec916b31457c915d/src/base/Roles/AccountantWithRateProviders.sol) | Adapted | Share, accounting, and control separation; offchain rate and high-water mark. PMVS changes contracts, evidence, and fee math. |
| [ERC-20](https://eips.ethereum.org/EIPS/eip-20) | Adopted | Share interface, not backing, NAV, or settlement. |
| [ERC-4626](https://eips.ethereum.org/EIPS/eip-4626) | Adapted | Asset/share units, conversion, and rounding. Full interface and behavior are required for conformance. |
| [ERC-7540](https://eips.ethereum.org/EIPS/eip-7540#request-lifecycle) | Adapted | Pending, claimable, claimed, and pull claim. PMVS adds epochs, remedies, evidence, Merkle allocation, and a custom ABI. |
| [Uniswap MerkleDistributor](https://github.com/Uniswap/merkle-distributor/blob/25a79e8ec8c22076a735b1a675b961c8184e7931/contracts/MerkleDistributor.sol) | Adapted | Root, proof, replay guard, and pull transfer. PMVS changes leaf, root, and reserves. |
| [Solmate MerkleProofLib](https://github.com/transmissions11/solmate/blob/eaa7041378f9a6c12f943de08a6c41b31a9870fc/src/utils/MerkleProofLib.sol), [RFC 6962](https://www.rfc-editor.org/rfc/rfc6962.html#section-2.1), [OpenZeppelin MerkleProof](https://docs.openzeppelin.com/contracts/5.x/api/utils/cryptography#MerkleProof) | Adapted | Sorted pairs, domain prefixes, and proof rules. The PMVS formula controls. |
| [EIP-712](https://eips.ethereum.org/EIPS/eip-712), [EIP-2](https://eips.ethereum.org/EIPS/eip-2), [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271) | Adopted | Digests, low-`s` ECDSA, and contract signatures. PMVS adds authority and replay. |
| [ERC-165](https://eips.ethereum.org/EIPS/eip-165) | Adopted | Interface detection, not behavior. |
| [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) | Adapted | Canonical JSON. PMVS-JCS adds types, bounds, casing, and array order. |
| [JSON Schema 2020-12](https://json-schema.org/draft/2020-12) | Adopted | Record shapes; semantic checks stay separate. |
| [ERC-1155](https://eips.ethereum.org/EIPS/eip-1155) and [Gnosis CTF](https://github.com/gnosis/conditional-tokens-contracts/blob/eeefca66eb46c800a9aaab88db2064a99026fde5/docs/developer-guide.rst) | Dependency | CTF-profile tokens, ids, events, balances, and payouts. |
| [EIP-1014](https://eips.ethereum.org/EIPS/eip-1014), [PolySafeLib](https://github.com/Polymarket/ctf-exchange-v2/blob/ccc0596074f4dfd62c944fbca4de252893b82b4b/src/exchange/libraries/PolySafeLib.sol), [Polymarket CLOB](https://docs.polymarket.com/trading/overview) | Dependency | Safe derivation and Polymarket venue facts. |
| [Kalshi order books](https://docs.kalshi.com/api-reference/market/get-market-orderbook) | Related | Offchain-book example only. |
| [Arweave API](https://docs.arweave.org/developers/arweave-node-server/http-api) and [ANS-104](https://github.com/ArweaveTeam/arweave-standards/blob/986f9e9a9b5952d8a869161209cd68d8b51c4626/ans/ANS-104.md) | Dependency | Optional storage; never a trust anchor. |
| [ERC-2612](https://eips.ethereum.org/EIPS/eip-2612), [ERC-7575](https://eips.ethereum.org/EIPS/eip-7575), [ERC-5267](https://eips.ethereum.org/EIPS/eip-5267) | Related | Optional permit, external-share, and domain-discovery interfaces. |
| [ERC-8330](https://eips.ethereum.org/EIPS/eip-8330), [ERC-8113](https://eips.ethereum.org/EIPS/eip-8113) | Related | NAV and series proposals only. |

## Interface references

The [PMVS EVM annex](./pmvs-evm.md#interface-registry) is the sole source for PMVS function signatures, selectors, and ERC-165 ids. Interface detection does not replace behavior checks.

| Claim | Required id |
|---|---|
| ERC-7540 vault | `0xe3bc4e65` and ERC-7575 vault `0x2f0a18c5` |
| Async deposit | `0xce3bbe50` |
| Async redemption | `0x620ee8e4` |
| ERC-7575 share, when declared | `0xf815c03d` |
| ERC-1155 token | `0xd9b67a26` |

ERC-20, ERC-2612, and ERC-4626 have no ERC-165 conformance id. Verify their ABI and behavior directly.

ERC-7540 also requires its request, claim, operator, preview, and event behavior.

## Status

PMVS is a pre-EIP suite under [EIP-1](https://eips.ethereum.org/EIPS/eip-1). ERC-8113 series accounting conflicts with Core v1's single NAV basis and needs a new Core version.

Requirement words follow [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174). Selectors and encodings adopt the [Solidity ABI specification](https://docs.soliditylang.org/en/latest/abi-spec.html).
