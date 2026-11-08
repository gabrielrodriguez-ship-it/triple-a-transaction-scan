# Validation — Triple-A Scan revamp

Date: 8 November 2026. Changes are local; no GitHub push or deployment was performed.

## Passed

| Check | Result |
| --- | --- |
| Automated tests | 82 passed, zero failed/skipped |
| JavaScript syntax and frontend boundaries | Passed |
| Production function bundle and import | Passed |
| Clean locked dependency install | Passed using integrity-checked cached official npm tarballs |
| Ethereum live transaction | Passed — Confirmed |
| Polygon live transaction | Passed — Confirmed |
| Arbitrum live transaction | Passed — Confirmed |
| Bitcoin live transaction | Passed — Confirmed |
| Tron live transaction | Passed — Pending as returned by the indexer |
| Solana live transaction | Passed — Confirmed, using public RPC |

The passing live run completed at 2026-11-08T14:11:00.725Z. It discovered a recent transaction on each mainnet, then required a rich summary, the expected resolved chain, and a matching returned transaction hash/signature. This validates basic live transaction lookup. It does not establish sustained availability, complete historical coverage, finality, or merchant settlement.

Early provider probes experienced timeouts. Earlier failures were retained during the investigation rather than treated as proof that a transaction was missing. The final live run passed on every supported on-chain network. Solana’s complete mainnet genesis hash was checked against live RPC.

The automated suite covers chain verification, hash mismatch rejection, concurrent EVM detection, provider failover, duplicate coalescing, cache expiry, deadlines, failed/pending/included transactions, exact token amounts, unavailable token metadata, ambiguous unprefixed hashes, Bitcoin/Tron address checksums, Solana accounts and signatures, invoice checksums/decoding, credential redaction, malformed requests, HTTP 429 cooldowns, browser-storage failures, stale responses, bulk limits, escaped provider text, and invoice privacy.

Frontend logic tests run the actual page script in an isolated DOM harness. They do not count as real-browser layout or security-policy validation.

## Still unverified

- Real-browser rendering, mobile layout, clipboard/popups, and deployed CSP/preview behavior. Headless Chrome could not launch in this managed environment. The browser approval gate then rejected localhost inspection and reported that permission was declined; no alternate browser route was used afterward. The real-browser test script is included and is scheduled in CI.
- A real Helius API key. No key was supplied. The server-only key path and redaction passed unit tests; the passing live Solana lookup used public RPC.
- Netlify deploy-preview execution, ingress-rate-rule enforcement on the target plan, and production traffic/quotas. There is no authenticated GitHub or Netlify deployment attached to this handoff.
- Sustained load and fleet-wide provider quotas. Warm-instance safeguards are implemented; a shared gateway/limiter is necessary for an account-wide quota across function instances.

These are release checks, not claims of passing validation. Do not represent the browser or deployment checks as complete.

## Dependency audit

The npm advisory bulk API was checked against the final locked package versions. The vulnerable transitive WebSocket version was replaced with ws 8.22.1; the final response contains no moderate/high/critical advisories for the submitted package versions.

One low-severity advisory remains in elliptic, pulled in by the BOLT11 decoder: [GHSA-848j-6mx2-7j84](https://github.com/advisories/GHSA-848j-6mx2-7j84). The advisory identifies faulty ECDSA signature generation and possible secret-key exposure; no patched version was listed. The production scanner calls the invoice decoder, accepts no private keys, and has no signing, wallet, or transaction-submission route. The test suite signs only a publicly hardcoded dummy key to construct an invoice fixture. The advisory remains present in the dependency graph and is recorded rather than suppressed.

## Evidence and reproduction

- [Full automated results](validation/tests.tap)
- [Live hashes and statuses](validation/live-transactions.json)
- [Build/install checks](validation/build.txt)
- [Final advisory response](validation/dependency-advisories.json)

Use Node.js 22+:

```sh
npm ci
npm test
npm run check
npx playwright install chromium
npm run test:ui
npm run test:live
```

Set server-only provider variables in the deployment environment, then verify a Netlify preview before releasing. The included README explains supported networks, interpretation limits, and capacity controls.
