# PMVS position profile: Gnosis Conditional Tokens Framework

```
pmvs-part:      profile (position)
profile-id:     position/gnosis-ctf/1
version:        1 (draft)
status:         Pre-EIP review draft
author:         Ivan Morozov (Zeit Finance)
created:        2026-08-21
requires:       PMVS Parts I and III; ERC-165; ERC-1155
```

This profile does not create a new outcome token. It tells a PMVS verifier how to identify, inventory, and calculate the redemption value of existing Gnosis Conditional Tokens Framework (CTF) positions.

Polymarket describes CTF as an open standard developed by Gnosis. It has no EIP or ERC number. Its `ConditionalTokens` contract implements ERC-1155. ERC-1155 defines balances, transfers, batches, events, and operator approvals. CTF adds condition preparation, outcome collections, position ids, collateral-backed split and merge operations, resolution, and redemption.

## Position identity and fields

A CTF position is identified by `(chainId, positionContract, positionId)`. A token id without its chain and contract is not a complete identity.

Each venue inventory entry using this profile contains a `position` object. That object MUST contain the following fields. Integers use canonical decimal strings. Addresses and fixed bytes use lowercase PMVS-JCS hex. The position contract, custody account, collateral token, and oracle MUST be nonzero addresses.

| Field | Type and meaning |
|---|---|
| `profile` | MUST equal `position/gnosis-ctf/1` |
| `chainId` | `uint256` chain containing the position contract and balance |
| `positionContract` | Address of the declared `ConditionalTokens` contract |
| `custodyAccount` | Address whose ERC-1155 balance belongs to the vault |
| `collateralToken` | Address of the ERC-20 token that backs the position |
| `oracle` | Address authorized by CTF to report the condition payout |
| `questionId` | `bytes32` question identifier supplied to CTF |
| `outcomeSlotCount` | `uint256` from 2 through 256 |
| `conditionId` | `bytes32` derived from the oracle, question, and slot count |
| `parentCollectionId` | Parent CTF collection id, or zero for a root position |
| `indexSet` | `uint256` nonempty proper subset of the condition's outcome slots |
| `collectionId` | `bytes32` derived by the CTF collection algorithm |
| `positionId` | `uint256` ERC-1155 token id derived from collateral and collection |
| `quantity` | `uint256` from the pinned ERC-1155 balance read |

The active venue profile names each permitted `positionContract`. The component record activates `position/gnosis-ctf/1` before a declared custody account receives a CTF position.

[`position-gnosis-ctf-1.schema.json`](../schemas/position-gnosis-ctf-1.schema.json) closes the `position` object. The venue profile owns the surrounding inventory entry and may add book, exchange-route, and venue-correlation fields beside it. A released venue profile MUST provide a closed schema for that entry. [`position-gnosis-ctf-1.json`](../fixtures/position-gnosis-ctf-1.json) carries the public vector from the Gnosis developer guide in PMVS encoding.

The fixture's oracle, question id, condition id, collateral token, collection id, and position id come from that guide. Its chain, position-contract address, custody account, and quantity are illustrative.

## Canonical derivation

The condition id uses Solidity packed encoding with a 20-byte address, a 32-byte question id, and a 32-byte `uint256`:

```text
conditionId = keccak256(
  abi.encodePacked(address oracle, bytes32 questionId, uint256 outcomeSlotCount)
)
```

The collection id is the exact elliptic-curve construction in `CTHelpers.getCollectionId(parentCollectionId, conditionId, indexSet)`. It is not a generic hash of those fields. A verifier MUST use the view function on the pinned `ConditionalTokens` code or a bit-for-bit implementation of the pinned `CTHelpers` algorithm.

The position id is:

```text
positionId = uint256(
  keccak256(abi.encodePacked(address collateralToken, bytes32 collectionId))
)
```

These derivations identify the token. They do not establish its price, liquidity, oracle correctness, or legal meaning.

## Verification procedure

For each `position` object, a verifier performs these checks at the valuation's pinned block:

