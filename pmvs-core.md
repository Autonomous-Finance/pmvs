# PMVS Part I. Vault model and common requirements

```
pmvs-part:      core
version:        1 (draft)
status:         Pre-EIP review draft
author:         Ivan Morozov (Zeit Finance)
created:        2026-08-18
discussion:     not yet opened
```

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119 and RFC 8174 only when they appear in all capitals.

## Abstract

PMVS specifies a prediction-market vault. It issues fungible ERC-20 **vault shares** to investors and holds prediction-market **outcome positions** inside a declared custody perimeter. Each vault share is a pro-rata unit of declared net asset value (NAV). It remains the same token while the portfolio changes.

A common modular layout places trading collateral and Gnosis Conditional Tokens Framework (CTF) ERC-1155 positions in declared strategy custody. The share-vault contract controls the ERC-20 supply and may buffer the accounting asset during settlement. It need not hold the outcome positions, and PMVS does not require this exact module split.

The `(chainId, shareToken)` pair identifies the vault. This Part defines its accounting asset, custody perimeter, component roles, lifecycle, and minimum holder protections. It also defines the records and on-chain commitments required to reproduce settlement calculations and compare recorded chain inputs with pinned Ethereum state.

Part II defines asynchronous settlement. Part III defines PMVS-M1 valuation. Profiles bind contract interfaces, venues, storage systems, and watcher methods without placing deployment-specific facts in the core.

Version 1 can verify signed records, chain state, and each implemented deterministic arithmetic check after its inputs are bound. It cannot yet reproduce a complete PMVS-M1 valuation. It also cannot prove that an unsigned venue response was true. It has no challenge period, fraud proof, bond, or veto.

## Motivation

The existing CTF protocol defines how collateral becomes outcome positions and how those positions merge or redeem. PMVS starts above that layer. It defines how a vault holds, values, and settles a portfolio of positions while investors hold one ERC-20 vault share.

An outcome position is tied to one market and one payout condition. It is designed to settle and be redeemed when that market resolves, so it is a poor long-term fundraising token. The vault sells, merges, or redeems it before moving capital into another market. A managed strategy holds many positions and enters new markets. Direct ownership would force investors to track changing ERC-1155 ids, resolution states, and venue operations.

The ERC-20 vault share is a continuing funding unit. Investors enter and exit in one accounting asset while the vault keeps the changing portfolio in custody. Wallets and protocols integrate the share without integrating each outcome position.

ERC-20 defines token balances and transfers. It leaves custody, NAV, entry and exit pricing, fees, request states, claim funding, migration, and closure unspecified. PMVS defines those vault semantics and binds settlement-bearing facts to canonical records.

The operator may control both venue-data capture and settlement submission. Canonical records bind its inputs and calculations to the resulting vault state.

PMVS can use Boring Vault's separation of share issuance, accounting, and asset movement. It neither requires nor extends a Boring Vault interface. Component records declare actual powers and custody instead of inferring them from contract or role names.

## Scope

Version 1 standardizes:

- one stable subject identity for a prediction-market vault and its ERC-20 share;
- the share's economic meaning and the vault's accounting asset;
- the custody perimeter for cash, outcome positions, claims, and liabilities;
- required component roles and minimum vault invariants;
- asynchronous entry, exit, migration, and closure semantics;
- versioned component generations beneath that identity;
- canonical records and ordered record streams;
- EIP-712 attestations by EOAs and ERC-1271 contract accounts;
- registry and atomic anchor modes;
- deterministic verifier results; and
- conformance levels for settlement, valuation, and publication continuity.

Version 1 does not standardize market selection, trading strategy, legal ownership, token distribution, fundraising terms, secondary-market liquidity, venue truth, or loss remediation. A conformance claim does not approve an investment or prove that the share is fairly priced.

Core v1 is EVM-specific. It uses Ethereum chain ids, 20-byte addresses, Keccak-256, ABI encoding, EIP-712, and EVM anchor events. A non-EVM port can preserve the vault semantics, but it needs a new core version with explicit identity, signature, and anchor rules.

## Design rules

1. The investor share and the outcome positions are different economic objects. A vault MUST NOT describe one outcome token as a share of the whole portfolio.
2. The vault includes every account that controls portfolio cash, positions, claim funding, or liabilities. Moving an asset between declared custody components MUST NOT change NAV.
3. The core contains only facts shared across implementations. A venue endpoint, chain deployment, storage network, or custom ABI belongs in a versioned profile.
4. A verifier never guesses behavior from a filename, URI, failed RPC call, or unrecognized field.
5. Every settlement-bearing quantity uses integer arithmetic with declared units and rounding.
6. A record preserves the assertion that existed at the time. Corrections add history and never replace bytes.
7. Interface support, vault solvency, record integrity, reproducible arithmetic, and truth of external data are separate claims.

## Vault architecture

A PMVS vault consists of one share token plus its declared components and custody accounts. A single contract may implement several roles. The component record MUST identify every role, each on-chain component or authority, and each off-chain capture or valuation engine.

| Component role | Required responsibility |
|---|---|
| Share vault | Implements the ERC-20 share, controls supply, and may buffer the accounting asset during settlement |
| Settlement component | Accepts deposits and redemption requests, escrows inputs, and moves requests through their declared states |
| Teller | Mints or burns shares and transfers the accounting asset only under settlement rules |
| Accountant | Stores or exposes the price per share and the fee state used by settlement |
| Strategy manager | Moves capital into strategy custody and directs trades within declared permissions |
| Strategy custody | Holds trading collateral, outcome positions, resolved claims, and venue receivables within the vault perimeter |
| Valuation method | Converts every declared asset and liability into the accounting asset and computes NAV and price per share |
| Governance and operating authorities | Control upgrades, settlement, valuation, fees, and custody under separate declared permissions |

The common modular flow is:

```text
investor
   |  deposit asset or redemption shares
   v
settlement component
   |
   v
teller  <------  accountant  <------  valuation method
   |
   v
share vault and settlement buffer
   |
   v
strategy custody  ------>  prediction-market outcome positions
   ^
   |
strategy manager
```

An external strategy wallet may hold the outcome positions while the share vault holds only an accounting-asset buffer. The component record places that wallet inside the custody perimeter, and each valuation includes its balances.

Component roles describe powers, not Solidity names. A contract field named `manager` is not a PMVS strategy manager unless its declared permissions include directing position operations. A Boring Vault role name also does not establish compatibility with an upstream BoringVault interface.

## Minimum vault invariants

Every conforming subject satisfies these rules:

1. The share token implements ERC-20 and represents fungible, proportional units of one declared vault NAV. It does not encode one market, condition, or outcome.
2. The active component generation declares one accounting asset and its decimals. Deposits, redemptions, NAV, price per share, and fees use that unit unless a named profile defines an exact conversion.
3. Every outcome position follows a declared position profile that defines its identity, balance source, and payout state.
4. Every outcome position, cash balance, receivable, claim reserve, and liability in the vault perimeter appears in valuation or in a declared exclusion with a reason.
5. A supply increase corresponds to an accepted deposit, a declared fee mint, migration, or another profile-defined event. A supply decrease corresponds to an accepted redemption, migration, or declared burn.
6. A deposit cannot receive shares from a valuation that omits existing holder assets. A redemption cannot receive assets from a valuation that omits liabilities or unfunded claims.
7. A request has explicit pending, claimable or selected, claimed, cancelled, and failed behavior. The active settlement profile states every transition and who can trigger it.
8. Component migration preserves every outstanding share, pending request, funded claim, reserve, and recovery right through a new anchored `components` record. It does not use `retirement-final`. Core v1 retirement is subject-only. Its record has `scope: "subject"`, `migration: null`, and zero `finalSupply`, `pendingRequests`, `outstandingClaims`, and `claimFunding`. Its closed `residualPositions`, `residualCash`, `feeAccruals`, and `liabilities` arrays are ordered by unique id. Each positive item names a completed resolution that predates finalization. `recovery` declares either no rights or a positive, exhaustive manifest whose rights were resolved before finalization. The registered wrapper reads and rechecks the four zero counters. Its protected anchor transition sets the anchor's persisted subject-final flag, and the wrapper sets the settlement terminal flag, binds the exact record hash and sequence, and emits both closure events. It executes no resolution. An independent verifier checks the residual and recovery evidence and proves that the complete custody and accounting perimeters are empty.
9. ERC-4626, ERC-7540, and ERC-7575 support are separate interface claims. PMVS conformance does not excuse an incomplete implementation of another standard.

