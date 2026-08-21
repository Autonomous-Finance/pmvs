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

In the reference architecture, a per-vault Strategy Safe holds working collateral and Gnosis Conditional Tokens Framework (CTF) ERC-1155 positions. The share-vault contract controls the ERC-20 supply and temporarily buffers the accounting asset during settlement. It does not hold the outcome positions.

The `(chainId, shareToken)` pair identifies the vault. This Part defines its accounting asset, custody perimeter, component roles, lifecycle, and minimum holder protections. It also defines the records and on-chain commitments required to reproduce settlement calculations and compare recorded chain inputs with pinned Ethereum state.

Part II defines asynchronous settlement. Part III defines PMVS-M1 valuation. Profiles bind contract interfaces, venues, storage systems, and watcher methods without placing deployment-specific facts in the core.

Version 1 can verify signed records, chain state, and deterministic arithmetic. It cannot prove that an unsigned venue response was true. It has no challenge period, fraud proof, bond, or veto.

## Motivation

The existing CTF protocol defines how collateral becomes outcome positions and how those positions merge or redeem. PMVS starts above that layer. It defines how a vault holds, values, and settles a portfolio of positions while investors hold one ERC-20 vault share.

An outcome position is tied to one market and one payout condition. It is designed to settle and be redeemed when that market resolves, so it is a poor long-term fundraising token. The vault sells, merges, or redeems it before moving capital into another market. A managed strategy holds many positions and enters new markets. Direct ownership would force investors to track changing ERC-1155 ids, resolution states, and venue operations.

The ERC-20 vault share is a continuing funding unit. Investors enter and exit in one accounting asset while the vault keeps the changing portfolio in custody. Wallets and protocols integrate the share without integrating each outcome position.

ERC-20 defines token balances and transfers. It leaves custody, NAV, entry and exit pricing, fees, request states, claim funding, migration, and closure unspecified. PMVS defines those vault semantics and binds settlement-bearing facts to canonical records.

The operator may control both venue-data capture and settlement submission. Canonical records bind its inputs and calculations to the resulting vault state.

The reference implementation adapts Boring Vault's separation of share issuance, accounting, and asset movement. PMVS itself neither requires nor extends Boring Vault. The reference share-vault is a custom contract, not an upstream BoringVault fork or compatible interface.

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

