# PMVS Part I. Core: identity, records, attestation, anchoring, conformance

```
pmvs-part:      core
version:        1 (draft)
status:         Draft
author:         Ivan Morozov (Zeit Finance)
created:        2026-08-18
discussions-to: TBD
```

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119 and RFC 8174.

## Abstract

PMVS (Prediction Market Vault Standard) is an attested-disclosure audit standard for pooled vaults whose portfolios are held and traded at prediction-market venues that are not themselves on-chain. Such a vault cannot compute `totalAssets()` on-chain: its positions live at the venue, its marks come from venue data, and its price per share is asserted by an operator. PMVS does not remove that trust. It makes every operator assertion integrity-protected, complete, attributable, and deterministically re-checkable from public data.

PMVS delivers forensic detectability after the fact. It does not deliver prevention: there is no challenge period, fraud proof, bond, or veto path in this version. An operator who publishes a dishonest record commits to it irrevocably and detectably; the standard does not stop the associated settlement from executing. Remediation mechanisms are explicitly future work (reserved: PMVS-CHALLENGE).

This Part defines the machinery every other Part builds on: subject identity, the record envelope, canonical serialization (PMVS-JCS), record hashing and chaining, operator attestation, on-chain anchoring, storage abstraction, the verifier verdict vocabulary, and the conformance ladder. Part II defines epoch settlement and its archives. Part III defines the valuation methodology (PMVS-M1). Profiles bind venue-, storage-, and watcher-specific behavior; they are versioned independently and deliberately kept out of this core.

## Definitions

- **Subject**: the economic vault under audit, identified as `(chainId, shareToken)`. Not the adapter: adapters can be migrated while the share token persists.
- **Share token**: the ERC-20 token representing vault shares (18 decimals, EIP-2612 permit, no transfer hooks).
- **Asset**: the settlement collateral, an ERC-20 with `D` decimals. `D = 6` in the precursor deployment.
- **Operator**: the off-chain actor that executes settlement and publishes records. An operator address MAY be an EOA or a contract such as a Safe.
- **Authority**: an on-chain role empowered to perform a class of privileged action. PMVS distinguishes five: the **settlement authority** (executes epoch rolls), the **valuation authority** (publishes gross PPS), the **fee authority** (sets the performance-fee rate), the **custody authority** (moves collateral between system components and external custody), and **governance** (rotates the other four). These roles are held by addresses that MAY differ and MAY rotate independently. Nothing in the precursor contracts forces them to coincide.
- **Record**: a canonical JSON document published by the operator: valuation records, settlement archives, receipts, retirement records, correction records, gap records.
- **Anchor**: an on-chain commitment to a record's hash.
- **Verifier**: any third party executing the verification procedures of Parts I through III.
- **Watcher**: an independent party publishing its own contemporaneous venue observations (profile `watcher/0`, experimental).
- **Epoch / roll**: see Part II.
- **Retirement states**: three distinct conditions that MUST NOT be conflated. *Wind-down opened* is the application-level decision to stop normal operation. The *settlement pin* is a fixed price per share applied to wind-down redemptions. *Terminal retirement* is the on-chain irreversible state after which the contract rejects new withdrawal requests. Part II defines a record kind for each.

### Version axes

Exactly one on-chain protocol version exists in this standard: `ROLL_SETTLEMENT_VERSION` (Part II), which governs the fee-ordering semantics of settlement. It is unrelated to (a) the revision number of these documents, (b) lifecycle capabilities such as request pausing, which are feature presence rather than protocol semantics, and (c) any implementation-internal versioning. Documents and records name their own versions explicitly. No other version axis appears in this standard.

## Subject identity and component graph