## Definitions

- **Outcome position**: a claim tied to one market outcome. A venue may call it an outcome share or outcome token. It may be a CTF ERC-1155 token, another token type, or an entry in venue custody. It is an asset of the vault, not the PMVS share.
- **Conditional Tokens Framework (CTF)**: the Gnosis protocol that defines collateral-backed conditions, outcome collections, positions, splitting, merging, resolution, and redemption. Its positions implement ERC-1155. CTF is not an ERC.
- **Positions Framework**: Polymarket's separate protocol for combinatorial positions. Its PositionManager issues ERC-1155 tokens, but those tokens are not CTF positions.
- **Prediction-market vault**: the share token, components, custody accounts, assets, liabilities, authorities, and lifecycle rules that form one PMVS subject.
- **Subject**: the economic vault identified by `(chainId, shareToken)`. An adapter or entry contract is not the subject because it may change while the share remains in circulation.
- **Custody perimeter**: every address and venue account whose balances, positions, receivables, reserves, or liabilities belong to the subject.
- **Share token**: the ERC-20 that denotes proportional NAV units of the subject. Its decimals and transfer restrictions are declared. EIP-2612 support is optional.
- **Share vault**: the contract that implements the share token and controls its supply. It may also hold a temporary accounting-asset buffer.
- **Accounting asset**: the asset in which NAV, price per share, deposits, withdrawals, and fees are stated. A profile declares its address, decimals, and unit. A subject may hold other cash assets, but the valuation method converts them into this unit.
- **Price per share (PPS)**: the accounting-asset value assigned to one scaled unit of the ERC-20 share under the active valuation and fee rules.
- **Settlement component**: the contract or group of contracts that accepts and settles deposit and redemption requests.
- **Teller**: the component authorized to mint and burn share supply and to move the accounting asset during settlement.
- **Accountant**: the component that stores or exposes the settlement price per share and related fee state.
- **Strategy manager**: the component or authority that moves capital into strategy custody and directs permitted position operations.
- **Strategy custody**: the component or declared account that holds trading collateral and outcome positions for the subject.
- **Fee beneficiary**: the account entitled to claim accrued fee shares or fee assets. It is distinct from the strategy manager, fee authority, and any contract field named `manager`.
- **Operator**: the off-chain actor that captures data, computes records, or submits settlement. The operator is not automatically an authority.
- **Authority**: an on-chain role empowered to perform a class of privileged action. PMVS distinguishes five authorities. The **settlement authority** executes epoch rolls. The **valuation authority** publishes attempt-indexed gross PPS. The **fee authority** sets the performance-fee rate. The **custody authority** moves collateral between system components and external custody. **Governance** rotates the other four. Their addresses MAY differ and MAY rotate independently.
- **Component generation**: one declared configuration of contracts, authorities, profiles, and policy parameters beneath a subject.
- **Record**: one canonical JSON assertion. Record kinds include components, valuations, settlement archives, receipts, retirement steps, corrections, and gaps.
- **Subject stream**: the ordered hash chain of records about one subject.
- **Watcher stream**: a separate ordered hash chain published by one watcher about one subject. Watcher records never occupy sequence numbers in the subject stream.
- **Anchor**: an on-chain commitment to a record's hash.
- **Verifier**: any third party executing the verification procedures of Parts I through III.
- **Watcher**: an independent party publishing its own contemporaneous venue observations (profile `watcher/0`, experimental).
- **Epoch / roll**: see Part II.
- **Retirement states**: two conditions that MUST remain distinct. *Wind-down opened* is the application-level decision to stop normal operation. *Terminal retirement* is the irreversible on-chain state after which the contract rejects every new request and roll. A positive-price settlement during wind-down uses a fresh attempt-indexed valuation under Part II; no earlier wind-down price carries forward.

### Version axes

PMVS keeps five version axes separate:

1. The **Part version** identifies this text.
2. A record's **schema and schema version** define its fields.
3. A **profile identifier** selects an interface, venue, storage, leaf, or watcher rule set.
4. A **settlement version** selects arithmetic or transaction-order semantics inside a settlement profile.
5. A **component generation** identifies the deployed configuration in force.

A verifier MUST NOT infer one axis from another. Feature presence, such as cancellation or request pausing, is reported as a capability and not encoded as a settlement version. An unrecognized behavior-selecting version produces `UNSUPPORTED_PROFILE`.

## Subject identity and component graph

1. Every record MUST identify its subject as `(chainId, shareToken)`, both fields canonical: a decimal-string chain id and a lowercase `0x` address.
2. `subjectId` is defined as `keccak256(abi.encodePacked(uint256 chainId, address shareToken))`. Test vector: `chainId = 137`, `shareToken = 0x4aff8269a587643f68aa8e58c5ad93d9423e8624` gives `subjectId = 0x119eba4ba90359458811e719965925e255c3537b907914b6428f775c8d297892`.
3. The share token MUST implement ERC-20. Each unit denotes the same proportional NAV interest as every other unit of that token, subject only to declared fees and transfer restrictions. It MUST NOT represent a specific outcome position.
4. The first component record MUST state `share.decimals`, `share.initialPps`, and `share.economicUnit: "pro-rata-nav"`. `initialPps` uses the `10^18` PPS scale and MUST be positive. The record MUST also state whether transfers can be paused, blocked, taxed, rebased, allow-listed, or changed by an administrator. A false capability statement is a component mismatch. ERC-2612, ERC-4626, ERC-7540, and ERC-7575 support are separate claims under their named conformance profiles. PMVS conformance alone implies none of them.
5. The component record MUST contain a `portfolio` object. It declares `kind: "prediction-market"`, the custody model, the supported position-profile ids, and whether entry and exit use the accounting asset or a named profile conversion.
6. Each subject MUST directly anchor a `components` record as its subject-stream genesis before claiming conformance. Every later component generation MUST also be directly anchored before a changed component or policy governs a covered action.
7. A component record MUST contain the subject, `subjectId`, generation number, previous component-record hash, accounting asset and decimals, share terms, portfolio declaration, interface support, settlement profile, anchor profile, valuation method, venue profile, storage profile, chain confirmation depth, publication windows, and every behavior-selecting parameter used by those profiles.
8. It MUST list each contract or account that can hold subject assets, mint or burn shares, accept requests, settle requests, set valuation, charge fees, anchor records, or move custody. Each entry contains its role, chain id, address, runtime-code hash, and proxy implementation data when applicable. An EOA component uses the zero code hash and is labeled `eoa`. Venue accounts that have no EVM address use the account form defined by the venue profile.
9. It MUST identify at least the share-vault, settlement, Teller, Accountant, strategy-manager, strategy-custody, and anchor roles. One address MAY hold more than one role. A subject with no separate Teller, Accountant, or strategy-manager component labels the contract or authority that performs the equivalent action.
10. It MUST list each direct or delegated privileged capability. A capability binds one operation to its caller, target, selectors, effect, mutability, and rotation authority. The list covers minting, burning, settlement, transfers, approvals, signing, configuration, upgrades, and anchoring. An indirect power, such as replacing an authority, implementation, module, guard, signer, relayer, or destination, is a separate capability. A name such as `owner` or `manager` is never enough.
11. It MUST list the current holder of each PMVS authority and the on-chain source used to resolve that holder. If no getter or event history makes a role independently recoverable, the component record MUST say `source: "attested"`; records governed by that role cannot pass historical authority verification and receive `UNVERIFIABLE_AUTHORITY`.
12. All modules that read the accounting asset MUST resolve to the same `(chainId, address, decimals)` at the activation block. Changing one cached or mutable asset reference in isolation is forbidden. An asset change requires an atomic migration or a new component generation that keeps settlement paused until every dependent module is synchronized and verified.
13. Component migration over the same share token creates a new component record with `components` and `supersedes` set to the active record hash. The old history remains valid. The new record commits an activation nonce, an expected active tuple, an inclusive block window, ordered on-chain checks, and the migration declaration. It MUST show how every pending request, unclaimed settlement, escrowed balance, custody position, approval, and authority obligation remains reachable. It MUST also show that the prior generation's powers are revoked or constrained before activation completes. A migration with no complete path is not conforming.
14. A component record MUST NOT contain the transaction hash, block hash, block number, transaction index, or log index of its future activation. The semantic verifier reserves and rejects the keys `transactionHash`, `txHash`, `blockHash`, `blockNumber`, `transactionIndex`, `txIndex`, and `logIndex` anywhere in a component record's open objects, including `migration`, `profileParameters`, extension values, and `meta`. Those facts are post-action receipt evidence and do not form part of `recordHash` or `actionCommitment`.
15. If the anchor contract changes, governance signs and anchors the new component record through the old contract. Its migration declaration lists each continuing watcher head but does not repeat the candidate's own future record hash. The activation transaction derives the subject head from its `recordHash` argument, freezes that exact old-anchor head and every listed watcher head, imports them into the new anchor, performs the declared migration, checks the resulting state, updates discovery, and emits the activation event. All steps succeed or revert together. Later attestations use the new anchor in their EIP-712 domain. Reusing an existing stream from an empty head would break its history and is not conforming.
16. Records never span subjects. Internal database identifiers MAY appear under `meta`, but MUST NOT replace subject identity or any on-chain key.