A PMVS vault consists of one share token plus its declared components and custody accounts. A single contract may implement several roles. The component record MUST identify every role, each on-chain component or authority, and each off-chain method engine.

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
8. Migration preserves every outstanding share, pending request, funded claim, and recovery right. Terminal closure leaves no unexplained share supply or residual asset.
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
- **Operator**: the off-chain actor that captures data, computes records, or submits settlement. The operator is not automatically an authority.
- **Authority**: an on-chain role empowered to perform a class of privileged action. PMVS distinguishes five authorities. The **settlement authority** executes epoch rolls. The **valuation authority** publishes gross PPS. The **fee authority** sets the performance-fee rate. The **custody authority** moves collateral between system components and external custody. **Governance** rotates the other four. Their addresses MAY differ and MAY rotate independently.
- **Component generation**: one declared configuration of contracts, authorities, profiles, and policy parameters beneath a subject.
- **Record**: one canonical JSON assertion. Record kinds include components, valuations, settlement archives, receipts, retirement steps, corrections, and gaps.
- **Subject stream**: the ordered hash chain of records about one subject.
- **Watcher stream**: a separate ordered hash chain published by one watcher about one subject. Watcher records never occupy sequence numbers in the subject stream.
- **Anchor**: an on-chain commitment to a record's hash.
- **Verifier**: any third party executing the verification procedures of Parts I through III.
- **Watcher**: an independent party publishing its own contemporaneous venue observations (profile `watcher/0`, experimental).
- **Epoch / roll**: see Part II.
- **Retirement states**: three conditions that MUST remain distinct. *Wind-down opened* is the application-level decision to stop normal operation. The *settlement pin* is a fixed price per share for wind-down redemptions. *Terminal retirement* is the irreversible on-chain state after which the contract rejects new withdrawal requests. Part II defines a record kind for each state.

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
4. The first component record MUST state `shareDecimals` and `economicUnit: "pro-rata-nav"`. It MUST also state whether transfers can be paused, blocked, taxed, rebased, allow-listed, or changed by an administrator. A false capability statement is a component mismatch. EIP-2612, ERC-4626, ERC-7540, and ERC-7575 support are separate, testable claims. PMVS conformance alone implies none of them.
5. The component record MUST contain a `portfolio` object. It declares `kind: "prediction-market"`, the custody model, the supported position-profile ids, and whether entry and exit use the accounting asset or a named profile conversion.
6. Each subject MUST directly anchor a `components` record as its subject-stream genesis before claiming conformance. Every later component generation MUST also be directly anchored before a changed component or policy governs a covered action.
7. A component record MUST contain the subject, `subjectId`, generation number, previous component-record hash, accounting asset and decimals, share terms, portfolio declaration, interface support, settlement profile, valuation method, venue profile, storage profile, chain confirmation depth, publication windows, and every behavior-selecting parameter used by those profiles.
8. It MUST list each contract or account that can hold subject assets, mint or burn shares, accept requests, settle requests, set valuation, charge fees, anchor records, or move custody. Each entry contains its role, chain id, address, runtime-code hash, and proxy implementation data when applicable. An EOA component uses the zero code hash and is labeled `eoa`. Venue accounts that have no EVM address use the account form defined by the venue profile.
9. It MUST identify at least the share-vault, settlement, Teller, Accountant, strategy-manager, strategy-custody, and anchor roles. One address MAY hold more than one role. A subject with no separate Teller, Accountant, or Manager labels the contract or authority that performs the equivalent action.
10. It MUST list the current holder of each PMVS authority and the on-chain source used to resolve that holder. If no getter or event history makes a role independently recoverable, the component record MUST say `source: "attested"`; records governed by that role cannot pass historical authority verification and receive `UNVERIFIABLE_AUTHORITY`.
11. Component migration over the same share token creates a new component record with `supersedes` set to the old record hash. The old history remains valid. The new record MUST state how every pending request, unclaimed settlement, escrowed balance, custody position, and authority obligation remains reachable. A migration with no complete path is not conforming.
12. If the anchor contract changes, governance first signs and anchors the new component record through the old contract. That record declares the old and new anchors and every stream head to import. The subject-stream head is mandatory. A watcher head is also mandatory if that watcher will continue its existing stream. The new anchor imports each declared `(subjectId, streamId, sequence, recordHash)` and emits the migration event required by its profile. Later attestations use the new contract in their EIP-712 domain. Reusing an existing stream from an empty head would break its history and is not conforming.
13. Records never span subjects. Internal database identifiers MAY appear under `meta`, but MUST NOT replace subject identity or any on-chain key.

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

Earlier pre-release fixtures used the raw label `erc1155` in `positionFormats`. That label does not identify prediction-market semantics and is invalid under this draft. An unanchored fixture using it must be regenerated. If such bytes were anchored, the deployment publishes a new component generation and keeps the old record. Published bytes are never silently rewritten. After a schema release, changing the accepted identifier form requires a new schema version.

## PMVS-JCS/1: canonical serialization

Records are serialized with a restricted profile of RFC 8785 (JCS), named PMVS-JCS/1:

