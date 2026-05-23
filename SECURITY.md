# Security Policy

BinDist is an authentication-gated binary distribution system. We take security reports seriously and appreciate responsible disclosure.

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, report them privately by one of:

- **Email**: [security@bindist.eu](mailto:security@bindist.eu)
- **GitHub private vulnerability reporting**: https://github.com/BinDist/bindist-terraform/security/advisories/new

When reporting, please include:

- A description of the vulnerability and its impact
- Steps to reproduce, or a proof-of-concept
- Affected version / commit hash
- Any suggested mitigations

We aim to acknowledge receipt within **3 business days** and to provide an initial assessment within **7 business days**.

## Scope

In scope:

- The shared handler code in `src/`
- The Scaleway adapter in `scaleway/adapter/`
- The Terraform modules in `aws/` and `scaleway/`
- The client scripts in `scripts/`

Out of scope:

- Vulnerabilities in third-party dependencies that have not been integrated insecurely (please report those upstream)
- Issues that require a compromised AWS / Scaleway account or root access to the cloud environment
- Denial-of-service via raw request volume against deployed instances

## Supported Versions

Security fixes are applied to the `main` branch. We do not currently maintain long-term support branches.

## Disclosure

Once a fix is released, we will publish a security advisory crediting the reporter (unless anonymity is requested) and describing the issue and mitigation.