Interface claims separate detection from behavior. For an ERC-165 claim, the
verifier makes a `STATICCALL` with a 30,000 gas limit, first to
`supportsInterface(0x01ffc9a7)` and then to
`supportsInterface(0xffffffff)`. The first call must return ABI `true`; the
second must return ABI `false`. It then checks each claimed interface id under
the same rules. A revert, short return, malformed Boolean, or exhausted call
is a failed claim. ERC-20, ERC-2612, and ERC-4626 are behavioral standards and
do not become valid merely because a contract returns an ERC-165 value. Their
named conformance profiles specify callable and state-transition tests.

### Subject discovery

Knowing the ERC-20 address must be enough to find the current PMVS configuration. A conforming share token implements this discovery surface and ERC-165:

```solidity
interface IPMVSSubjectDiscovery {
    function pmvsAnchor() external view returns (address);
    function pmvsComponents() external view returns (bytes32 recordHash, uint64 generation);
    function pmvsActivationNonce() external view returns (uint64);
}

event PMVSComponentsUpdated(
    bytes32 indexed recordHash,
    uint64 indexed generation,
    address indexed anchor,
    uint64 nonce,
    bytes32 actionCommitment
);
```

The selectors are `0x5847c21e` for `pmvsAnchor()`, `0xdede8119` for
`pmvsComponents()`, and `0xb3d6a144` for `pmvsActivationNonce()`. Their XOR is
the ERC-165 interface id `0x354fe243`. Before conformance begins, the address,
record hash, generation, and nonce MUST all be zero. Once active, the getters
MUST identify the directly anchored component record, its generation, its
anchor, and the last successful activation nonce. The record MUST identify the
same share token, generation, and anchor.

The component record commits the action that may activate it, but not the
record's own hash. This removes the fixed point that would arise if a record
contained the hash or log position of a transaction whose calldata or event
contained `recordHash`. Its closed `activation` object contains:

- `nonce`, the intended exact-next activation nonce;
- `actionCommitment`, calculated below;
- `conditions.expectedActive`, which is `null` for genesis or the exact active
  `(recordHash, generation, anchor)` tuple for an update;
- an inclusive `validFromBlock` and `validThroughBlock`; and
- `checks`, strictly ordered by unique `id`. Each check contains a nonzero
  target, calldata, and the expected hash of the complete return bytes.

The two commitment type strings are exact:

```text
PMVSActivationCondition(bytes32 idHash,address target,bytes32 callDataHash,bytes32 expectedReturnDataHash)
PMVSComponentActivation(uint256 chainId,address shareToken,bytes32 subjectId,uint64 streamSequence,bytes32 streamPrev,uint64 nonce,bool expectedActiveExists,bytes32 expectedActiveRecordHash,uint64 expectedActiveGeneration,address expectedActiveAnchor,uint64 newGeneration,address newAnchor,uint64 validFromBlock,uint64 validThroughBlock,bytes32 migrationHash,bytes32 checksHash)
```

Their type hashes are `keccak256` of the UTF-8 type strings:

```text
PMVS_ACTIVATION_CONDITION_TYPEHASH = 0xf4efdc987c7a892232dc714e8dbdb048305d54d3f2b907ca3c92ec826d1847b5
PMVS_COMPONENT_ACTIVATION_TYPEHASH = 0x563f159cebc787ed3f208d852ac1b05e8d669fdf8e03cdfcaa9abb3ba8cf4dce
```

For each check in its declared order:

```text
conditionHash = keccak256(abi.encode(
    PMVS_ACTIVATION_CONDITION_TYPEHASH,
    keccak256(UTF8(id)),
    target,
    keccak256(callData),
    expectedReturnDataHash
))

checksHash = keccak256(abi.encode(bytes32[] conditionHashes))
migrationHash = migration == null
    ? bytes32(0)
    : keccak256(UTF8(PMVS-JCS(migration)))
```

The action commitment is:

```text
actionCommitment = keccak256(abi.encode(
    PMVS_COMPONENT_ACTIVATION_TYPEHASH,
    chainId,
    shareToken,
    subjectId,
    streamSequence,
    streamPrev,
    nonce,
    expectedActiveExists,
    expectedActiveRecordHash,
    expectedActiveGeneration,
    expectedActiveAnchor,
    newGeneration,
    newAnchor,
    validFromBlock,
    validThroughBlock,
    migrationHash,
    checksHash
))
```

For `expectedActive: null`, the existence flag is `false`, its hash and
generation are zero, and its anchor is the zero address. The commitment
deliberately omits `recordHash`. The later event binds the already known record
hash to the committed action. The event signature is
`PMVSComponentsUpdated(bytes32,uint64,address,uint64,bytes32)` and its topic is
`0x59aea3a41f3d49292c360c978eec343e43c6fd1b81850fc5a64abab4c5b72b5d`.

The executable nonempty vector uses chain `137`, share token
`0x4aff8269a587643f68aa8e58c5ad93d9423e8624`, subject id
`0x119eba4ba90359458811e719965925e255c3537b907914b6428f775c8d297892`,
stream sequence `4`, predecessor
`0x2222222222222222222222222222222222222222222222222222222222222222`,
nonce `2`, active record
`0x3333333333333333333333333333333333333333333333333333333333333333`
at generation `0` and anchor
`0x0000000000000000000000000000000000000001`, new generation `1` at the
same anchor, blocks `10` through `20`, and migration
`{"mode":"same-anchor"}`. Its one check has id `settlement-paused`, target
`0x0000000000000000000000000000000000000002`, calldata `0x12345678`, and
expected return-data hash
`0x1111111111111111111111111111111111111111111111111111111111111111`.
The results are:

