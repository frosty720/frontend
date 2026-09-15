# KalySwap UI Redesign — Design Spec

**Date:** 2026-09-11
**Repo:** `KalySwapv3/frontend` only (branch `feat/ui-redesign` off `main`)
**Reference:** `https://kalychain-landing-cpxnk1.abacusai.app/dashboard`, the ten screenshots and `DOCTYPE html html lang.html` in `KalySwapv3/`

## 1. Goal

Rebuild the KalySwap frontend's visual layer to the sidebar "DeFi Super App" layout from the reference, on the KalyChain brand palette, in English and French, without removing any working feature. Every feature page keeps its existing hooks, services, wallet stack and contract logic; only the shell, theme, markup and copy change. Every number shown is on-chain or from a subgraph, or it is not shown.

**The reference screenshots are the binding layout for every page** (boss correction, 2026-09-11). Where a screenshot shows data we have no source for, the element is omitted, never faked. Where we have a working feature the screenshot lacks, it is kept in the least intrusive place and called out.

Decisions already made with the boss (2026-09-11):

| Topic | Decision |
|---|---|
| Simple/Pro toggle | Dropped. Pro layout only. |
| "V4" tag | Removed everywhere. |
| Bridge | Kept as a sidebar item (after Swap). |
| Vault NFT | In-app `/vaults` page with live stats, pack grid, my vaults; mint/claim link out to `https://vaults.kalychain.io`. |
| Buy/Sell KUSD, Lend, KUSD Card | Coming Soon pages. |
| Language | EN + FR. |
| Root `/` | Becomes the Dashboard. Marketing lives on kalyswap-lander. |

## 2. Non-goals

- No backend, admin, subgraph, or contract changes.
- No changes to hooks/services logic, wallet stack (thirdweb), bridge logic, or swap execution.
- No Simple mode (KUSD send/receive/top-up/card).
- No portfolio-over-time chart (no price-history source).
- No translation of strings that originate inside hooks/services (error humanizers, logger output). Those stay English in this pass and are listed as follow-up in §12.
- No light theme. The app is dark only.

## 3. App shell

New `src/components/shell/`:

| File | Responsibility |
|---|---|
| `AppShell.tsx` | Fixed 256px sidebar + main column (`margin-left: 256px`) + sticky top bar + footer. Below 960px the sidebar is hidden and rendered as a drawer overlay toggled by a hamburger in the top bar. |
| `Sidebar.tsx` | Logo block (KS mark from `/icons/KalySwapLogo.png` + "KalySwap" wordmark in the display font, no V4), nav list from `nav.ts`, and the "New to KalySwap?" callout linking to the docs site. |
| `TopBar.tsx` | Page title + subtitle (looked up from `nav.ts` by pathname, falling back to the parent route for nested pages), `LangSwitcher`, `ChainBadge`, and the existing thirdweb `ConnectWallet` restyled as the gold pill. |
| `ChainBadge.tsx` | Display-only. Green dot + "KalyChain" when `useChainId() === CHAIN_IDS.KALYCHAIN` or not connected; amber dot + "Wrong network" otherwise. No switch logic (CutoverNotice already owns add-network). |
| `LangSwitcher.tsx` | EN / FR segmented control. Swaps the locale prefix on the current pathname. |
| `Footer.tsx` | One line: "KalySwap — The DeFi Super App · Powered by KalyChain" + the social links from the current footer (X, GitHub, Telegram/Discord as currently configured). Replaces `components/layout/Footer.tsx`. |
| `nav.ts` | Typed nav config (see below). Single source of truth for sidebar, page titles, and the nav guard test. |

`nav.ts` shape:

```ts
export interface NavItem {
	key: 'dashboard' | 'swap' | 'bridge' | 'vaults' | 'kusd' | 'pools' | 'farm' | 'stake' | 'launchpad' | 'lend' | 'card';
	href: string;            // locale-less, e.g. '/swaps'
	icon: LucideIcon;
	soon?: true;             // renders a "Soon" pill, page is ComingSoon
}
export const NAV: readonly NavItem[]; // order below
```

