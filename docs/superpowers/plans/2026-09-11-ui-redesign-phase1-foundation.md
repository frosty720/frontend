# KalySwap UI Redesign — Phase 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the whole KalySwap frontend inside the new sidebar app shell, on the brand token theme, with EN/FR locale routing, so every existing page renders end-to-end in the new frame and the Coming Soon pages exist.

**Architecture:** A server `app/[locale]/layout.tsx` loads a typed dictionary and hands it to a client `DictionaryProvider`; a middleware serves EN unprefixed and FR under `/fr`. `AppShell` (sidebar + top bar + footer) is mounted once in that layout; pages are moved under `[locale]` with their `MainLayout` wrappers removed and otherwise untouched. The theme is a single set of CSS variables in `globals.css` mapped onto the shadcn tokens so `components/ui/*` restyles without edits.

**Tech Stack:** Next.js 15.3 App Router, React 19, TypeScript strict, Tailwind v4 (`@tailwindcss/postcss`, CSS-first), lucide-react, thirdweb `ConnectButton`, wagmi, vitest + @testing-library/react (jsdom via file pragma).

**Spec:** `docs/superpowers/specs/2026-09-11-ui-redesign-design.md` (§3 shell, §4 theme, §5 i18n, §6 primitives, §7.9–7.10 Coming Soon / not found, §10 tests, §11 phase 1).

## Global Constraints

- Work only in `KalySwapv3/frontend` on branch `feat/ui-redesign`. **Never run `git add`, `git commit`, or `git push`** (boss stages and commits from the IDE). Use plain `mv`, not `git mv`.
- Indentation: tabs. Single quotes in TS/TSX. No `any`. No dead code or commented-out blocks.
- Fonts via `next/font/local` only. Never `next/font/google`.
- No hostname literals outside `src/config/**` except the two documented app links (`https://docs.kalychain.io` in `nav.ts`, social links in `Footer.tsx`); `src/config/__tests__/hosts-only-in-config.test.ts` and `no-3888.test.ts` must stay green.
- The string `V4` must not appear anywhere in `src/`.
- Icons: lucide-react only.
- No polling faster than 30 s anywhere.
- Brand token note: the spec's `--muted` text token is exposed as shadcn's `--muted-foreground` (`text-muted-foreground`) to avoid clashing with shadcn's `--muted` background token; `--muted-deep` (`text-muted-deep`) is added as specified.
- `reset.css` is deleted outright (Tailwind v4 preflight covers everything it did) instead of being trimmed.
- After every task: `npm test` green. After Task 8: `npm run lint`, `npm run build`, browser check.

---

## File map (this phase)

| Path | Action | Responsibility |
|---|---|---|
| `src/fonts/SpaceGrotesk-Variable.ttf`, `src/fonts/SpaceGrotesk-OFL.txt` | create | display font + license |
| `src/app/globals.css` | rewrite | brand tokens, shadcn mapping, `@theme inline`, base layer |
| `src/app/reset.css`, `tailwind.config.js` | delete | dead under v4 |
| `src/components/ui/{button,badge,card,tabs,toast,skeleton,slider,error-boundary}.tsx` | modify | token classes |
| `src/lib/__tests__/no-old-theme.test.ts` | create | guard: no old-theme classes / V4 in migrated paths |
| `src/i18n/config.ts`, `interpolate.ts`, `format.ts`, `locale-path.ts`, `get-dictionary.ts`, `DictionaryProvider.tsx`, `hooks.ts` | create | i18n core |
| `src/i18n/dictionaries/en.ts`, `fr.ts` | create | copy |
| `src/i18n/__tests__/dictionaries.test.ts`, `locale-path.test.ts`, `format.test.ts` | create | tests |
| `src/middleware.ts` | create | locale rewrite/redirect |
| `src/components/shell/{nav.ts,AppShell.tsx,Sidebar.tsx,TopBar.tsx,ChainBadge.tsx,LangSwitcher.tsx,Footer.tsx,index.ts}` | create | app shell |
| `src/components/shell/__tests__/nav.test.ts`, `AppShell.test.tsx` | create | tests |
| `src/components/wallet/ConnectWallet.tsx`, `ClientOnlyConnectWallet.tsx` | modify | token restyle + dictionary label |
| `src/components/primitives/{PageHeader,StatCard,Panel,Pill,TokenAvatar,TokenPair,DataTable,EmptyState,ComingSoon,ConnectPrompt}.tsx`, `index.ts` | create | shared presentational primitives |
| `src/components/primitives/__tests__/ComingSoon.test.tsx` | create | test |
| `src/app/[locale]/layout.tsx` | create | root layout (fonts, providers, shell) |
| `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/home.css` | delete | replaced |
| `src/app/[locale]/page.tsx` | create | Dashboard (hero + quick actions; stats/assets/yields come in Phase 2) |
| `src/app/[locale]/{swaps,bridge,farm,stake,launchpad}/` | move from `src/app/` | pages, wrappers removed |
| `src/app/[locale]/pools/page.tsx` | create (from `pools/browse`) | pool list |
| `src/app/[locale]/pools/add/page.tsx` | move from `src/app/pools/page.tsx` | add-liquidity form |
| `src/app/[locale]/pools/browse/page.tsx` | create | redirect to `/pools` |
| `src/app/[locale]/{kusd,lend,card}/page.tsx` | create | Coming Soon |
| `src/app/[locale]/not-found.tsx`, `src/app/[locale]/[...rest]/page.tsx` | create | locale 404 |
| `src/components/layout/{MainLayout,Header,Footer}.tsx` | delete | replaced by shell |
| `public/favicon.ico`, `public/icon.png`, `public/apple-icon.png` | create/replace | favicon set |

---

### Task 1: Branch and display font

**Files:**
- Create: `src/fonts/SpaceGrotesk-Variable.ttf`, `src/fonts/SpaceGrotesk-OFL.txt`

**Interfaces:**
- Produces: the font file path used by Task 6's `localFont` call.

- [ ] **Step 1: Create the feature branch**

Run:
```bash
cd /home/dude/KalyChain/KalySwapv3/frontend && git status --short && git checkout -b feat/ui-redesign
```
Expected: `git status --short` prints nothing (clean tree), then `Switched to a new branch 'feat/ui-redesign'`.

- [ ] **Step 2: Download the variable font and its license**

Run:
```bash
cd /home/dude/KalyChain/KalySwapv3/frontend
curl -fsSL -o src/fonts/SpaceGrotesk-Variable.ttf 'https://raw.githubusercontent.com/google/fonts/main/ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf'
curl -fsSL -o src/fonts/SpaceGrotesk-OFL.txt 'https://raw.githubusercontent.com/google/fonts/main/ofl/spacegrotesk/OFL.txt'
file src/fonts/SpaceGrotesk-Variable.ttf && head -3 src/fonts/SpaceGrotesk-OFL.txt
```
Expected: `TrueType Font data` and the OFL header (`Copyright 2020 The Space Grotesk Project Authors`).

- [ ] **Step 3: Confirm the lucide icons the shell needs exist in the installed version**

Run:
```bash
cd /home/dude/KalyChain/KalySwapv3/frontend && node -e "const l=require('lucide-react');for(const n of ['LayoutDashboard','ArrowLeftRight','Shuffle','Vault','ShoppingBag','Layers','Sprout','Coins','Rocket','HandCoins','CreditCard','Menu','X','Globe','Twitter','Github','Send','MessageCircle','Wallet','ArrowLeft'])console.log(n, typeof l[n])"
```
Expected: every line ends in `object` or `function` (never `undefined`). If one is `undefined`, pick the closest lucide name and use it consistently in Task 4.

---

### Task 2: Brand tokens and `components/ui` restyle

**Files:**
- Rewrite: `src/app/globals.css`
- Delete: `src/app/reset.css`, `tailwind.config.js`
- Modify: `src/components/ui/button.tsx`, `badge.tsx`, `card.tsx`, `tabs.tsx`, `toast.tsx`, `skeleton.tsx`, `slider.tsx`, `error-boundary.tsx`
- Test: `src/lib/__tests__/no-old-theme.test.ts`

**Interfaces:**
- Produces Tailwind color classes: `ink, surface, surface-alt, surface-hi, cream, muted-deep, line, line-strong, gold, gold-dark, gold-bright, gold-light, gold-soft, on-gold, violet, success, info, danger` (usable as `bg-*`, `text-*`, `border-*`, with `/NN` opacity); fonts `font-sans`, `font-display`; breakpoint `desk:` (960px); radii `rounded-2xl` = 18px.
- Produces `Button` variants `default | secondary | outline | ghost | destructive | link`, sizes `default | sm | lg | icon`; `Badge` variants unchanged in name.

- [ ] **Step 1: Write the failing guard test**

Create `src/lib/__tests__/no-old-theme.test.ts`:
```ts
/**
 * The redesign runs on brand tokens (globals.css). Anything that reaches for the old
 * slate/gray/blue palette, the Tailwind v2 CDN, `!important` overrides, or the dropped
 * "V4" label is a regression. ENFORCED grows by one entry per migration phase until it
 * covers all of src/app and src/components.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', '..');

/** Paths (relative to src/) that must already be on the new theme. */
const ENFORCED = [
	'app/globals.css',
	'app/[locale]/layout.tsx',
	'app/[locale]/page.tsx',
	'app/[locale]/not-found.tsx',
	'app/[locale]/[...rest]',
	'app/[locale]/kusd',
	'app/[locale]/lend',
	'app/[locale]/card',
	'components/shell',
	'components/primitives',
	'components/ui',
	'components/wallet/ConnectWallet.tsx',
	'components/wallet/ClientOnlyConnectWallet.tsx',
	'i18n',
];

const FORBIDDEN: Array<[RegExp, string]> = [
	[/tailwindcss@2/, 'Tailwind v2 CDN'],
	[/!important/, '!important override'],
	[/\b(text|bg|border|ring|from|to|via)-(gray|slate|zinc|neutral|stone|blue)-\d/, 'old palette class'],
	[/\bbg-white\b/, 'bg-white'],
	[/#fef3c7/i, 'old amber-50 text color'],
	[/\bV4\b/, 'V4 label'],
];

function walk(path: string, out: string[] = []): string[] {
	if (!existsSync(path)) return out;
	if (statSync(path).isFile()) {
		if (/\.(tsx?|css)$/.test(path)) out.push(path);
		return out;
	}
	for (const entry of readdirSync(path)) {
		if (entry === '__tests__') continue;
		walk(join(path, entry), out);
	}
	return out;
}

describe('no old theme in migrated paths', () => {
	it('every enforced path exists', () => {
		const missing = ENFORCED.filter((p) => !existsSync(join(SRC, p)));
		expect(missing).toEqual([]);
	});

	it('contains no old-theme markers', () => {
		const offenders: string[] = [];
		for (const rel of ENFORCED) {
			for (const file of walk(join(SRC, rel))) {
				const text = readFileSync(file, 'utf8');
				for (const [re, label] of FORBIDDEN) {
					if (re.test(text)) offenders.push(`${file.replace(SRC, 'src')}: ${label}`);
				}
			}
		}
		expect(offenders).toEqual([]);
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /home/dude/KalyChain/KalySwapv3/frontend && npx vitest run src/lib/__tests__/no-old-theme.test.ts`
Expected: FAIL — "every enforced path exists" lists the not-yet-created paths, and "contains no old-theme markers" lists `globals.css: !important`, `badge.tsx: old palette class`, `toast.tsx`, `skeleton.tsx`, `slider.tsx`, `error-boundary.tsx`.

- [ ] **Step 3: Rewrite `globals.css`**