```text
checksHash = 0xd2fc7f12fd8de5c06d28a3affe1dd9d54529b95210fab89136db1670f5850d30
migrationHash = 0x86d0987a15890e51bce9830d9addccbdfc665c011e5593f46247de7523b53103
actionCommitment = 0xaa7f7d29c88a4a364c4d096f30d7810bea2c16a83c44ff87dfcc9354ac85f912
```

Genesis uses an explicit bootstrap. Its component record occupies subject
sequence zero, has zero `context.prev`, `components`, and `supersedes`, uses
generation zero and nonce one, declares `expectedActive: null` and
`migration: null`, and is signed with the declared anchor in its EIP-712
domain. Bootstrap governance anchors that kind-4 record. The activation then
requires that exact `(sequence, kind, recordHash)` anchor head before updating
discovery and emitting the event. No PMVS conformance claim exists before the
activation transaction completes successfully.

For every later generation, `expectedActive` MUST equal the discovery tuple
that is active before the transaction. `components` and `supersedes` MUST equal
that active record hash. The generation MUST be exactly one greater. The
record is signed and anchored under the active anchor, even when it declares a
new anchor. Its nonce MUST be one greater than the last successful activation
nonce, and its migration object MUST be non-null.

The activation path performs these checks and changes as one transaction:

1. Authenticate bootstrap governance for genesis or governance from the active
   generation for an update.
2. Require the committed chain id, share token, subject id, stream sequence,
   stream predecessor, expected active tuple, generation, anchors, nonce, and
   inclusive block window. Recompute `actionCommitment` from the supplied
   values and require equality with the supplied commitment. The verifier
   later requires that value to equal the one inside the anchored record.
3. Require the anchor that committed the candidate to hold its exact
   `(sequence, kind 4, recordHash)` subject head. This is the declared anchor
   for genesis and the active anchor for an update. When the anchor changes,
   atomically freeze each declared old head, import the exact subject and
   continuing watcher heads into the new anchor, and require the imported new
   subject head to equal the candidate tuple.
4. Perform only the declared migration actions. Then execute every activation
   check with `STATICCALL`; require success and
   `keccak256(returnData) == expectedReturnDataHash`.
5. Store the new discovery tuple and nonce, then emit exactly one
   `PMVSComponentsUpdated` event from the share token with the committed five
   values.

A revert removes every freeze, import, migration change, discovery update, and
event. The old generation remains active. The activation transaction MUST NOT
contain an ordinary covered settlement, valuation-dependent share action, or
retirement action. This makes transaction completion the activation boundary;
an event's position inside that transaction is not a mid-transaction boundary.
Every later covered action MUST use the new generation.

Receipt evidence is gathered after the action and kept outside the hashed
record. A verifier requires a successful, non-removed canonical receipt after
the candidate's canonical anchor, the exact event emitter, topic and five
values, proof that `nonce` is one greater than the last successful activation
nonce, the exact kind-4 anchor head, matching `pmvsAnchor` and `pmvsComponents`
post-state, a matching `pmvsActivationNonce` post-state, successful governance
authorization and checks, no ordinary covered action, and the component
generation's declared confirmation depth. Genesis also requires the zero
discovery tuple and nonce before the transaction. A
reorganization that removes the anchor or activation invalidates that evidence.

An anchored candidate with no such receipt is `UNEXECUTED_ACTIVATION`. It stays
in subject-stream history but consumes neither a generation nor an activation
nonce. A later candidate advances the subject sequence and predecessor while
reusing the still-intended next generation and nonce. Its `components`,
`supersedes`, and `expectedActive` still name the generation that remains
active.

Off-chain tags, filenames, APIs, and storage indexes MAY help locate bytes, but none can replace this on-chain discovery path.

### Portfolio declaration

The component record's `portfolio` object has these fields:

| Field | Meaning |
|---|---|
| `kind` | MUST be `prediction-market` in Core v1 |
| `custodyModel` | `direct` when the share vault holds all positions, `external-strategy` when declared strategy accounts hold them, or `hybrid` when both do |
| `positionFormats` | Nonempty list of versioned position-profile ids used by the portfolio, such as `position/gnosis-ctf/1` |
| `entryAssetMode` | `accounting-asset` or `profile-defined` |
| `exitAssetMode` | `accounting-asset` or `profile-defined` |

`economicUnit: "pro-rata-nav"` is an accounting definition. It means that each fungible share uses the same NAV and price-per-share basis within its component generation. It does not create a legal ownership claim beyond the rights supplied by the deployment.

Each `positionFormats` entry uses `position/<protocol>/<positive-version>`, where `protocol` is a lowercase ASCII slug. Entries sort in ascending UTF-16 code-unit order. The selected profile defines position identity, balances, transfer events, lifecycle state, and payout reads. ERC-1155 alone is a token interface and is not a complete prediction-market position profile.

An `external-strategy` or `hybrid` subject MUST list every strategy-custody account under its venue profile and in the component record or its closed profile parameters. Part III reconstructs inventory across all of them. A custody-model or position-format change creates a new component generation before the new configuration receives or moves subject assets.

The raw label `erc1155` is invalid in `positionFormats` because it names only a token interface, not prediction-market semantics. An unpublished record using it must be regenerated. If such bytes were anchored, the deployment publishes a new component generation and preserves the old record. Published bytes are never silently rewritten. After a schema release, changing the accepted identifier form requires a new schema version.

## PMVS-JCS/1: canonical serialization

Records are serialized with a restricted profile of RFC 8785 (JCS), named PMVS-JCS/1:

1. **Scalars.** Permitted scalar types are string, boolean, and `null`. JSON numbers are forbidden anywhere in a record. A serializer encountering a number MUST fail; a verifier encountering one MUST return `INVALID_ENCODING`.
2. **Integers.** Numeric quantities are decimal strings matching `0|[1-9][0-9]*`, optionally preceded by `-` only where a field is explicitly signed. No leading zeros, no `+`, no `-0`, no decimal point, and no exponent. Each schema field declares a signed or unsigned bit width. An unsigned `w`-bit value is in `[0, 2^w - 1]`. A signed `w`-bit value is in `[-2^(w-1), 2^(w-1) - 1]`. Quantities use declared base units, never fractional JSON values.
3. **Hex.** Addresses are lowercase `0x` plus 40 hex characters; hashes are lowercase `0x` plus 64. Mixed-case (checksum) forms are invalid inside records.
4. **Objects.** Keys are sorted by UTF-16 code units (JCS order). Duplicate keys are invalid. A parser that silently discards duplicates is not a conforming verifier: verification MUST operate on raw bytes and reject duplicates before parsing (`INVALID_ENCODING`).
5. **Strings.** ECMAScript `JSON.stringify` escaping (the JCS string rule). Input MUST be valid Unicode; unpaired surrogates are invalid. Encoding is UTF-8 without BOM. No insignificant whitespace. PMVS performs no Unicode normalization. Producers SHOULD use NFC for human text, but verifiers MUST hash the published code points without changing them.
6. **Arrays.** Order is significant and defined per schema field. Arrays never carry set semantics.
7. **I-JSON.** Records MUST satisfy RFC 7493.

Set-like arrays use these default orders unless a profile gives a stricter
order. `contracts` sorts by role, numeric chain id, then lowercase address.
`interfaces` sorts by id then contract. `authorities` uses the fixed role order
settlement, valuation, fee, custody, governance. `capabilities`, extensions,
and evidence lines sort by id. Chain-state entries sort by numeric chain id;
their reads sort by read id. Raw responses sort by source, numeric start time,
then byte hash. Locations sort by UTF-16 code-unit order. All such arrays reject
duplicate sort keys. Request ids and claim entries sort by numeric request id.
A Merkle proof is different: its array preserves bottom-up tree-path order.
Position holdings, outputs, and books use the orders in Part III and the active
venue profile.

