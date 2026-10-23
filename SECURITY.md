# Security Policy

CallFlow is a local-first demo project, not a production service. Security reports are still welcome.

## Reporting a vulnerability

Please do **not** open a public Issue containing secrets, real customer data, or step-by-step exploit details.

Use GitHub's private vulnerability reporting for this repository once it is enabled, or contact the maintainer through the contact method listed on the repository profile. Include:

- affected version or commit;
- a minimal reproduction;
- impact and any suggested mitigation;
- whether the issue also affects the demo dataset.

## Scope

In scope:

- authentication, session handling and RBAC bypasses;
- CSRF or authorization flaws;
- SQL injection or data corruption;
- path traversal, unsafe file handling or backup/restore issues;
- leakage of secrets or real personal data.

Out of scope for this demo:

- missing production TLS, rate limiting, MFA or high availability;
- issues that require a compromised host or database file;
- the publicly documented demo accounts.

See [docs/SECURITY.md](docs/SECURITY.md) for the security model and known residual risks.