1. Every record MUST identify its subject as `(chainId, shareToken)`, both fields canonical: a decimal-string chain id and a lowercase `0x` address.
2. `subjectId` is defined as `keccak256(abi.encodePacked(uint256 chainId, address shareToken))`. Test vector: `chainId = 137`, `shareToken = 0x4aff8269a587643f68aa8e58c5ad93d9423e8624` gives `subjectId = 0x119eba4ba90359458811e719965925e255c3537b907914b6428f775c8d297892`.
3. Each subject MUST publish a **component-generation record** (`kind: "components"`) before its first anchored record and after every component change. It lists the current adapter, teller, accountant, fee manager, and any auxiliary contracts, each with its address and the `keccak256` of its runtime code, plus the addresses currently holding each of the five authorities and the on-chain source of each (contract and getter).
4. Component migration, such as replacing the adapter over the same share token, MUST be represented by a new component-generation record carrying `supersedes: <recordHash of previous>`. The superseded generation's record set remains valid history. Claims against a superseded adapter remain claimable under that adapter's own rules; the migration record MUST say so or state the replacement path.
5. An operator serving multiple subjects MUST scope every record, sequence, and chain to one subject. Records never span subjects.
6. Internal identifiers (databases, UUIDs) MUST NOT appear as subject identity. They MAY appear under the non-normative `meta` object.

## PMVS-JCS/1: canonical serialization

Records are serialized with a restricted profile of RFC 8785 (JCS), named PMVS-JCS/1:

1. **Scalars.** Permitted scalar types are string, boolean, and `null`. JSON numbers are forbidden anywhere in a record. A serializer encountering a number MUST fail; a verifier encountering one MUST return `INVALID_ENCODING`.
2. **Integers.** Numeric quantities are decimal strings matching `0|[1-9][0-9]*`, optionally preceded by `-` only where a field is explicitly signed. No leading zeros, no `+`, no `-0`, no decimal point, no exponent. Each schema field declares a bit width; values at or above 2^width are invalid. Quantities are expressed in base units (asset base units, share wei, WAD), never as fractional decimals.
3. **Hex.** Addresses are lowercase `0x` plus 40 hex characters; hashes are lowercase `0x` plus 64. Mixed-case (checksum) forms are invalid inside records.
4. **Objects.** Keys are sorted by UTF-16 code units (JCS order). Duplicate keys are invalid. A parser that silently discards duplicates is not a conforming verifier: verification MUST operate on raw bytes and reject duplicates before parsing (`INVALID_ENCODING`).
5. **Strings.** ECMAScript `JSON.stringify` escaping (the JCS string rule). Input MUST be valid Unicode; unpaired surrogates are invalid. Encoding is UTF-8 without BOM. No insignificant whitespace.
6. **Arrays.** Order is significant and defined per schema field. Arrays never carry set semantics.
7. **I-JSON.** Records MUST satisfy RFC 7493.

The published bytes MUST already be canonical: `recordHash` is computed over the exact published bytes, and a verifier additionally re-canonicalizes the parsed document and requires byte equality.

Canonicalization vector (an illustrative record fragment; input keys deliberately unordered):

```
canonical:
{"context":{"epoch":"7","kind":"roll","prev":"0x0000000000000000000000000000000000000000000000000000000000000000","sequence":"42"},"outputs":{"grossPps":"1100000000000000000","ünicode":["true-string",true,null]},"schema":"pmvs/valuation-record","schemaVersion":"1","subject":{"chainId":"137","shareToken":"0x4aff8269a587643f68aa8e58c5ad93d9423e8624"}}

recordHash = keccak256(utf8(canonical))
           = 0x54ffd48315146c62079c7b3cfd2577b174968754063ed1311819815e824be5df
```

Note that `"ünicode"` (U+00FC) sorts after `"grossPps"`: key order is UTF-16 code-unit order, not locale order. Grammar rejection vectors: `"01"`, `"+1"`, `"-0"`, `"1.0"`, `"1e0"`, and `""` are all invalid integer lexemes.

## Record envelope, hashing, chaining

Every published artifact is an envelope:

```jsonc
{
  "record": { /* the hashed region — schema per record kind */ },
  "attestation": {
    "recordHash": "0x…",          // keccak256(PMVS-JCS bytes of `record`)
    "scheme": "eip712-ecdsa" | "eip712-erc1271",
    "signer": "0x…",
    "signature": "0x…"
  },
  "locations": [ "ar://…", "https://…" ]   // transport hints, unhashed
}
```