The published bytes MUST already be canonical: `recordHash` is computed over the exact published bytes. A verifier also re-canonicalizes the parsed document and requires byte equality.

Canonicalization vector (an illustrative record fragment; input keys deliberately unordered):

```
canonical:
{"context":{"epoch":"7","kind":"roll","prev":"0x0000000000000000000000000000000000000000000000000000000000000000","sequence":"42"},"outputs":{"pps":"1100000000000000000","ünicode":["true-string",true,null]},"schema":"pmvs/valuation-record","schemaVersion":"1","subject":{"chainId":"137","shareToken":"0x4aff8269a587643f68aa8e58c5ad93d9423e8624"}}

recordHash = keccak256(utf8(canonical))
           = 0x12cff343cf51e23a8963e06de305bdfab292fccc199639c9f8bea4992d26fe5c
```

Note that `"ünicode"` (U+00FC) sorts after `"pps"`: key order is UTF-16 code-unit order, not locale order. Grammar rejection vectors: `"01"`, `"+1"`, `"-0"`, `"1.0"`, `"1e0"`, and `""` are all invalid integer lexemes.

## Record envelope, hashing, chaining

Every published artifact is an envelope:

```jsonc
{
  "record": { /* the hashed region; schema depends on record kind */ },
  "attestation": {
    "recordHash": "0x…",          // keccak256(PMVS-JCS bytes of `record`)
    "scheme": "eip712-ecdsa" | "eip712-erc1271",
    "verifyingContract": "0x…",   // active anchor contract
    "streamId": "0x…",
    "previousAnchor": "0x…",
    "signer": "0x…",
    "signature": "0x…"
  },
  "locations": [ "ar://…", "https://…" ]   // transport hints; not hashed
}
```

Core v1 caps the canonical `record` at 16,777,216 UTF-8 bytes, 64 nested
containers, 65,536 items in one array, and 65,536 members in one object. A
profile MAY set lower limits. Verifiers enforce the byte and depth limits
before unbounded allocation or recursion. Oversized raw venue responses use
hash-bound sidecars; they do not enlarge these record limits. A record that
exceeds a limit is `INVALID_ENCODING`.

1. `recordHash = keccak256(canonicalBytes(record))`.
2. The attestation and locations are outside the hashed region to avoid a cycle. A location is only a transport hint. A verifier trusts bytes only after checking their hash, signature, and anchor.
3. Every record has `schema`, `schemaVersion`, `subject`, `components`, `context`, and `extensions`. `components` is the hash of the component record that governs production of that record. The genesis component record uses the zero hash. A later component record is governed by the active predecessor and sets both `components` and `supersedes` to that predecessor's record hash. Once the update activates, later records use the new component-record hash.
4. In a subject-stream record, `context` contains `stream: "subject"`, `kind`, `sequence`, `prev`, and `producedAt`. `sequence` is a `uint64` decimal string. It starts at `"0"` and increases by one. `prev` is the preceding record hash or zero at genesis.
5. In a watcher record, `context` contains `stream: "watcher"` and `producer`, the lowercase watcher address. Its sequence and `prev` form a separate chain keyed by `(subjectId, producer)`. It does not change the subject stream.
6. Each record is closed by its base schema and every named profile schema. An undeclared field is `INVALID_ENCODING` unless it appears under `meta` or in `extensions`. The base schema delegates only the subobjects named in its schema notes, such as profile parameters and venue evidence. A conforming verifier applies the selected profile schema to each delegated object. `meta` is hash-bound but MUST NOT change verification behavior. Each extension has `{ "id": "…", "critical": true|false, "value": … }`. A verifier preserves every unknown extension. It returns `UNSUPPORTED_PROFILE` for an unknown critical extension. It may ignore only the behavior of an unknown non-critical extension.
7. Core v1 `retirement-final` is subject-only. Its reason cannot be `superseded`, and its `migration` value is null. Publishing, signing, or anchoring that record does not terminate the subject. Only the registered atomic kind-7 transition defined in Part II can change the anchor's persisted `subjectFinalized(subjectId)` flag from false to true, while the same transaction sets the settlement terminal flag. After that successful action, the anchor accepts only subject-stream kind-8 corrections, and semantic verification requires `changesSettlementBearingOutput: false` on each one. Component generation replacement uses an anchored `components` migration instead, before subject retirement.

The normative v1 machine shapes are in [`schemas/pmvs-envelope-v1.schema.json`](./schemas/pmvs-envelope-v1.schema.json). JSON Schema does not replace raw-byte canonicality, signature, profile, cross-field, or chain-state checks.

```
subject stream:  [0]* <-prev- [1]* <-prev- [2]* <-prev- [3]*
                   A              B              C              D

For D:
recordPrev = previousAnchor = hash([2])
sequence   = 3
```

The asterisk means that the record is directly anchored. PMVS v1 does not
use retrospective or transitive coverage. A batch transaction may commit
several records, but it validates and advances the head once per record in
strict sequence.

### What the chain does and does not provide

The hash chain is fork-detecting, not append-only. A signer can issue two different records with the same `(subjectId, streamId, sequence, prev)`. Therefore:

- Two attested records in the same stream with equal `(sequence, prev)` and different hashes are equivocation. `EQUIVOCATION` remains part of that stream's record history even if only one branch was anchored.
- An anchor commits one record at one stream position. It does not prove that an unanchored fork never existed, and it does not prove cadence by itself.
- A component record that claims L3 declares `cadenceOrigin`, `cadenceSeconds`, and `publicationGraceSeconds`. Slot `n` is `[origin + n * cadence, origin + (n + 1) * cadence)`. Exactly one periodic valuation or gap record names each elapsed slot. A gap record gives a plain explanation and one reason: `venue_unavailable`, `chain_unavailable`, `operator_unavailable`, `unsafe_capture`, `storage_unavailable`, or `other`. A gap is evidence of missing data, not a substitute valuation.
- A record published after its slot's grace carries `late: true` and receives `STALE`. A later correction cannot make the original publication timely.
- A correction names `targetHash`, a reason code, whether settlement-bearing outputs change, and the replacement assertion. It never removes the target. If the target affected an executed settlement, the correction MUST state the on-chain effect and any remediation. A correction cannot turn a mismatched executed settlement into `VALID`.
- Every periodic valuation and gap record is directly anchored. A deployment that publishes records without anchoring them does not satisfy the record-chain requirements of this version.

## Attestation

1. Each subject-stream record MUST be signed by the declared authority for its kind. Settlement archives and receipts use the settlement authority. Valuations use the valuation authority. The component record assigns components, retirement, gap, and correction records to one of the five PMVS authorities. A watcher record is signed by its `producer`, not by a subject authority.
2. The signature scheme is EIP-712 over domain `{ name: "PMVS-Attestation", version: "1", chainId, verifyingContract }`. `verifyingContract` is the active anchor contract in the component record. The anchor SHOULD expose this domain through ERC-5267. The primary type is:

```
Attestation(bytes32 recordHash,uint8 kind,bytes32 subjectId,bytes32 streamId,uint64 sequence,bytes32 prev,bytes32 previousAnchor)
```

`kind` is a compact enum: `1` valuation, `2` settlement-archive, `3` receipt, `4` components, `5` winddown-opened, `7` retirement-final, `8` correction, `9` gap, `10` watcher-observation. Numeric kind `6` is reserved for a future versioned profile. Core v1 and `anchor/evm/1` MUST reject it.