1. **Scalars.** Permitted scalar types are string, boolean, and `null`. JSON numbers are forbidden anywhere in a record. A serializer encountering a number MUST fail; a verifier encountering one MUST return `INVALID_ENCODING`.
2. **Integers.** Numeric quantities are decimal strings matching `0|[1-9][0-9]*`, optionally preceded by `-` only where a field is explicitly signed. No leading zeros, no `+`, no `-0`, no decimal point, and no exponent. Each schema field declares a signed or unsigned bit width. An unsigned `w`-bit value is in `[0, 2^w - 1]`. A signed `w`-bit value is in `[-2^(w-1), 2^(w-1) - 1]`. Quantities use declared base units, never fractional JSON values.
3. **Hex.** Addresses are lowercase `0x` plus 40 hex characters; hashes are lowercase `0x` plus 64. Mixed-case (checksum) forms are invalid inside records.
4. **Objects.** Keys are sorted by UTF-16 code units (JCS order). Duplicate keys are invalid. A parser that silently discards duplicates is not a conforming verifier: verification MUST operate on raw bytes and reject duplicates before parsing (`INVALID_ENCODING`).
5. **Strings.** ECMAScript `JSON.stringify` escaping (the JCS string rule). Input MUST be valid Unicode; unpaired surrogates are invalid. Encoding is UTF-8 without BOM. No insignificant whitespace. PMVS performs no Unicode normalization. Producers SHOULD use NFC for human text, but verifiers MUST hash the published code points without changing them.
6. **Arrays.** Order is significant and defined per schema field. Arrays never carry set semantics.
7. **I-JSON.** Records MUST satisfy RFC 7493.

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

1. `recordHash = keccak256(canonicalBytes(record))`.
2. The attestation and locations are outside the hashed region to avoid a cycle. A location is only a transport hint. A verifier trusts bytes only after checking their hash, signature, and anchor.
3. Every record has `schema`, `schemaVersion`, `subject`, `components`, `context`, and `extensions`. `components` is the hash of the governing component record. The genesis component record uses the zero hash.
4. In a subject-stream record, `context` contains `stream: "subject"`, `kind`, `sequence`, `prev`, and `producedAt`. `sequence` is a `uint64` decimal string. It starts at `"0"` and increases by one. `prev` is the preceding record hash or zero at genesis.
5. In a watcher record, `context` contains `stream: "watcher"` and `producer`, the lowercase watcher address. Its sequence and `prev` form a separate chain keyed by `(subjectId, producer)`. It does not change the subject stream.
6. Each record is closed by its base schema and every named profile schema. An undeclared field is `INVALID_ENCODING` unless it appears under `meta` or in `extensions`. The base schema delegates only the subobjects named in its schema notes, such as profile parameters and venue evidence. A conforming verifier applies the selected profile schema to each delegated object. `meta` is hash-bound but MUST NOT change verification behavior. Each extension has `{ "id": "…", "critical": true|false, "value": … }`. A verifier preserves every unknown extension. It returns `UNSUPPORTED_PROFILE` for an unknown critical extension. It may ignore only the behavior of an unknown non-critical extension.
7. `retirement-final` terminates the component generation it names. A later `components` record is allowed only for a declared migration of the same subject. A final subject closure permits only corrections after it.

The normative v1 machine shapes are in [`schemas/pmvs-envelope-v1.schema.json`](./schemas/pmvs-envelope-v1.schema.json). JSON Schema does not replace raw-byte canonicality, signature, profile, cross-field, or chain-state checks.

```
subject stream:  [0]* <-prev- [1] <-prev- [2] <-prev- [3]*
                   A                                  B

B.previousAnchor = hash([0])
B.recordPrev     = hash([2])

Anchor B covers [1] and [2] only if the verifier can retrieve and
validate the complete chain from [3] back to anchor A.
```

### What the chain does and does not provide

The hash chain is fork-detecting, not append-only. A signer can issue two different records with the same `(subjectId, streamId, sequence, prev)`. Therefore:

- Two attested records in the same stream with equal `(sequence, prev)` and different hashes are equivocation. `EQUIVOCATION` remains part of that stream's record history even if only one branch was anchored.
- An anchor commits one selected ancestry, and only if every intermediate record is retrievable. It does not prove that omitted records never existed, and it does not prove cadence.
- A component record that claims L3 declares `cadenceOrigin`, `cadenceSeconds`, and `publicationGraceSeconds`. Slot `n` is `[origin + n * cadence, origin + (n + 1) * cadence)`. Exactly one periodic valuation or gap record names each elapsed slot. A gap record gives a plain explanation and one reason: `venue_unavailable`, `chain_unavailable`, `operator_unavailable`, `unsafe_capture`, `storage_unavailable`, or `other`. A gap is evidence of missing data, not a substitute valuation.
- A record published after its slot's grace carries `late: true` and receives `STALE`. A later correction cannot make the original publication timely.
- A correction names `targetHash`, a reason code, whether settlement-bearing outputs change, and the replacement assertion. It never removes the target. If the target affected an executed settlement, the correction MUST state the on-chain effect and any remediation. A correction cannot turn a mismatched executed settlement into `VALID`.
- Retrospective anchoring MUST NOT be described as continuous disclosure. Conformance level L3 is named accordingly (below).

