# PMVS: Prediction Market Vault Standard (Draft)

**Status: Draft.** Author: Ivan Morozov (Zeit Finance). Created 2026-08-18. Discussions-to: TBD.

This repository is the standalone home of the PMVS draft. The suite was extracted from the Zeit monorepo (`docs/pmvs/`), which tracks the precursor implementation the gap tables refer to; the two copies are synced manually. The text of every document here is CC0 (see LICENSE). Publication and visibility decisions follow the prerequisites at the bottom.

## What PMVS is

An **attested-disclosure audit standard** for pooled vaults trading at centralized prediction-market venues. Such vaults cannot compute `totalAssets()` on-chain: positions live at the venue, marks come from venue data, and price per share is asserted by an operator. PMVS does not remove that trust. It makes every operator assertion integrity-protected, complete, attributable, and deterministically re-checkable from public data. Settlements verify against Merkle commitments and published archives. Valuations re-execute byte-exactly from records that pin every input. Every record is hash-chained, signed by the on-chain authority, and anchored on-chain.

```
                         investors
                            │  requests in, Merkle-proof claims out
                            ▼
         ┌─ on-chain (Polygon) ─────────────────────────────┐
         │  EscrowAdapter ── Teller ── BoringVault (shares)  │
         │        │                    Accountant (PPS, HWM) │
         │   roots + totals + events   FeeManager (fees)     │
         └────────┬────────────────────────────▲─────────────┘
                  │ rollEpoch (one tx/epoch)   │ anchors: keccak(record)
                  ▼                            │
     operator + solver (off-chain) ──── valuation engine (PMVS-M1)
          │   select → price → archive → publish → execute
          │                          │
          ▼                          ▼
     Polymarket venue          content-addressed storage
     (positions, books)        (archives + valuation records)
                                     ▲
                                     │ fetch, hash, re-execute, compare
                          independent verifiers and watchers
```

What PMVS is **not**: not trustless and not preventive. This version has no challenge period, fraud proof, bond, or veto. A dishonest settlement executes; the standard guarantees it is committed, attributed, and detectable afterward. Forensic detectability, in other words. Prevention mechanisms are reserved as PMVS-CHALLENGE, future work. The document structure borrows from EIP-1, but PMVS carries no ERC number or category. Entering the Ethereum EIP process, if that ever happens, is a separate act under that process's rules.

## Parts

| Document | Scope | Version |
|---|---|---|
| [`pmvs-core.md`](./pmvs-core.md) | Part I. Subject identity, PMVS-JCS canonicalization, record envelope and hash chain, EIP-712/ERC-1271 attestation, on-chain anchoring (event and legacy registry), storage abstraction, verdict vocabulary, conformance ladder, trust framing (T1/T2/T3) | core v1 draft |
| [`pmvs-settlement.md`](./pmvs-settlement.md) | Part II. Epoch request-and-claim interface, byte-exact Merkle encodings with vectors, settlement and fee computation with vectors, PMVS-SettlementArchive/1, roll chronology (pre-roll record plus receipt), claims, retirement (three record kinds), precursor gaps G1-G9 | settlement v1 draft |
| [`pmvs-m1.md`](./pmvs-m1.md) | Part III. Valuation methodology PMVS-M1: chain-derived inventory completeness, displayed-book cross mark, redemption marks, illiquidity policy, quiescent capture, cash perimeter, capture/compute determinism, precursor gaps M1-M12 | m1 v1 draft |
| [`profiles/venue-polymarket-1.md`](./profiles/venue-polymarket-1.md) | Venue profile: Polymarket CLOB. Contracts, inventory bindings, book-capture rules, resolution, fees, degraded modes | venue/polymarket/1 draft |
| [`profiles/storage-arweave-1.md`](./profiles/storage-arweave-1.md) | Storage profile: Arweave. Txid-versus-hash precision, upload lifecycle, bundling, tags, retention honesty | storage/arweave/1 draft |
| [`profiles/watcher-0-experimental.md`](./profiles/watcher-0-experimental.md) | Watcher profile: observation format (stable) plus alarm methodology (experimental) | watcher/0 experimental |

Profiles are versioned independently so mutable venue, storage, and watcher facts never contaminate the core.

## Conformance at a glance

```
 L1a  anchored settlement disclosure    archives hashed + attested + registry-anchored
  └─ L1b  fail-closed settlement        the roll ABI itself carries the anchor
      └─ L2  valuation-reproducible     pre-roll records + receipts, pure re-execution
          └─ L3  continuity-auditable   declared cadence slots, 100% coverage, corrections
 W(n, coverage, window, diversity)      orthogonal watcher designation, never claimed bare
```

Claim wording is fixed: *"conforms to PMVS Core v1 at Level L with venue profile p and storage profile s"*.

**Precursor status (updated 2026-08-18).** The Zeit deployment that motivated this standard conforms to no level yet: it publishes pre-standard roll archives with no hash anchoring, no attestation, no retirement records, and no verifier tooling. The gap tables in Parts II and III (G1-G9, M1-M12) are the migration roadmap. The four safety-tagged valuation gaps (M1-M4: whole-dollar redemption floor, zero-NAV decided before redemption, unbounded zero-bid write-off, silent empty-position NAV) were closed in the precursor on 2026-08-18, with an adversarially verified fix cycle and a regression harness; the remaining gaps are conformance work, not live hazards. All pre-standard history stays `UNVERIFIABLE_INPUTS` forever.

## Test vectors

The vectors embedded in Parts I and II cover Merkle leaves, trees, and proofs (including negative encodings and the odd-duplication ambiguity), settlement pricing, the two-stage fee mint (including the adversarial case where a single-ceiling formula diverges), the final-roll asset fee with its headroom cap, conversions and zero-output handling, PMVS-JCS canonicalization with its record hash, attestation digests and signatures, and selection hashes. Two independent implementations generated every vector, one derived from the production settlement code and one written fresh from the spec text, with byte-equal results.

## Publication prerequisites (tracked outside this suite)

1. Owner approval of final language.
2. Licensing: the precursor code has no license grant today (SPDX headers alone are not a grant); CC0 here covers document text only.
3. Venue data rights: embedding and durably republishing venue API responses needs terms, database-rights, and privacy clearance (see the venue profile's note).
4. Regulatory review of promoting a prediction-market vault standard, beyond language approval.
