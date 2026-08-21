# Security policy

PMVS is a draft specification with schemas, fixtures, and reference
verification code. This repository does not contain audited deployable vault
contracts and does not operate a vault or custody user funds.

## Private reports

The repository maintainer MUST enable GitHub private vulnerability reporting
when the repository becomes public. After it is enabled, use **Security >
Report a vulnerability** for a confidential report about:

- a rule that could misprice shares, misallocate a claim, omit a custody asset,
  or permit an invalid conformance result;
- an error in canonicalization, hashing, signatures, arithmetic, schema
  composition, or reference verification; or
- a publication detail that would make an exploit practical before a fix is
  available.

Include the affected document or function, a minimal reproducer, the expected
result, and the investor or implementation impact. If the private form is not
available, do not publish exploit details in an issue. The missing form is a
release-configuration defect that the repository maintainer must correct.

## Scope

The current `main` branch is the only supported draft. Historical commits are
retained as design history and are not supported protocol versions.

For an incident involving a deployed vault, contact that deployment's operator
or security team. This repository has no access to deployment keys, contracts,
accounts, or emergency controls.