## Attestation

1. Each subject-stream record MUST be signed by the declared authority for its kind. Settlement archives and receipts use the settlement authority. Valuations use the valuation authority. The component record assigns components, retirement, gap, and correction records to one of the five PMVS authorities. A watcher record is signed by its `producer`, not by a subject authority.
2. The signature scheme is EIP-712 over domain `{ name: "PMVS-Attestation", version: "1", chainId, verifyingContract }`. `verifyingContract` is the active anchor contract in the component record. The anchor SHOULD expose this domain through ERC-5267. The primary type is:

```
Attestation(bytes32 recordHash,uint8 kind,bytes32 subjectId,bytes32 streamId,uint64 sequence,bytes32 prev,bytes32 previousAnchor)
```

`kind` is a compact enum: `1` valuation, `2` settlement-archive, `3` receipt, `4` components, `5` winddown-opened, `6` retirement-pin, `7` retirement-final, `8` correction, `9` gap, `10` watcher-observation.

3. ECDSA signatures MUST use canonical low-`s` form with `v` in `{27, 28}`. Contract accounts verify through ERC-1271. The envelope's `scheme` selects the path. EIP-712 alone has no replay protection. The domain and message bind the signature to one chain, anchor contract, subject, stream, record position, and prior anchor head. The anchor's compare-and-set head rejects a second submission at the same stream position.
4. For a directly anchored record, the signer MUST hold the relevant authority in that transaction. The anchor contract checks this before emitting the event. It also calls ERC-1271 in that transaction when the signer is a contract. This on-chain result survives a later owner or signature-policy change.
5. An ECDSA record MAY be covered only through a later anchor in its stream. In that case, the verifier recovers its signer and requires that signer to hold the relevant authority at the later anchor's block. If the authority changes before that anchor, the new authority MUST sign a replacement envelope. The record bytes and hash do not change. The untrusted `producedAt` value never selects authority.
6. An anchor mechanism that does not validate both authority and signature cannot support a PMVS conformance claim. A historical `eth_call` against the current ERC-1271 policy is not a substitute for validation at anchor time.
7. An ERC-1271-signed record MUST be directly validated by an anchor transaction. A batch MAY validate and emit one anchor event for each record. A later record cannot validate an earlier contract signature only by referring to it through `prev`.

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

The subject stream uses `streamId = bytes32(0)`. A watcher stream uses `streamId = keccak256(abi.encodePacked("PMVS:WATCHER:1", producer))`. `recordPrev` is the preceding record in that stream. `previousAnchor` is the last anchored record hash. It may be older than `recordPrev` when one anchor covers intermediate records transitively. `signatureHash` is `keccak256(signature)`. It binds the envelope signature to the on-chain validation result.

A record is **directly anchored** when an event names its own `recordHash`. An intermediate ECDSA record is **transitively covered** when a later direct anchor commits a complete `recordPrev` chain through it. Transitive coverage binds the bytes to the anchor ancestry, but the verifier performs that intermediate record's ECDSA and authority checks off-chain. It is not direct on-chain signature validation.

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