1. `recordHash = keccak256(canonicalBytes(record))`. Keccak-256 is the EVM-native hash, so the on-chain anchor and any future contract-side check cost one opcode.
2. `attestation` and `locations` live outside the hashed region, which avoids circularity. Tags, filenames, and transport metadata carry no trust. All trust derives from `recordHash`, the attestation, and the anchor.
3. Every `record` carries `context`: `{ kind, sequence, prev, … }`. `sequence` is a per-subject counter increasing by exactly 1 from `"0"`. `prev` is the `recordHash` of the preceding record for the subject (`0x00…00` at genesis). All record kinds share one chain per subject: valuation, archive, receipt, components, retirement, correction, gap.
4. Unknown fields inside `record` are hash-bound and MUST be preserved by tooling. A verifier that encounters an unknown value in any field that selects verification behavior (schema, methodology, profile identifiers) MUST return `UNSUPPORTED_PROFILE`, never `VALID`.
5. A record whose `kind` is `"retirement-final"` is terminal. The only records permitted after it are `correction` records.

```
 record 0 ──▶ record 1 ──▶ record 2 ──▶ record 3 ──▶ record 4
 (genesis)        ▲prev         ▲prev        ▲prev        ▲prev
                  │             │            │
    anchor A ─────┘             │  anchor B ─┘
    on-chain:                   │  commits records 2..3 transitively,
    (subject, seq, prev,        │  PROVIDED the intermediates are
     recordHash, uri)           │  retrievable; a missing one is
                                └─ CHAIN_BROKEN, not silence
```

### What the chain does and does not provide

The hash chain is fork-detecting, not append-only. An operator holding the signing key can sign two different records with the same `(subject, sequence, prev)`. Therefore:

- Two attested records with equal `(subject, sequence, prev)` and different hashes constitute equivocation. Equivocation is a permanent conformance failure for the subject (`EQUIVOCATION`), regardless of which branch was anchored.
- An anchor commits one selected ancestry, and only if every intermediate record is retrievable. It does not prove that omitted records never existed, and it does not prove cadence.
- Cadence is therefore made checkable structurally: periodic record kinds occupy deterministic slots (declared cadence; see Part III and the conformance parameters). A slot with no data MUST be filled by an explicit signed gap record (`kind: "gap"`, carrying the slot id and a reason code). Missing slots are `MISSING_RECORD`. Retrospective back-filling of slots after the declared grace is `STALE`, and records so filed MUST carry `late: true`.
- Retrospective anchoring MUST NOT be described as continuous disclosure. Conformance level L3 is named accordingly (below).

## Attestation

1. Every record MUST be signed by the address holding the relevant authority for that record kind: the settlement authority for archives and receipts, the valuation authority for valuation records, and either (declared per deployment in the component-generation record) for components, retirement, gap, and correction records.
2. The signature scheme is EIP-712 over domain `{ name: "PMVS-Attestation", version: "1", chainId }` with primary type:

```
Attestation(bytes32 recordHash,uint8 kind,bytes32 subjectId,uint64 sequence,bytes32 prev)
```

`kind` is a compact enum: `1` valuation, `2` settlement-archive, `3` receipt, `4` components, `5` winddown-opened, `6` retirement-pin, `7` retirement-final, `8` correction, `9` gap, `10` watcher-observation.

3. ECDSA signatures MUST use canonical low-`s` form with `v` in `{27, 28}`. Contract signers verify through ERC-1271 (`isValidSignature` against the EIP-712 digest); the envelope's `scheme` field says which path applies. EIP-712 provides no replay protection by itself. Replay is excluded because `recordHash`, `subjectId`, and `sequence` sit inside the signed struct.
4. **Authority timing.** The signature is validated against the authority holder in force immediately before the anchor transaction is included, ordered by block, then transaction index, then log index. It is NOT validated against the authority at the record's valuation block. That rule would reject a legitimate successor anchoring after a rotation and accept a revoked key backdating records. `valuationBlock` (data provenance) and anchor-time authority (attribution) are independent dimensions.
5. If the relevant authority rotates between record creation and anchoring, the operator MUST rebuild and re-sign the record (same content, new attestation) before anchoring.

