# Triple-A Scan

Read-only transaction inspection for Ethereum, Polygon, Arbitrum One, Bitcoin, Tron, Solana mainnet, and BOLT11 Lightning invoices. Results stay in Triple-A; explorer links are optional.

**Validation status:** 106 automated tests and the production function build/import check passed on 8 November 2026. The deployed receipt update was checked against the previously failing Ethereum transaction and a Tron overview URL; both returned confirmed summaries. The Solana token-label update still needs deployment and a live recheck. Browser checks, Helius-key integration, and production capacity remain unverified. See [VALIDATION.md](VALIDATION.md).

## Interface

The search form uses labeled transaction and network fields. During a lookup, the Triple-A mark animates while old results are hidden. Bulk progress counts completed requests. Loading clears after success, failure, or an input change, and animation stops for visitors who request reduced motion. The loading state does not add an artificial delay.

## How it works

- The frontend calls only `POST /api/lookup`. Provider requests and credentials stay in the Netlify function.
- EVM chains are checked concurrently, with provider fallback and chain-ID verification. A returned transaction hash must match the input. Unprefixed 64-character hex hashes are checked across all three EVM chains, Bitcoin, and Tron, with no default to Tron.
- Pending, included-without-receipt, failed, not-found, and unavailable states differ. An unavailable provider never proves that a transaction is missing. Multiple matching networks are retained.
- Native amounts and standard ERC-20/TRC-20 token quantities use integer arithmetic. Token contracts and transfer endpoints are shown. Metadata is labeled as token-reported. A zero native value does not imply a zero token payment.
- Solana now has a real backend, using Helius RPC when configured and public RPC fallbacks. Mainnet genesis is verified. Signatures and accounts take different paths; parsed native/SPL transfers are shown when returned by RPC.
- Lightning uses the bitcoinjs BOLT11 decoder. An invoice is never presented as proof of settlement. Invoices do not enter local history or permalinks.
- The app handles provider timeouts, rate limits, corrupt/blocked browser storage, duplicate submissions, and stale asynchronous responses. The logo is now inside the publish directory.
- Preview frames contain escaped internal summaries with scripts disabled. They do not embed remote explorer pages.

## Run locally

Use Node.js 22 or later:

```sh
npm ci
cp .env.example .env
# Fill server-only variables in .env if available.
npm test
npm run check
npm start
```

Open `http://127.0.0.1:8787`. A static-file server alone cannot run `/api/lookup`.

Additional checks:

```sh
npm run test:offline       # no external dependencies or network required
npx playwright install chromium
npm run test:ui           # real Chromium, synthetic API responses
npm run test:live         # opt-in mainnet provider checks
```

The browser suite needs permission to launch Chromium and access localhost. `CHROME_PATH` can select an installed Chrome executable. `PLAYWRIGHT_MODULE` can point to an existing Playwright module. These are test conveniences, not deployment settings.

## Netlify deployment

Connect this repository to Netlify. The configuration publishes `src`, installs dependencies, runs checks and unit tests, and bundles `netlify/functions/lookup.mjs`. `bolt11`, `ethers`, and `bitcoinjs-lib` are installed as external runtime modules to preserve Node CommonJS interoperability.

Set `HELIUS_API_KEY` in Netlify's environment UI/CLI with **Functions scope** and redeploy. Never put keys in `src`, `netlify.toml`, or a frontend build variable. The backend consumes `process.env.HELIUS_API_KEY`; the browser never receives the URL or key. Helius is optional for basic public-RPC summaries but useful for historical coverage and provider access.

Optional private provider overrides (comma-separated HTTPS mainnet URLs, at most three per network):

- `ETHEREUM_RPC_URLS`
- `POLYGON_RPC_URLS`
- `ARBITRUM_RPC_URLS`
- `SOLANA_RPC_URLS`

Test a Netlify deploy preview before production, including `/api/lookup`, logo, CSP, preview frames, and real transaction hashes on every network. Static drag-and-drop uploads do not supply the required function build. The included lockfile pins the resolved dependencies; CI uses `npm ci`. The WebSocket dependency is overridden to a patched version. A low-severity advisory remains in the invoice decoder’s transitive `elliptic` dependency; its affected operation is signing, which the production application does not perform. See the validation report.

Official references: [Netlify function environment variables](https://docs.netlify.com/build/functions/environment-variables/), [function API and ingress limits](https://docs.netlify.com/build/functions/api/), [Ethereum JSON-RPC](https://ethereum.org/developers/docs/apis/json-rpc/), [Solana getTransaction](https://solana.com/docs/rpc/http/gettransaction), [bitcoinjs BOLT11](https://github.com/bitcoinjs/bolt11).

## Capacity and limits

Netlify ingress is configured for 30 requests per 60 seconds per IP/domain combination. Confirm this rule is supported and active on the deployed Netlify plan. Platform 429s are handled even if the platform returns HTML rather than JSON.

Each provider request has a 2.8-second timeout, including body loading. A lookup has a 20-second deadline; the frontend allows 25 seconds. Providers with HTTP 429 or recognized JSON-RPC quota errors enter a bounded Retry-After cooldown; another configured provider is tried without hammering the throttled endpoint. Eight concurrent requests per provider host and 24 distinct active lookups are allowed per warm instance. Identical requests coalesce; results are cached for 2–15 seconds in a bounded in-memory cache. Bulk mode accepts the first 20 lines and announces truncation.

Warm-instance limits, cooldowns, and cache are **not fleet-wide quota enforcement**. Public RPCs and free keys do not provide a production availability guarantee. Use dedicated providers with appropriate quotas for production traffic. A shared limiter/gateway is required if Infra must enforce a single provider-key quota across function instances. No guarantee is made that a particular free Helius plan permits 10 requests/second; use the current account quota.

## Interpretation limits

A transaction hash does not encode an EVM network. Coverage is limited to the listed mainnets. Other EVM chains and testnets are not searched. The same hash can appear on multiple chains.

Receipt inclusion is not finality or merchant settlement. The app displays confirmations when available. Execution fees may not include every chain-specific component. Standard transfer logs are shown up to 12 entries; internal EVM transfers, complete token balances/history, NFTs, and every contract interaction are not indexed. Token symbols can be spoofed: verify the contract/mint. Failed transaction transfer records do not indicate funds settled.

Bitcoin output totals include change and are not a payment amount. Solana parsed instructions can refer to token accounts. Checked transfers display USDC or USDT only when the mint matches the issuer-listed mainnet address and the decimals match. Other tokens retain an explicit unknown-symbol label; unchecked SPL transfers may show base units. Lightning settlement must come from the Triple-A payment record. Bitcoin/Tron addresses are recognized but address history is not indexed.

History stores up to 30 prior non-invoice lookups locally; selecting an entry fetches fresh data. Clear history using the page control. Permalinks contain transaction inputs; invoices are excluded.