1. The contract keeps one head per `(subjectId, streamId)`. Before emission, it MUST require that `previousAnchor` equals that head, `sequence` is greater than the stored anchor sequence, `recordHash` is nonzero, and the attestation passes the authority and signature rules above. The first anchor uses zero for `previousAnchor`.
2. The contract cannot inspect unpublished record ancestry. A verifier MUST walk `recordPrev` until it reaches `previousAnchor` and require consecutive sequence numbers. A missing or inconsistent intermediate produces `CHAIN_BROKEN`.
3. **Registry mode.** A separate append-only registry validates and stores the anchor. It can commit before or after the covered action, so it proves disclosure but cannot make that action depend on disclosure.
4. **Atomic mode.** The covered contract validates and stores the anchor in the same transaction as the covered action. The transaction MUST revert if the anchor step fails. Every settlement path, including zero-NAV and retirement paths, is covered. Only this mode may claim that record commitment is a precondition of the action.
5. The exact function ABI, authority resolver, and interface-detection method belong in a settlement anchor profile. Different ABIs MAY conform if they emit the event above and satisfy the state transition and validation rules.
6. A contract MAY emit `ArtifactLocationAdded(bytes32 indexed subjectId, bytes32 indexed recordHash, string uri)` for another location. Adding a location does not change the record or anchor. The reader still checks retrieved bytes against `recordHash`.
7. A registry anchor for a transaction that never executes remains history. It is `UNEXECUTED_ANCHOR`, not void. A new attempt uses a new record and sequence and names the earlier archive under `supersedesUnexecuted`. Only a receipt can bind an archive to an executed transaction. Atomic anchors revert with the failed action and therefore cannot create this state.
8. Verifiers read anchors at the confirmation depth declared for the chain. An orphaned anchor does not exist on the canonical chain and MUST be re-anchored. Ordering within one canonical block is by transaction index and then log index.
9. Periodic records need not each be anchored. A later anchor covers their ancestry only when every intermediate record is retrievable and valid.

## Storage abstraction

1. Records MUST be retrievable from content-addressed or content-verified public storage: given `recordHash`, any honest holder of the bytes can serve them and any verifier can check them. The storage layer is untrusted transport. No storage property participates in the trust argument.
2. A storage profile (for example `storage/arweave/1`) defines the upload lifecycle, inclusion confirmation, read-back verification, discovery tagging, and bundling. Conformance claims name the profile.
3. The standard does not use the word *permanence*. Storage claims are stated as testable properties: inclusion (the bytes were accepted at height H), retrievability (the bytes are servable from at least two independent read paths at verification time), mirroring (the operator retains and can re-serve the bytes), and retention assumptions (documented, economic or contractual, of the chosen network).
4. Operators MUST retain the canonical bytes of every record they have anchored and MUST be able to re-serve them. Loss of the only copy of an anchored record is `MISSING_RECORD` against the operator regardless of storage-network behavior.

## Verifier result codes

A verifier returns every applicable code. `VALID` is returned only when no other code applies to the requested verification scope. A verifier SHOULD continue independent checks after one failure so the report does not hide a second defect.

| Verdict | Meaning |
|---|---|
| `VALID` | All applicable checks passed. |
| `INVALID_ENCODING` | Bytes are not canonical PMVS-JCS (numbers, duplicate keys, bad lexemes, escaping, BOM, surrogates). |
| `INVALID_HASH` | Bytes do not hash to the committed or claimed `recordHash`. |
| `INVALID_SIGNATURE` | Attestation fails: bad signature, wrong scheme, or signer not the authority at anchor time. |
| `UNVERIFIABLE_AUTHORITY` | The historical authority or ERC-1271 result was not resolved by the declared on-chain mechanism. The record cannot pass integrity verification. |
| `UNSUPPORTED_PROFILE` | A behavior-selecting field names a profile, schema, or methodology the verifier does not implement. |
| `UNSUPPORTED_POSITION_FORMAT` | A custody account holds a nonzero position whose versioned position profile is not active for the component generation. |
| `ARITHMETIC_MISMATCH` | Deterministic re-execution of record inputs does not reproduce record outputs. |
| `CHAIN_STATE_MISMATCH` | A recorded chain read does not match archive-node state at the pinned block. |
| `SETTLEMENT_MISMATCH` | Archive contents are inconsistent with on-chain roots, totals, selections, or events (Part II). |
| `UNDERFUNDED_CLAIMS` | Committed deposit shares or withdrawal assets exceed the funds available for those claims. |
| `STRANDED_SHARE_SUPPLY` | A terminal component state leaves ERC-20 shares with no declared, enforceable redemption, migration, burn, or recovery path. |
| `UNALLOCATED_ASSETS` | The subject has zero share supply and nonzero NAV without a declared seeding or residual-asset rule. |
| `CHAIN_BROKEN` | The `prev`/`sequence` ancestry cannot be walked (gap, unretrievable intermediate). |
| `EQUIVOCATION` | Two attested records share `(subjectId, streamId, sequence, prev)` with different hashes. Permanent. |
| `MISSING_RECORD` | A required record (per event, registry, or slot) is unretrievable after grace from at least two read paths. |
| `STALE` | The record exists but violated its declared latency or grace. |
| `UNANCHORED` | Published and attested but never anchored. |
| `UNEXECUTED_ANCHOR` | A registry-anchored settlement archive has no matching canonical transaction receipt. The anchor remains part of history. |
| `DATA_UNAVAILABLE` | The record declares an input-source failure (Part III); distinguished from asserting a zero value. |
| `INCOMPLETE_CAPTURE` | A required response side, ladder depth, page, or raw input is missing or unlawfully truncated. |
| `INCOMPLETE_INVENTORY` | The position-inventory rules of Part III are not satisfied; the record cannot support L2 claims. |
| `UNVERIFIABLE_INVENTORY` | Inventory completeness cannot be established from public data for this record. |
| `UNVERIFIABLE_INPUTS` | The record predates the standard or lacks pinned inputs. This is the permanent classification of history whose settlement-bearing inputs were not preserved. |
| `INCONCLUSIVE` | A corroboration check (watcher bracketing) had no eligible evidence. |
| `FIDELITY_SUSPECT` | Statistical corroboration flagged operator-published venue inputs (watcher profile). Evidence, not proof. |