Attestation vector (test key `0x…01`, signer `0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf`, chainId 137):

```
message = { recordHash: 0x63b263cd41b1160c1a92be6a17df1a1de6ae9e5f0a9a11b6ad2b6fe9f8a9c9d1,
            kind: 1, subjectId: 0x119eba4ba90359458811e719965925e255c3537b907914b6428f775c8d297892,
            sequence: 42, prev: 0x0000000000000000000000000000000000000000000000000000000000000000 }
digest    = 0x4d95750285cf67db2be98d6f79d99a602ab7abcdfc3e4023e820f6534fee2049
signature = 0xe133fc4d547e1f9def7c768fd12a720ca31ef38faf2628c3469d42963ac214830514780ec7abfb67f6bb58d757fe39e4eeb69a7014520cf2bb8c96c693c1ca3a1b
negative  : same message under chainId 1 → digest 0x1a9c318d915e37fb6c3977ebab9b0a2c76c0f043a1f76256a3bf831bbe0ec9dc (differs)
```

## Anchoring

An anchor is an on-chain commitment `(subjectId, kind, sequence, prevAnchorHash, recordHash, uri)`.

1. **New deployments (L1b).** The settlement contract MUST emit `ValuationCommitted(uint64 indexed epoch, uint8 kind, bytes32 recordHash, string uri)`, or an equivalent event carrying at least `(kind, sequence, prev, recordHash, uri)`, inside the same transaction as the settlement it covers. The roll entry points, including the zero-NAV path, MUST take the pre-settlement record anchor as an argument so a roll cannot execute without it. This is the only configuration entitled to the phrase *fail-closed publication*.
2. **Legacy deployments (L1a).** Already-deployed immutable contracts cannot emit new events. They anchor through a singleton, append-only **ValuationRegistry** contract per chain: `commit(address adapter, uint8 kind, uint64 sequence, bytes32 prev, bytes32 recordHash, string uri)`, access-gated against the declared authority set of the subject (readable on-chain, for example `adapter.operator()`). Two caveats are part of the standard's honesty and MUST be disclosed wherever L1a conformance is claimed: (a) a registry commitment cannot make the adapter revert, so it is authenticated post-hoc observability rather than fail-closed publication; (b) gating on one role, such as the adapter's roll executor, authenticates that role only. Where authorities diverge, the registry entry does not speak for the valuation or fee authority. The registry MUST store `(sequence, prev)` and reject a second commit for an occupied `(subject, sequence)` (compare-and-set head), which makes equivocation visible on-chain.
3. The registry, and new-deployment contracts, SHOULD emit `ArtifactLocationAdded(bytes32 recordHash, string uri)`, letting the role holder register additional locations for an already-committed hash. Re-uploading identical bytes to a content store yields the same hash and a new locator, so discovery is repairable without touching the commitment.
4. **Finality and reorgs.** Verifiers MUST read anchors at a declared confirmation depth (a per-chain parameter in the component-generation record). An anchor orphaned by a reorg is void; the operator MUST re-anchor. Competing anchors for one `(subject, sequence)` across reorg branches resolve to the canonical chain. If both land on the canonical chain, the earlier by (block, tx index, log index) prevails, and the later is `EQUIVOCATION` evidence if its hash differs.
5. Periodic (non-settlement) records need no individual anchor: each anchored record transitively commits its whole `prev` ancestry back to the previous anchor, provided every intermediate record is retrievable. Missing intermediates convert the transitive claim into `CHAIN_BROKEN`.

## Storage abstraction

1. Records MUST be retrievable from content-addressed or content-verified public storage: given `recordHash`, any honest holder of the bytes can serve them and any verifier can check them. The storage layer is untrusted transport. No storage property participates in the trust argument.
2. A storage profile (for example `storage/arweave/1`) defines the upload lifecycle, inclusion confirmation, read-back verification, discovery tagging, and bundling. Conformance claims name the profile.
3. The standard does not use the word *permanence*. Storage claims are stated as testable properties: inclusion (the bytes were accepted at height H), retrievability (the bytes are servable from at least two independent read paths at audit time), mirroring (the operator retains and can re-serve the bytes), and retention assumptions (documented, economic or contractual, of the chosen network).
4. Operators MUST retain the canonical bytes of every record they have anchored and MUST be able to re-serve them. Loss of the only copy of an anchored record is `MISSING_RECORD` against the operator regardless of storage-network behavior.