3. ECDSA signatures MUST use canonical low-`s` form with `v` in `{27, 28}`. Contract accounts verify through ERC-1271. The envelope's `scheme` selects the path. EIP-712 alone has no replay protection. The domain and message bind the signature to one chain, anchor contract, subject, stream, record position, and prior anchor head. The anchor's compare-and-set head rejects a second submission at the same stream position.
4. For a directly anchored record, the signer MUST hold the relevant authority in that transaction. The anchor contract checks this before emitting the event. It also calls ERC-1271 in that transaction when the signer is a contract. This on-chain result survives a later owner or signature-policy change.
5. Every record MUST be directly validated by an anchor transaction. The anchor checks the relevant authority in that transaction. A historical `eth_call` against a current authority or ERC-1271 policy is not a substitute.
6. An anchor mechanism that does not validate both authority and signature cannot support a PMVS conformance claim.
7. A batch MAY validate and emit one anchor event for each record. It MUST apply the same checks and advance the stream head after each item, in array order. If any item fails, the whole batch MUST revert.

Attestation vector (test key `0x…01`, signer `0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf`, chainId 137, verifying contract `0x0000000000000000000000000000000000000001`). This tests the typed-data digest only. Its sequence and previous hash do not form a valid stream position:

```
message = { recordHash: 0x63b263cd41b1160c1a92be6a17df1a1de6ae9e5f0a9a11b6ad2b6fe9f8a9c9d1,
            kind: 1, subjectId: 0x119eba4ba90359458811e719965925e255c3537b907914b6428f775c8d297892,
            streamId: 0x0000000000000000000000000000000000000000000000000000000000000000,
            sequence: 42, prev: 0x0000000000000000000000000000000000000000000000000000000000000000,
            previousAnchor: 0x0000000000000000000000000000000000000000000000000000000000000000 }
digest    = 0x47b5d61b55a851f50606886d2fbbb057c903c228c39a509b9c7f434ac0fea6fd
signature = 0x33ce3af8909e6a4828d38a30f291a18c3bcfde53f916df764aaaaf2ac069370d541bf653c721d8196d57ff4e271cbc123b9be996b579a93fbb1a028d2cb717ed1b
negative  : same message under chainId 1 -> digest 0xc9d93048d77596c629cdd52444444edba7eb2a2b6c9172fdfbec2e4e7bc2d5db (differs)
```

## Anchoring

An anchor contains `(subjectId, streamId, kind, sequence, recordPrev, previousAnchor, recordHash, signer, signatureScheme, signatureHash, uri)`.

The subject stream uses `streamId = bytes32(0)`. A watcher stream uses `streamId = keccak256(abi.encodePacked("PMVS:WATCHER:1", producer))`. `recordPrev` is the preceding record in that stream. `previousAnchor` is the current anchored head before this commit. After genesis, the two fields MUST be equal. `signatureHash` is `keccak256(signature)`. It binds the envelope signature to the on-chain validation result.

A record is **directly anchored** when an event names its own `recordHash` and the anchor validates its stream position, authority, and signature in that transaction. Direct anchoring is required for every PMVS v1 record.

A conforming anchor contract emits:

```solidity
event PMVSRecordAnchored(
    bytes32 indexed subjectId,
    bytes32 indexed streamId,
    uint64 indexed sequence,
    uint8 kind,
    bytes32 recordPrev,
    bytes32 previousAnchor,
    bytes32 recordHash,
    address signer,
    uint8 signatureScheme,
    bytes32 signatureHash,
    string uri
);
```

1. The contract keeps one head per `(subjectId, streamId)`. A new stream MUST start at sequence zero with both `recordPrev` and `previousAnchor` set to zero. For an existing stream, it MUST require `sequence == storedSequence + 1` and `recordPrev == previousAnchor == storedRecordHash`. It MUST reject an advance from `type(uint64).max`. It also requires a nonzero `recordHash` and validates the authority and signature before changing state.
2. A skipped, repeated, or out-of-order sequence, or either predecessor mismatch, reverts. This exact compare-and-set rule prevents an authorized signer from jumping to `type(uint64).max` and permanently exhausting the stream. A verifier reports the same defects as `CHAIN_BROKEN` when checking retrieved history.
3. **Registry mode.** A separate append-only registry validates and stores the anchor. Its generic interface can technically commit before or after a normal-roll or zero-NAV action, so registry storage alone cannot make that action depend on disclosure. A conforming L1 settlement uses the stricter Part II rule: the exact branch record is already anchored before any covered effect. A post-action registry commit is nonconforming. Core v1 has no registry-mode terminal-retirement path. A registry settlement generation MUST migrate, without dropping any holder right or obligation, to an atomic generation before terminal closure.
4. **Atomic mode.** The covered contract validates and stores the anchor in the same transaction as the covered action. The transaction MUST revert if either step fails. Record kinds `2`, `5`, and `7` are protected in this mode. The generic commit entry point MUST reject a protected kind unless the call comes from its registered covered wrapper or the wrapper invokes the anchor transition internally. This prevents an authorized signer from creating an action-looking anchor without the covered action. Only this mode may claim that record commitment is a precondition of the action, and Core v1 terminal retirement requires it.
5. The exact function ABI, authority resolver, and interface-detection method belong in a settlement anchor profile. Different ABIs MAY conform if they emit the event above and satisfy the state transition and validation rules.
6. A contract MAY emit `ArtifactLocationAdded(bytes32 indexed subjectId, bytes32 indexed recordHash, string uri)` for another location. Adding a location does not change the record or anchor. The reader still checks retrieved bytes against `recordHash`.
7. A registry-anchored branch-specific pre-action record for a transaction that never executes remains history. It is `UNEXECUTED_ANCHOR`, not void. Price attempt `1` is the first attempt for an epoch. A retry is exactly `n + 1` and may be published only strictly after attempt `n` expires, before epoch processing, before either branch succeeds, and before `uint64` exhaustion. It uses a later subject-stream sequence. Its required `supersedesUnexecuted` value names the latest unresolved registry-anchored, receipt-less pre-action record for the same subject and epoch, even when the branch changes between `settlement-archive` and `winddown-opened`. The named record must have both an earlier stream sequence and an earlier price attempt. The field is `null` only when no such record exists, and verifiers check that claim independently. Only a receipt can bind a pre-action record to an executed transaction. Atomic anchors revert with the failed action and therefore cannot create this state.
8. Verifiers read anchors at the confirmation depth declared for the chain. An orphaned anchor does not exist on the canonical chain and MUST be re-anchored. Ordering within one canonical block is by transaction index and then log index.
9. Every periodic record is directly anchored. Batching changes transaction overhead, not the per-record validation rule.

## Storage abstraction

1. Records MUST be retrievable from content-addressed or content-verified public storage: given `recordHash`, any honest holder of the bytes can serve them and any verifier can check them. The storage layer is untrusted transport. No storage property participates in the trust argument.
2. A storage profile (for example `storage/arweave/1`) defines the upload lifecycle, inclusion confirmation, read-back verification, discovery tagging, and bundling. Conformance claims name the profile.
3. The standard does not use the word *permanence*. Storage claims are stated as testable properties: inclusion (the bytes were accepted at height H), retrievability (the bytes are servable from at least two independent read paths at verification time), mirroring (the operator retains and can re-serve the bytes), and retention assumptions (documented, economic or contractual, of the chosen network).
4. Operators MUST retain the canonical bytes of every record they have anchored and MUST be able to re-serve them. Loss of the only copy of an anchored record is `MISSING_RECORD` against the operator regardless of storage-network behavior.

## Verifier result codes

A verifier returns every applicable code. `VALID` is returned only when no other code applies to the requested verification scope. A verifier SHOULD continue independent checks after one failure so the report does not hide a second defect.

