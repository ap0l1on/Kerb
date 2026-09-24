# Security Policy

## Supported Versions

Kerb is a static browser game (no backend). The latest `main` is supported.

## Reporting a Vulnerability

Open a GitHub issue or contact the maintainers via the repository. Please do not include personal data.

## Notes

- No cookies, accounts, or servers. Progress lives in `localStorage` under `kerb.v1`.
- Only analytics is Cloudflare Web Analytics (single script tag).
- Challenge-link ghost codes are strictly validated (version byte, length cap, checksum) and re-simulated; malformed codes are rejected.
- No `eval`, `new Function`, or `innerHTML` with untrusted data.