A code's effect depends on the requested verification scope:

1. `INVALID_*`, `UNVERIFIABLE_AUTHORITY`, `ARITHMETIC_MISMATCH`, `CHAIN_STATE_MISMATCH`, `SETTLEMENT_MISMATCH`, `UNDERFUNDED_CLAIMS`, `STRANDED_SHARE_SUPPLY`, `UNALLOCATED_ASSETS`, `EQUIVOCATION`, `CHAIN_BROKEN`, `MISSING_RECORD`, and `UNSUPPORTED_PROFILE` prevent a passing result for every scope that requires the affected record.
2. `UNANCHORED` or `STALE` prevents a level claim when that level requires the record to be anchored or timely.
3. `INCOMPLETE_CAPTURE`, `INCOMPLETE_INVENTORY`, `UNVERIFIABLE_INVENTORY`, `UNVERIFIABLE_INPUTS`, `DATA_UNAVAILABLE`, and `UNSUPPORTED_POSITION_FORMAT` prevent the affected record from serving as a required L2 valuation. `UNSUPPORTED_POSITION_FORMAT` also blocks new valuation-dependent settlement until the position leaves the custody perimeter under a declared policy or an active profile covers it. A `gap` record may report `DATA_UNAVAILABLE` and still fill an L3 cadence slot, subject to the declared maximum run of gaps.
4. `UNEXECUTED_ANCHOR` cannot satisfy a requirement for an executed settlement. It does not by itself make a later, separately anchored settlement invalid.
5. `INCONCLUSIVE` and `FIDELITY_SUSPECT` qualify T3 evidence. They do not change T1 or T2 results.

## Conformance

Every deployment declares its settlement, anchor, request-liveness, valuation, venue, storage, and optional watcher profiles in the active component record. It also declares confirmation depth, capture window, publication grace by record kind, and every profile parameter. L3 adds cadence origin, cadence width, evaluation window, and maximum consecutive gap slots. A claim that omits a required profile or parameter is incomplete.

| Level | Requirements |
|---|---|
| **L1, settlement-complete** | Every executed settlement has a complete Part II archive and funded claim path. The authority signed the archive, a conforming anchor committed it, and settlement verification passes. The archive was available no later than the profile's publication deadline. Retirement records cover every retirement transition. |
| **L2, valuation-reproducible** | L1 plus a pre-settlement valuation and post-settlement receipt for every settlement. The inventory is complete under Part III. Pure re-execution reproduces each settlement-bearing output. |
| **L3, continuous-record** | L2 plus one timely valuation or explicit gap for every cadence slot, no run of gaps beyond the declared maximum, timely anchors, and the correction rules in this Part. |

