# PMVS governance

Who maintains this standard and how it changes. Short on purpose.

## Maintainers

The authors listed in each document maintain the suite in the [Autonomous-Finance/pmvs](https://github.com/Autonomous-Finance/pmvs) repository. Substantive changes go through pull request. Maintainers publish releases under immutable tags; `main` may run ahead of the latest tag, and a conformance claim MUST name a tag or commit.

## Identifiers

Profile and method ids are allocated only in this repository; ERC-165 interface ids derive from the ABI and are not part of this registry. An id names exactly one governing document at one version. A third party extending or forking a profile MUST use its own prefix (`venue/example/1`, not `venue/polymarket/1`) so records stay distinguishable. Colliding or shadow ids are rejected as `UNSUPPORTED_PROFILE`.

## Stale venue facts

A profile pins contract addresses and code hashes checked at a named block and date. When a venue upgrades materially:

1. anyone may open an issue flagging staleness;
2. maintainers verify against the chain and publish the next profile id with new pinned facts;
3. the old id stays valid for records already anchored under it, whose pinned facts do not move;
4. vaults migrate by activating a components record selecting the new id.

Meanwhile, a verifier judging current vault state under a materially stale profile fails closed (`UNSUPPORTED_PROFILE`), never open.

## Questions and errata

Normative questions and errata go through GitHub issues in this repository; maintainers resolve them by PR only. Security-sensitive reports follow [SECURITY.md](./SECURITY.md).
