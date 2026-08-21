# PMVS watcher profile: `watcher/0` (EXPERIMENTAL)

```
pmvs-part:      profile (watcher)
profile-id:     watcher/0
version:        0 (experimental draft)
status:         Experimental draft; alarm method unresolved
author:         Ivan Morozov (Zeit Finance)
created:        2026-08-18
requires:       PMVS Parts I, III; a venue profile
```

Watchers record their own venue observations near an operator's capture. The observation format is normative for this draft. Statistical alarms remain experimental. Watcher agreement does not authenticate a venue response, and common control can manufacture agreement.

```
operator record R ---- compare within the declared window
                              |
watcher records O1, O2 -------+

same opaque book hash: exact correlation
temporal bracket only: INCONCLUSIVE unless a named alarm method applies
no eligible observation: INCONCLUSIVE
```

## Observation records (normative)

A watcher publishes a Part I envelope with `kind: "watcher-observation"`, `stream: "watcher"`, and `producer` equal to its signer. Its stream is keyed by `(subjectId, producer)`. The record contains observation time, request start and end, token-selection rule, sampling-window id, raw response hashes and locations, normalized ladders, and venue correlation fields. The watcher derives candidate tokens from the latest subject valuation and venue listing. It records that derivation and any sampled subset.

Sampling MUST be time-randomized within declared windows. Before a window starts, the watcher anchors a commitment to the seed, window, selection rule, and expected sample count. It reveals the seed after the window. Every scheduled sample receives an observation or an explicit watcher gap. Omitting a failed or unfavorable sample reduces coverage. A W designation requires watcher anchors within the declared latency; signatures without timely anchors do not establish observation order.

## Corroboration (normative, weak claims only)

For an operator record R at capture time t and position i:

1. **Exact correlation match.** If an eligible watcher observation near time `t` carries a book `hash` byte-equal to the operator record for the same token, both captures report the same opaque venue correlation value. This is the clearest signal the profile produces. It does not prove the book was true or independently generated.
2. **Temporal bracketing (heuristic).** Without an exact match, watcher observations bracketing t bound nothing formally, because a book can change arbitrarily between two observations. Bracket comparisons (crossing R's position size into the bracketing ladders and comparing marks) are heuristic evidence and MUST be labeled `INCONCLUSIVE` unless the experimental alarm methodology below is explicitly invoked, with its version named.
3. No eligible observations means `INCONCLUSIVE`. Non-detection is never evidence of correctness: an unwatched or thinly watched subject has no T3 signal.

## Alarm methodology (EXPERIMENTAL, not a conformance surface)

A bias detector needs all of these declared inputs:

- sampled population and eligibility windows;
- minimum sample count;
- test statistic and null hypothesis under book-dynamics noise;
- significance and power targets;
- autocorrelation treatment, because consecutive book observations are not independent draws;
- multiple-testing correction across positions and records;
- missing-data treatment; and
- a NAV-weighted effect size, so a large deviation on a negligible position is not confused with a small deviation on a concentrated position.

Version 0 fixes none of those choices. A deployment that experiments with alarms MUST publish the full parameter set with any `FIDELITY_SUSPECT` output. That output can prompt human investigation. It is never an automated conformance verdict.

## Independence and reporting

A watcher under the operator's administration does not count as independent. `W(n, coverage, window, diversity)` reports eligible watchers, scheduled-sample coverage, the evaluation window, and an administrative and infrastructure-diversity statement. Sybil resistance here is organizational, not cryptographic. The report lists missed samples and common API, cloud, gateway, and key-control dependencies.

## Copyright

Copyright and related rights on this document's text are waived via CC0-1.0.