Replace the entire file with:
```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

:root {
	/* Brand palette — shared with kaly-site and kalyswap-lander */
	--ink: #0A0A0A;
	--surface: #141414;
	--surface-alt: #1A1A1A;
	--surface-hi: #212121;
	--cream: #F5F0E6;
	--muted-deep: #6F6960;
	--line: rgba(255, 255, 255, 0.08);
	--line-strong: rgba(255, 255, 255, 0.14);
	--gold: #F59E0B;
	--gold-dark: #D97706;
	--gold-bright: #F7931A;
	--gold-light: #FBBF24;
	--gold-soft: rgba(245, 158, 11, 0.12);
	--on-gold: #1A1206;
	--violet: #8B5CF6;
	--success: #22C55E;
	--info: #38BDF8;
	--danger: #EF4444;
	--radius: 0.875rem;

	/* shadcn semantic tokens mapped onto the brand */
	--background: var(--ink);
	--foreground: var(--cream);
	--card: var(--surface);
	--card-foreground: var(--cream);
	--popover: var(--surface-alt);
	--popover-foreground: var(--cream);
	--primary: var(--gold);
	--primary-foreground: var(--on-gold);
	--secondary: var(--surface-hi);
	--secondary-foreground: var(--cream);
	--muted: var(--surface-alt);
	--muted-foreground: #9A938A;
	--accent: var(--gold-soft);
	--accent-foreground: var(--gold-light);
	--destructive: var(--danger);
	--destructive-foreground: #FFFFFF;
	--border: var(--line);
	--input: var(--surface-alt);
	--ring: var(--gold);
	--chart-1: var(--gold);
	--chart-2: var(--success);
	--chart-3: var(--gold-light);
	--chart-4: var(--violet);
	--chart-5: var(--danger);
	--sidebar: var(--surface);
	--sidebar-foreground: var(--cream);
	--sidebar-primary: var(--gold);
	--sidebar-primary-foreground: var(--on-gold);
	--sidebar-accent: var(--gold-soft);
	--sidebar-accent-foreground: var(--gold-light);
	--sidebar-border: var(--line);
	--sidebar-ring: var(--gold);
}

@theme inline {
	--color-ink: var(--ink);
	--color-surface: var(--surface);
	--color-surface-alt: var(--surface-alt);
	--color-surface-hi: var(--surface-hi);
	--color-cream: var(--cream);
	--color-muted-deep: var(--muted-deep);
	--color-line: var(--line);
	--color-line-strong: var(--line-strong);
	--color-gold: var(--gold);
	--color-gold-dark: var(--gold-dark);
	--color-gold-bright: var(--gold-bright);
	--color-gold-light: var(--gold-light);
	--color-gold-soft: var(--gold-soft);
	--color-on-gold: var(--on-gold);
	--color-violet: var(--violet);
	--color-success: var(--success);
	--color-info: var(--info);
	--color-danger: var(--danger);

	--color-background: var(--background);
	--color-foreground: var(--foreground);
	--color-card: var(--card);
	--color-card-foreground: var(--card-foreground);
	--color-popover: var(--popover);
	--color-popover-foreground: var(--popover-foreground);
	--color-primary: var(--primary);
	--color-primary-foreground: var(--primary-foreground);
	--color-secondary: var(--secondary);
	--color-secondary-foreground: var(--secondary-foreground);
	--color-muted: var(--muted);
	--color-muted-foreground: var(--muted-foreground);
	--color-accent: var(--accent);
	--color-accent-foreground: var(--accent-foreground);
	--color-destructive: var(--destructive);
	--color-destructive-foreground: var(--destructive-foreground);
	--color-border: var(--border);
	--color-input: var(--input);
	--color-ring: var(--ring);
	--color-chart-1: var(--chart-1);
	--color-chart-2: var(--chart-2);
	--color-chart-3: var(--chart-3);
	--color-chart-4: var(--chart-4);
	--color-chart-5: var(--chart-5);
	--color-sidebar: var(--sidebar);
	--color-sidebar-foreground: var(--sidebar-foreground);
	--color-sidebar-primary: var(--sidebar-primary);
	--color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
	--color-sidebar-accent: var(--sidebar-accent);
	--color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
	--color-sidebar-border: var(--sidebar-border);
	--color-sidebar-ring: var(--sidebar-ring);

	--font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
	--font-display: var(--font-space-grotesk), var(--font-inter), ui-sans-serif, system-ui, sans-serif;

	--radius-sm: calc(var(--radius) - 4px);
	--radius-md: calc(var(--radius) - 2px);
	--radius-lg: var(--radius);
	--radius-xl: calc(var(--radius) + 2px);
	--radius-2xl: 1.125rem;
}

@theme {
	/* Sidebar collapses to a drawer below this width (reference layout breakpoint). */
	--breakpoint-desk: 60rem;
}

@layer base {
	* {
		@apply border-border outline-ring/50;
	}

	html {
		scroll-behavior: smooth;
		color-scheme: dark;
	}

	body {
		@apply bg-background font-sans text-foreground antialiased;
		min-height: 100vh;
	}

	h1,
	h2,
	h3 {
		@apply font-display;
	}

	::-webkit-scrollbar {
		width: 10px;
		height: 10px;
	}

	::-webkit-scrollbar-thumb {
		background: var(--surface-hi);
		border-radius: 8px;
	}
}

@layer utilities {
	.text-balance {
		text-wrap: balance;
	}
}
```

- [ ] **Step 4: Delete the dead reset and config files**

Run:
```bash
cd /home/dude/KalyChain/KalySwapv3/frontend && rm src/app/reset.css tailwind.config.js && grep -rn "reset.css\|tailwind.config" src postcss.config.mjs next.config.js || echo "no references left"
```
Expected: `no references left`.

- [ ] **Step 5: Restyle `button.tsx`**

Replace the `buttonVariants` definition (keep the `Button` function and exports as they are):
```tsx
const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-[background-color,color,filter,transform] duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-danger aria-invalid:ring-danger/20 active:scale-[0.99]",
	{
		variants: {
			variant: {
				default:
					"bg-gradient-to-br from-gold-light to-gold text-on-gold hover:brightness-105",
				destructive:
					"bg-danger text-white hover:bg-danger/90 focus-visible:ring-danger/30",
				outline:
					"border border-line-strong bg-transparent text-cream hover:bg-surface-alt",
				secondary:
					"border border-line bg-surface-hi text-cream hover:bg-surface-alt",
				ghost:
					"text-muted-foreground hover:bg-surface-alt hover:text-cream",
				link: "text-gold underline-offset-4 hover:underline",
			},
			size: {
				default: "h-10 px-4 py-2 has-[>svg]:px-3.5",
				sm: "h-8 rounded-lg gap-1.5 px-3 text-[13px] has-[>svg]:px-2.5",
				lg: "h-12 rounded-xl px-6 text-[15px] has-[>svg]:px-5",
				icon: "size-10",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	}
)
```

- [ ] **Step 6: Restyle `badge.tsx`**

Replace `baseClasses` and `variantClasses`:
```tsx
	const baseClasses = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring/50"

	const variantClasses = {
		default: "border-transparent bg-gold-soft text-gold-light",
		secondary: "border-transparent bg-surface-hi text-cream",
		destructive: "border-transparent bg-danger/15 text-danger",
		outline: "border-line-strong text-muted-foreground",
	}
```

- [ ] **Step 7: Restyle `card.tsx`**

In `Card`, change the class string to:
```tsx
				"bg-card text-card-foreground flex flex-col gap-6 rounded-2xl border border-line py-6",
```
(drops `rounded-xl` and `shadow-sm`). Leave the other Card sub-components unchanged.

- [ ] **Step 8: Restyle `tabs.tsx`**

`TabsList` class string:
```tsx
			"inline-flex h-auto items-center justify-center gap-1 rounded-xl border border-line bg-surface-hi p-1 text-muted-foreground",
```
`TabsTrigger` class string:
```tsx
			"inline-flex items-center justify-center whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-gold data-[state=active]:text-on-gold",
```
`TabsContent` class string: replace `ring-offset-background focus-visible:ring-offset-2` with nothing, keeping `"mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"`.

- [ ] **Step 9: Token-swap the remaining ui files**

Apply exactly these replacements:

| File | Old | New |
|---|---|---|
| `toast.tsx` | `text-green-600` | `text-success` |
| `toast.tsx` | `text-red-600` | `text-danger` |
| `toast.tsx` | `text-blue-600` | `text-info` |
| `toast.tsx` | `border-l-green-500` | `border-l-success` |
| `toast.tsx` | `border-l-red-500` | `border-l-danger` |
| `toast.tsx` | `border-l-blue-500` | `border-l-info` |
| `toast.tsx` | `text-gray-900` | `text-cream` |
| `toast.tsx` | `hover:bg-gray-100` | `hover:bg-surface-alt` |
| `toast.tsx` | `text-gray-600` | `text-muted-foreground` |
| `skeleton.tsx` | `'bg-gray-200 dark:bg-gray-700'` | `'bg-surface-hi'` |
| `slider.tsx` | `bg-gray-700` | `bg-surface-hi` |
| `error-boundary.tsx` | `bg-gray-100 dark:bg-gray-800` | `bg-surface-alt` |
| `error-boundary.tsx` | `text-gray-600 dark:text-gray-400` | `text-muted-foreground` |

Run:
```bash
cd /home/dude/KalyChain/KalySwapv3/frontend/src/components/ui && sed -i \
 -e 's/text-green-600/text-success/g; s/text-red-600/text-danger/g; s/text-blue-600/text-info/g' \
 -e 's/border-l-green-500/border-l-success/g; s/border-l-red-500/border-l-danger/g; s/border-l-blue-500/border-l-info/g' \
 -e 's/text-gray-900/text-cream/g; s/hover:bg-gray-100/hover:bg-surface-alt/g; s/text-gray-600/text-muted-foreground/g' toast.tsx && \
sed -i "s/'bg-gray-200 dark:bg-gray-700'/'bg-surface-hi'/" skeleton.tsx && \
sed -i 's/bg-gray-700/bg-surface-hi/' slider.tsx && \
sed -i 's/bg-gray-100 dark:bg-gray-800/bg-surface-alt/; s/text-gray-600 dark:text-gray-400/text-muted-foreground/' error-boundary.tsx && \
grep -n "gray-\|blue-\|green-\|red-" *.tsx || echo "ui clean"
```
Expected: `ui clean`.

- [ ] **Step 10: Run the guard test again**

Run: `npx vitest run src/lib/__tests__/no-old-theme.test.ts`
Expected: "contains no old-theme markers" PASSES for the ui files; "every enforced path exists" still FAILS (paths created in Tasks 3–6). That is the expected state until Task 6.

- [ ] **Step 11: Run the whole suite to confirm nothing else broke**

Run: `npm test`
Expected: only `no-old-theme.test.ts` "every enforced path exists" fails.

---

### Task 3: i18n core (config, dictionaries, provider, hooks, middleware)

**Files:**
- Create: `src/i18n/config.ts`, `src/i18n/interpolate.ts`, `src/i18n/format.ts`, `src/i18n/locale-path.ts`, `src/i18n/get-dictionary.ts`, `src/i18n/DictionaryProvider.tsx`, `src/i18n/hooks.ts`, `src/i18n/dictionaries/en.ts`, `src/i18n/dictionaries/fr.ts`, `src/middleware.ts`
- Test: `src/i18n/__tests__/dictionaries.test.ts`, `src/i18n/__tests__/locale-path.test.ts`, `src/i18n/__tests__/format.test.ts`

**Interfaces:**
- Produces: `type Locale = 'en' | 'fr'`; `LOCALES`, `DEFAULT_LOCALE`, `isLocale(v): v is Locale`, `LOCALE_LABEL`, `LOCALE_HTML_LANG`, `NUMBER_LOCALE`.
- Produces: `type Dictionary = typeof en`; `getDictionary(locale): Promise<Dictionary>`.
- Produces: `DictionaryProvider({ dict, locale, children })`; hooks `useDict(): Dictionary`, `useLocale(): Locale`, `useLocaleHref(): (path: string) => string`, `useFormat(): Formatter`.
- Produces: `splitLocale(pathname): { locale: Locale; path: string }`, `withLocale(locale, path): string`, `resolveLocalePath(pathname): LocaleRoute`.
- Produces: `interpolate(template, vars): string`; `makeFormat(locale): Formatter` where `Formatter = { number(v, opts?), usd(v, opts?), pct(v, decimals?), date(d, opts?) }`.

- [ ] **Step 1: Write the failing tests**

