# PMVS watcher profile: `watcher/0` (EXPERIMENTAL, NON-CONFORMING)

```
pmvs-part:      profile (watcher)
profile-id:     watcher/0
version:        0 (experimental draft)
status:         Experimental only; not a PMVS conformance profile
author:         Ivan Morozov (Zeit Finance)
created:        2026-08-18
requires:       PMVS Parts I, III; a venue profile
```

Watchers record their own venue observations near an operator's capture. Version 0 is a research sketch, not a conformance profile. Its sampling procedure and statistical alarms are provisional. Watcher agreement does not authenticate a venue response, and common control can manufacture agreement.

Part I currently defines the `watcher-observation` kind but does not define record kinds for a sampling-seed commitment or a watcher gap. The base schema also lacks closed shapes for those records. Version 0 therefore cannot encode or verify the complete procedure described below.

Version 0 contributes no evidence to a PMVS conformance claim and cannot support a `W(...)` claim. A deployment can publish these experimental records alongside an otherwise conforming subject, but verifiers exclude them from conformance. A later version can become a conformance profile only after it defines the missing record kinds, closed schemas, canonical fixtures, signature and sequencing vectors, and executable verification tests.

```
operator record R ---- compare within the declared window
                              |
watcher records O1, O2 -------+

same opaque book hash: exact correlation
temporal bracket only: INCONCLUSIVE unless a named alarm method applies
no eligible observation: INCONCLUSIVE
```

## Provisional observation records

A prototype watcher can publish a Part I envelope with `kind: "watcher-observation"`, `stream: "watcher"`, and `producer` equal to its signer. Its stream is keyed by `(subjectId, producer)`. The proposed record contains observation time, request start and end, token-selection rule, sampling-window id, raw response hashes and locations, normalized ladders, and venue correlation fields. The watcher derives candidate tokens from the latest subject valuation and venue listing, then records that derivation and any sampled subset. This selection is for book sampling only. It does not establish inventory completeness.

The proposed sampling method randomizes sample times within declared windows. Before a window starts, the watcher would anchor a commitment to the seed, window, selection rule, and expected sample count. It would reveal the seed after the window. Each scheduled sample would produce either an observation or an explicit watcher gap. Omitting a failed or unfavorable sample would reduce reported coverage. These steps are design requirements for a future profile, but version 0 cannot represent the seed commitment or watcher gap as PMVS records.

## Experimental corroboration

For an operator record `R` at capture time `t` and position `i`:

1. **Exact correlation match.** If an eligible watcher observation near time `t` carries a book `hash` byte-equal to the operator record for the same token, both captures report the same opaque venue correlation value. This is correlation evidence only. It does not prove the book was true or independently generated.
2. **Temporal bracketing.** Without an exact match, watcher observations bracketing `t` set no formal bound because a book can change arbitrarily between observations. Comparing marks from the two ladders is a heuristic. A prototype reports that comparison as `INCONCLUSIVE` unless it also names and applies an experimental alarm method.
3. With no eligible observation, a prototype reports `INCONCLUSIVE`. Non-detection is never evidence of correctness. An unwatched or thinly watched subject has no T3 evidence.

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

Version 0 fixes none of those choices. A prototype that experiments with alarms should publish the full parameter set with any `FIDELITY_SUSPECT` label. That label can prompt human investigation. It is not a PMVS verifier verdict or a conformance result under version 0.

## Independence and reporting

A watcher under the operator's administration is not independent. An experimental report can state the number of eligible watchers, scheduled-sample coverage, evaluation window, and administrative and infrastructure dependencies. It should list missed samples and shared API, cloud, gateway, and key-control dependencies. This is descriptive research evidence, not a `W(...)` claim. Sybil resistance for watcher independence is organizational and operational, not cryptographic.

## Copyright

Copyright and related rights on this document's text are waived via CC0-1.0.