| Verdict | Meaning |
|---|---|
| `VALID` | All checks in the requested verification scope passed. A scoped `VALID` result is not by itself a PMVS conformance result. |
| `INVALID_ENCODING` | Bytes are not canonical PMVS-JCS (numbers, duplicate keys, bad lexemes, escaping, BOM, surrogates). |
| `INVALID_HASH` | Bytes do not hash to the committed or claimed `recordHash`. |
| `INVALID_SIGNATURE` | Attestation fails: bad signature, wrong scheme, or signer not the authority at anchor time. |
| `UNVERIFIABLE_AUTHORITY` | The historical authority or ERC-1271 result was not resolved by the declared on-chain mechanism. The record cannot pass integrity verification. |
| `UNSUPPORTED_PROFILE` | A behavior-selecting field names a profile, schema, or methodology the verifier does not implement. |
| `UNSUPPORTED_POSITION_FORMAT` | A custody account holds a nonzero position whose versioned position profile is not active for the component generation. |
| `ARITHMETIC_MISMATCH` | Deterministic re-execution of record inputs does not reproduce record outputs. |
| `CHAIN_STATE_MISMATCH` | A recorded chain read does not match archive-node state at the pinned block. |
| `SETTLEMENT_MISMATCH` | A branch record or receipt conflicts with its on-chain action. Normal-roll checks include roots, totals, selections, positive prices, the exact price attempt, getter, and events. Zero-NAV checks include its branch kind and getter, exact attempt, zero prices, no selection or fee, unchanged supply, `retirement: {triggered: false, reason: null}`, and canonical events. |
| `UNDERFUNDED_CLAIMS` | Committed deposit shares or withdrawal assets exceed the funds available for those claims. |
| `STRANDED_SHARE_SUPPLY` | A claimed terminal subject state leaves ERC-20 shares with no declared, enforceable redemption, migration, burn, or recovery path. |
| `UNALLOCATED_ASSETS` | The subject has zero share supply and nonzero NAV without a declared seeding or residual-asset rule. |
| `CHAIN_BROKEN` | A stream has a skipped, repeated, or inconsistent sequence or predecessor. |
| `EQUIVOCATION` | Two attested records share `(subjectId, streamId, sequence, prev)` with different hashes. Permanent. |
| `MISSING_RECORD` | A required record (per event, registry, or slot) is unretrievable after grace from at least two read paths. |
| `STALE` | The record exists but violated its declared latency or grace. |
| `UNANCHORED` | Published and attested but never anchored. |
| `UNEXECUTED_ANCHOR` | A registry-anchored branch-specific pre-action record has no matching canonical transaction receipt. The anchor remains part of history. |
| `UNEXECUTED_ACTIVATION` | An anchored component candidate has no matching canonical successful activation receipt. The candidate remains history but never became active. |
| `DATA_UNAVAILABLE` | The record declares an input-source failure (Part III); distinguished from asserting a zero value. |
| `INCOMPLETE_CAPTURE` | A required response side, ladder depth, page, or raw input is missing or unlawfully truncated. |
| `INCOMPLETE_INVENTORY` | The position-inventory rules of Part III are not satisfied. The record cannot support L1 or any higher level. |
| `UNVERIFIABLE_INVENTORY` | Public data cannot establish inventory completeness for this record. The record cannot support L1 or any higher level. |
| `UNVERIFIABLE_INPUTS` | The record predates the standard or lacks pinned inputs. This is the permanent classification of history whose settlement-bearing inputs were not preserved, and the record cannot support L1 or any higher level. |
| `INCONCLUSIVE` | A corroboration check (watcher bracketing) had no eligible evidence. |
| `FIDELITY_SUSPECT` | Statistical corroboration flagged operator-published venue inputs (watcher profile). Evidence, not proof. |

A code's effect depends on the requested verification scope:

1. `INVALID_*`, `UNVERIFIABLE_AUTHORITY`, `ARITHMETIC_MISMATCH`, `CHAIN_STATE_MISMATCH`, `SETTLEMENT_MISMATCH`, `UNDERFUNDED_CLAIMS`, `STRANDED_SHARE_SUPPLY`, `UNALLOCATED_ASSETS`, `EQUIVOCATION`, `CHAIN_BROKEN`, `MISSING_RECORD`, and `UNSUPPORTED_PROFILE` prevent a passing result for every scope that requires the affected record.
2. `UNANCHORED` or `STALE` prevents a level claim when that level requires the record to be anchored or timely.
3. `INCOMPLETE_CAPTURE`, `INCOMPLETE_INVENTORY`, `UNVERIFIABLE_INVENTORY`, `UNVERIFIABLE_INPUTS`, `DATA_UNAVAILABLE`, and `UNSUPPORTED_POSITION_FORMAT` prevent the affected record from serving as the pre-settlement valuation for L1 or any higher level. The record may remain diagnostic, but an action that uses it cannot claim conformance. `UNSUPPORTED_POSITION_FORMAT` also blocks new valuation-dependent settlement until the position leaves the custody perimeter under a declared policy or an active profile covers it. A `gap` record may report `DATA_UNAVAILABLE` and fill an L3 cadence slot, subject to the declared maximum run of gaps, but it is not a valuation and cannot authorize settlement.
4. `UNEXECUTED_ANCHOR` cannot satisfy a requirement for an executed settlement. It does not by itself make a later, separately anchored settlement invalid. `UNEXECUTED_ACTIVATION` cannot govern a covered action and does not consume a component generation or activation nonce.
5. `INCONCLUSIVE` and `FIDELITY_SUSPECT` qualify T3 evidence. They do not change T1 or T2 results.

## Conformance

Every deployment declares its settlement, anchor, request-liveness, valuation, venue, storage, and optional watcher profiles in the active component record. It also declares confirmation depth, capture window, publication grace by record kind, and every profile parameter. L3 adds cadence origin, cadence width, evaluation window, and maximum consecutive gap slots. A claim that omits a required profile or parameter is incomplete.

The levels are cumulative. A lower level never permits an omitted custody account, position, cash balance, receivable, reserve, liability, required input, or applicable policy check. Record validity, schema validity, and a diagnostic profile result are scoped verification results, not conformance results.

| Level | Requirements |
|---|---|
| **L1, evidence-bound settlement** | Every executed epoch action uses a pre-settlement valuation that passes the active profiles' complete custody-perimeter, position-inventory, pinned-input, capture, quiescence, and applicable settlement-policy checks. Its authenticated hash is nonzero. The valuation, immutable price attempt, branch-specific pre-action record, action, events, claim funding, and post-action receipt are timely, retrievable, anchored as required, and mutually consistent. The required authorities sign the records, and conforming anchors commit them. A normal roll uses `settlement-archive`, positive prices, a complete archive, and a funded claim path. A zero-NAV action uses `winddown-opened`, zero prices, no selected request or fee, no supply or retirement change, and the Part II post-redemption and no-effect checks. Both receipt branches use `retirement: {triggered: false, reason: null}`. A terminal-retirement claim requires the successful registered atomic wrapper transaction. The wrapper reads and rechecks all four zero counters, consumes the subject-only `retirement-final` record, stores its exact hash and sequence, sets both terminal flags, and emits both closure events. An independent verifier proves that every residual and recovery resolution predates finalization and that the complete custody and accounting perimeters are empty. Only non-settlement-bearing corrections may follow. L1 identifies the complete disclosed evidence and authenticated price that drove settlement. It does not reproduce the complete NAV or PPS computation or prove venue truth or price fairness. |
| **L2, valuation-reproducible** | L1 plus a closed compute profile. Starting from the active component record and complete bound inputs, pure re-execution derives the valuation without trusting `record.outputs` and reproduces every settlement-bearing output. |
| **L3, continuous-record** | L2 plus one timely valuation or explicit gap for every cadence slot, no run of gaps beyond the declared maximum, timely anchors, and the correction rules in this Part. |