Anchor mode is an independent claim:

- `registry`: an append-only registry validates the attestation. The covered action can still execute without that registry call.
- `atomic`: the covered action and its anchor succeed or revert together on every path.

Watchers are also independent. `W(n, coverage, window, diversity)` states the number of watchers, observed-slot coverage, evaluation window, and administrative diversity. It MUST accompany, not replace, an L-level claim. Commonly controlled watchers do not count as independent.

A complete claim uses this form:

> Conforms to PMVS Core v1 at L2; anchor mode `atomic`; request liveness `bounded`; settlement profile `profile-id`; valuation method `method-id`; venue profile `profile-id`; storage profile `profile-id`.

An L3 claim adds its cadence parameters. A watcher claim adds `W(...)`. The phrase "PMVS compliant" on its own has no defined meaning.

## Verification boundaries

Verification separates three results:

- **T1, anchored-disclosure integrity.** The anchored bytes are the bytes the authority signed. Membership proofs, selections, totals, and per-request settlement amounts are consistent with the on-chain commitments. Recorded chain state matches the chain at the pinned blocks. Misstatements here are provable to anyone.
- **T2, deterministic reproduction.** The published outputs (marks, NAV, PPS) are exactly the declared methodology applied to the disclosed, integrity-protected inputs. This is deterministic re-execution of attested disclosures. It proves the operator did not misapply the methodology to what it disclosed. It does not prove the disclosed venue inputs were true.
- **T3, contemporaneous corroboration.** Independent watchers can corroborate some venue observations statistically. The venue signs nothing. Displayed liquidity is cancellable and spoofable. Colluding or sybil watchers corroborate nothing. T3 output is evidence, never proof, and the absence of corroboration failure is never evidence of correctness.

Atomic anchoring can prevent settlement without a commitment. It cannot prevent a signed false input or a correctly reproduced bad valuation policy. Some false inputs may be exposed by chain comparison or watchers. Others may remain indistinguishable from true venue responses. Challenge windows, bonds, vetoes, and loss remedies are outside version 1.

## Security considerations (core scope)

- **Key compromise.** An attacker holding an authority key can sign and anchor false records. PMVS makes this attributable, not impossible. Authorities SHOULD be contracts with multisig or timelock policies; ERC-1271 support exists for exactly this reason.
- **Rotation races.** Anchor-time authority validation prevents a revoked key from anchoring a backdated record. Implementations MUST NOT select authority from the valuation block.
- **Equivocation.** Fork detection depends on verifiers comparing records across sources. The registry's compare-and-set head prevents two commits at the same `(subjectId, streamId, sequence)`.
- **ERC-1271 policy changes.** A contract account may accept a signature at one block and reject it later. The anchor-time contract call and event preserve the accepted result. Transitive anchoring without that call does not.
- **Anchor defects.** A faulty authority resolver or anchor contract can accept an unauthorized record or corrupt its head. Its address, runtime-code hash, proxy state, and security-review status MUST be disclosed. Verifiers MUST compare them with the active component record.
- **External data.** A venue may omit positions, return stale data, change an endpoint, or show cancellable liquidity. T1 and T2 do not prove such data true. Profiles define failure handling. Watchers may add limited evidence.
- **Profile confusion.** A verifier MUST stop before behavior selection if it does not implement the named profile or version. Falling back after a failed RPC or parse is unsafe.
- **Storage retention.** Content-addressed storage networks have economic, not absolute, retention. The mirroring and re-serve obligations above keep the trust argument independent of any single network's behavior.
- **Integer and unit errors.** Every amount is range-checked before arithmetic. Implementations MUST reject overflow, mixed decimal scales, unsafe host-language integers, and an undeclared rounding rule.
- **Privacy and legality.** Public archives may expose addresses, strategy positions, or venue data. A deployment must assess data rights and legal duties before publication. PMVS conformance is not that assessment.

## Copyright

Copyright and related rights on this document's text are waived via CC0-1.0. No license to any implementation code, trademark, or patent is granted or implied by this document.
