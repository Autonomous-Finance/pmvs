# PMVS watcher profile: `watcher/0` (EXPERIMENTAL)

```
pmvs-part:      profile (watcher)
profile-id:     watcher/0
version:        0 (experimental draft)
status:         Draft — statistical methodology explicitly unresolved
author:         Ivan Morozov (Zeit Finance)
created:        2026-08-18
requires:       PMVS Parts I, III; a venue profile
```

Watchers are independent parties who record their own contemporaneous venue observations so that operator-published venue inputs (Part I trust tier T3) can be corroborated. This profile splits deliberately: the observation format is stable and normative, while the statistical alarm methodology is experimental and will version separately once empirically validated. Nothing in this profile upgrades T3 beyond corroboration. The venue signs nothing, displayed liquidity is cancellable, and watcher agreement can be manufactured by collusion.

```
 operator capture ──▶ record R (venueState: books, venue hash fields)
                              │
                              │  compare within ±window
                              ▼
 watcher samples ──▶ observations O₁, O₂, ... (own chain, own key)
      exact venue-hash match with R?  ──yes──▶ strong corroboration
      only temporal bracketing?       ──────▶ heuristic / INCONCLUSIVE
      no eligible observation?        ──────▶ INCONCLUSIVE (no signal)
```

## Observation records (normative)

A watcher publishes Part I envelopes with `kind: "watcher-observation"`, on its own per-watcher hash chain, attested by its own EVM key (Part I attestation, with `subjectId` naming the watched subject). The schema: subject; context (sequence, prev, observationTime plus unix ms); venueState in the same byte discipline as Part III capture, meaning per-token ladders (or full raw responses with hashes), venue correlation fields (`hash`, `timestamp`) verbatim, and request timing; plus the watcher's declared sampling parameters (window width, token-selection rule, randomization source). The tracked token set derives from the subject's latest published valuation record plus the venue's position listing for the custody account, and the derivation MUST be recorded.

Sampling MUST be time-randomized within declared windows (uniform within each window of at most `watcherWindowSeconds`). The randomization seed handling SHOULD be commit-reveal so an operator cannot learn sampling instants in advance. Publication latency bounds and storage-profile rules apply as they do for operator records.

## Corroboration (normative, weak claims only)

For an operator record R at capture time t and position i:

1. **Exact correlation match.** If any watcher observation within plus or minus `watcherWindowSeconds` of t carries a venue correlation field (the book `hash`) byte-equal to R's for token i, that book is strongly corroborated: the venue reported the same book state to an independent party near t. Exact matches are the highest-value signal this profile produces.
2. **Temporal bracketing (heuristic).** Without an exact match, watcher observations bracketing t bound nothing formally, because a book can change arbitrarily between two observations. Bracket comparisons (crossing R's position size into the bracketing ladders and comparing marks) are heuristic evidence and MUST be labeled `INCONCLUSIVE` unless the experimental alarm methodology below is explicitly invoked, with its version named.
3. No eligible observations means `INCONCLUSIVE`. Non-detection is never evidence of correctness: an unwatched or thinly watched subject simply has no T3 signal.

## Alarm methodology (EXPERIMENTAL, not a conformance surface)

A defensible bias detector must define the sampled population and eligibility windows, a minimum sample count, the test statistic and its null hypothesis under book-dynamics noise, significance and power targets, autocorrelation handling (books are strongly autocorrelated, so consecutive observations are not independent draws), multiple-testing correction across positions and records, missing-data treatment, and a NAV-weighted effect size (a large relative deviation on a negligible position is not a material event, while a small one on a concentrated position is). None of these are fixed in version 0. Deployments experimenting with alarms MUST publish the full parameterization alongside any `FIDELITY_SUSPECT` output, and such output is evidence for human investigation, never an automated conformance verdict.

## Independence and reporting

One watcher under the operator's own administration corroborates nothing. The designation reported per Part I is always parameterized, `W(n, coverage, window, diversity)`: the number of watchers, the fraction of records with eligible observations, the evaluation window, and an administration-diversity statement covering who runs them and on what infrastructure. Sybil resistance is organizational, not cryptographic. The diversity statement is a human-auditable claim and MUST say so.

## Copyright

Copyright and related rights on this document's text are waived via CC0-1.0.