The levels above define target claims. This repository has no end-to-end
deployment-level L1 verifier. Its schema validators, record-level semantic
verifier, and profile helpers return partial results. Current PMVS-M1 does not
define a closed complete valuation computation and cannot satisfy L2. No L3
claim is possible until an eligible L2 valuation method exists.

Anchor mode is an independent claim:

- `registry`: an append-only registry validates the attestation. A normal-roll or zero-NAV action can still execute without that registry call. Terminal retirement is unavailable.
- `atomic`: each protected action and its anchor succeed or revert together on every path. This mode is required for terminal retirement.

Watcher evidence is independent of L1 through L3. The current `watcher/0`
profile is experimental and does not define a conformance claim. A later
profile may standardize sample commitments, missed-sample records, coverage,
and administrative-diversity measures. Common control can never count as
independence merely because observations use different keys.

A complete claim uses this form:

> PMVS Core v1 verification: L1, evidence-bound settlement; complete valuation replay unavailable for `pmvs-m1`; anchor profile `anchor/evm/1`; anchor mode `atomic`; request liveness `bounded`; settlement profile `settlement/epoch-merkle/1`; venue profile `venue/polymarket/1`; storage profile `...`.

An L3 claim adds its cadence parameters. Experimental watcher evidence may be
reported separately but not appended as a PMVS conformance level. The phrase
"PMVS compliant" on its own has no defined meaning.

## Verification boundaries

Verification separates three trust-boundary results. They are not conformance
levels. A record can pass a scoped T1 or diagnostic check without supporting
L1. L1 also requires the complete custody, inventory, input, capture,
quiescence, and policy checks stated above.

- **T1, anchored-disclosure integrity.** The anchored bytes are the bytes the authority signed. Membership proofs, selections, totals, and per-request settlement amounts are consistent with the on-chain commitments. Recorded chain state matches the chain at the pinned blocks. Misstatements here are provable to anyone.
- **T2, deterministic reproduction.** Under a method with a closed compute profile, the published outputs (marks, NAV, PPS) are exactly the declared methodology applied to the disclosed, integrity-protected inputs. This is deterministic re-execution of attested disclosures. It proves the operator did not misapply the methodology to what it disclosed. It does not prove the disclosed venue inputs were true. Current PMVS-M1 does not provide this result.
- **T3, contemporaneous corroboration.** Independent watchers can corroborate some venue observations statistically. The venue signs nothing. Displayed liquidity is cancellable and spoofable. Colluding or sybil watchers corroborate nothing. T3 output is evidence, never proof, and the absence of corroboration failure is never evidence of correctness.

Atomic anchoring can prevent settlement without a commitment. It cannot prevent a signed false input or a correctly reproduced bad valuation policy. Some false inputs may be exposed by chain comparison or watchers. Others may remain indistinguishable from true venue responses. Challenge windows, bonds, vetoes, and loss remedies are outside version 1.

## Rationale

### Identify the subject by its share

The investor keeps the ERC-20 share while entry contracts, custody wallets,
fee modules, and valuation engines can change. `(chainId, shareToken)` is
therefore the smallest durable on-chain identity. The discovery interface
removes the need for an API or storage tag to find the active generation.

### Keep outcome positions below the vault layer

ERC-1155 identifies token balances but does not define a prediction-market
condition or payout. CTF defines those facts for its positions. PMVS reuses
that position protocol and defines the separate ERC-20 claim over the whole
portfolio. It does not create another outcome token.

### Use profiles for facts that can change

Venue endpoints, contract deployments, collateral wrappers, and storage
systems change more often than the vault model. A versioned profile can pin
those facts without changing the meaning of every PMVS share. An unknown
profile fails closed because guessing a replacement can alter NAV or payment.

### Anchor each record directly

Direct anchoring gives the contract one exact compare-and-set transition for
the record, signer, and authority. Retrospective coverage would require an
off-chain verifier to reconstruct authority at a later block and would not
preserve an ERC-1271 result. Exact sequence increments also prevent a signer
from exhausting a stream with one maximum-value jump.

### Separate authorities by effect

Settlement, valuation, fees, custody, and governance can each move value or
change the rules used to move it. Declaring them separately exposes combined
control and supports independent rotation. A deployment may assign several
roles to one address, but the record makes that concentration visible.

### Do not claim another vault standard by resemblance

ERC-4626 defines synchronous tokenized-vault behavior. ERC-7575 separates a
share from vault entry points. ERC-7540 defines asynchronous request flows.
PMVS needs additional position identity, custody-perimeter, valuation,
commitment, migration, and closure rules. A deployment may implement those
ERCs, but PMVS tests each claim separately instead of treating similar method
names as conformance.

## Backwards compatibility

PMVS does not change ERC-20 balances or reinterpret an existing outcome
position. An existing share token can begin PMVS conformance only if it can
expose the discovery interface and activate a component genesis without
changing holder economics. Otherwise a new share or a holder-approved
migration is required.

Existing custom queues and Merkle roots remain readable under an explicitly
named compatibility profile. They do not acquire `settlement/epoch-merkle/1`
status. Outstanding requests and claims move to a new generation only through
a migration that preserves their amounts, funding, cancellation, and recovery
rights. Historical records that lack required inputs remain classified as
`UNVERIFIABLE_INPUTS`; later records cannot repair their original evidence.

Support for ERC-4626, ERC-7540, or ERC-7575 is unchanged. An implementation
that already claims one of them must continue to satisfy that standard after
adding PMVS. If its PMVS accounting asset differs from the ERC-4626 asset, the
ERC-4626 claim is invalid rather than redefined.

## Security considerations (core scope)

- **Key compromise.** An attacker holding an authority key can sign and anchor false records. PMVS makes this attributable, not impossible. Authorities SHOULD be contracts with multisig or timelock policies; ERC-1271 support exists for exactly this reason.
- **Rotation races.** Anchor-time authority validation prevents a revoked key from anchoring a backdated record. Implementations MUST NOT select authority from the valuation block.
- **Equivocation.** Fork detection depends on verifiers comparing records across sources. The registry's compare-and-set head prevents two commits at the same `(subjectId, streamId, sequence)`.
- **ERC-1271 policy changes.** A contract account may accept a signature at one block and reject it later. The anchor-time contract call and event preserve the accepted result. Every record is checked at its own anchor transition.
- **Anchor defects.** A faulty authority resolver or anchor contract can accept an unauthorized record or corrupt its head. Its address, runtime-code hash, proxy state, and security-review status MUST be disclosed. Verifiers MUST compare them with the active component record.
- **External data.** A venue may omit positions, return stale data, change an endpoint, or show cancellable liquidity. T1 and T2 do not prove such data true. Profiles define failure handling. Watchers may add limited evidence.
- **Profile confusion.** A verifier MUST stop before behavior selection if it does not implement the named profile or version. Falling back after a failed RPC or parse is unsafe.
- **Storage retention.** Content-addressed storage networks have economic, not absolute, retention. The mirroring and re-serve obligations above keep the trust argument independent of any single network's behavior.
- **Integer and unit errors.** Every amount is range-checked before arithmetic. Implementations MUST reject overflow, mixed decimal scales, unsafe host-language integers, and an undeclared rounding rule.
- **Privacy and legality.** Public archives may expose addresses, strategy positions, or venue data. A deployment must assess data rights and legal duties before publication. PMVS conformance is not that assessment.

## Copyright

Copyright and related rights in this document and repository-owned reference
code are waived under CC0-1.0. Third-party material remains under its own
license. CC0 does not grant trademark or patent rights.