1. Match `positionContract` and `custodyAccount` against the active component and venue profiles. Match the pinned runtime-code hash and proxy implementation, if any.
2. Apply the ERC-165 procedure: require `supportsInterface(0x01ffc9a7) == true`, `supportsInterface(0xffffffff) == false`, and `supportsInterface(0xd9b67a26) == true` for ERC-1155.
3. Locate the contract's `ConditionPreparation` event for `conditionId`. Require its oracle, question id, and outcome slot count to equal the position entry.
4. Recompute `conditionId` with the packed encoding above and require an exact match.
5. Read `getOutcomeSlotCount(conditionId)`. Require it to equal `outcomeSlotCount` and to be from 2 through 256.
6. Let `fullIndexSet = 2^outcomeSlotCount - 1`, with `2^256 - 1` represented by the maximum `uint256`. Require `0 < indexSet < fullIndexSet`.
7. Call `getCollectionId(parentCollectionId, conditionId, indexSet)` and require an exact match with `collectionId`.
8. Call `getPositionId(collateralToken, collectionId)` and require the returned `uint256` to equal `positionId`.
9. Read `balanceOf(custodyAccount, positionId)`, or the equivalent entry in `balanceOfBatch`, and require it to equal `quantity`.
10. Apply the venue profile's binding between `positionId` and the traded instrument, such as the Polymarket CLOB `asset_id`.

A failed call, interface mismatch, event mismatch, derivation mismatch, or balance mismatch invalidates the position input. A venue-reported size cannot replace the pinned ERC-1155 balance.

## Inventory

ERC-1155 does not enumerate the token ids held by an account. PMVS-M1 reconstructs a candidate set from every `TransferSingle` and `TransferBatch` log that touches each declared custody account, without filtering by emitting contract. The scan begins at chain genesis or at a checkpoint that proves the complete starting contract-and-token-id set and balances. It treats logs as candidates, verifies the emitter and token interface, and reads each pinned balance. The active component and venue profiles then classify each nonzero token as supported, unsupported, or demonstrably unsolicited. An unknown token cannot silently enter NAV. A mere event-signature match is not proof that the emitter is an ERC-1155 contract.

The token id is a one-way hash, so transfer logs alone do not reveal its collateral, condition, or index set. Venue metadata MAY propose those preimages. `ConditionPreparation`, `PositionSplit`, `PositionsMerge`, and `PayoutRedemption` logs MAY also supply them. The verifier still performs every derivation above. A nonzero id with no unique, verifiable field set is `UNVERIFIABLE_INVENTORY` and cannot support L2 valuation.

An operator-maintained token list, open-order list, or venue API does not prove complete inventory. An unsolicited token remains in the inventory and follows the active profile's valuation or fail-closed rule.

## Lifecycle and payout

CTF can split collateral or a parent position into child positions. It can merge a valid partition into collateral or a parent position. The quantity minted or burned uses the same integer amount passed to the CTF operation.

A condition is resolved when `payoutDenominator(conditionId) > 0`. For a position's index set:

```text
positionPayoutNumerator = sum(
  payoutNumerators(conditionId, i) for every set bit i in indexSet
)

grossPayout = floor(
  quantity * positionPayoutNumerator / payoutDenominator(conditionId)
)
```

The multiplication uses checked full-precision arithmetic before the final floor.

For `parentCollectionId == 0`, `redeemPositions` burns the position and returns the collateral token. For a nonzero parent, redemption returns a parent position instead of cash. A venue profile MUST define the complete route from that result into the accounting asset before M1 may treat it as a redemption mark.

## Boundaries and risks

- This profile proves token identity, balance, and CTF state at pinned blocks. It does not prove that the oracle answer, question wording, or market resolution is correct.
- `setApprovalForAll` grants an operator authority over every CTF token held by an account. A deployment records the operator set and treats each approved operator as part of the custody threat model.
- Position ids can match across different CTF contracts. Verifiers always include chain id and contract address.
- ERC-1155 compatibility does not imply CTF compatibility. A wrapper, bridge representation, off-chain venue balance, or Polymarket PositionManager token needs another versioned position profile.
- Polymarket Combo positions use its separate Positions Framework. They are outside this profile even though PositionManager also implements ERC-1155.

## Primary references

- [Gnosis Conditional Tokens developer guide](https://github.com/gnosis/conditional-tokens-contracts/blob/master/docs/developer-guide.rst)
- [Pinned `CTHelpers.sol` at `eeefca6`](https://github.com/gnosis/conditional-tokens-contracts/blob/eeefca66eb46c800a9aaab88db2064a99026fde5/contracts/CTHelpers.sol)
- [Pinned `ConditionalTokens.sol` at `eeefca6`](https://github.com/gnosis/conditional-tokens-contracts/blob/eeefca66eb46c800a9aaab88db2064a99026fde5/contracts/ConditionalTokens.sol)
- [ERC-165](https://eips.ethereum.org/EIPS/eip-165)
- [ERC-1155](https://eips.ethereum.org/EIPS/eip-1155)

## Copyright

Copyright and related rights on this document's text are waived via CC0-1.0.
