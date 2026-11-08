# Validation — Triple-A Scan

Checked on 8 November 2026.

## Passed

- 106 automated tests; no failures or skipped tests.
- JavaScript syntax, frontend boundaries, and production function bundle/import.
- Loading-state lifecycle: pending requests hide old results and disable result actions; success and failure clear loading; input edits reject stale results; bulk progress counts completed responses.
- Reviewed the supplied loading-animation recording. The new CSS animates the brand mark during requests and includes a reduced-motion override. Browser rendering remains unverified: the attempted Chrome launch exited with SIGABRT in this environment.
- Historical receipt fallback, wrong-chain and mismatched-receipt rejection, quota cooldowns, Tron overview URLs, Solana full-data fallback, and token metadata fallback.
- USDC/USDT Solana labels matched by official mint and decimals; unknown mints and mismatched decimals retain an unknown-symbol label.
- Independent RPC captures verified all 33 supplied on-chain transaction examples with successful execution data. Customer identifiers and raw responses are excluded from this repository.
- The supplied Lightning invoice decoded but was expired. Payment status cannot be established from an invoice.
- After the receipt patch was deployed, the previously failing Ethereum example returned Confirmed with native amount and execution fee. A previously rejected Tron overview URL returned Confirmed.

## Still required before Triple-A production sign-off

- Deploy the Solana token-label update and verify the affected transaction shows its token symbol.
- Recheck the full transaction set against the final deployment. Independent RPC captures and synthetic tests do not replace this check.
- Run the browser checks and verify mobile layout, search, bulk input, copy actions, and previews.
- Confirm production Functions environment variables and test Helius access. No private key was supplied for validation.
- Validate provider quotas, historical coverage, load, monitoring, and the deployed Netlify ingress rule with Infra. Public endpoints can restrict history or throttle requests; per-instance limits do not enforce a shared key quota across instances.

## Scope

Read-only inspection of the listed mainnets. Results are not payment settlement verification. Token names do not establish authenticity; contract and mint addresses remain visible. Solana symbols currently cover checked USDC/USDT transfers only. Arbitrary token metadata, full account history, internal EVM transfers, and Lightning settlement are outside the current implementation.

The remaining low-severity elliptic advisory affects signing through a transitive invoice-decoder dependency; this application does not sign. The lockfile pins dependencies and the ws override.