Create `src/i18n/__tests__/locale-path.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { splitLocale, withLocale, resolveLocalePath } from '../locale-path';

describe('splitLocale', () => {
	it('treats an unprefixed path as the default locale', () => {
		expect(splitLocale('/swaps')).toEqual({ locale: 'en', path: '/swaps' });
		expect(splitLocale('/')).toEqual({ locale: 'en', path: '/' });
	});
	it('strips a known locale prefix', () => {
		expect(splitLocale('/fr/swaps')).toEqual({ locale: 'fr', path: '/swaps' });
		expect(splitLocale('/fr')).toEqual({ locale: 'fr', path: '/' });
		expect(splitLocale('/en/pools/add')).toEqual({ locale: 'en', path: '/pools/add' });
	});
	it('does not mistake a longer segment for a locale', () => {
		expect(splitLocale('/french')).toEqual({ locale: 'en', path: '/french' });
	});
});

describe('withLocale', () => {
	it('leaves EN unprefixed', () => {
		expect(withLocale('en', '/swaps')).toBe('/swaps');
		expect(withLocale('en', '/')).toBe('/');
	});
	it('prefixes FR', () => {
		expect(withLocale('fr', '/swaps')).toBe('/fr/swaps');
		expect(withLocale('fr', '/')).toBe('/fr');
		expect(withLocale('fr', 'swaps')).toBe('/fr/swaps');
	});
});

describe('resolveLocalePath (middleware)', () => {
	it('rewrites unprefixed paths to the EN tree', () => {
		expect(resolveLocalePath('/swaps')).toEqual({ kind: 'rewrite', pathname: '/en/swaps' });
		expect(resolveLocalePath('/')).toEqual({ kind: 'rewrite', pathname: '/en' });
	});
	it('redirects explicit /en to the canonical unprefixed URL', () => {
		expect(resolveLocalePath('/en/swaps')).toEqual({ kind: 'redirect', pathname: '/swaps' });
		expect(resolveLocalePath('/en')).toEqual({ kind: 'redirect', pathname: '/' });
	});
	it('passes FR through', () => {
		expect(resolveLocalePath('/fr/swaps')).toEqual({ kind: 'next' });
		expect(resolveLocalePath('/fr')).toEqual({ kind: 'next' });
	});
});

describe('middleware matcher', () => {
	// Next's matcher is path-to-regexp; the negative lookahead inside is a plain regex,
	// so the derived form below is what actually decides which paths reach the middleware.
	const matcher = /^\/(?!api|subgraphs|_next|.*\..*).*$/;
	it('skips API, subgraph proxy, Next internals and files', () => {
		for (const p of ['/api/graphql', '/subgraphs/name/v3-subgraph-kmt', '/_next/static/x.js', '/favicon.ico', '/icons/KalySwapLogo.png']) {
			expect(matcher.test(p), p).toBe(false);
		}
	});
	it('matches page routes', () => {
		for (const p of ['/', '/swaps', '/fr/swaps', '/en', '/launchpad/0xabc']) {
			expect(matcher.test(p), p).toBe(true);
		}
	});
});
```

Create `src/i18n/__tests__/dictionaries.test.ts`:
```ts
/**
 * EN is the source of truth; FR must mirror it exactly. A missing key would render
 * `undefined` in the UI, an empty string would render nothing, and a placeholder that
 * exists in one language but not the other would leak `{name}` into the page.
 */
import { describe, it, expect } from 'vitest';
import en from '../dictionaries/en';
import fr from '../dictionaries/fr';

type Tree = { [k: string]: string | Tree };

function leaves(node: Tree, prefix = ''): Array<[string, string]> {
	const out: Array<[string, string]> = [];
	for (const [k, v] of Object.entries(node)) {
		const key = prefix ? `${prefix}.${k}` : k;
		if (typeof v === 'string') out.push([key, v]);
		else out.push(...leaves(v, key));
	}
	return out;
}

const placeholders = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort();

describe('dictionaries', () => {
	const enLeaves = leaves(en as unknown as Tree);
	const frLeaves = leaves(fr as unknown as Tree);
	const frMap = new Map(frLeaves);

	it('FR exposes exactly the EN key set', () => {
		expect(frLeaves.map(([k]) => k).sort()).toEqual(enLeaves.map(([k]) => k).sort());
	});

	it('no string is empty in either locale', () => {
		const empty = [...enLeaves, ...frLeaves].filter(([, v]) => v.trim() === '').map(([k]) => k);
		expect(empty).toEqual([]);
	});

	it('every key uses the same placeholders in both locales', () => {
		const mismatched = enLeaves
			.filter(([k, v]) => JSON.stringify(placeholders(v)) !== JSON.stringify(placeholders(frMap.get(k) ?? '')))
			.map(([k]) => k);
		expect(mismatched).toEqual([]);
	});

	it('never mentions the dropped V4 label', () => {
		const hits = [...enLeaves, ...frLeaves].filter(([, v]) => /\bV4\b/.test(v)).map(([k]) => k);
		expect(hits).toEqual([]);
	});

	it('has the namespaces the shell depends on', () => {
		for (const ns of ['meta', 'nav', 'pages', 'shell', 'common', 'dashboard', 'comingSoon', 'footer'] as const) {
			expect(en[ns], ns).toBeDefined();
		}
		for (const key of ['dashboard', 'swap', 'bridge', 'vaults', 'kusd', 'pools', 'farm', 'stake', 'launchpad', 'lend', 'card'] as const) {
			expect(en.nav[key], `nav.${key}`).toBeTruthy();
			expect(en.pages[key].title, `pages.${key}`).toBeTruthy();
		}
	});
});
```

Create `src/i18n/__tests__/format.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { makeFormat } from '../format';
import { interpolate } from '../interpolate';

describe('makeFormat', () => {
	it('formats USD per locale', () => {
		expect(makeFormat('en').usd(1234.5)).toBe('$1,234.50');
		// fr-FR uses a narrow no-break space as the thousands separator and puts the symbol last.
		expect(makeFormat('fr').usd(1234.5).replace(/[\u202f\u00a0]/g, ' ')).toBe('1 234,50 $US');
	});
	it('compacts large USD values', () => {
		expect(makeFormat('en').usd(1_240_000, { compact: true })).toBe('$1.24M');
	});
	it('formats percentages and plain numbers', () => {
		expect(makeFormat('en').pct(48.123)).toBe('48.12%');
		expect(makeFormat('en').number(124500)).toBe('124,500');
		expect(makeFormat('fr').number(124500).replace(/[\u202f\u00a0]/g, ' ')).toBe('124 500');
	});
});

describe('interpolate', () => {
	it('substitutes every placeholder and leaves unknown ones visible', () => {
		expect(interpolate('Source: {name} · {name}', { name: 'subgraph' })).toBe('Source: subgraph · subgraph');
		expect(interpolate('Hi {who}', {})).toBe('Hi {who}');
	});
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/i18n`
Expected: FAIL — cannot resolve `../locale-path`, `../dictionaries/en`, `../format`.

- [ ] **Step 3: Create `config.ts`, `interpolate.ts`, `format.ts`, `locale-path.ts`**

`src/i18n/config.ts`:
```ts
export const LOCALES = ['en', 'fr'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(value: string): value is Locale {
	return (LOCALES as readonly string[]).includes(value);
}

export const LOCALE_LABEL: Record<Locale, string> = {
	en: 'English',
	fr: 'Français',
};

export const LOCALE_HTML_LANG: Record<Locale, string> = {
	en: 'en',
	fr: 'fr',
};

/** BCP-47 tags for Intl formatting. */
export const NUMBER_LOCALE: Record<Locale, string> = {
	en: 'en-US',
	fr: 'fr-FR',
};
```

`src/i18n/interpolate.ts`:
```ts
/** Replace `{name}` placeholders; unknown names stay visible so a missing var is noticed. */
export function interpolate(template: string, vars: Record<string, string | number>): string {
	return template.replace(/\{(\w+)\}/g, (_, key: string) => {
		const value = vars[key];
		return value === undefined ? `{${key}}` : String(value);
	});
}
```

`src/i18n/format.ts`:
```ts
import { NUMBER_LOCALE, type Locale } from './config';

export interface Formatter {
	number: (value: number, opts?: Intl.NumberFormatOptions) => string;
	usd: (value: number, opts?: { compact?: boolean; decimals?: number }) => string;
	pct: (value: number, decimals?: number) => string;
	date: (value: Date | number, opts?: Intl.DateTimeFormatOptions) => string;
}

export function makeFormat(locale: Locale): Formatter {
	const tag = NUMBER_LOCALE[locale];
	return {
		number: (value, opts) => new Intl.NumberFormat(tag, { maximumFractionDigits: 2, ...opts }).format(value),
		usd: (value, opts) => {
			if (opts?.compact) {
				return new Intl.NumberFormat(tag, {
					style: 'currency',
					currency: 'USD',
					notation: 'compact',
					maximumFractionDigits: opts.decimals ?? 2,
				}).format(value);
			}
			const decimals = opts?.decimals ?? 2;
			return new Intl.NumberFormat(tag, {
				style: 'currency',
				currency: 'USD',
				minimumFractionDigits: decimals,
				maximumFractionDigits: decimals,
			}).format(value);
		},
		pct: (value, decimals = 2) =>
			`${new Intl.NumberFormat(tag, { maximumFractionDigits: decimals }).format(value)}%`,
		date: (value, opts) => new Intl.DateTimeFormat(tag, opts ?? { dateStyle: 'medium' }).format(value),
	};
}
```

`src/i18n/locale-path.ts`:
```ts
import { DEFAULT_LOCALE, isLocale, type Locale } from './config';

/** Split `/fr/pools/add` into `{ locale: 'fr', path: '/pools/add' }`; unprefixed paths are EN. */
export function splitLocale(pathname: string): { locale: Locale; path: string } {
	const [, first = '', ...rest] = pathname.split('/');
	if (isLocale(first)) {
		const joined = `/${rest.join('/')}`;
		return { locale: first, path: joined === '/' ? '/' : joined.replace(/\/$/, '') };
	}
	return { locale: DEFAULT_LOCALE, path: pathname === '' ? '/' : pathname };
}

/** Prefix an internal path for a locale. EN stays unprefixed. */
export function withLocale(locale: Locale, path: string): string {
	const clean = path.startsWith('/') ? path : `/${path}`;
	if (locale === DEFAULT_LOCALE) return clean;
	return clean === '/' ? `/${locale}` : `/${locale}${clean}`;
}

export type LocaleRoute =
	| { kind: 'next' }
	| { kind: 'redirect'; pathname: string }
	| { kind: 'rewrite'; pathname: string };

/**
 * Middleware decision: EN is served at the site root; other locales are prefixed.
 * `/en/*` redirects to the unprefixed canonical URL; unprefixed paths are rewritten
 * (invisibly) into the `/en` tree that `app/[locale]` renders.
 */
export function resolveLocalePath(pathname: string): LocaleRoute {
	const { locale, path } = splitLocale(pathname);
	const prefixed = pathname === `/${locale}` || pathname.startsWith(`/${locale}/`);
	if (locale !== DEFAULT_LOCALE) return { kind: 'next' };
	if (prefixed) return { kind: 'redirect', pathname: path };
	return { kind: 'rewrite', pathname: path === '/' ? `/${DEFAULT_LOCALE}` : `/${DEFAULT_LOCALE}${path}` };
}
```

- [ ] **Step 4: Create the EN dictionary**

`src/i18n/dictionaries/en.ts`:
```ts
/**
 * English copy — the source of truth. `fr.ts` is typed against this object, so adding a key
 * here fails the FR build until it is translated. Placeholders use `{name}` (see interpolate.ts).
 */