## Verifier verdict vocabulary

A verifier evaluates records and subjects to exactly these verdicts:

| Verdict | Meaning |
|---|---|
| `VALID` | All applicable checks passed. |
| `INVALID_ENCODING` | Bytes are not canonical PMVS-JCS (numbers, duplicate keys, bad lexemes, escaping, BOM, surrogates). |
| `INVALID_HASH` | Bytes do not hash to the committed or claimed `recordHash`. |
| `INVALID_SIGNATURE` | Attestation fails: bad signature, wrong scheme, or signer not the authority at anchor time. |
| `UNSUPPORTED_PROFILE` | A behavior-selecting field names a profile, schema, or methodology the verifier does not implement. |
| `ARITHMETIC_MISMATCH` | Deterministic re-execution of record inputs does not reproduce record outputs. |
| `CHAIN_STATE_MISMATCH` | A recorded chain read does not match archive-node state at the pinned block. |
| `SETTLEMENT_MISMATCH` | Archive contents are inconsistent with on-chain roots, totals, selections, or events (Part II). |
| `CHAIN_BROKEN` | The `prev`/`sequence` ancestry cannot be walked (gap, unretrievable intermediate). |
| `EQUIVOCATION` | Two attested records share `(subject, sequence, prev)` with different hashes. Permanent. |
| `MISSING_RECORD` | A required record (per event, registry, or slot) is unretrievable after grace from at least two read paths. |
| `STALE` | The record exists but violated its declared latency or grace. |
| `UNANCHORED` | Published and attested but never anchored. |
| `DATA_UNAVAILABLE` | The record declares an input-source failure (Part III); distinguished from asserting a zero value. |
| `INCOMPLETE_INVENTORY` | The position-inventory rules of Part III are not satisfied; the record cannot support L2 claims. |
| `UNVERIFIABLE_INVENTORY` | Inventory completeness cannot be established from public data for this record. |
| `UNVERIFIABLE_INPUTS` | The record predates the standard or lacks pinned inputs. This is the permanent classification of all pre-standard history, including the precursor deployment's past valuations. |
| `INCONCLUSIVE` | A corroboration check (watcher bracketing) had no eligible evidence. |
| `FIDELITY_SUSPECT` | Statistical corroboration flagged operator-published venue inputs (watcher profile). Evidence, not proof. |

Subject status aggregates as follows. Any of `INVALID_*`, `ARITHMETIC_MISMATCH`, `CHAIN_STATE_MISMATCH`, `SETTLEMENT_MISMATCH`, `EQUIVOCATION`, `CHAIN_BROKEN`, or `MISSING_RECORD` means failing. `STALE`, `UNANCHORED`, `DATA_UNAVAILABLE`, `INCONCLUSIVE`, and `FIDELITY_SUSPECT` are warnings. `UNVERIFIABLE_*` are scope limits, reported as such.

## Conformance

Every conformance-determining requirement is a MUST. Each deployment declares, in its component-generation record: `cadenceSeconds` (periodic record slot width), the capture window, per-kind grace windows, the evaluation window, the maximum consecutive gap slots, and the per-chain confirmation depth. A conformance claim without these parameters is void.

```
 L1a  anchored settlement disclosure   reachable by legacy deployments
  └─ L1b  fail-closed settlement       new deployments; anchor in the roll ABI
      └─ L2  valuation-reproducible    records pin inputs; engine re-runs pure
          └─ L3  continuity-auditable  slots, coverage, correction discipline
 W(n, coverage, window, diversity)     watchers; orthogonal to the ladder
```

