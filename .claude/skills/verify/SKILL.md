---
name: verify
description: Build/launch/drive recipe for verifying KalySwap frontend changes end-to-end in the browser
---

# Verifying KalySwap frontend changes

## Launch
1. Proxy: `portless proxy start` (falls back to unprivileged 1355; iptables 443→1355 redirect already set at kernel level — do NOT sudo).
2. Dev server: `npm run dev` in `frontend/` (script is `portless kalyswap next dev`, port 3002).
3. Wait for `curl -sk https://kalyswap.localhost/swaps` → 200 (first compile takes ~30–60s).

## Drive
- Swap page: `https://kalyswap.localhost/swaps`. The V2/V3 toggle is in the swap card header (persists in localStorage `kalyswap_protocol_version`).
- Quotes work without a wallet (public client reads). Type into the From amount field; quote resolves in ~5–10s (V3 probes many pools via RPC).
- Chart, market stats, and Transaction History all key off the selected pair + protocol toggle.

## Ground truth to compare against
- V3 subgraph (no auth, CORS open): `https://app.kalyswap.io/subgraphs/name/v3-subgraph-kalychain-mainnet`
  - WKLC/USDT 0.3% pool: `0x3848c7c8d088549194a264cb1d639258abe406a9` (token0=WKLC, token1=USDT)
  - `poolHourDatas.close` and `pool.token0Price` are token0-per-token1 (~402 WKLC/USDT); `token1Price` is the USD-ish KLC price (~0.0025).
- Useful probes: KLC/USDT (real pool), KLC/DAI (zero-TVL dust pool → huge price impact), toggle V2↔V3 (chart must re-render with different data).

## Gotchas
- `npm run lint` is broken (interactive next lint setup prompt) — use `npx tsc --noEmit` as the static gate.
- `src/services/__tests__/wallet-auth-integration.test.ts` needs a running backend; fails with "Not Found" otherwise (pre-existing).
- In dev, the V2 24h-volume fetch to `https://app.kalyswap.io/api/graphql` fails (network/CORS) → V2 mode shows "24h Vol: $0". Pre-existing.