const en = {
	meta: {
		title: 'KalySwap — The DeFi Super App on KalyChain',
		description:
			'Swap, bridge, provide liquidity, farm, stake and launch on KalyChain — the all-in-one DeFi dashboard with real yield on every block.',
	},

	nav: {
		dashboard: 'Dashboard',
		swap: 'Swap',
		bridge: 'Bridge',
		vaults: 'Vaults',
		kusd: 'Buy/Sell KUSD',
		pools: 'Pools',
		farm: 'Farm',
		stake: 'Stake',
		launchpad: 'Launchpad',
		lend: 'Lend',
		card: 'KUSD Card',
	},

	pages: {
		dashboard: { title: 'Dashboard', subtitle: 'Your KalyChain portfolio at a glance' },
		swap: { title: 'Swap', subtitle: 'Trade any asset on KalyChain in one click' },
		bridge: { title: 'Bridge', subtitle: 'Move tokens between KalyChain, Arbitrum, BSC and Polygon' },
		vaults: { title: 'Vaults', subtitle: 'Yield-bearing NFTs backed by protocol-owned liquidity' },
		kusd: { title: 'Buy / Sell KUSD', subtitle: 'The KalyChain dollar, on-ramp and off-ramp' },
		pools: { title: 'Pools', subtitle: 'Provide liquidity and earn trading fees' },
		farm: { title: 'Farm', subtitle: 'Stake LP positions for boosted KMT rewards' },
		stake: { title: 'Stake', subtitle: 'Stake KMT and earn real yield every block' },
		launchpad: { title: 'Launchpad', subtitle: 'Early access to new projects built on KalyChain' },
		lend: { title: 'Lend', subtitle: 'Lend and borrow, over-collateralized and non-custodial' },
		card: { title: 'KUSD Card', subtitle: 'Spend your KUSD anywhere' },
		notFound: { title: 'Page not found', subtitle: 'Nothing lives at this address' },
	},

	shell: {
		brand: 'KalySwap',
		tagline: 'The DeFi Super App',
		menu: 'Open menu',
		closeMenu: 'Close menu',
		language: 'Language',
		soon: 'Soon',
		chainOk: 'KalyChain',
		chainWrong: 'Wrong network',
		connect: 'Connect Wallet',
		newTitle: 'New to KalySwap?',
		newBody: 'Discover real yield on KalyChain.',
		newCta: 'Learn more →',
		poweredBy: 'Powered by KalyChain',
	},

	common: {
		loading: 'Loading…',
		error: 'Something went wrong',
		retry: 'Retry',
		connectWallet: 'Connect your wallet',
		connectBody: 'Connect a wallet to see your balances and positions.',
		viewAll: 'View all',
		claim: 'Claim',
		manage: 'Manage',
		add: 'Add',
		source: 'Source: {name}',
		backToDashboard: 'Back to Dashboard',
		comingSoon: 'Coming soon',
		external: 'Opens in a new tab',
		noData: 'No data yet',
	},

	dashboard: {
		heroTitleLead: 'KalySwap — The',
		heroTitleAccent: 'DeFi Super App',
		heroBody:
			'All of DeFi in one place. Swap, Vaults, liquidity, farming, staking and more — on a fast chain where a transaction costs less than a cent.',
		ctaSwap: 'Start a swap',
		ctaVaults: 'Explore Vaults',
		quickSwap: 'Swap',
		quickSwapBody: 'Fast exchange',
		quickVaults: 'Vaults',
		quickVaultsBody: 'Passive-income NFTs',
		quickPools: 'Pools',
		quickPoolsBody: 'Provide liquidity',
		quickFarm: 'Farm',
		quickFarmBody: 'Boosted LP rewards',
	},

	comingSoon: {
		kusd: {
			title: 'Buy / Sell KUSD',
			body: 'Buy and sell the KUSD stablecoin (1:1 USD) with mobile money, card or crypto, settled instantly on KalyChain. The ramp is being wired into KalySwap.',
		},
		lend: {
			title: 'Lend & Borrow',
			body: 'Lend your assets to earn interest, or borrow against your collateral — over-collateralized and non-custodial. Coming to KalySwap.',
		},
		card: {
			title: 'KUSD Card',
			body: 'Spend your KUSD anywhere in the world with a card backed by your on-chain balance, no bank account required. Coming to KalySwap.',
		},
	},

	notFound: {
		body: 'The page you are looking for does not exist or has moved.',
	},

	footer: {
		line: 'KalySwap — The DeFi Super App · Powered by KalyChain',
		twitter: 'X (Twitter)',
		github: 'GitHub',
		telegram: 'Telegram',
		discord: 'Discord',
	},
};

export type Dictionary = typeof en;
export default en;
```

- [ ] **Step 5: Create the FR dictionary**

`src/i18n/dictionaries/fr.ts`:
```ts
import type { Dictionary } from './en';

const fr: Dictionary = {
	meta: {
		title: 'KalySwap — La DeFi Super App sur KalyChain',
		description:
			'Échangez, transférez, fournissez de la liquidité, farmez, stakez et lancez vos projets sur KalyChain — le tableau de bord DeFi tout-en-un avec un rendement réel à chaque bloc.',
	},

	nav: {
		dashboard: 'Tableau de bord',
		swap: 'Swap',
		bridge: 'Bridge',
		vaults: 'Vaults',
		kusd: 'Acheter/Vendre KUSD',
		pools: 'Pools',
		farm: 'Farm',
		stake: 'Stake',
		launchpad: 'Launchpad',
		lend: 'Prêt',
		card: 'Carte KUSD',
	},

	pages: {
		dashboard: { title: 'Tableau de bord', subtitle: 'Votre portefeuille KalyChain en un coup d’œil' },
		swap: { title: 'Swap', subtitle: 'Échangez n’importe quel actif de KalyChain en un clic' },
		bridge: { title: 'Bridge', subtitle: 'Transférez vos jetons entre KalyChain, Arbitrum, BSC et Polygon' },
		vaults: { title: 'Vaults', subtitle: 'Des NFT productifs adossés à la liquidité du protocole' },
		kusd: { title: 'Acheter / Vendre KUSD', subtitle: 'Le dollar KalyChain, en entrée comme en sortie' },
		pools: { title: 'Pools', subtitle: 'Fournissez de la liquidité et gagnez des frais de trading' },
		farm: { title: 'Farm', subtitle: 'Stakez vos positions LP pour des récompenses KMT boostées' },
		stake: { title: 'Stake', subtitle: 'Stakez du KMT et gagnez un rendement réel à chaque bloc' },
		launchpad: { title: 'Launchpad', subtitle: 'Accédez en avant-première aux nouveaux projets sur KalyChain' },
		lend: { title: 'Prêt', subtitle: 'Prêtez et empruntez, sur-collatéralisé et non-custodial' },
		card: { title: 'Carte KUSD', subtitle: 'Dépensez vos KUSD partout' },
		notFound: { title: 'Page introuvable', subtitle: 'Rien n’existe à cette adresse' },
	},

	shell: {
		brand: 'KalySwap',
		tagline: 'La DeFi Super App',
		menu: 'Ouvrir le menu',
		closeMenu: 'Fermer le menu',
		language: 'Langue',
		soon: 'Bientôt',
		chainOk: 'KalyChain',
		chainWrong: 'Mauvais réseau',
		connect: 'Connecter un wallet',
		newTitle: 'Nouveau sur KalySwap ?',
		newBody: 'Découvrez le rendement réel sur KalyChain.',
		newCta: 'En savoir plus →',
		poweredBy: 'Propulsé par KalyChain',
	},

	common: {
		loading: 'Chargement…',
		error: 'Une erreur est survenue',
		retry: 'Réessayer',
		connectWallet: 'Connectez votre wallet',
		connectBody: 'Connectez un wallet pour voir vos soldes et vos positions.',
		viewAll: 'Tout voir',
		claim: 'Réclamer',
		manage: 'Gérer',
		add: 'Ajouter',
		source: 'Source : {name}',
		backToDashboard: 'Retour au tableau de bord',
		comingSoon: 'Bientôt disponible',
		external: 'S’ouvre dans un nouvel onglet',
		noData: 'Pas encore de données',
	},

	dashboard: {
		heroTitleLead: 'KalySwap — La',
		heroTitleAccent: 'DeFi Super App',
		heroBody:
			'Toute la DeFi au même endroit. Swap, Vaults, liquidité, farming, staking et plus encore — sur une chaîne rapide où une transaction coûte moins d’un centime.',
		ctaSwap: 'Lancer un swap',
		ctaVaults: 'Explorer les Vaults',
		quickSwap: 'Swap',
		quickSwapBody: 'Échange rapide',
		quickVaults: 'Vaults',
		quickVaultsBody: 'NFT à revenu passif',
		quickPools: 'Pools',
		quickPoolsBody: 'Fournir de la liquidité',
		quickFarm: 'Farm',
		quickFarmBody: 'Récompenses LP boostées',
	},

	comingSoon: {
		kusd: {
			title: 'Acheter / Vendre KUSD',
			body: 'Achetez et vendez le stablecoin KUSD (1:1 USD) par mobile money, carte ou crypto, avec règlement instantané sur KalyChain. La rampe est en cours d’intégration à KalySwap.',
		},
		lend: {
			title: 'Prêt & Emprunt',
			body: 'Prêtez vos actifs pour gagner des intérêts, ou empruntez contre votre collatéral — sur-collatéralisé et non-custodial. Bientôt sur KalySwap.',
		},
		card: {
			title: 'Carte KUSD',
			body: 'Dépensez vos KUSD partout dans le monde avec une carte adossée à votre solde on-chain, sans compte bancaire. Bientôt sur KalySwap.',
		},
	},

	notFound: {
		body: 'La page que vous cherchez n’existe pas ou a été déplacée.',
	},

	footer: {
		line: 'KalySwap — La DeFi Super App · Propulsé par KalyChain',
		twitter: 'X (Twitter)',
		github: 'GitHub',
		telegram: 'Telegram',
		discord: 'Discord',
	},
};

export default fr;
```

- [ ] **Step 6: Create the loader, provider, hooks, and middleware**

`src/i18n/get-dictionary.ts`:
```ts
import type { Locale } from './config';
import type { Dictionary } from './dictionaries/en';

const loaders: Record<Locale, () => Promise<{ default: Dictionary }>> = {
	en: () => import('./dictionaries/en'),
	fr: () => import('./dictionaries/fr'),
};

/** Server-side: load one locale's copy. Only the requested locale ships to the client. */
export async function getDictionary(locale: Locale): Promise<Dictionary> {
	const mod = await loaders[locale]();
	return mod.default;
}
```

`src/i18n/DictionaryProvider.tsx`:
```tsx
'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Locale } from './config';
import type { Dictionary } from './dictionaries/en';

export interface DictionaryContextValue {
	dict: Dictionary;
	locale: Locale;
}

const DictionaryContext = createContext<DictionaryContextValue | null>(null);

export function DictionaryProvider({ dict, locale, children }: DictionaryContextValue & { children: ReactNode }) {
	return <DictionaryContext.Provider value={{ dict, locale }}>{children}</DictionaryContext.Provider>;
}

export function useDictionaryContext(): DictionaryContextValue {
	const value = useContext(DictionaryContext);
	if (!value) throw new Error('useDict/useLocale must be used inside <DictionaryProvider>');
	return value;
}
```

`src/i18n/hooks.ts`:
```ts
'use client';

import { useCallback, useMemo } from 'react';
import { useDictionaryContext } from './DictionaryProvider';
import { makeFormat, type Formatter } from './format';
import { withLocale } from './locale-path';
import type { Locale } from './config';
import type { Dictionary } from './dictionaries/en';

export function useDict(): Dictionary {
	return useDictionaryContext().dict;
}

export function useLocale(): Locale {
	return useDictionaryContext().locale;
}

/** Prefix an internal href for the active locale: `href('/pools')` → `/pools` (EN) or `/fr/pools`. */
export function useLocaleHref(): (path: string) => string {
	const locale = useLocale();
	return useCallback((path: string) => withLocale(locale, path), [locale]);
}

export function useFormat(): Formatter {
	const locale = useLocale();
	return useMemo(() => makeFormat(locale), [locale]);
}
```

`src/middleware.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server';
import { resolveLocalePath } from '@/i18n/locale-path';

/**
 * EN is served at the site root; FR lives under /fr. `/en/*` redirects to the canonical
 * unprefixed URL; everything else is rewritten into the /en tree that app/[locale] renders.
 */
export function middleware(request: NextRequest) {
	const route = resolveLocalePath(request.nextUrl.pathname);
	if (route.kind === 'next') return NextResponse.next();
	const url = request.nextUrl.clone();
	url.pathname = route.pathname;
	return route.kind === 'redirect' ? NextResponse.redirect(url, 308) : NextResponse.rewrite(url);
}

export const config = {
	// Skip API routes, the dev subgraph proxy (next.config.js rewrites), Next internals, and files.
	matcher: ['/((?!api|subgraphs|_next|.*\\..*).*)'],
};
```

- [ ] **Step 7: Run the i18n tests**

Run: `npx vitest run src/i18n`
Expected: PASS (3 files). If `format.test.ts` fails on the FR currency string, print the actual value with `console.log(JSON.stringify(makeFormat('fr').usd(1234.5)))` and adjust only the expected literal's whitespace characters (the test already normalises U+202F and U+00A0 via the `[\u202f\u00a0]` regex) — never change `makeFormat`.

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "src/app/" | head -20`
Expected: no errors under `src/i18n` or `src/middleware.ts`. (Errors under `src/app/` are expected until Task 6 — the old `layout.tsx` still exists.)