Sidebar order: Dashboard `/`, Swap `/swaps`, Bridge `/bridge`, Vaults `/vaults`, Buy/Sell KUSD `/kusd` (soon), Pools `/pools`, Farm `/farm`, Stake `/stake`, Launchpad `/launchpad`, Lend `/lend` (soon), KUSD Card `/card` (soon).

Active item style: gold text on `gold-soft` background with a `gold/35` border (reference). Icons: lucide-react (`LayoutDashboard, ArrowLeftRight, Shuffle, Vault, ShoppingBag, Layers, Sprout, Coins, Rocket, HandCoins, CreditCard`).

`components/layout/MainLayout.tsx`, `Header.tsx`, `Footer.tsx` are deleted once every page is on `AppShell`. `AppShell` is mounted once in `app/[locale]/layout.tsx`, so pages no longer wrap themselves.

## 4. Theme

### 4.1 Tokens (`src/app/globals.css`, `:root`, single dark theme)

Brand values are the ones already shipped on kaly-site and kalyswap-lander; semantic values come from the reference.

| Token | Value | Use |
|---|---|---|
| `--ink` | `#0A0A0A` | page background |
| `--surface` | `#141414` | cards, sidebar |
| `--surface-alt` | `#1A1A1A` | inputs, nested panels, hover |
| `--surface-hi` | `#212121` | secondary buttons, segmented controls |
| `--cream` | `#F5F0E6` | primary text |
| `--muted` | `#9A938A` | secondary text |
| `--muted-deep` | `#6F6960` | labels, eyebrow text |
| `--line` | `rgba(255,255,255,0.08)` | borders |
| `--line-strong` | `rgba(255,255,255,0.14)` | outlined buttons |
| `--gold` | `#F59E0B` | primary |
| `--gold-dark` | `#D97706` | primary hover / gradient end |
| `--gold-bright` | `#F7931A` | gradient start (brand) |
| `--gold-light` | `#FBBF24` | highlighted text on dark (already KalySwap's accent) |
| `--gold-soft` | `rgba(245,158,11,0.12)` | active nav, badges |
| `--on-gold` | `#1A1206` | text on gold buttons |
| `--violet` | `#8B5CF6` | brand secondary accent (KMT avatar, launchpad gradient) |
| `--success` | `#22C55E` | positive numbers, live status |
| `--info` | `#38BDF8` | info callouts |
| `--danger` | `#EF4444` | errors, negative numbers |
| `--radius` | `0.875rem` (14px) | base radius; cards use `1.125rem` (18px) |

shadcn variables are remapped onto these (`--background: var(--ink)`, `--foreground: var(--cream)`, `--card: var(--surface)`, `--popover: var(--surface-alt)`, `--primary: var(--gold)`, `--primary-foreground: var(--on-gold)`, `--secondary: var(--surface-hi)`, `--muted: var(--surface-alt)`, `--muted-foreground: var(--muted)`, `--accent: var(--gold-soft)`, `--accent-foreground: var(--gold-light)`, `--destructive: var(--danger)`, `--border: var(--line)`, `--input: var(--surface-alt)`, `--ring: var(--gold)`) so every `components/ui/*` primitive restyles without edits. The `@theme inline` block exposes the brand tokens as Tailwind colors (`bg-surface`, `text-muted`, `border-line`, `text-gold`, …) and the two font variables.

### 4.2 Removals

- The `<link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/...">` in `app/layout.tsx`. It loads Tailwind v2 on top of v4 and is the reason the current theme needs `!important` everywhere.
- The `body` gradient (`linear-gradient(135deg, #000, #1c1917, #92400e)`).
- The whole `@layer components` override block in globals.css (forced amber borders, `!important` text colors, `[class*="bg-white"]` rewrites, select/popover overrides). Components that relied on it get proper token classes instead (§9).
- The unused `.dark { … oklch … }` block.
- `tailwind.config.js` (no `@config` directive; dead under v4). `tw-animate-css` stays via its existing `@import`.
- `reset.css` body rule (`color: #333; background: #fff`) — the file is reduced to the box-sizing/margin/form resets.
- Per-page CSS (`home.css`, `swaps.css`, `pools.css`, `farm.css`, `stake.css`, `launchpad.css`, `bridge.css`; 1,910 lines): each file is deleted in the phase that moves its page to the shell. Anything still needed (mobile flex-wrap fixes for the chart and swap interface noted in CLAUDE.md) is kept as Tailwind classes on the component.

### 4.3 Fonts

- Display: Space Grotesk variable TTF (`src/fonts/SpaceGrotesk[wght].ttf` + `OFL.txt`, from `google/fonts` `ofl/spacegrotesk`), loaded with `next/font/local` (`weight: '300 700'`, `variable: '--font-display'`). Used for h1–h3, stat values, wordmark, primary buttons.
- Body: Inter, unchanged (`--font-inter`). Tailwind: `font-sans` = Inter, `font-display` = Space Grotesk.
- No `next/font/google` (project rule: breaks the server build).

### 4.4 Icons and assets

- Icons: lucide-react only. No Font Awesome.
- Favicon set generated from `public/icons/KalySwapLogo.png`: `public/favicon.ico` (real ICO, 16/32/48), `public/icon.png` (512), `public/apple-icon.png` (180). No SVG icon: the mark only exists as a raster and tracing it by hand is not worth the fidelity risk. `metadata.icons` in the locale layout points at them. The current `favicon.ico` is a PNG with the wrong extension and is replaced.
- Token avatars: `TokenAvatar` primitive shows the token's `logoURI` when present, else a two-letter monogram on a per-symbol tinted circle (KMT violet, KUSD success, stables info, default gold).

## 5. Internationalization

Pattern: kaly-site middleware + kaly-vault typed dictionaries, with a client context instead of prop-drilling.

### 5.1 Routing

```
src/middleware.ts                 EN unprefixed, FR at /fr/*; /en/* → 308 to unprefixed; else rewrite to /en/*
src/app/[locale]/layout.tsx       root layout (html/body, fonts, providers, DictionaryProvider, AppShell)
src/app/[locale]/page.tsx         Dashboard
src/app/[locale]/swaps/page.tsx
src/app/[locale]/bridge/page.tsx
src/app/[locale]/vaults/page.tsx
src/app/[locale]/kusd/page.tsx    ComingSoon
src/app/[locale]/pools/page.tsx   pool table
src/app/[locale]/pools/add/page.tsx
src/app/[locale]/pools/browse/page.tsx   redirect → /pools (locale-aware)
src/app/[locale]/farm/page.tsx
src/app/[locale]/stake/page.tsx
src/app/[locale]/launchpad/page.tsx
src/app/[locale]/launchpad/[address]/page.tsx
src/app/[locale]/lend/page.tsx    ComingSoon
src/app/[locale]/card/page.tsx    ComingSoon
src/app/[locale]/not-found.tsx
src/app/[locale]/[...rest]/page.tsx   calls notFound() so unmatched URLs render the locale 404 inside the shell
```

There is no `src/app/layout.tsx`; the `[locale]` layout is the root layout (kaly-vault does the same). `generateStaticParams` returns both locales; an unknown locale calls `notFound()`.

Middleware matcher: `/((?!api|subgraphs|_next|.*\\..*).*)`. `api` and `subgraphs` are excluded because `next.config.js` proxies them in dev; without the exclusion the rewrite would turn `/subgraphs/name/x` into `/en/subgraphs/name/x` and break every subgraph call. The middleware logic lives in a pure function `resolveLocalePath(pathname): { kind: 'next' | 'redirect' | 'rewrite'; pathname?: string }` so it is unit-testable without Next request objects.

### 5.2 Dictionaries

```
src/i18n/config.ts            LOCALES = ['en','fr'], DEFAULT_LOCALE = 'en', isLocale, LOCALE_LABEL, NUMBER_LOCALE
src/i18n/dictionaries/en.ts   const en = { … } as const; export type Dictionary = typeof en
src/i18n/dictionaries/fr.ts   const fr: Dictionary = { … }
src/i18n/get-dictionary.ts    server-only dynamic import per locale
src/i18n/DictionaryProvider.tsx  'use client' context { dict, locale }
src/i18n/hooks.ts             useDict(), useLocale(), useLocaleHref(), useFormat()
src/i18n/interpolate.ts       '{name}' placeholder substitution (kaly-vault's)
```

Namespaces: `meta`, `nav`, `pages` (title/subtitle per nav key), `shell` (connect, wrongNetwork, language, menu), `common` (loading, error, retry, connectWallet, comingSoon, viewAll, claim, manage, add, source), `dashboard`, `swap`, `bridge`, `vaults`, `pools`, `farm`, `stake`, `launchpad`, `comingSoon` (per-page title/body for kusd, lend, card), `footer`, `cutover` (the existing CutoverNotice copy).

`useLocaleHref(path)` returns `path` for EN and `/fr${path}` for FR. Every internal `<Link>` and `router.push` in `src/app` and `src/components` goes through it. `useFormat()` returns `Intl`-based `number`, `usd`, `pct`, `date` bound to the active locale (`en-US` / `fr-FR`).

Scope of extraction: every user-visible string rendered by files under `src/app` and `src/components`, including aria-labels, placeholders, empty states, button labels, modal copy, and toast titles raised from components. Strings built inside `src/hooks` and `src/services` (e.g. `humanizeBridgeError`) are out of scope (§2, §12).

## 6. Shared primitives (`src/components/primitives/`)

| Component | Contract |
|---|---|
| `PageHeader` | `{ title, subtitle?, actions? }` — h1 in display font + muted subtitle, optional right-side actions. |
| `StatCard` | `{ label, value, hint?, tone?: 'default' \| 'gold' \| 'success', source? }` — eyebrow label, large display value, optional footnote and "Source: …" caption. |
| `Panel` | `{ title?, action?, children }` — the 18px-radius surface card with optional header row. |
| `Pill` | `{ tone: 'gold' \| 'success' \| 'info' \| 'violet' \| 'muted' \| 'danger', children }` — uppercase 10.5px badge. |
| `TokenAvatar` | `{ symbol, logoURI?, size? }` — see §4.4. |
| `TokenPair` | two overlapping `TokenAvatar`s. |
| `DataTable` | `{ columns, rows, empty }` — table head styling + row dividers + responsive horizontal scroll wrapper. |
| `EmptyState` | `{ icon, title, body, action? }`. |
| `ComingSoon` | `{ pageKey }` — reads `dict.comingSoon[pageKey]`, renders Soon pill, title, body, and a "Back to Dashboard" link. |
| `ConnectPrompt` | `{ body }` — panel with the thirdweb connect button, used wherever a page section needs a wallet. |

`components/ui/*` (shadcn) stays and is used for inputs, dialogs, tabs, selects. Buttons: `button.tsx` variants become `default` (gold gradient, on-gold text), `secondary` (`surface-hi`, cream), `outline` (transparent, `line-strong` border), `ghost`, `destructive`.

## 7. Pages

All pages render inside `AppShell` via the layout. Page files are thin: header + data hooks + primitives + existing feature components.

### 7.1 Dashboard `/`

- **Hero panel:** eyebrow pill "Powered by KalyChain", title "KalySwap — The DeFi Super App", one-line body, CTAs "Start a swap" → `/swaps`, "Explore Vaults" → `/vaults`.
- **KalySwap stats panel** (`useV3FactoryStats`): Total TVL (`factory.totalValueLockedUSD`), 24h volume (latest `uniswapDayData.volumeUSD`), transactions (`factory.txCount`). Caption "Source: KalySwap V3 subgraph". The reference's "Users" stat has no source and is omitted. If the query fails the panel shows an inline error with retry, never zeros.
- **Quick actions row:** Swap, Vaults, Pools, Farm cards linking to their pages.
- **My assets panel** (connected only, else `ConnectPrompt`): rows for native KMT + every token in the bundled KalyChain list with balance > 0, via the existing balance hooks (`useNativeTokenBalance`, `useTokenBalances`). USD value via new `useTokenPricesUSD(addresses)` (one subgraph query: `tokens(where:{id_in}){ id derivedETH }` + `bundle.ethPriceUSD`); a dash when no price. Columns: asset, balance, price, value. No 24h-change column (no source). Empty state links to Bridge.
- **Active yields panel** (connected only): rows built by pure `buildYieldRows()` from (a) KMT staking `useStakedBalance` + `useEarnedRewards` when staked > 0, (b) V3 farm stakes from `useV3Staking` with pending rewards, (c) `useUserV3Positions().length` as "LP positions". Each row's action deep-links to `/stake`, `/farm`, `/pools`. No aggregate "$/day" figure (would need USD prices for every reward token; omitted).

### 7.2 Swap `/swaps`

Follows the reference screenshot exactly (boss correction 2026-09-11: **no chart on the swap page**). Page header "Swap" + one-line subtitle. Two columns on ≥1100px (swap card left, ~520px; side column right), stacked below.

- **Left — swap card:** "You pay" box (label, balance on the right, large amount input, token selector pill, ≈ USD estimate), round flip button, "You receive" box (same layout, amount in gold), detail rows Rate / Price impact / Max slippage / Network fee, full-width gold button "Swap X → Y" (with the existing Connect wallet / Enter amount / Insufficient balance / Approve states). All behaviour stays in the existing swap hooks and services (`useV3Swap`, `KalySwapV3Service`, `SwapConfirmationModal`, `TokenSelectorModal`); only markup and copy change.
- **Right — "Optimal route" panel:** token avatar → "KalySwap V3 · <fee tier>" → token avatar, taken from the quote's actual path; multi-hop quotes show every hop.
- **Right — "Recent swaps" panel:** the selected pair's latest swaps from the existing subgraph data (pair, amount, relative time).
- **Removed from the swap page:** `TradingChart`, the market-stats strip, and the disabled Limit tab. `TradingChart.tsx` stays in the repo, unused, until the boss decides whether to delete it.
- **Not in the reference but working:** the AlchemyPay card on-ramp. It stays reachable as a small secondary "Buy crypto with card" link under the swap card that opens the widget in a dialog, unless the boss says to drop it.

### 7.3 Bridge `/bridge`

`BridgeCard` left (max 31rem as today), `TransferHistory` right (320px). The current "tip" card becomes the page subtitle. `TransferStoreProvider` wraps the page as today.

### 7.4 Vaults `/vaults`

New `src/config/vaults.ts` (addresses mirrored from `kalychain-ops/files/kmt-3890/addresses.json`: `vaultManager 0xDA2A7a2D504949896e709F546B6Bc06C2E7c5982`, `rewardsPool 0x82eeCEcF8C3bbD94A3A11Abe04Ce3F49BbA35E52`, `usdtPool 0xa9Ac6D3c75A883Cc5D6EfE7EbB973c68174bA61F`, `deployBlock 4581`, `VAULT_SUBGRAPH_URL` env with default, `VAULTS_APP_URL = 'https://vaults.kalychain.io'`) with a sync test against the ops JSON. ABIs (`tiers`, `nextTokenId`, `ownerOf`, `tierOf`, `paused`, `klcUsdPrice`; RewardsPool `earned`, `earnedUsdOf`, `capUsdOf`, `isMatured`) copied from kaly-vault `src/lib/chain/abis.ts` into `src/config/abis/vaults.ts`.

- **Stats:** Pool liquidity (V3 subgraph `pools(where:{id_in:[usdtPool]}).totalValueLockedUSD`), Active vaults and Total deposited (`useVaultProtocolStats`, same multicall approach as kaly-vault's `useProtocolStats`: `nextTokenId` → `ownerOf` multicall → `tierOf` multicall → Σ tier price), APR range (min/max of active tiers' `aprBps`).
- **Pack grid:** one card per active tier from `tiers(i)`: name from `metadataURI`/index mapping (mirrors kaly-vault `TIERS` labels), price, APR, "Mint on Vaults" button → `${VAULTS_APP_URL}/app` (external, new tab). The reference's supply bars are omitted (no supply cap on-chain).
- **My vaults** (connected): `useMyVaults(address)` = kaly-vault `useVaults` logic (owned ids → tier, earned, cap, maturity %). Rows show tier, id, earned KMT, maturity progress; "Claim" links out to the Vaults dApp. Sales paused (`paused()`) shows a muted pill on the pack grid.

### 7.5 Pools `/pools`, `/pools/add`

- `/pools`: `StatCard` row (Pools TVL = Σ `totalValueLockedUSD`, 24h volume = Σ latest `poolDayData.volumeUSD`, My liquidity = count of positions or "—") then the `DataTable`: Pool (`TokenPair` + symbols + fee-tier pill), TVL, APR, Volume 24h, My liquidity, action. APR = pure `poolApr({ feesUSD24h, tvlUSD })` = `feesUSD24h / tvlUSD * 365`; null → "—". `feesUSD24h` comes from extending `useV3Pools`'s query with `poolDayData(first:1, orderBy:date, orderDirection:desc){ volumeUSD feesUSD }`. Action: **Manage** (opens existing `V3ManageModal`) when the user has a position in that pool, else **Add** → `/pools/add?token0=&token1=&fee=`.
- `/pools/add`: the current `/pools` page body (`TokenSelector` ×2 + `V3AddLiquidity`), `onSuccess` → `/pools`.
- `/pools/browse`: `redirect()` to the locale-aware `/pools`.

### 7.6 Farm `/farm`

`StatCard` row: Pending rewards (Σ user pending across incentives, in reward-token units per token; if more than one reward token, the card lists them), Total staked positions (count), Average APR (mean of `useV3IncentiveAPR` over active incentives; "—" if none). Then the two-column grid of `V3FarmCard` (restyled: header with pair + boost pill + APR in success, two nested stat boxes, Stake LP / Harvest buttons). `V3ClaimRewards`, `V3StakingModal`, `V3ManageModal` unchanged in behaviour.

### 7.7 Stake `/stake`

The reference's KLC/KMT tabs and lock-period tiers do not exist in KalyStaking and are not rendered. Left `Panel`: `StakingForm` (stake/unstake tabs, amount, balance, submit) restyled. Right column: "My staking position" (`useStakedBalance`, `useEarnedRewards`, claim button via the existing `useStakingActions`) and "Network stats" (`useTotalStaked`, `useRewardRate`, `useRewardPeriod` → APR as computed today in `StakingStats`). The "How staking works" and "Risks" copy from the current page stays, in a collapsible panel under the form.

### 7.8 Launchpad `/launchpad`, `/launchpad/[address]`

- Tab row under the header: **Explore** | **Create**.
- Explore: project card grid. Data fetch moves from `Overview.tsx` into `useLaunchpadProjects()` (same two GraphQL queries: presale overview + confirmed fairlaunches). Card: gradient banner (gold → violet) with a status `Pill` from pure `projectStatus({ now, startTime, endTime, status })` → `live | upcoming | ended | cancelled`; name, one-line description, Raised/Hard cap with a progress bar when `totalRaised` is present (presales) and cap-only when it is not (fairlaunches expose `sellingAmount`, not raised); price; "Participate" → `/launchpad/[address]` for live, disabled "Soon"/"Ended" otherwise. `Overview.tsx` and `ConfirmedProjects.tsx` are both replaced by this grid: their fetch logic moves into `useLaunchpadProjects`, their per-project detail rendering already exists on the detail page, and both files are deleted.
- Create: the four existing tools (`TokenCreator`, `RewardsTokenManager`, `PresaleCreator`, `FairlaunchCreator`) as a secondary tab set, forms restyled through the shared tokens only.
- `/launchpad/[address]`: existing components (`ProjectHeader`, `ProjectStats`, `ProjectProgress`, `ParticipationForm`, `UserContributions`, `ProjectOwnerControls`, `ProjectSocialLinks`, `ProjectConfiguration`) laid out as: header panel, two columns (participation left, stats/progress/contributions right), owner controls below when the connected wallet is the owner. 

### 7.9 Coming Soon `/kusd`, `/lend`, `/card`

`ComingSoon` primitive with per-page copy (`dict.comingSoon.kusd|lend|card`): title, two-sentence body describing what the page will do, Soon pill, back link. Sidebar shows the Soon pill on these three items.

### 7.10 Not found

`app/[locale]/not-found.tsx` inside the shell, bilingual.

## 8. Data additions (new hooks and pure helpers)

| File | Purpose |
|---|---|
| `src/lib/subgraph-client.ts` `getV3FactoryStats(url)` | factory TVL/volume/txCount + latest day volume |
| `src/lib/subgraph-client.ts` `getTokenPricesUSD(url, ids)` | derivedETH × ethPriceUSD per token |
| `src/hooks/v3/useV3FactoryStats.ts`, `useTokenPricesUSD.ts` | react-query wrappers, 60s stale |
| `src/hooks/v3/useV3Subgraph.ts` | `useV3Pools` query extended with latest `poolDayData` |
| `src/hooks/vaults/useVaultProtocolStats.ts`, `useMyVaults.ts`, `useVaultTiers.ts`, `useVaultPoolTvl.ts` | RPC multicalls + one subgraph read, ported from kaly-vault |
| `src/hooks/launchpad/useLaunchpadProjects.ts` | extracted from `Overview.tsx` |
| `src/utils/dashboard.ts` `buildAssetRows`, `buildYieldRows` | pure mappers |
| `src/utils/pools.ts` `poolApr` | pure |
| `src/utils/launchpad.ts` `projectStatus` | pure |
| `src/utils/vaults.ts` `maturityPct`, `tierLabel` | pure |

All new hooks use `@tanstack/react-query` like the existing V3 hooks; no polling faster than 30s (RPC budget rule).

## 9. Migrating existing feature components

For each component under `src/components/{swap,swaps,charts,bridge,pools,liquidity,farming,staking,launchpad,onramp,wallet}`:

1. Replace hard-coded old-theme classes (`text-gray-*`, `bg-white`, `bg-slate-*`, `text-slate-*`, inline amber gradients, `#fef3c7`) with token classes (`text-muted`, `bg-surface`, `bg-surface-alt`, `text-cream`, `text-gold`).
2. Replace literal strings with `useDict()` lookups.
3. Replace `next/link` hrefs and `router.push` targets with `useLocaleHref`.
4. Remove `MainLayout` wrappers and per-page CSS imports.
5. Keep every hook call, handler, and prop contract unchanged.

`ConnectWallet.tsx`'s `darkTheme({...})` colors are updated to the tokens (modal bg `--surface`, primary button gold gradient with `--on-gold` text, accent `--gold-light`). `CutoverNotice` copy moves to `dict.cutover`.

## 10. Testing

Vitest (`**/__tests__/**`). New tests, written with the code:

| Test | Asserts |
|---|---|
| `src/i18n/__tests__/dictionaries.test.ts` | EN and FR have identical key trees; no empty strings; identical `{placeholder}` sets per key; FR file type-checks against `Dictionary`. |
| `src/__tests__/middleware.test.ts` | `resolveLocalePath`: `/swaps` → rewrite `/en/swaps`; `/fr/swaps` → next; `/en/swaps` → redirect `/swaps`; `/en` → redirect `/`; `/subgraphs/x`, `/api/x`, `/favicon.ico` untouched by matcher regex. |
| `src/components/shell/__tests__/nav.test.ts` | every `NAV.href` has a `page.tsx` under `src/app/[locale]`; `soon` items are exactly kusd/lend/card; keys unique; every key has `dict.pages[key]` in both locales. |
| `src/components/shell/__tests__/AppShell.test.tsx` (jsdom) | active item highlighted for the current pathname (incl. nested `/launchpad/0x…`); Soon pill rendered for soon items; drawer opens/closes from the hamburger; V4 never appears. |
| `src/components/primitives/__tests__/ComingSoon.test.tsx` | renders title/body from each locale for each of the three keys. |
| `src/utils/__tests__/dashboard.test.ts` | `buildAssetRows` hides zero balances, keeps KMT first, dashes missing prices; `buildYieldRows` includes staking only when staked > 0, farm rows per stake, LP count row when > 0. |
| `src/utils/__tests__/pools.test.ts` | `poolApr` math, null on zero/missing TVL. |
| `src/utils/__tests__/launchpad.test.ts` | `projectStatus` boundaries (start == now, end == now, cancelled wins). |
| `src/utils/__tests__/vaults.test.ts` | `maturityPct` clamps at 100, zero cap → 0. |
| `src/config/__tests__/vaults-addresses.test.ts` | `src/config/vaults.ts` matches `kalychain-ops/files/kmt-3890/addresses.json` (pattern from kaly-vault). |
| `src/lib/__tests__/no-old-theme.test.ts` | no file under `src/app` or `src/components` contains `tailwindcss@2`, `!important`, `text-gray-`, `bg-slate-`, `#fef3c7`, or the string `V4`. |

Existing suite stays green (`npm test`), `npm run lint` clean, `npm run build` passes (strict TS, no `ignoreBuildErrors`). The existing guard tests (`no-3888`, `hosts-only-in-config`, `no-auth-stack`, `no-v2-subgraph`) constrain where the new vault subgraph URL and app URL may live: config only.

Browser verification per page with the `KalySwapv3/frontend:verify` skill at desktop (1440) and phone (400) widths, both locales.

## 11. Sequence

1. **Foundation:** branch; fonts; tokens + removals (§4); i18n plumbing (§5) with `en.ts`/`fr.ts` seeded with shell/common/pages/comingSoon; `AppShell` + primitives; `[locale]` tree with the existing page bodies moved in, their `MainLayout` wrappers and per-page CSS imports removed but their feature components untouched; Coming Soon pages; favicon set. App runs end-to-end in the new frame. Tests: dictionaries, middleware, nav, AppShell, ComingSoon, no-old-theme (initially allowed to fail on not-yet-migrated components, enforced by phase 6).
2. **Dashboard** (§7.1) + its hooks/mappers and tests.
3. **Swap, Bridge** (§7.2–7.3): migrate components per §9, delete `swaps.css`, `bridge.css`.
4. **Pools, Farm, Stake** (§7.5–7.7): migrate, delete `pools.css`, `farm.css`, `stake.css`, `home.css`.
5. **Launchpad** (§7.8) list + detail + create tools; delete `launchpad.css`.
6. **Vaults** (§7.4) config, ABIs, hooks, page, sync test.
7. **FR pass + cleanup:** complete every FR string, delete `components/layout/*`, `tailwind.config.js`, enforce `no-old-theme`, mobile QA at 400px on every page, both locales, build + full suite.

Each phase ends with `npm test`, `npm run lint`, `npm run build`, and a browser check. Nothing is committed by Claude; the boss reviews diffs in the IDE.

## 12. Risks and follow-ups

- **USD figures from the KMT V3 subgraph** may read $0 (pool never swapped) or drift; the UI shows what the subgraph returns with the source caption. Not a UI defect (see memory `kalyswap-usd-pricing-bug`).
- **Removing the `!important` overrides** will surface every component that leaned on them; that is the §9 work and is why phases 3–5 exist.
- **thirdweb ConnectButton** can only be restyled through its theme/style props; pixel-parity with the reference pill is best-effort.
- **Follow-up (not in this pass):** translating hook/service-originated error strings; translating the launchpad creator forms' validation messages that come from zod schemas; a KUSD ramp page when the ramp is exposed to the frontend.
- **Vault subgraph** is not used for vault counts (its migration handler zeroes carried-over vaults; kaly-vault documents this). Counts come from RPC multicalls.