- **L1a, anchored settlement disclosure** (reachable by legacy deployments). For every executed roll: a Part II settlement archive published, attested, and registry-anchored within grace; retirement handled with the three record kinds of Part II; verifier settlement checks pass. The disclosure caveats of the registry path apply and MUST accompany the claim.
- **L1b, fail-closed settlement** (new deployments). L1a, plus the anchor is consumed or emitted atomically by the roll ABI: no roll can execute without its pre-settlement record.
- **L2, valuation-reproducible.** L1a or L1b, plus for every roll a pre-roll valuation record and a post-roll receipt per Parts II and III, satisfying Part III inventory completeness and determinism. Independent re-execution reproduces outputs byte-exactly.
- **L3, continuity-auditable disclosure.** L2, plus periodic valuation records at the declared cadence with 100% slot coverage (data or signed gap records), daily anchoring windows honored, and correction discipline. The name is deliberate: disclosure is auditable for continuity. It is not "continuous verification".
- **W(n, coverage, window, diversity)**: an orthogonal designation, never claimed bare. `n` independent watchers, their sampling coverage, the evaluation window, and an administration-diversity statement. One watcher, or watchers under common administration, provide corroboration of correspondingly limited weight.

The claim wording is fixed: *"conforms to PMVS Core v1 at Level L with venue profile p and storage profile s"*.

**Precursor status.** The Zeit deployment that motivated this standard currently conforms to no level. It publishes per-roll settlement archives in a pre-standard shape, with no hash anchoring, no attestation, no retirement records, and no verifier. Parts II and III each carry a precursor-gap section enumerating the distance (the four safety-tagged valuation gaps were closed in the precursor on 2026-08-18; the rest remain open conformance work). Pre-standard history is `UNVERIFIABLE_INPUTS` forever. Conformance can begin only at the first conformant record.

## Trust framing

What verification proves, stated exactly:

- **T1, anchored-disclosure integrity.** The anchored bytes are the bytes the authority signed. Membership proofs, selections, totals, and per-request settlement amounts are consistent with the on-chain commitments. Recorded chain state matches the chain at the pinned blocks. Misstatements here are provable to anyone.
- **T2, deterministic reproduction.** The published outputs (marks, NAV, PPS) are exactly the declared methodology applied to the disclosed, integrity-protected inputs. This is deterministic re-execution of attested disclosures. It proves the operator did not misapply the methodology to what it disclosed. It does not prove the disclosed venue inputs were true.
- **T3, contemporaneous corroboration.** Independent watchers can corroborate some venue observations statistically. The venue signs nothing. Displayed liquidity is cancellable and spoofable. Colluding or sybil watchers corroborate nothing. T3 output is evidence, never proof, and the absence of corroboration failure is never evidence of correctness.

Publication cannot prevent a dishonest settlement. It guarantees the dishonesty is committed, attributed, and detectable. Deployments wanting prevention need mechanisms outside this version's scope (challenge windows, bonds, vetoes), reserved for PMVS-CHALLENGE.

## Security considerations (core scope)

- **Key compromise.** An attacker holding an authority key can sign and anchor false records. PMVS makes this attributable, not impossible. Authorities SHOULD be contracts with multisig or timelock policies; ERC-1271 support exists for exactly this reason.
- **Rotation races.** Anchor-time authority validation (above) closes the backdating and successor-rejection races. Implementations MUST NOT validate against valuation-block authority.
- **Equivocation.** Fork detection depends on verifiers comparing records across sources. The registry's compare-and-set head makes same-`(subject, sequence)` double-commits visible on the chain itself.
- **ERC-1271 signers.** Contract wallets may change owners without on-chain events legible to PMVS. The attestation binds to the authority address; its internal policy changes are out of scope. Deployments SHOULD disclose signer-policy conventions in the component-generation record.
- **Storage retention.** Content-addressed storage networks have economic, not absolute, retention. The mirroring and re-serve obligations above keep the trust argument independent of any single network's behavior.
- **Registry deployment.** The registry is trusted for availability and its access gate only, never for content. Its address and runtime code hash MUST be declared in the component-generation record.

## Copyright

Copyright and related rights on this document's text are waived via CC0-1.0. No license to any implementation code, trademark, or patent is granted or implied by this document.