---

### Task 4: App shell (nav, sidebar, top bar, chain badge, language switcher, footer) + wallet button restyle

**Files:**
- Create: `src/components/shell/nav.ts`, `AppShell.tsx`, `Sidebar.tsx`, `TopBar.tsx`, `ChainBadge.tsx`, `LangSwitcher.tsx`, `Footer.tsx`, `index.ts`
- Modify: `src/components/wallet/ConnectWallet.tsx`, `src/components/wallet/ClientOnlyConnectWallet.tsx`
- Test: `src/components/shell/__tests__/nav.test.ts`, `src/components/shell/__tests__/AppShell.test.tsx`

**Interfaces:**
- Consumes: `useDict`, `useLocale`, `useLocaleHref` (Task 3); `splitLocale`, `withLocale` (Task 3); `Pill` (Task 5 — create `Pill.tsx` first in this task if executing Task 4 before Task 5; its code is in Task 5 Step 3 and is identical).
- Produces: `NAV: readonly NavItem[]`, `type NavKey`, `activeNavKey(path): NavKey | null`, `DOCS_URL`; `<AppShell>{children}</AppShell>`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/shell/__tests__/nav.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import { NAV, activeNavKey } from '../nav';
import en from '@/i18n/dictionaries/en';
import fr from '@/i18n/dictionaries/fr';

const APP = join(__dirname, '..', '..', '..', 'app', '[locale]');

describe('NAV', () => {
	it('lists the sidebar in the agreed order', () => {
		expect(NAV.map((i) => i.key)).toEqual([
			'dashboard', 'swap', 'bridge', 'vaults', 'kusd', 'pools', 'farm', 'stake', 'launchpad', 'lend', 'card',
		]);
	});

	it('marks exactly the three Coming Soon pages', () => {
		expect(NAV.filter((i) => i.soon).map((i) => i.key)).toEqual(['kusd', 'lend', 'card']);
	});

	it('has unique keys and hrefs', () => {
		expect(new Set(NAV.map((i) => i.key)).size).toBe(NAV.length);
		expect(new Set(NAV.map((i) => i.href)).size).toBe(NAV.length);
	});

	it('every href has a page under app/[locale]', () => {
		const missing = NAV.filter((i) => !existsSync(join(APP, i.href === '/' ? '' : i.href, 'page.tsx'))).map((i) => i.href);
		expect(missing).toEqual([]);
	});

	it('every key has nav + page copy in both locales', () => {
		for (const { key } of NAV) {
			expect(en.nav[key]).toBeTruthy();
			expect(fr.nav[key]).toBeTruthy();
			expect(en.pages[key].title).toBeTruthy();
			expect(fr.pages[key].title).toBeTruthy();
		}
	});
});

describe('activeNavKey', () => {
	it('matches exact and nested paths', () => {
		expect(activeNavKey('/')).toBe('dashboard');
		expect(activeNavKey('/swaps')).toBe('swap');
		expect(activeNavKey('/pools/add')).toBe('pools');
		expect(activeNavKey('/launchpad/0xabc')).toBe('launchpad');
		expect(activeNavKey('/nope')).toBeNull();
	});
});
```

Create `src/components/shell/__tests__/AppShell.test.tsx`:
```tsx
/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import React from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';
import fr from '@/i18n/dictionaries/fr';
import type { Locale } from '@/i18n/config';
import { CHAIN_IDS } from '@/config/chains';

let mockPathname = '/';
let mockAccount = { isConnected: false };
let mockChainId: number = CHAIN_IDS.KALYCHAIN;

vi.mock('next/navigation', () => ({ usePathname: () => mockPathname }));
vi.mock('wagmi', () => ({ useAccount: () => mockAccount, useChainId: () => mockChainId }));
vi.mock('next/link', () => ({
	default: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
		<a href={href} {...rest}>{children}</a>
	),
}));
vi.mock('next/image', () => ({
	default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
vi.mock('@/components/wallet/ClientOnlyConnectWallet', () => ({
	ClientOnlyConnectWallet: () => <button>connect-stub</button>,
}));

import { AppShell } from '../AppShell';

function renderShell(locale: Locale = 'en', pathname = '/') {
	mockPathname = locale === 'fr' ? (pathname === '/' ? '/fr' : `/fr${pathname}`) : pathname;
	return render(
		<DictionaryProvider dict={locale === 'fr' ? fr : en} locale={locale}>
			<AppShell>
				<p>page-body</p>
			</AppShell>
		</DictionaryProvider>,
	);
}

describe('AppShell', () => {
	beforeEach(() => {
		mockAccount = { isConnected: false };
		mockChainId = CHAIN_IDS.KALYCHAIN;
	});
	afterEach(cleanup);

	it('renders the page body, every nav label, and no V4 tag', () => {
		const { container } = renderShell();
		expect(screen.getByText('page-body')).toBeTruthy();
		const nav = screen.getByRole('navigation');
		for (const label of Object.values(en.nav)) expect(within(nav).getByText(label)).toBeTruthy();
		expect(container.textContent).not.toMatch(/\bV4\b/);
	});

	it('highlights the active item, including nested routes', () => {
		renderShell('en', '/launchpad/0xabc');
		const active = screen.getByRole('navigation').querySelector('[aria-current="page"]');
		expect(active?.textContent).toContain(en.nav.launchpad);
		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(en.pages.launchpad.title);
	});

	it('shows a Soon pill on exactly the three Coming Soon items', () => {
		renderShell();
		expect(within(screen.getByRole('navigation')).getAllByText(en.shell.soon)).toHaveLength(3);
	});

	it('opens and closes the mobile drawer', () => {
		renderShell();
		const aside = screen.getByRole('complementary');
		expect(aside.className).toContain('-translate-x-full');
		fireEvent.click(screen.getByLabelText(en.shell.menu));
		expect(aside.className).toContain('translate-x-0');
		fireEvent.click(screen.getByLabelText(en.shell.closeMenu));
		expect(aside.className).toContain('-translate-x-full');
	});

	it('prefixes links and copy for FR', () => {
		renderShell('fr', '/swaps');
		const nav = screen.getByRole('navigation');
		expect(within(nav).getByText(fr.nav.pools).closest('a')?.getAttribute('href')).toBe('/fr/pools');
		expect(within(nav).getByText(fr.nav.dashboard).closest('a')?.getAttribute('href')).toBe('/fr');
		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(fr.pages.swap.title);
	});

	it('flags a wrong network only when connected elsewhere', () => {
		mockAccount = { isConnected: true };
		mockChainId = 1;
		renderShell();
		expect(screen.getByText(en.shell.chainWrong)).toBeTruthy();
		cleanup();
		mockChainId = CHAIN_IDS.KALYCHAIN;
		renderShell();
		expect(screen.getByText(en.shell.chainOk)).toBeTruthy();
	});
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/shell`
Expected: FAIL — cannot resolve `../nav` / `../AppShell`.

- [ ] **Step 3: Create `nav.ts`**

```ts
import {
	ArrowLeftRight,
	Coins,
	CreditCard,
	HandCoins,
	LayoutDashboard,
	Layers,
	Rocket,
	ShoppingBag,
	Shuffle,
	Sprout,
	Vault,
	type LucideIcon,
} from 'lucide-react';

export type NavKey =
	| 'dashboard'
	| 'swap'
	| 'bridge'
	| 'vaults'
	| 'kusd'
	| 'pools'
	| 'farm'
	| 'stake'
	| 'launchpad'
	| 'lend'
	| 'card';

export interface NavItem {
	key: NavKey;
	/** Locale-less path; run through useLocaleHref() before rendering. */
	href: string;
	icon: LucideIcon;
	/** Renders a "Soon" pill; the page is a ComingSoon placeholder. */
	soon?: true;
}

/** Single source of truth for the sidebar, page titles, and the nav guard test. */
export const NAV: readonly NavItem[] = [
	{ key: 'dashboard', href: '/', icon: LayoutDashboard },
	{ key: 'swap', href: '/swaps', icon: ArrowLeftRight },
	{ key: 'bridge', href: '/bridge', icon: Shuffle },
	{ key: 'vaults', href: '/vaults', icon: Vault },
	{ key: 'kusd', href: '/kusd', icon: ShoppingBag, soon: true },
	{ key: 'pools', href: '/pools', icon: Layers },
	{ key: 'farm', href: '/farm', icon: Sprout },
	{ key: 'stake', href: '/stake', icon: Coins },
	{ key: 'launchpad', href: '/launchpad', icon: Rocket },
	{ key: 'lend', href: '/lend', icon: HandCoins, soon: true },
	{ key: 'card', href: '/card', icon: CreditCard, soon: true },
];

/** Which nav item a locale-less path belongs to (nested routes resolve to their parent). */
export function activeNavKey(path: string): NavKey | null {
	if (path === '/') return 'dashboard';
	const hit = NAV.find((item) => item.href !== '/' && (path === item.href || path.startsWith(`${item.href}/`)));
	return hit?.key ?? null;
}

export const DOCS_URL = 'https://docs.kalychain.io';
```

- [ ] **Step 4: Create `Sidebar.tsx`**

```tsx
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Pill } from '@/components/primitives/Pill';
import { useDict, useLocaleHref } from '@/i18n/hooks';
import { splitLocale } from '@/i18n/locale-path';
import { NAV, DOCS_URL, activeNavKey } from './nav';

interface SidebarProps {
	open: boolean;
	onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
	const dict = useDict();
	const href = useLocaleHref();
	const active = activeNavKey(splitLocale(usePathname() ?? '/').path);

	return (
		<aside
			className={cn(
				'fixed inset-y-0 left-0 z-40 flex w-64 flex-col overflow-y-auto border-r border-line bg-surface px-4 py-5 transition-transform duration-200 desk:translate-x-0',
				open ? 'translate-x-0' : '-translate-x-full',
			)}
		>
			<div className="flex items-center gap-2.5 px-2 pb-5">
				<Image src="/icons/KalySwapLogo.png" alt="" width={38} height={38} className="rounded-xl" priority />
				<span className="font-display text-xl font-bold tracking-tight">{dict.shell.brand}</span>
				<button
					type="button"
					aria-label={dict.shell.closeMenu}
					onClick={onClose}
					className="ml-auto flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-alt hover:text-cream desk:hidden"
				>
					<X className="size-5" />
				</button>
			</div>

			<nav className="flex flex-col gap-0.5">
				{NAV.map((item) => {
					const isActive = item.key === active;
					const Icon = item.icon;
					return (
						<Link
							key={item.key}
							href={href(item.href)}
							aria-current={isActive ? 'page' : undefined}
							onClick={onClose}
							className={cn(
								'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-[14.5px] transition-colors',
								isActive
									? 'border-gold/35 bg-gold-soft font-bold text-gold-light'
									: 'border-transparent font-medium text-muted-foreground hover:bg-surface-alt hover:text-cream',
							)}
						>
							<Icon className="size-[18px] shrink-0" />
							<span className="flex-1">{dict.nav[item.key]}</span>
							{item.soon && <Pill tone="muted">{dict.shell.soon}</Pill>}
						</Link>
					);
				})}
			</nav>

			<div className="mt-5 rounded-2xl border border-line bg-surface-alt p-4">
				<div className="text-[13.5px] font-bold">{dict.shell.newTitle}</div>
				<div className="mb-2 mt-1 text-[12.5px] text-muted-foreground">{dict.shell.newBody}</div>
				<a
					href={DOCS_URL}
					target="_blank"
					rel="noopener noreferrer"
					className="text-[13px] font-bold text-gold hover:text-gold-light"
				>
					{dict.shell.newCta}
				</a>
			</div>
		</aside>
	);
}
```

- [ ] **Step 5: Create `ChainBadge.tsx` and `LangSwitcher.tsx`**

`ChainBadge.tsx`:
```tsx
'use client';

import { useAccount, useChainId } from 'wagmi';
import { CHAIN_IDS } from '@/config/chains';
import { cn } from '@/lib/utils';
import { useDict } from '@/i18n/hooks';

/** Display-only network indicator. Add-network flows live in CutoverNotice. */
export function ChainBadge() {
	const dict = useDict();
	const { isConnected } = useAccount();
	const chainId = useChainId();
	const ok = !isConnected || chainId === CHAIN_IDS.KALYCHAIN;

	return (
		<span
			className={cn(
				'inline-flex items-center gap-2 rounded-[10px] border border-line bg-surface px-3 py-2 text-[13px] font-semibold',
				ok ? 'text-cream' : 'text-gold-light',
			)}
		>
			<span className={cn('size-2 rounded-full', ok ? 'bg-success' : 'bg-gold')} aria-hidden />
			{ok ? dict.shell.chainOk : dict.shell.chainWrong}
		</span>
	);
}
```

`LangSwitcher.tsx`:
```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LOCALES, LOCALE_LABEL } from '@/i18n/config';
import { splitLocale, withLocale } from '@/i18n/locale-path';
import { useDict, useLocale } from '@/i18n/hooks';
import { cn } from '@/lib/utils';

export function LangSwitcher() {
	const dict = useDict();
	const current = useLocale();
	const { path } = splitLocale(usePathname() ?? '/');

	return (
		<div
			role="group"
			aria-label={dict.shell.language}
			className="inline-flex rounded-[10px] border border-line bg-surface-hi p-[3px]"
		>
			{LOCALES.map((locale) => (
				<Link
					key={locale}
					href={withLocale(locale, path)}
					hrefLang={locale}
					aria-current={locale === current ? 'true' : undefined}
					title={LOCALE_LABEL[locale]}
					className={cn(
						'rounded-lg px-3 py-1.5 text-[13px] font-bold uppercase transition-colors',
						locale === current ? 'bg-gold text-on-gold' : 'text-muted-foreground hover:text-cream',
					)}
				>
					{locale}
				</Link>
			))}
		</div>
	);
}
```

- [ ] **Step 6: Create `TopBar.tsx` and `Footer.tsx`**

`TopBar.tsx`:
```tsx
'use client';

import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { ClientOnlyConnectWallet } from '@/components/wallet/ClientOnlyConnectWallet';
import { useDict } from '@/i18n/hooks';
import { splitLocale } from '@/i18n/locale-path';
import { ChainBadge } from './ChainBadge';
import { LangSwitcher } from './LangSwitcher';
import { activeNavKey } from './nav';

interface TopBarProps {
	onMenu: () => void;
}

export function TopBar({ onMenu }: TopBarProps) {
	const dict = useDict();
	const key = activeNavKey(splitLocale(usePathname() ?? '/').path);
	const page = key ? dict.pages[key] : dict.pages.notFound;

	return (
		<header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-ink/70 px-4 py-3.5 backdrop-blur-md sm:px-6">
			<div className="flex min-w-0 items-center gap-3">
				<button
					type="button"
					aria-label={dict.shell.menu}
					onClick={onMenu}
					className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-line bg-surface text-cream desk:hidden"
				>
					<Menu className="size-5" />
				</button>
				<div className="min-w-0">
					<h1 className="truncate font-display text-[17px] font-bold leading-tight">{page.title}</h1>
					<p className="truncate text-[12.5px] text-muted-deep">{page.subtitle}</p>
				</div>
			</div>
			<div className="flex shrink-0 items-center gap-2.5">
				<LangSwitcher />
				<span className="hidden sm:inline-flex">
					<ChainBadge />
				</span>
				<ClientOnlyConnectWallet />
			</div>
		</header>
	);
}
```

`Footer.tsx`:
```tsx
'use client';

import { Github, MessageCircle, Send, Twitter } from 'lucide-react';
import { useDict } from '@/i18n/hooks';

const SOCIAL = [
	{ key: 'twitter', href: 'https://x.com/KalyChainEVM', icon: Twitter },
	{ key: 'github', href: 'https://github.com/kalycoinproject/', icon: Github },
	{ key: 'telegram', href: 'https://t.me/KalyChain', icon: Send },
	{ key: 'discord', href: 'https://discord.gg/tTe8BmcAks', icon: MessageCircle },
] as const;

export function Footer() {
	const dict = useDict();
	return (
		<footer className="flex flex-col items-center gap-3 border-t border-line px-6 py-6 text-center text-[12.5px] text-muted-deep sm:flex-row sm:justify-between">
			<span>{dict.footer.line}</span>
			<div className="flex items-center gap-3">
				{SOCIAL.map(({ key, href, icon: Icon }) => (
					<a
						key={key}
						href={href}
						target="_blank"
						rel="noopener noreferrer"
						aria-label={dict.footer[key]}
						className="text-muted-foreground transition-colors hover:text-gold"
					>
						<Icon className="size-4" />
					</a>
				))}
			</div>
		</footer>
	);
}
```

- [ ] **Step 7: Create `AppShell.tsx` and `index.ts`**

`AppShell.tsx`:
```tsx
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Footer } from './Footer';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

/** Sidebar + sticky top bar + footer. Mounted once in app/[locale]/layout.tsx. */
export function AppShell({ children }: { children: ReactNode }) {
	const pathname = usePathname();
	const [open, setOpen] = useState(false);

	useEffect(() => {
		setOpen(false);
	}, [pathname]);

	return (
		<div className="min-h-screen bg-background text-foreground">
			<Sidebar open={open} onClose={() => setOpen(false)} />
			{open && (
				<div aria-hidden onClick={() => setOpen(false)} className="fixed inset-0 z-30 bg-black/60 desk:hidden" />
			)}
			<div className="flex min-h-screen flex-col desk:pl-64">
				<TopBar onMenu={() => setOpen(true)} />
				<main className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-6 sm:px-6">{children}</main>
				<Footer />
			</div>
		</div>
	);
}
```

(The overlay is `aria-hidden` with no label on purpose: the sidebar's X button already carries `closeMenu`, and the drawer test finds it with `getByLabelText`, which throws on duplicate labels. `dict` is still needed in `AppShell` for nothing else — remove the `useDict` import and the `const dict` line.)

`index.ts`:
```ts
export { AppShell } from './AppShell';
export { NAV, activeNavKey, DOCS_URL } from './nav';
export type { NavItem, NavKey } from './nav';
```

- [ ] **Step 8: Restyle the wallet button**

In `src/components/wallet/ConnectWallet.tsx`:

1. Add `import { useDict } from '@/i18n/hooks'` and, inside `ConnectWallet`, `const dict = useDict()`.
2. Replace the `kalyswapTheme` colors block with:
```ts
const kalyswapTheme = darkTheme({
  colors: {
    primaryButtonBg: 'linear-gradient(135deg, #FBBF24, #F59E0B)',
    primaryButtonText: '#1A1206',
    modalBg: '#141414',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    accentButtonBg: '#212121',
    accentButtonText: '#F5F0E6',
    accentText: '#FBBF24',
    separatorLine: 'rgba(255, 255, 255, 0.08)',
    secondaryText: '#9A938A',
    primaryText: '#F5F0E6',
    secondaryButtonBg: '#1A1A1A',
    secondaryButtonText: '#F5F0E6',
    secondaryButtonHoverBg: '#212121',
    connectedButtonBg: '#141414',
    connectedButtonBgHover: '#1A1A1A',
    selectedTextBg: 'rgba(245, 158, 11, 0.12)',
    selectedTextColor: '#FBBF24',
    skeletonBg: '#212121',
    tooltipBg: '#1A1A1A',
    tooltipText: '#F5F0E6',
    inputAutofillBg: '#1A1A1A',
    danger: '#EF4444',
    success: '#22C55E',
  },
})
```
3. Replace `connectButton` with:
```ts
        connectButton={{
          label: children ? undefined : dict.shell.connect,
          className: 'kalyswap-connect-btn',
          style: {
            background: 'linear-gradient(135deg, #FBBF24, #F59E0B)',
            color: '#1A1206',
            fontWeight: 700,
            borderRadius: '10px',
            border: 'none',
            fontSize: '13px',
            padding: '9px 14px',
            minWidth: 0,
          },
        }}
```
4. Replace `detailsButton.style` with `{ background: '#141414', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px' }`.
5. In `ConnectWalletButton`, replace the inner `<Button size="sm" className="bg-gradient-to-r from-amber-500 ...">` with `<Button size="sm">` (no className) and its label `Connect` with `{dict.shell.connect}` — this requires `const dict = useDict()` at the top of `ConnectWalletButton` (before the `try`). Also apply the same change to the fallback branch's button if it renders one.

In `src/components/wallet/ClientOnlyConnectWallet.tsx`, replace the placeholder button with:
```tsx
      <Button size="sm" className={className} disabled>
        <Wallet className="h-4 w-4" />
        {dict.shell.connect}
      </Button>
```
adding `import { useDict } from '@/i18n/hooks'` and `const dict = useDict()` at the top of the component.

- [ ] **Step 9: Run the shell tests (with a temporary Pill)**

If Task 5 has not run yet, create `src/components/primitives/Pill.tsx` now with the exact code from Task 5 Step 3 (it is the same file; Task 5 will find it already present).

Run: `npx vitest run src/components/shell`
Expected: `nav.test.ts` — all pass except "every href has a page under app/[locale]" (created in Task 6). `AppShell.test.tsx` — all 6 pass. If `next/image` complains about `priority` in jsdom, the mock in the test already discards it.

---

### Task 5: Shared primitives + ComingSoon

**Files:**
- Create: `src/components/primitives/PageHeader.tsx`, `StatCard.tsx`, `Panel.tsx`, `Pill.tsx`, `TokenAvatar.tsx`, `TokenPair.tsx`, `DataTable.tsx`, `EmptyState.tsx`, `ComingSoon.tsx`, `ConnectPrompt.tsx`, `index.ts`
- Test: `src/components/primitives/__tests__/ComingSoon.test.tsx`

**Interfaces:**
- Produces (all named exports, re-exported from `index.ts`):
  - `PageHeader({ title, subtitle?, actions? })`
  - `StatCard({ label, value, hint?, tone?: 'default'|'gold'|'success', source?, className? })`
  - `Panel({ title?, action?, children, className?, bodyClassName? })`
  - `Pill({ tone: 'gold'|'success'|'info'|'violet'|'muted'|'danger', children, className? })`
  - `TokenAvatar({ symbol, logoURI?, size? })`, `TokenPair({ a: {symbol, logoURI?}, b: {symbol, logoURI?}, size? })`
  - `DataTable<T>({ columns: Column<T>[], rows: T[], rowKey, empty })` with `Column<T> = { key, header, align?, className?, cell(row) }`
  - `EmptyState({ icon?, title, body?, action? })`
  - `ComingSoon({ pageKey: 'kusd'|'lend'|'card' })`
  - `ConnectPrompt({ body? })`

- [ ] **Step 1: Write the failing test**

Create `src/components/primitives/__tests__/ComingSoon.test.tsx`:
```tsx
/**
 * @vitest-environment jsdom
 */
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';
import fr from '@/i18n/dictionaries/fr';

vi.mock('next/link', () => ({
	default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import { ComingSoon } from '../ComingSoon';

const KEYS = ['kusd', 'lend', 'card'] as const;

describe('ComingSoon', () => {
	afterEach(cleanup);

	it.each(KEYS)('renders EN copy and a back link for %s', (key) => {
		render(
			<DictionaryProvider dict={en} locale="en">
				<ComingSoon pageKey={key} />
			</DictionaryProvider>,
		);
		expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(en.comingSoon[key].title);
		expect(screen.getByText(en.comingSoon[key].body)).toBeTruthy();
		expect(screen.getByText(en.common.comingSoon)).toBeTruthy();
		expect(screen.getByText(en.common.backToDashboard).closest('a')?.getAttribute('href')).toBe('/');
	});

	it.each(KEYS)('renders FR copy with a prefixed back link for %s', (key) => {
		render(
			<DictionaryProvider dict={fr} locale="fr">
				<ComingSoon pageKey={key} />
			</DictionaryProvider>,
		);
		expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(fr.comingSoon[key].title);
		expect(screen.getByText(fr.common.backToDashboard).closest('a')?.getAttribute('href')).toBe('/fr');
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/primitives`
Expected: FAIL — cannot resolve `../ComingSoon`.

- [ ] **Step 3: Create the primitives**

`Pill.tsx`:
```tsx
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type PillTone = 'gold' | 'success' | 'info' | 'violet' | 'muted' | 'danger';

const TONES: Record<PillTone, string> = {
	gold: 'bg-gold-soft text-gold-light',
	success: 'bg-success/15 text-success',
	info: 'bg-info/15 text-info',
	violet: 'bg-violet/15 text-violet',
	muted: 'bg-surface-hi text-muted-foreground',
	danger: 'bg-danger/15 text-danger',
};

export function Pill({ tone, children, className }: { tone: PillTone; children: ReactNode; className?: string }) {
	return (
		<span
			className={cn(
				'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em]',
				TONES[tone],
				className,
			)}
		>
			{children}
		</span>
	);
}
```

`PageHeader.tsx`:
```tsx
import type { ReactNode } from 'react';

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
	return (
		<div className="mb-5 flex flex-wrap items-end justify-between gap-3">
			<div>
				<h2 className="font-display text-[26px] font-bold leading-tight sm:text-[28px]">{title}</h2>
				{subtitle && <p className="mt-1 text-[15px] text-muted-foreground">{subtitle}</p>}
			</div>
			{actions && <div className="flex items-center gap-2">{actions}</div>}
		</div>
	);
}
```
(The `h1` on every page is the top bar's title; page headers are `h2` so the document outline stays sane.)

`StatCard.tsx`:
```tsx
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const TONES = {
	default: 'text-cream',
	gold: 'text-gold',
	success: 'text-success',
} as const;

export function StatCard({
	label,
	value,
	hint,
	tone = 'default',
	source,
	className,
}: {
	label: ReactNode;
	value: ReactNode;
	hint?: ReactNode;
	tone?: keyof typeof TONES;
	source?: ReactNode;
	className?: string;
}) {
	return (
		<div className={cn('rounded-2xl border border-line bg-surface p-5', className)}>
			<div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-deep">{label}</div>
			<div className={cn('mt-2 font-display text-[28px] font-bold leading-none sm:text-[32px]', TONES[tone])}>{value}</div>
			{hint && <div className="mt-2 text-[13px] text-muted-foreground">{hint}</div>}
			{source && <div className="mt-2 text-[11.5px] text-muted-deep">{source}</div>}
		</div>
	);
}
```

`Panel.tsx`:
```tsx
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Panel({
	title,
	action,
	children,
	className,
	bodyClassName,
}: {
	title?: ReactNode;
	action?: ReactNode;
	children: ReactNode;
	className?: string;
	bodyClassName?: string;
}) {
	return (
		<section className={cn('rounded-2xl border border-line bg-surface p-5 sm:p-6', className)}>
			{(title || action) && (
				<header className="mb-4 flex items-center justify-between gap-3">
					{title && <h3 className="font-display text-lg font-semibold">{title}</h3>}
					{action}
				</header>
			)}
			<div className={bodyClassName}>{children}</div>
		</section>
	);
}
```

`TokenAvatar.tsx`:
```tsx
import { cn } from '@/lib/utils';

const TONE_BY_SYMBOL: Record<string, string> = {
	KMT: 'bg-violet text-white',
	WKMT: 'bg-violet text-white',
	KUSD: 'bg-success text-white',
	USDT: 'bg-info text-ink',
	USDC: 'bg-info text-ink',
	DAI: 'bg-info text-ink',
};

export function TokenAvatar({ symbol, logoURI, size = 32 }: { symbol: string; logoURI?: string; size?: number }) {
	const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
	if (logoURI) {
		// eslint-disable-next-line @next/next/no-img-element -- token-list logos come from arbitrary hosts
		return <img src={logoURI} alt={symbol} width={size} height={size} style={style} className="shrink-0 rounded-full object-cover" />;
	}
	return (
		<span
			aria-label={symbol}
			style={style}
			className={cn(
				'inline-flex shrink-0 items-center justify-center rounded-full font-bold uppercase',
				TONE_BY_SYMBOL[symbol.toUpperCase()] ?? 'bg-gold text-on-gold',
			)}
		>
			{symbol.slice(0, 2)}
		</span>
	);
}
```

`TokenPair.tsx`:
```tsx
import { TokenAvatar } from './TokenAvatar';

interface TokenRef {
	symbol: string;
	logoURI?: string;
}

export function TokenPair({ a, b, size = 28 }: { a: TokenRef; b: TokenRef; size?: number }) {
	return (
		<span className="inline-flex items-center">
			<TokenAvatar symbol={a.symbol} logoURI={a.logoURI} size={size} />
			<span className="-ml-2 rounded-full ring-2 ring-surface">
				<TokenAvatar symbol={b.symbol} logoURI={b.logoURI} size={size} />
			</span>
		</span>
	);
}
```

`DataTable.tsx`:
```tsx
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface Column<T> {
	key: string;
	header: ReactNode;
	align?: 'left' | 'right';
	className?: string;
	cell: (row: T) => ReactNode;
}

export function DataTable<T>({
	columns,
	rows,
	rowKey,
	empty,
}: {
	columns: Column<T>[];
	rows: T[];
	rowKey: (row: T) => string;
	empty: ReactNode;
}) {
	if (rows.length === 0) return <div className="py-8 text-center text-sm text-muted-foreground">{empty}</div>;
	return (
		<div className="overflow-x-auto">
			<table className="w-full min-w-[640px] text-sm">
				<thead>
					<tr className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-muted-deep">
						{columns.map((c) => (
							<th key={c.key} className={cn('px-3 py-2.5 font-semibold', c.align === 'right' ? 'text-right' : 'text-left', c.className)}>
								{c.header}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr key={rowKey(row)} className="border-b border-line last:border-b-0 hover:bg-surface-alt/60">
							{columns.map((c) => (
								<td key={c.key} className={cn('px-3 py-4 align-middle', c.align === 'right' ? 'text-right' : 'text-left', c.className)}>
									{c.cell(row)}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
```

`EmptyState.tsx`:
```tsx
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export function EmptyState({ icon: Icon, title, body, action }: { icon?: LucideIcon; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
	return (
		<div className="flex flex-col items-center gap-2 py-10 text-center">
			{Icon && (
				<span className="mb-1 flex size-11 items-center justify-center rounded-xl bg-surface-alt text-muted-foreground">
					<Icon className="size-5" />
				</span>
			)}
			<div className="font-semibold">{title}</div>
			{body && <p className="max-w-sm text-sm text-muted-foreground">{body}</p>}
			{action && <div className="mt-2">{action}</div>}
		</div>
	);
}
```

`ComingSoon.tsx`:
```tsx
'use client';

import Link from 'next/link';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDict, useLocaleHref } from '@/i18n/hooks';
import { Pill } from './Pill';

export type ComingSoonKey = 'kusd' | 'lend' | 'card';

export function ComingSoon({ pageKey }: { pageKey: ComingSoonKey }) {
	const dict = useDict();
	const href = useLocaleHref();
	const copy = dict.comingSoon[pageKey];

	return (
		<section className="mx-auto max-w-2xl rounded-2xl border border-line bg-gradient-to-br from-surface-alt to-surface p-8 text-center sm:p-12">
			<span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-gold-soft text-gold">
				<Sparkles className="size-7" />
			</span>
			<Pill tone="gold">{dict.common.comingSoon}</Pill>
			<h2 className="mt-4 font-display text-3xl font-bold">{copy.title}</h2>
			<p className="mx-auto mt-3 max-w-lg text-[15px] leading-relaxed text-muted-foreground">{copy.body}</p>
			<Button asChild variant="secondary" className="mt-7">
				<Link href={href('/')}>
					<ArrowLeft />
					{dict.common.backToDashboard}
				</Link>
			</Button>
		</section>
	);
}
```

`ConnectPrompt.tsx`:
```tsx
'use client';

import { Wallet } from 'lucide-react';
import { ClientOnlyConnectWallet } from '@/components/wallet/ClientOnlyConnectWallet';
import { useDict } from '@/i18n/hooks';
import { EmptyState } from './EmptyState';
import { Panel } from './Panel';

export function ConnectPrompt({ body }: { body?: string }) {
	const dict = useDict();
	return (
		<Panel>
			<EmptyState icon={Wallet} title={dict.common.connectWallet} body={body ?? dict.common.connectBody} action={<ClientOnlyConnectWallet />} />
		</Panel>
	);
}
```

`index.ts`:
```ts
export { PageHeader } from './PageHeader';
export { StatCard } from './StatCard';
export { Panel } from './Panel';
export { Pill } from './Pill';
export type { PillTone } from './Pill';
export { TokenAvatar } from './TokenAvatar';
export { TokenPair } from './TokenPair';
export { DataTable } from './DataTable';
export type { Column } from './DataTable';
export { EmptyState } from './EmptyState';
export { ComingSoon } from './ComingSoon';
export type { ComingSoonKey } from './ComingSoon';
export { ConnectPrompt } from './ConnectPrompt';
```

- [ ] **Step 4: Run the primitives tests**

Run: `npx vitest run src/components/primitives src/components/shell`
Expected: ComingSoon (6 cases) PASS; shell tests as in Task 4 Step 9.

---

### Task 6: `[locale]` route tree, root layout, page moves, Coming Soon pages, 404

**Files:**
- Create: `src/app/[locale]/layout.tsx`, `src/app/[locale]/page.tsx`, `src/app/[locale]/not-found.tsx`, `src/app/[locale]/[...rest]/page.tsx`, `src/app/[locale]/kusd/page.tsx`, `src/app/[locale]/lend/page.tsx`, `src/app/[locale]/card/page.tsx`, `src/app/[locale]/pools/page.tsx`, `src/app/[locale]/pools/browse/page.tsx`
- Move: `src/app/{swaps,bridge,farm,stake,launchpad}` → `src/app/[locale]/…`; `src/app/pools/page.tsx` → `src/app/[locale]/pools/add/page.tsx`
- Delete: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/home.css`, `src/app/pools/browse/page.tsx` (replaced), `src/components/layout/MainLayout.tsx`, `Header.tsx`, `Footer.tsx`
- Modify: every moved `page.tsx` (drop `MainLayout` and the CSS import; keep the CSS files for now — they are deleted in Phases 3–5 when their pages are restyled)

**Interfaces:**
- Consumes: `AppShell` (Task 4), `DictionaryProvider`, `getDictionary`, `LOCALES`, `isLocale`, `LOCALE_HTML_LANG` (Task 3), `ComingSoon`, `Panel`, `Pill` (Task 5).
- Produces: the route tree in spec §5.1.

- [ ] **Step 1: Create the locale layout**

`src/app/[locale]/layout.tsx`:
```tsx
import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { notFound } from 'next/navigation';
import '../globals.css';
import { WalletProviders } from '@/components/providers/WalletProviders';
import { ToastProvider } from '@/components/ui/toast';
import { CutoverNotice } from '@/components/wallet/CutoverNotice';
import { AppShell } from '@/components/shell/AppShell';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import { LOCALES, LOCALE_HTML_LANG, isLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/get-dictionary';

const inter = localFont({
	src: [
		{ path: '../../fonts/Inter-Regular.ttf', weight: '400', style: 'normal' },
		{ path: '../../fonts/Inter-Medium.ttf', weight: '500', style: 'normal' },
		{ path: '../../fonts/Inter-SemiBold.ttf', weight: '600', style: 'normal' },
		{ path: '../../fonts/Inter-Bold.ttf', weight: '700', style: 'normal' },
	],
	variable: '--font-inter',
});

const display = localFont({
	src: '../../fonts/SpaceGrotesk-Variable.ttf',
	weight: '300 700',
	variable: '--font-space-grotesk',
});

interface LocaleParams {
	params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
	return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
	const { locale } = await params;
	if (!isLocale(locale)) return {};
	const dict = await getDictionary(locale);
	return {
		title: dict.meta.title,
		description: dict.meta.description,
		icons: {
			icon: [
				{ url: '/favicon.ico', sizes: '48x48' },
				{ url: '/icon.png', type: 'image/png', sizes: '512x512' },
			],
			apple: '/apple-icon.png',
		},
	};
}

export const viewport: Viewport = {
	width: 'device-width',
	initialScale: 1,
	maximumScale: 1,
};

export default async function LocaleLayout({ children, params }: LocaleParams & { children: React.ReactNode }) {
	const { locale } = await params;
	if (!isLocale(locale)) notFound();
	const dict = await getDictionary(locale);

	return (
		<html lang={LOCALE_HTML_LANG[locale]} className={`${inter.variable} ${display.variable}`}>
			<body suppressHydrationWarning>
				<DictionaryProvider dict={dict} locale={locale}>
					<ToastProvider>
						<WalletProviders>
							<AppShell>{children}</AppShell>
							<CutoverNotice />
						</WalletProviders>
					</ToastProvider>
				</DictionaryProvider>
			</body>
		</html>
	);
}
```
(`WalletProviders` is a client-only dynamic import that renders `null` during SSR — that is today's behaviour and is unchanged: the shell hydrates on the client like the rest of the app.)

- [ ] **Step 2: Create the Dashboard page (hero + quick actions)**

`src/app/[locale]/page.tsx`:
```tsx
'use client';

import Link from 'next/link';
import { ArrowLeftRight, Layers, Sprout, Vault, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Pill } from '@/components/primitives';
import { useDict, useLocaleHref } from '@/i18n/hooks';
import { cn } from '@/lib/utils';

interface QuickAction {
	href: string;
	icon: LucideIcon;
	title: string;
	body: string;
	tone: string;
}

export default function DashboardPage() {
	const dict = useDict();
	const href = useLocaleHref();
	const d = dict.dashboard;

	const quick: QuickAction[] = [
		{ href: '/swaps', icon: ArrowLeftRight, title: d.quickSwap, body: d.quickSwapBody, tone: 'bg-gold-soft text-gold' },
		{ href: '/vaults', icon: Vault, title: d.quickVaults, body: d.quickVaultsBody, tone: 'bg-success/15 text-success' },
		{ href: '/pools', icon: Layers, title: d.quickPools, body: d.quickPoolsBody, tone: 'bg-info/15 text-info' },
		{ href: '/farm', icon: Sprout, title: d.quickFarm, body: d.quickFarmBody, tone: 'bg-violet/15 text-violet' },
	];

	return (
		<div className="space-y-5">
			<section className="rounded-2xl border border-line bg-gradient-to-br from-surface-alt to-surface p-7 sm:p-8">
				<Pill tone="gold">{dict.shell.poweredBy}</Pill>
				<h2 className="mt-3 font-display text-3xl font-bold leading-tight sm:text-4xl">
					{d.heroTitleLead} <span className="text-gold">{d.heroTitleAccent}</span>
				</h2>
				<p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground">{d.heroBody}</p>
				<div className="mt-6 flex flex-wrap gap-3">
					<Button asChild size="lg">
						<Link href={href('/swaps')}>
							<ArrowLeftRight />
							{d.ctaSwap}
						</Link>
					</Button>
					<Button asChild size="lg" variant="secondary">
						<Link href={href('/vaults')}>
							<Vault />
							{d.ctaVaults}
						</Link>
					</Button>
				</div>
			</section>

			<section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				{quick.map(({ href: path, icon: Icon, title, body, tone }) => (
					<Link
						key={path}
						href={href(path)}
						className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface p-5 transition-colors hover:bg-surface-alt"
					>
						<span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', tone)}>
							<Icon className="size-5" />
						</span>
						<span className="min-w-0">
							<span className="block font-semibold">{title}</span>
							<span className="block truncate text-[12.5px] text-muted-foreground">{body}</span>
						</span>
					</Link>
				))}
			</section>
		</div>
	);
}
```

- [ ] **Step 3: Create the Coming Soon pages, 404, and catch-all**

`src/app/[locale]/kusd/page.tsx`:
```tsx
import { ComingSoon } from '@/components/primitives/ComingSoon';

export default function KusdPage() {
	return <ComingSoon pageKey="kusd" />;
}
```
`src/app/[locale]/lend/page.tsx` — same with `pageKey="lend"` and `LendPage`.
`src/app/[locale]/card/page.tsx` — same with `pageKey="card"` and `CardPage`.

`src/app/[locale]/not-found.tsx`:
```tsx
'use client';

import Link from 'next/link';
import { ArrowLeft, Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, Panel } from '@/components/primitives';
import { useDict, useLocaleHref } from '@/i18n/hooks';

export default function NotFound() {
	const dict = useDict();
	const href = useLocaleHref();
	return (
		<Panel className="mx-auto max-w-xl">
			<EmptyState
				icon={Compass}
				title={dict.pages.notFound.title}
				body={dict.notFound.body}
				action={
					<Button asChild variant="secondary">
						<Link href={href('/')}>
							<ArrowLeft />
							{dict.common.backToDashboard}
						</Link>
					</Button>
				}
			/>
		</Panel>
	);
}
```

`src/app/[locale]/[...rest]/page.tsx`:
```tsx
import { notFound } from 'next/navigation';

/** Any URL the other routes don't claim renders the locale 404 inside the shell. */
export default function CatchAll() {
	notFound();
}
```

- [ ] **Step 4: Move the feature pages under `[locale]`**

Run:
```bash
cd /home/dude/KalyChain/KalySwapv3/frontend/src/app
mv swaps '[locale]/swaps' && mv bridge '[locale]/bridge' && mv farm '[locale]/farm' && mv stake '[locale]/stake' && mv launchpad '[locale]/launchpad'
mkdir -p '[locale]/pools/add' '[locale]/pools/browse'
mv pools/page.tsx '[locale]/pools/add/page.tsx' && mv pools/pools.css '[locale]/pools/add/pools.css'
rm pools/browse/page.tsx && rmdir pools/browse pools
rm layout.tsx page.tsx home.css
ls -R . | head -40
```
Expected: `src/app` now contains only `globals.css` and `[locale]/`.

- [ ] **Step 5: Strip `MainLayout` from every moved page**

For each of `[locale]/swaps/page.tsx`, `[locale]/bridge/page.tsx`, `[locale]/farm/page.tsx`, `[locale]/stake/page.tsx`, `[locale]/launchpad/page.tsx`, `[locale]/launchpad/[address]/page.tsx`, `[locale]/pools/add/page.tsx`:

1. Delete the line `import MainLayout from '@/components/layout/MainLayout';` (or the `'`-less variant in `farm/page.tsx`).
2. Replace the opening `<MainLayout>` with `<>` and the closing `</MainLayout>` with `</>`. If a page passes props (`<MainLayout showFooter={false}>`), still replace with `<>`.
3. Fix the CSS import path in `pools/add/page.tsx`: `import './pools.css';` stays valid because the CSS moved with it. The others keep their `./x.css` imports (deleted in later phases).

Run to verify:
```bash
cd /home/dude/KalyChain/KalySwapv3/frontend && grep -rn "MainLayout" src && echo "STILL REFERENCED" || echo "MainLayout gone"
```
Expected: `MainLayout gone`.

- [ ] **Step 6: Wrap `useSearchParams` consumers in Suspense**

Run: `grep -rln "useSearchParams" src/app`. For each file listed (expected: `[locale]/pools/add/page.tsx`, possibly `[locale]/launchpad/page.tsx`), rename the default export component to `<Name>Inner` and add:
```tsx
import { Suspense } from 'react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

export default function PoolsAddPage() {
	return (
		<Suspense fallback={<div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>}>
			<PoolsAddPageInner />
		</Suspense>
	);
}
```
(`useSearchParams` in a statically generated route must sit under a Suspense boundary or `next build` fails with "Missing Suspense boundary with useSearchParams".)

- [ ] **Step 7: Create the pool list page and the browse redirect**

`src/app/[locale]/pools/page.tsx` (the former `pools/browse` body, unwrapped):
```tsx
'use client';

import PoolListWrapper from '@/components/pools/PoolListWrapper';

export default function PoolsPage() {
	return <PoolListWrapper />;
}
```
Check the old `pools/browse/page.tsx` content you deleted in Step 4 (`git show HEAD:src/app/pools/browse/page.tsx`) — if it passed props to `PoolListWrapper` or rendered anything besides the wrapper inside `MainLayout`, carry that over verbatim.

`src/app/[locale]/pools/browse/page.tsx`:
```tsx
import { redirect } from 'next/navigation';
import { DEFAULT_LOCALE, isLocale } from '@/i18n/config';
import { withLocale } from '@/i18n/locale-path';

/** /pools/browse was the old list URL; the list now lives at /pools. */
export default async function PoolsBrowseRedirect({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	redirect(withLocale(isLocale(locale) ? locale : DEFAULT_LOCALE, '/pools'));
}
```

Then update in-page navigation that targeted the old URLs: in `[locale]/pools/add/page.tsx` replace `router.push('/pools/browse')` (two occurrences, one in `onSuccess`) with `router.push(href('/pools'))`, adding `import { useLocaleHref } from '@/i18n/hooks';` and `const href = useLocaleHref();` inside the inner component. Run `grep -rn "'/pools/browse'\|\"/pools/browse\"" src` — expected: no hits outside the redirect page's comment.

- [ ] **Step 8: Delete the old layout components**

Run:
```bash
cd /home/dude/KalyChain/KalySwapv3/frontend && rm -r src/components/layout && grep -rn "components/layout" src || echo "no references"
```
Expected: `no references`.

- [ ] **Step 9: Type-check and run the suite**

Run: `npx tsc --noEmit -p tsconfig.json && npm test`
Expected: tsc clean; every test passes, including `no-old-theme` "every enforced path exists" and `nav.test.ts` "every href has a page".

If tsc reports `Property 'params' ... Promise` mismatches, the `LocaleParams` type in Step 1 is correct for Next 15.3 (`params` is a Promise); fix the call site, not the type.

---

### Task 7: Favicon set

**Files:**
- Replace: `public/favicon.ico`; create `public/icon.png`, `public/apple-icon.png`

- [ ] **Step 1: Generate the files from the KS mark**

Run:
```bash
cd /home/dude/KalyChain/KalySwapv3/frontend && python3 - <<'PY'
from PIL import Image
src = Image.open('public/icons/KalySwapLogo.png').convert('RGBA')
src.resize((512, 512), Image.LANCZOS).save('public/icon.png')
src.resize((180, 180), Image.LANCZOS).save('public/apple-icon.png')
src.resize((48, 48), Image.LANCZOS).save('public/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
PY
file public/favicon.ico public/icon.png public/apple-icon.png
```
Expected: `favicon.ico: MS Windows icon resource - 3 icons`, `icon.png: PNG image data, 512 x 512`, `apple-icon.png: PNG image data, 180 x 180`.

---

### Task 8: Verification (lint, build, browser)

- [ ] **Step 1: Lint**

Run: `cd /home/dude/KalyChain/KalySwapv3/frontend && npm run lint`
Expected: no errors. Fix any `@next/next/no-img-element` hits by adding the documented eslint-disable comment used in `TokenAvatar.tsx`, and any unused-import warnings by removing the import.

- [ ] **Step 2: Production build**

Run: `npm run build 2>&1 | tail -40`
Expected: `✓ Compiled successfully`, route list shows `/[locale]`, `/[locale]/swaps`, … with both `en` and `fr` prerendered, and `ƒ Middleware`. Known failure modes and fixes:
- "Missing Suspense boundary with useSearchParams" → Task 6 Step 6 missed a file.
- "`app/layout.tsx` is required" → confirm `src/app/layout.tsx` is deleted and `[locale]/layout.tsx` renders `<html>`; Next accepts a root layout inside a dynamic segment when every route is under it (kaly-vault ships this way).
- Font path errors → the `localFont` paths in Task 6 Step 1 are relative to `src/app/[locale]/`.
- Headings render in Inter → the next/font variable must be `--font-space-grotesk` (not `--font-display`, which is the theme token that references it).

- [ ] **Step 3: Browser check**

Invoke the `KalySwapv3/frontend:verify` skill and, with the dev server running at `https://kalyswap.localhost`, confirm at 1440px and 400px:
- `/` shows the sidebar (desktop) / hamburger drawer (phone), gold active state on Dashboard, no "V4" anywhere, KS logo in the sidebar and browser tab.
- `/swaps`, `/pools`, `/pools/add`, `/farm`, `/stake`, `/bridge`, `/launchpad` render their existing bodies inside the shell with the correct top-bar title.
- `/pools/browse` lands on `/pools`; `/en/swaps` lands on `/swaps` (308); `/fr/swaps` shows French chrome; `/nothing-here` shows the bilingual 404 inside the shell.
- `/kusd`, `/lend`, `/card` show the Coming Soon panel; the sidebar shows the Soon pill on those three.
- Console: no hydration errors, no 404s for `/favicon.ico`, `/icon.png`, `/apple-icon.png`, no CSS from `cdn.jsdelivr.net`.

- [ ] **Step 4: Report**

State what passed, list any component that still looks visibly broken because it leaned on the deleted `!important` overrides (expected on feature pages; those are Phases 3–5 work), and stop. Do not commit.
