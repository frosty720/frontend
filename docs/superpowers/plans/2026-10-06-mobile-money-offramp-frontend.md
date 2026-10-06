# Mobile Money Cash-Out (direct path) — KalySwap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `/kusd` → Sell → "Mobile money", the user fills in the mobile money details and clicks Cash out. KalySwap asks the fiat-ramp keeper for a Yellow Card payout, then runs the cash-out that is already live (swap KUSD → USDT, bridge) straight to that payout's Polygon deposit address.

**Architecture:**
- New `/ramp-api/withdraw*` proxy routes forward to the keeper with the server-only key (the existing `keeperFetch`).
- `CashoutPanel` keeps its swap/bridge machinery (`useCashout`, the capacity checks, the stranded-USDT resume). It swaps the "your Yellow Card address" field for the mobile-money form and gets the recipient from the keeper.
- A status line polls the keeper every 5 s until the payout is paid, failed or expired.

**Tech Stack:** Next.js 15 App Router, React 19, wagmi/viem, @tanstack/react-query, vitest + Testing Library (jsdom).

**Spec:** `/home/dude/KalyChain/KUSD/fiat-bridge-keeper/docs/superpowers/specs/2026-10-06-mobile-money-offramp-design.md` (§2 user flow, §5 KalySwap design). The keeper half is `/home/dude/KalyChain/KUSD/fiat-bridge-keeper/docs/superpowers/plans/2026-10-06-mobile-money-offramp-keeper.md`. This plan's tests use mocks; live use needs the keeper's withdraw API deployed.

## Global Constraints

- Tabs, single quotes, TypeScript strict, no `any`.
- **Unchanged:** `useCashout`, `utils/kusdCashout`, the cash-out plan steps, `KUSD_CASHOUT`, the Hyperlane ABIs, `useKusdWriter`.
- The bridge goes only to the deposit address of the payout the keeper just created, for exactly that payout's USDT (spec §6.2).
- The browser talks only to `/ramp-api/*`; the keeper key stays in server env.
- EN and FR for every user-facing string, with the same keys.
- Dev server only through portless (`https://kalyswap.localhost`, already running; do not start a second one).
- **Claude never runs `git add`, `git commit` or `git push`.**
- `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build` stay green.

## Review Focus

1. **The keeper answers with a different amount, no address, a malformed address, or a payout that is not open.** Expected: the wallet is never asked. Test: Task 3, "never cashes out when the keeper answers …".
2. **Keeper unreachable on create (504 `keeper_unreachable`).** Expected: the retry reuses the idempotency key; a definitive refusal starts fresh. Test: Task 3.
3. **A double click.** Expected: one payout, one cash-out. Test: Task 3, "starts one cash-out for a double click".
4. **USDT stranded after the swap.** Expected: the resume creates a fresh payout and bridges to its address, never to the old one. Test: Task 3, "resumes stranded USDT into a fresh payout".
5. **Polygon collateral short or unknown.** Expected: blocked before anything is sent (the kept tests). Task 3.

## Before Task 1

```bash
cd /home/dude/KalyChain/KalySwapv3/frontend
git fetch origin && git status --short && git log --oneline -1   # expect a clean tree at 8f2988d (origin/main)
git checkout -b feat/mobile-money-cashout
```
If the tree is not clean, or HEAD is not origin/main, stop and ask the user.

---

### Task 1: Proxy routes for the keeper's withdraw API

**Files:**
- Create: `src/app/ramp-api/withdraw-channels/route.ts`, `src/app/ramp-api/withdraw-quote/route.ts`, `src/app/ramp-api/withdrawals/route.ts`, `src/app/ramp-api/withdrawals/[id]/route.ts`
- Modify: `src/lib/ramp.ts` (two input checks)
- Test: `src/app/ramp-api/__tests__/routes.test.ts`, `src/lib/__tests__/ramp.test.ts`

**Interfaces:**
- Produces:
  - `isValidUsdAmount(value: string): boolean`
  - `isRampWithdrawalId(id: string): boolean`
  - Routes:
    - `GET /ramp-api/withdraw-channels`
    - `GET /ramp-api/withdraw-quote?country&currency&usd`
    - `POST /ramp-api/withdrawals`
    - `GET /ramp-api/withdrawals/[id]`
  - Each route passes the keeper's status and body through.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/__tests__/ramp.test.ts`, and add `isRampWithdrawalId`, `isValidUsdAmount` to its import from `'../ramp'`:
```ts
describe('cash-out input checks', () => {
	it('accepts USD amounts with at most 6 decimals (the payout is 6-decimal USDT)', () => {
		expect(isValidUsdAmount('25')).toBe(true);
		expect(isValidUsdAmount('25.123456')).toBe(true);
		expect(isValidUsdAmount('25.1234567')).toBe(false);
		expect(isValidUsdAmount('0')).toBe(false);
		expect(isValidUsdAmount('-1')).toBe(false);
		expect(isValidUsdAmount('1e3')).toBe(false);
		expect(isValidUsdAmount('')).toBe(false);
	});
	it('accepts only keeper-shaped withdrawal ids', () => {
		expect(isRampWithdrawalId('6f1c2d3e-4a5b-6c7d')).toBe(true);
		expect(isRampWithdrawalId('../admin')).toBe(false);
		expect(isRampWithdrawalId('short')).toBe(false);
	});
});
```

In `src/app/ramp-api/__tests__/routes.test.ts`, add next to the other route imports:
```ts
import { GET as withdrawChannels } from '../withdraw-channels/route';
import { GET as withdrawQuote } from '../withdraw-quote/route';
import { POST as createWithdrawal } from '../withdrawals/route';
import { GET as getWithdrawal } from '../withdrawals/[id]/route';
```
and append:
```ts
describe('mobile-money cash-out', () => {
	it('forwards the payout corridors', async () => {
		await withdrawChannels();
		expect(lastCall()[0]).toBe(`${KEEPER}/api/withdraw-channels`);
	});

	it('quotes only with country, currency and a ≤6-decimal USD amount, forwarding nothing else', async () => {
		expect((await withdrawQuote(req('/ramp-api/withdraw-quote?country=CI&currency=XOF'))).status).toBe(400);
		expect((await withdrawQuote(req('/ramp-api/withdraw-quote?country=CI&currency=XOF&usd=1.1234567'))).status).toBe(400);
		expect(keeper).not.toHaveBeenCalled();
		await withdrawQuote(req('/ramp-api/withdraw-quote?country=CI&currency=XOF&usd=25&evil=1'));
		expect(lastCall()[0]).toBe(`${KEEPER}/api/withdraw-quote?country=CI&currency=XOF&usd=25`);
	});

	it('rejects malformed withdrawals before reaching the keeper', async () => {
		const post = (body: string) => createWithdrawal(req('/ramp-api/withdrawals', { method: 'POST', body }));
		for (const body of [
			'{nope',
			'null',
			'[]',
			JSON.stringify({ userWallet: '0x123', usdAmount: '25' }),
			JSON.stringify({ userWallet: WALLET, usdAmount: '-1' }),
			JSON.stringify({ userWallet: WALLET, usdAmount: '1.1234567' }),
		]) {
			expect((await post(body)).status, body).toBe(400);
		}
		expect(keeper).not.toHaveBeenCalled();
	});

	it('forwards a valid withdrawal unchanged as a POST, and an unreachable keeper as an unknown outcome', async () => {
		const body = { idempotencyKey: 'ui-ff409dbd-1', userWallet: WALLET, usdAmount: '25', channelId: 'wd1' };
		await createWithdrawal(req('/ramp-api/withdrawals', { method: 'POST', body: JSON.stringify(body) }));
		const [url, init] = lastCall();
		expect(url).toBe(`${KEEPER}/api/withdrawals`);
		expect(init.method).toBe('POST');
		expect(JSON.parse(String(init.body))).toEqual(body);

		keeper.mockRejectedValueOnce(new TypeError('fetch failed'));
		const res = await createWithdrawal(req('/ramp-api/withdrawals', { method: 'POST', body: JSON.stringify(body) }));
		expect(res.status).toBe(504);
		expect(await res.json()).toEqual({ error: 'keeper_unreachable' });
	});

	it('checks the withdrawal id before forwarding a status poll', async () => {
		const get = (id: string) => getWithdrawal(req(`/ramp-api/withdrawals/${id}`), { params: Promise.resolve({ id }) });
		for (const id of ['..%2Fadmin', 'short']) expect((await get(id)).status, id).toBe(400);
		expect(keeper).not.toHaveBeenCalled();
		await get('6f1c2d3e-4a5b-6c7d');
		expect(lastCall()[0]).toBe(`${KEEPER}/api/withdrawals/6f1c2d3e-4a5b-6c7d`);
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/__tests__/ramp.test.ts src/app/ramp-api/__tests__/routes.test.ts`
Expected: FAIL — the route modules are missing, and the two checks are not exported.

- [ ] **Step 3: Implement**

In `src/lib/ramp.ts`, below `isRampDepositId`:
```ts
/** Withdrawal ids the keeper issues (UUIDs), and the only shape the status proxy forwards. */
export function isRampWithdrawalId(id: string): boolean {
	return /^[a-zA-Z0-9-]{8,64}$/.test(id);
}

/** A USD amount the keeper accepts for a cash-out: positive, at most 6 decimals (the payout is USDT). */
export function isValidUsdAmount(value: string): boolean {
	const v = value.trim();
	return /^\d+(\.\d{1,6})?$/.test(v) && Number(v) > 0;
}
```

`src/app/ramp-api/withdraw-channels/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { keeperFetch } from '@/lib/rampServer';

export const dynamic = 'force-dynamic';

/** Yellow Card mobile-money payout corridors, mirrored live by the fiat-ramp keeper. */
export async function GET() {
	const r = await keeperFetch('/api/withdraw-channels');
	return NextResponse.json(r.body, { status: r.status });
}
```

`src/app/ramp-api/withdraw-quote/route.ts`:
```ts
import { type NextRequest, NextResponse } from 'next/server';
import { isValidUsdAmount } from '@/lib/ramp';
import { keeperFetch } from '@/lib/rampServer';

export const dynamic = 'force-dynamic';

/** Quote a cash-out: what the mobile money number receives in local currency, after Yellow Card's fee. */
export async function GET(req: NextRequest) {
	const search = req.nextUrl.searchParams;
	const country = search.get('country') ?? '';
	const currency = search.get('currency') ?? '';
	const usd = search.get('usd') ?? '';
	if (!country || !currency || !isValidUsdAmount(usd)) {
		return NextResponse.json({ error: 'country, currency and usd required' }, { status: 400 });
	}
	const r = await keeperFetch(`/api/withdraw-quote?${new URLSearchParams({ country, currency, usd })}`);
	return NextResponse.json(r.body, { status: r.status });
}
```

`src/app/ramp-api/withdrawals/route.ts`:
```ts
import { type NextRequest, NextResponse } from 'next/server';
import { isEvmAddress, isValidUsdAmount } from '@/lib/ramp';
import { keeperFetch } from '@/lib/rampServer';

export const dynamic = 'force-dynamic';

/**
 * Create a mobile-money cash-out (the keeper opens the Yellow Card payout). Thin validation here (fast
 * 400s for obviously bad input); the keeper re-validates everything authoritatively.
 */
export async function POST(req: NextRequest) {
	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ error: 'invalid json' }, { status: 400 });
	}
	if (body === null || typeof body !== 'object' || Array.isArray(body)) {
		return NextResponse.json({ error: 'invalid body' }, { status: 400 });
	}
	const fields = body as Record<string, unknown>;
	if (typeof fields.userWallet !== 'string' || !isEvmAddress(fields.userWallet)) {
		return NextResponse.json({ error: 'invalid userWallet' }, { status: 400 });
	}
	if (typeof fields.usdAmount !== 'string' || !isValidUsdAmount(fields.usdAmount)) {
		return NextResponse.json({ error: 'invalid usdAmount' }, { status: 400 });
	}
	const r = await keeperFetch('/api/withdrawals', { method: 'POST', body: fields });
	return NextResponse.json(r.body, { status: r.status });
}
```

`src/app/ramp-api/withdrawals/[id]/route.ts`:
```ts
import { type NextRequest, NextResponse } from 'next/server';
import { isRampWithdrawalId } from '@/lib/ramp';
import { keeperFetch } from '@/lib/rampServer';

export const dynamic = 'force-dynamic';

/** Cash-out payout status, polled after the transfer. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
	const { id } = await ctx.params;
	if (!isRampWithdrawalId(id)) {
		return NextResponse.json({ error: 'invalid id' }, { status: 400 });
	}
	const r = await keeperFetch(`/api/withdrawals/${encodeURIComponent(id)}`);
	return NextResponse.json(r.body, { status: r.status });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/__tests__/ramp.test.ts src/app/ramp-api/__tests__/routes.test.ts && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 5: Hand-off.** Do not stage or commit.

---

### Task 2: Browser client, payout states and the status hook

**Files:**
- Modify: `src/lib/ramp.ts`
- Create: `src/hooks/kusd/useRampWithdraw.ts`
- Modify: `src/i18n/dictionaries/en/kusd.ts`, `src/i18n/dictionaries/fr/kusd.ts` (`buy.errors`: two new keys)
- Test: `src/lib/__tests__/ramp.test.ts`

**Interfaces:**
- Consumes: `jsonOrThrow`, `RampApiError`, `RampCorridor`, `RampCustomer` (existing).
- Produces:
  - `RAMP_WITHDRAWAL_STATES` and `type RampWithdrawalState`
  - `isTerminalWithdrawalState(state: string): boolean`
  - `interface RampWithdrawal { withdrawalId; state; depositAddress: string | null; usdAmount; localAmount: string | null; currency; expiresAt: string | null }`
  - `RampWithdrawChannelsResponse`, `RampWithdrawQuote`, `CreateRampWithdrawalInput`
  - `fetchRampWithdrawChannels()`, `fetchRampWithdrawQuote(country, currency, usd)`, `createRampWithdrawal(input)`, `fetchRampWithdrawal(id)`
  - `RAMP_ERROR_KEYS` gains `'daily_cap' | 'unknown_corridor'`
  - `useRampWithdrawChannels()`; `useRampWithdrawal(id: string | null)`, which polls every 5 s until the payout is final

- [ ] **Step 1: Write the failing tests** — append to `src/lib/__tests__/ramp.test.ts`, adding the new names to its import from `'../ramp'`:
```ts
describe('mobile-money cash-out client', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('stops polling only once the payout is final', () => {
		expect(RAMP_WITHDRAWAL_STATES.filter(isTerminalWithdrawalState)).toEqual(['paid', 'failed', 'expired', 'failed_create']);
	});

	it('creates, reads, quotes and lists through the ramp proxy', async () => {
		const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({ corridors: [] }), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		await createRampWithdrawal({
			idempotencyKey: 'k',
			userWallet: '0x' + '1'.repeat(40),
			usdAmount: '25',
			channelId: 'c',
			country: 'CI',
			currency: 'XOF',
			networkId: 'n',
			momoNumber: '+2250701234567',
			accountName: 'A',
			sender: { name: 'A', country: 'CI' },
		});
		await fetchRampWithdrawal('wd-00000001');
		await fetchRampWithdrawQuote('CI', 'XOF', '25');
		expect((await fetchRampWithdrawChannels()).corridors).toEqual([]);
		expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
			'/ramp-api/withdrawals',
			'/ramp-api/withdrawals/wd-00000001',
			'/ramp-api/withdraw-quote?country=CI&currency=XOF&usd=25',
			'/ramp-api/withdraw-channels',
		]);
		expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
	});

	it("explains the keeper's cash-out refusals as definitive (not unknown) outcomes", async () => {
		for (const key of ['daily_cap', 'unknown_corridor'] as const) {
			vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: key }), { status: 422 })));
			await expect(fetchRampWithdrawal('wd-00000001')).rejects.toMatchObject({ key, outcomeUnknown: false });
		}
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/__tests__/ramp.test.ts`
Expected: FAIL — the new exports are missing.

- [ ] **Step 3: Implement**

In `src/lib/ramp.ts`, add `'daily_cap'` and `'unknown_corridor'` at the end of `RAMP_ERROR_KEYS`. Then append to the file:
```ts
// ── Mobile-money cash-out (keeper /api/withdraw*) ───────────────────────────

/** fiat-bridge-keeper src/core/withdrawals.ts WithdrawalState — the keeper's code is the authority. */
export const RAMP_WITHDRAWAL_STATES = ['created', 'awaiting_funds', 'paid', 'failed', 'expired', 'failed_create'] as const;

export type RampWithdrawalState = (typeof RAMP_WITHDRAWAL_STATES)[number];

/** Polling stops here. failed / expired: Yellow Card returns any USDT it received to the seller on Polygon. */
export function isTerminalWithdrawalState(state: string): boolean {
	return ['paid', 'failed', 'expired', 'failed_create'].includes(state);
}

export interface RampWithdrawal {
	withdrawalId: string;
	state: RampWithdrawalState | string;
	/** Yellow Card's Polygon deposit address for this payout: the bridge sends the USDT here. */
	depositAddress: string | null;
	/** The payout in USD (= the USDT to send, exactly). */
	usdAmount: string;
	localAmount: string | null;
	currency: string;
	expiresAt: string | null;
}

export interface RampWithdrawChannelsResponse {
	corridors: RampCorridor[];
	/** The keeper's USD floor/ceiling per cash-out. */
	minUsd?: string;
	maxUsd?: string;
	stale?: boolean;
}

export interface RampWithdrawQuote {
	usd: string;
	rate: number;
	feeLocal: number;
	receiveLocal: number;
	currency: string;
}

export interface CreateRampWithdrawalInput {
	idempotencyKey: string;
	userWallet: string;
	usdAmount: string;
	channelId: string;
	country: string;
	currency: string;
	networkId: string;
	momoNumber: string;
	accountName: string;
	sender: RampCustomer;
}

export async function fetchRampWithdrawChannels(): Promise<RampWithdrawChannelsResponse> {
	const body = await jsonOrThrow<RampWithdrawChannelsResponse>(await fetch('/ramp-api/withdraw-channels'));
	return { ...body, corridors: body.corridors ?? [] };
}

export async function fetchRampWithdrawQuote(country: string, currency: string, usd: string): Promise<RampWithdrawQuote> {
	return jsonOrThrow(await fetch(`/ramp-api/withdraw-quote?${new URLSearchParams({ country, currency, usd })}`));
}

export async function createRampWithdrawal(input: CreateRampWithdrawalInput): Promise<RampWithdrawal> {
	return jsonOrThrow(
		await fetch('/ramp-api/withdrawals', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(input),
		}),
	);
}

export async function fetchRampWithdrawal(withdrawalId: string): Promise<RampWithdrawal> {
	return jsonOrThrow(await fetch(`/ramp-api/withdrawals/${encodeURIComponent(withdrawalId)}`));
}
```

`src/hooks/kusd/useRampWithdraw.ts`:
```ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchRampWithdrawal, fetchRampWithdrawChannels, isTerminalWithdrawalState } from '@/lib/ramp';

const STATUS_POLL_MS = 5_000;

/**
 * Yellow Card's live mobile-money payout corridors, via the keeper (/ramp-api/withdraw-channels).
 * No retries: while the ramp is offline the form says so at once instead of spinning.
 */
export function useRampWithdrawChannels() {
	return useQuery({
		queryKey: ['rampWithdrawChannels'],
		queryFn: fetchRampWithdrawChannels,
		staleTime: 5 * 60_000,
		retry: false,
	});
}

/** A cash-out's payout status from the keeper (a database read there), every 5 s until it is final. */
export function useRampWithdrawal(withdrawalId: string | null) {
	return useQuery({
		queryKey: ['rampWithdrawal', withdrawalId],
		enabled: Boolean(withdrawalId),
		retry: false,
		queryFn: () => fetchRampWithdrawal(withdrawalId!),
		refetchInterval: (query) => (query.state.data && isTerminalWithdrawalState(String(query.state.data.state)) ? false : STATUS_POLL_MS),
	});
}
```

In `src/i18n/dictionaries/en/kusd.ts`, add to `buy.errors` after `not_found`:
```ts
			daily_cap: 'Today’s limit has been reached. Please try again tomorrow.',
			unknown_corridor: 'This payout method is not available right now. Please pick another one.',
```
In `src/i18n/dictionaries/fr/kusd.ts`, the same keys in `buy.errors`:
```ts
			daily_cap: 'La limite du jour est atteinte. Veuillez réessayer demain.',
			unknown_corridor: 'Ce mode de paiement n’est pas disponible pour le moment. Veuillez en choisir un autre.',
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/__tests__/ramp.test.ts src/i18n && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 5: Hand-off.** Do not stage or commit.

---

### Task 3: `CashoutPanel` pays mobile money

**Files:**
- Modify: `src/components/kusd/CashoutPanel.tsx` (full replacement below)
- Modify: `src/components/kusd/BuyKusdPanel.tsx` (export `Field`, one word)
- Modify: `src/i18n/dictionaries/en/kusd.ts`, `src/i18n/dictionaries/fr/kusd.ts` (replace the `cashout` section)
- Test: `src/components/kusd/__tests__/CashoutPanel.test.tsx` (full replacement below)

**Interfaces:**
- Consumes:
  - Task 2: `createRampWithdrawal`, `fetchRampWithdrawQuote`, `useRampWithdrawChannels`, `useRampWithdrawal`, `RampWithdrawal`
  - Existing: `useCashout`, `usePolygonCollateral`, `useBridgeDelivery`, `planCashout`, `cashoutProblem`, `parseRecipient`, `CashoutStrandedError`, and `rampErrorText` from BuyKusdPanel
- Produces: `CashoutPanel({ onBusyChange })`, the same props as today.

- [ ] **Step 1: Write the failing test** — replace `src/components/kusd/__tests__/CashoutPanel.test.tsx` with:
```tsx
/**
 * @vitest-environment jsdom
 *
 * Cash-out to mobile money. Money-safety rules: nothing is sent while the Polygon side of the route
 * holds less USDT than the cash-out (or is unknown); the bridge goes only to the deposit address of the
 * Yellow Card payout the keeper just created, and only when that payout is open and for exactly the
 * planned USDT; a retry after an unknown keeper outcome reuses the idempotency key; a double click
 * never starts two cash-outs; USDT stranded in the wallet (swap mined, bridge not sent) is resumed
 * into a fresh payout, and only while the wallet still holds it.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';
import { interpolate } from '@/i18n/interpolate';
import { CashoutStrandedError } from '@/utils/kusdCashout';

const WALLET = '0x1111111111111111111111111111111111111111';
const DEPOSIT = '0x52908400098527886E0F7030069857D2E4169EE7';
const DEPOSIT2 = '0x2222222222222222222222222222222222222222';
const USDT = 10n ** 6n;
const WAD = 10n ** 18n;
let collateral: bigint | undefined;
let gemBalance = 0n;
let tout = 0n;
const cashout = vi.fn();
const resumeBridge = vi.fn();
const toastError = vi.fn();

vi.mock('wagmi', () => ({ useAccount: () => ({ address: WALLET }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => '/kusd' }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ success: vi.fn(), error: toastError }) }));
vi.mock('@/components/wallet/ClientOnlyConnectWallet', () => ({ ClientOnlyConnectWallet: () => null }));
vi.mock('@/hooks/kusd/usePsm', () => ({
	PSM_HALTED: 2n ** 256n - 1n,
	usePsmState: () => ({ data: { tin: 0n, tout, kusdCash: 10_000n * WAD, pocketGem: 1_419n * USDT } }),
	usePsmWallet: () => ({ data: { gemBalance, gemAllowance: 0n, kusdBalance: 500n * WAD, kusdAllowance: 0n } }),
}));
vi.mock('@/hooks/kusd/useCashout', () => ({
	usePolygonCollateral: () => ({ data: collateral }),
	useCashout: () => ({ cashout, resumeBridge }),
	useBridgeDelivery: () => 'pending',
}));
// Radix Select needs pointer APIs jsdom lacks; a native input exercises the same value flow.
vi.mock('@/components/ui/select', () => {
	const Ctx = React.createContext<{ value: string; onValueChange: (v: string) => void }>({ value: '', onValueChange: () => undefined });
	return {
		Select: ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: React.ReactNode }) => (
			<Ctx.Provider value={{ value, onValueChange }}>{children}</Ctx.Provider>
		),
		SelectTrigger: ({ id }: { id?: string }) => {
			const ctx = React.useContext(Ctx);
			return <input data-testid={id} value={ctx.value} onChange={(e) => ctx.onValueChange(e.target.value)} />;
		},
		SelectValue: () => null,
		SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
		SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => <div data-value={value}>{children}</div>,
	};
});

import CashoutPanel from '../CashoutPanel';

const t = en.kusd.cashout;
const b = en.kusd.buy;
const CI = {
	channelId: 'ci-wd',
	country: 'CI',
	currency: 'XOF',
	channelType: 'momo',
	min: 500,
	max: 1_500_000,
	estimatedSettlementTime: 5,
	networks: [
		{ id: 'net-mtn', name: 'MTN', accountNumberType: 'phone' },
		{ id: 'net-orange', name: 'Orange', accountNumberType: 'phone' },
	],
};
const SN_NO_OPERATOR = { ...CI, channelId: 'sn-wd', country: 'SN', networks: [] };

type CreateHandler = (body: Record<string, unknown>, n: number) => Response;
let onCreate: CreateHandler;
let onStatus: () => Response;
const creates: Array<Record<string, unknown>> = [];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
/** The keeper's answer for the n-th create: an open payout for the amount asked, at DEPOSIT / DEPOSIT2 (lower-cased). */
const payout = (body: Record<string, unknown>, n: number, over: Record<string, unknown> = {}) => ({
	withdrawalId: `wd-0000000${n}`,
	state: 'awaiting_funds',
	depositAddress: [DEPOSIT, DEPOSIT2][n % 2].toLowerCase(),
	usdAmount: body.usdAmount,
	localAmount: null,
	currency: 'XOF',
	expiresAt: null,
	...over,
});
const sentTo = (recipient: string, gemAmt = 50n * USDT) => ({ gemAmt, recipient, hash: `0x${'cd'.repeat(32)}`, messageId: null });
const rejected = () => new Error('User rejected the request.');

beforeEach(() => {
	collateral = 194n * USDT;
	gemBalance = 0n;
	tout = 0n;
	cashout.mockReset();
	resumeBridge.mockReset();
	toastError.mockReset();
	creates.length = 0;
	onCreate = (body, n) => json(payout(body, n), 201);
	onStatus = () => json({ withdrawalId: 'wd-00000000', state: 'awaiting_funds' });
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
			const url = String(input);
			if (url === '/ramp-api/withdraw-channels') return json({ corridors: [CI, SN_NO_OPERATOR], minUsd: '5', maxUsd: '20000' });
			if (url.startsWith('/ramp-api/withdraw-quote')) return json({ usd: '50', rate: 480, feeLocal: 240, receiveLocal: 23760, currency: 'XOF' });
			if (url === '/ramp-api/withdrawals') {
				const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
				creates.push(body);
				return onCreate(body, creates.length - 1);
			}
			if (url.startsWith('/ramp-api/withdrawals/')) return onStatus();
			throw new Error(`unexpected fetch ${url}`);
		}),
	);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function renderPanel(onBusyChange?: (busy: boolean) => void) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<QueryClientProvider client={client}>
			<DictionaryProvider dict={en} locale="en">
				<CashoutPanel onBusyChange={onBusyChange} />
			</DictionaryProvider>
		</QueryClientProvider>,
	);
}

const button = () => screen.getByRole('button', { name: new RegExp(`^(${t.cashout}|${t.enterAmount})$`) }) as HTMLButtonElement;
const typeAmount = (amount: string) => fireEvent.change(screen.getByLabelText(t.amount), { target: { value: amount } });
async function fill(amount: string) {
	typeAmount(amount);
	await screen.findByText(/XOF \(mobile money\)/);
	fireEvent.change(screen.getByTestId('cashout-country'), { target: { value: 'ci-wd' } });
	fireEvent.change(await screen.findByTestId('cashout-operator'), { target: { value: 'net-mtn' } });
	fireEvent.change(screen.getByLabelText(t.momoNumber), { target: { value: '07 01 23 45 67' } });
	fireEvent.change(screen.getByLabelText(t.accountName), { target: { value: 'Awa Koné' } });
	fireEvent.change(screen.getByLabelText(b.name), { target: { value: 'Awa Koné' } });
	fireEvent.change(screen.getByLabelText(b.phone), { target: { value: '0701234567' } });
}
const resumeButton = (amount: number) => screen.findByRole('button', { name: new RegExp(`Send ${amount} USDT to Yellow Card`) }) as Promise<HTMLButtonElement>;

describe('CashoutPanel', () => {
	it('offers only payout corridors that have an operator', async () => {
		renderPanel();
		await screen.findByText(/XOF \(mobile money\)/);
		expect(screen.getAllByText(/XOF \(mobile money\)/)).toHaveLength(1);
		expect(screen.queryByText(/Senegal/)).toBeNull();
	});

	it('blocks a cash-out above the USDT on the Polygon side, and names the limit', () => {
		renderPanel();
		typeAmount('200');
		expect(screen.getByRole('alert').textContent).toContain('194');
		expect(button().disabled).toBe(true);
	});

	it('refuses an amount under the keeper\'s minimum', async () => {
		renderPanel();
		typeAmount('2');
		expect(await screen.findByText(interpolate(t.belowMin, { min: '5' }))).toBeTruthy();
		expect(button().disabled).toBe(true);
	});

	it('notes when digits beyond USDT’s 6 decimals will not be spent', () => {
		renderPanel();
		typeAmount('10.1234567');
		expect(screen.getByText(/USDT has 6 decimals/)).toBeTruthy();
	});

	it('names the Polygon limit rounded down, so typing the number shown goes through', async () => {
		collateral = 386_099_040n; // 386.09904 USDT (wallet holds 500 KUSD)
		renderPanel();
		await fill('400');
		expect(screen.getByRole('alert').textContent).toContain('386.09 USDT');
		typeAmount('386.09');
		expect(screen.queryByRole('alert')).toBeNull();
		expect(button().disabled).toBe(false);
	});

	it('Max fills the most that can go out now: the smaller of the KUSD balance and the Polygon limit', () => {
		renderPanel();
		fireEvent.click(screen.getByRole('button', { name: t.max }));
		expect((screen.getByLabelText(t.amount) as HTMLInputElement).value).toBe('194'); // balance 500 KUSD, limit 194 USDT
	});

	it('shows the PSM fee, and none when it is zero', () => {
		renderPanel();
		expect(screen.getByText(en.kusd.swap.noFee)).toBeTruthy();
		cleanup();
		tout = WAD / 100n; // 1%
		renderPanel();
		expect(screen.getByText('1%')).toBeTruthy();
	});

	it('quotes what the mobile money number receives for the planned USDT', async () => {
		renderPanel();
		await fill('50');
		fireEvent.blur(screen.getByLabelText(t.amount));
		expect(await screen.findByText(interpolate(t.receiveValue, { amount: '23,760', currency: 'XOF' }))).toBeTruthy();
	});

	it('creates the Yellow Card payout (E.164 numbers, KYC, the planned USDT), then cashes out to its deposit address', async () => {
		cashout.mockResolvedValue(sentTo(DEPOSIT));
		renderPanel();
		await fill('50');
		fireEvent.click(button());
		await waitFor(() => expect(cashout).toHaveBeenCalledTimes(1));
		expect(creates[0]).toMatchObject({
			userWallet: WALLET,
			usdAmount: '50',
			channelId: 'ci-wd',
			country: 'CI',
			currency: 'XOF',
			networkId: 'net-mtn',
			momoNumber: '+2250701234567',
			accountName: 'Awa Koné',
			sender: { name: 'Awa Koné', country: 'CI', phone: '+2250701234567' },
		});
		expect(cashout.mock.calls[0][0]).toEqual({ plan: { gemAmt: 50n * USDT, cost: 50n * WAD }, recipient: DEPOSIT, kusdAllowance: 0n });
		expect(await screen.findByText(t.status.pending)).toBeTruthy();
	});

	it.each([
		['a different amount', { usdAmount: '49' }],
		['no deposit address', { depositAddress: null }],
		['a malformed address', { depositAddress: '0x1234' }],
		['a payout that is not open', { state: 'failed_create' }],
	])('never cashes out when the keeper answers with %s', async (_label, over) => {
		onCreate = (body, n) => json(payout(body, n, over), 201);
		renderPanel();
		await fill('50');
		fireEvent.click(button());
		expect(await screen.findByText(t.badResponse)).toBeTruthy();
		expect(cashout).not.toHaveBeenCalled();
	});

	it('keeps the idempotency key when the keeper outcome is unknown, and starts fresh after a definitive refusal', async () => {
		cashout.mockResolvedValue(sentTo(DEPOSIT));
		onCreate = () => json({ error: 'keeper_unreachable' }, 504);
		renderPanel();
		await fill('50');
		fireEvent.click(button());
		await screen.findByText(b.errors.network);
		onCreate = () => json({ error: 'unknown_corridor' }, 400);
		fireEvent.click(button());
		await screen.findByText(b.errors.unknown_corridor);
		onCreate = (body, n) => json(payout(body, n), 201);
		fireEvent.click(button());
		await waitFor(() => expect(cashout).toHaveBeenCalledTimes(1));
		expect(String(creates[0].idempotencyKey)).toMatch(/^ui-11111111-/);
		expect(creates[1].idempotencyKey).toBe(creates[0].idempotencyKey);
		expect(creates[2].idempotencyKey).not.toBe(creates[1].idempotencyKey);
	});

	it('starts one cash-out for a double click', async () => {
		cashout.mockReturnValue(new Promise(() => undefined)); // still in flight
		renderPanel();
		await fill('50');
		const btn = button();
		fireEvent.click(btn);
		fireEvent.click(btn);
		await waitFor(() => expect(cashout).toHaveBeenCalledTimes(1));
		expect(creates).toHaveLength(1);
	});

	it('resumes stranded USDT into a fresh payout, and bridges it to that payout\'s address', async () => {
		gemBalance = 50n * USDT;
		cashout.mockRejectedValue(new CashoutStrandedError(50n * USDT, DEPOSIT, rejected()));
		resumeBridge.mockResolvedValue(sentTo(DEPOSIT2));
		renderPanel();
		await fill('50');
		fireEvent.click(button());
		fireEvent.click(await resumeButton(50));
		await waitFor(() => expect(resumeBridge).toHaveBeenCalledWith({ gemAmt: 50n * USDT, recipient: DEPOSIT2 }, expect.any(Function)));
		expect(creates).toHaveLength(2);
		expect(creates[1].usdAmount).toBe('50');
		expect(creates[1].idempotencyKey).not.toBe(creates[0].idempotencyKey);
	});

	it('keeps resume disabled when the wallet no longer holds the stranded USDT', async () => {
		gemBalance = 10n * USDT;
		cashout.mockRejectedValue(new CashoutStrandedError(50n * USDT, DEPOSIT, rejected()));
		renderPanel();
		await fill('50');
		fireEvent.click(button());
		expect((await resumeButton(50)).disabled).toBe(true);
	});

	it('does not offer a resume for a failure that left nothing stranded', async () => {
		gemBalance = 50n * USDT;
		cashout.mockRejectedValue(rejected());
		renderPanel();
		await fill('50');
		fireEvent.click(button());
		await waitFor(() => expect(toastError).toHaveBeenCalled());
		expect(screen.queryByRole('button', { name: /Send 50 USDT to Yellow Card/ })).toBeNull();
	});

	it('sends one resume for a double click', async () => {
		gemBalance = 50n * USDT;
		cashout.mockRejectedValue(new CashoutStrandedError(50n * USDT, DEPOSIT, rejected()));
		resumeBridge.mockReturnValue(new Promise(() => undefined));
		renderPanel();
		await fill('50');
		fireEvent.click(button());
		const resume = await resumeButton(50);
		fireEvent.click(resume);
		fireEvent.click(resume);
		await waitFor(() => expect(resumeBridge).toHaveBeenCalledTimes(1));
		expect(resumeBridge).toHaveBeenCalledTimes(1);
	});

	it('adds a second stranded amount to the first, so one resume sends both', async () => {
		gemBalance = 80n * USDT;
		cashout.mockRejectedValueOnce(new CashoutStrandedError(50n * USDT, DEPOSIT, rejected()));
		cashout.mockRejectedValueOnce(new CashoutStrandedError(30n * USDT, DEPOSIT2, rejected()));
		renderPanel();
		await fill('50');
		fireEvent.click(button());
		await resumeButton(50);
		typeAmount('30');
		fireEvent.click(button());
		expect(await resumeButton(80)).toBeTruthy();
	});

	it('shows the payout as paid once Yellow Card reports it, with the local amount and the number', async () => {
		cashout.mockResolvedValue(sentTo(DEPOSIT));
		onStatus = () => json({ withdrawalId: 'wd-00000000', state: 'paid', localAmount: '23760', currency: 'XOF' });
		renderPanel();
		await fill('50');
		fireEvent.click(button());
		expect(await screen.findByText(/23,760 XOF sent to \+2250701234567/)).toBeTruthy();
	});

	it('says the USDT goes back to the seller\'s Polygon address when the payout fails', async () => {
		cashout.mockResolvedValue(sentTo(DEPOSIT));
		onStatus = () => json({ withdrawalId: 'wd-00000000', state: 'failed' });
		renderPanel();
		await fill('50');
		fireEvent.click(button());
		expect(await screen.findByText(t.payout.failed)).toBeTruthy();
	});

	it('starts "New cash-out" from a blank form', async () => {
		cashout.mockResolvedValue(sentTo(DEPOSIT));
		renderPanel();
		await fill('50');
		fireEvent.click(button());
		fireEvent.click(await screen.findByRole('button', { name: t.again }));
		expect((screen.getByLabelText(t.amount) as HTMLInputElement).value).toBe('');
		expect((screen.getByTestId('cashout-country') as HTMLInputElement).value).toBe('');
		expect((screen.getByLabelText(b.name) as HTMLInputElement).value).toBe('');
	});

	it('tells the page it is busy for the whole flow, so the page can lock its tabs', async () => {
		const onBusyChange = vi.fn();
		let finish: (value: unknown) => void = () => undefined;
		cashout.mockReturnValue(new Promise((resolve) => (finish = resolve)));
		renderPanel(onBusyChange);
		await fill('50');
		fireEvent.click(button());
		expect(onBusyChange).toHaveBeenLastCalledWith(true);
		await waitFor(() => expect(cashout).toHaveBeenCalled());
		finish(sentTo(DEPOSIT));
		await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(false));
	});

	it('stays disabled while the Polygon collateral is unknown', async () => {
		collateral = undefined;
		renderPanel();
		await fill('5');
		expect(button().disabled).toBe(true);
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/kusd/__tests__/CashoutPanel.test.tsx`
Expected: FAIL — `t.momoNumber` is undefined and there is no `cashout-country` field.

- [ ] **Step 3: Implement**

In `src/components/kusd/BuyKusdPanel.tsx`, change `function Field(` to `export function Field(`.

Replace `src/components/kusd/CashoutPanel.tsx` with:
```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDown, CheckCircle2, ExternalLink, Loader2, XCircle } from 'lucide-react';
import { formatUnits, parseUnits } from 'viem';
import { useAccount } from 'wagmi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { ClientOnlyConnectWallet } from '@/components/wallet/ClientOnlyConnectWallet';
import { CHAIN_IDS, getExplorerAddressUrl, getExplorerTxUrl } from '@/config/chains';
import { KUSD_PSM, KUSD_TOKEN } from '@/config/kusd';
import { useBridgeDelivery, useCashout, usePolygonCollateral, type CashoutSent } from '@/hooks/kusd/useCashout';
import { PSM_HALTED, usePsmState, usePsmWallet } from '@/hooks/kusd/usePsm';
import { useRampWithdrawal, useRampWithdrawChannels } from '@/hooks/kusd/useRampWithdraw';
import type { Dictionary } from '@/i18n/dictionaries/en';
import { describeError } from '@/i18n/errorText';
import { useDict, useFormat, useLocale } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import {
	COUNTRY_KYC_EXTRAS,
	countryDisplayName,
	createRampWithdrawal,
	dedupeNetworksByName,
	fetchRampWithdrawQuote,
	isInternationalPhone,
	makeIdempotencyKey,
	normalizePhoneForCountry,
	RampApiError,
	type RampCorridor,
	type RampCustomer,
	type RampWithdrawal,
	type RampWithdrawQuote,
} from '@/lib/ramp';
import { psmBuyCost, WAD } from '@/utils/kusd';
import { CashoutStrandedError, cashoutProblem, parseRecipient, planCashout } from '@/utils/kusdCashout';
import type { KusdStep } from '@/utils/kusdPlans';
import type { TxAction } from '@/utils/transactions';
import { exactAmount, parseAmount, showAmount } from './amounts';
import { Field, rampErrorText } from './BuyKusdPanel';

const GEM = KUSD_PSM.gem;
const STEP_LABEL: Partial<Record<TxAction, 'approve' | 'swap' | 'bridge'>> = { tokenApproval: 'approve', psmSwap: 'swap', bridgeTransfer: 'bridge' };

/** The keeper's answer is not an open payout for the amount asked at a real address: nothing may be sent on it. */
class UnexpectedPayoutError extends Error {}

/** A ramp failure in cash-out words where the buy form's wording would mislead. */
function cashoutErrorText(error: unknown, dict: Dictionary): string {
	if (error instanceof UnexpectedPayoutError) return dict.kusd.cashout.badResponse;
	if (error instanceof RampApiError && !error.outcomeUnknown) {
		if (error.key === 'paused') return dict.kusd.cashout.errors.paused;
		if (error.key === 'not_found') return dict.kusd.cashout.errors.notFound;
	}
	return rampErrorText(error, dict);
}

/** Where the money goes, in the form Yellow Card takes it (E.164 numbers). */
interface Destination {
	corridor: RampCorridor;
	payoutNumber: string;
	contactPhone: string;
}

interface OpenPayout {
	withdrawal: RampWithdrawal;
	recipient: `0x${string}`;
}

/**
 * Cash out KUSD to mobile money (spec 2026-10-06, direct path). The fiat-ramp keeper creates the
 * Yellow Card payout and returns its Polygon deposit address. The wallet then runs the cash-out:
 * buyGem swaps KUSD → USDT 1:1 into the wallet (the psm-keeper's trim() burns the KUSD), and the USDT
 * warp route carries that USDT straight to the deposit address (~8–10 min). Yellow Card then pays the
 * mobile money number, or returns the USDT to the seller's address on Polygon if it cannot.
 *
 * The Polygon side can only release the USDT it holds, so a larger cash-out is blocked before
 * anything is sent. One flow runs at a time. If the USDT is stranded in the wallet (swap mined,
 * bridge not sent), resuming opens a fresh payout for it and bridges there.
 */
export default function CashoutPanel({ onBusyChange }: { onBusyChange?: (busy: boolean) => void } = {}) {
	const dict = useDict();
	const fmt = useFormat();
	const locale = useLocale();
	const toast = useToast();
	const c = dict.kusd.cashout;
	const b = dict.kusd.buy;
	const { address } = useAccount();
	const [input, setInput] = useState('');
	const [corridorId, setCorridorId] = useState('');
	const [networkId, setNetworkId] = useState('');
	const [momoNumber, setMomoNumber] = useState('');
	const [accountName, setAccountName] = useState('');
	const [customer, setCustomer] = useState<RampCustomer>({ name: '', country: '' });
	const [quote, setQuote] = useState<RampWithdrawQuote | null>(null);
	const [formError, setFormError] = useState('');
	const [progress, setProgress] = useState<{ index: number; total: number; step: KusdStep } | null>(null);
	const [stranded, setStranded] = useState<{ gemAmt: bigint } | null>(null);
	const [pending, setPending] = useState(false);
	const inFlight = useRef(false);
	// One idempotency key per payout attempt: kept while the keeper's answer is unknown, dropped once it answers.
	const idemKeyRef = useRef<string | null>(null);
	const quoteSeqRef = useRef(0);
	const [sent, setSent] = useState<CashoutSent | null>(null);
	const [withdrawal, setWithdrawal] = useState<RampWithdrawal | null>(null);
	const { data: psm } = usePsmState();
	const { data: wallet } = usePsmWallet(address);
	const { data: collateral } = usePolygonCollateral();
	const channels = useRampWithdrawChannels();
	const { cashout, resumeBridge } = useCashout();
	const delivery = useBridgeDelivery(sent?.messageId ?? null);
	const { data: liveWithdrawal } = useRampWithdrawal(withdrawal?.withdrawalId ?? null);

	// A payout needs an operator (Yellow Card's networkId), so corridors without one are not offered.
	const corridors = channels.data ? channels.data.corridors.filter((x) => x.networks.length > 0) : null;
	const corridor = corridors?.find((x) => x.channelId === corridorId) ?? null;
	const operators = corridor ? dedupeNetworksByName(corridor.networks) : [];
	const minUsd = channels.data?.minUsd;
	const maxUsd = channels.data?.maxUsd;

	// The KYC country follows the corridor; operators belong to it (a lone one is preselected).
	useEffect(() => {
		if (corridor) setCustomer((x) => ({ ...x, country: corridor.country }));
		const ops = corridor ? dedupeNetworksByName(corridor.networks) : [];
		setNetworkId(ops.length === 1 ? ops[0].id : '');
	}, [corridor]);

	/** A USDT limit, rounded DOWN to cents: typing the number shown must always go through. */
	const usdtLimit = (value: bigint) => `${showAmount(value - (value % 10n ** BigInt(GEM.decimals - 2)), GEM.decimals, fmt, 2)} ${GEM.symbol}`;
	const halted = psm?.tout === PSM_HALTED;
	const kusdIn = parseAmount(input, KUSD_TOKEN.decimals);
	const plan = psm && !halted ? planCashout(kusdIn, psm.tout) : null;
	const problem = cashoutProblem({ plan, halted, kusdBalance: wallet?.kusdBalance, pocketGem: psm?.pocketGem, collateral });
	const invalidAmount = input.trim() !== '' && !plan && !halted;
	const rounded = Boolean(plan && kusdIn !== null && plan.cost < kusdIn);
	const available = psm && collateral !== undefined ? (psm.pocketGem < collateral ? psm.pocketGem : collateral) : undefined;
	const busy = pending;
	/** The most KUSD that can go out now: the wallet balance, capped by what the PSM and Polygon can pay. */
	const capKusd = psm && available !== undefined ? psmBuyCost(available, GEM.decimals, psm.tout) : undefined;
	const maxKusd = wallet && capKusd !== undefined && capKusd < wallet.kusdBalance ? capKusd : wallet?.kusdBalance;
	const feeLabel = !psm || halted ? '—' : psm.tout === 0n ? dict.kusd.swap.noFee : interpolate(dict.kusd.swap.feePct, { pct: fmt.pct(Number((psm.tout * 1_000_000n) / WAD) / 10_000, 4) });

	let message: string | null = null;
	if (problem?.key === 'halted') message = c.halted;
	else if (invalidAmount) message = dict.errors.invalidAmount;
	else if (problem?.key === 'insufficient') message = c.insufficient;
	else if (problem?.key === 'pocket') message = interpolate(c.overPocket, { amount: usdtLimit(problem.limit) });
	else if (problem?.key === 'collateral') message = interpolate(c.overCollateral, { amount: usdtLimit(problem.limit) });
	else if (plan && minUsd && plan.gemAmt < parseUnits(minUsd, GEM.decimals)) message = interpolate(c.belowMin, { min: minUsd });
	else if (plan && maxUsd && plan.gemAmt > parseUnits(maxUsd, GEM.decimals)) message = interpolate(c.aboveMax, { max: maxUsd });
	const shown = message ?? (formError || null);

	const ready = Boolean(plan && corridor && networkId && !message && wallet && collateral !== undefined);
	const strandedHeld = Boolean(stranded && wallet && wallet.gemBalance >= stranded.gemAmt);
	const canResume = Boolean(stranded && corridor && networkId && strandedHeld && !busy);
	const onStep = (index: number, total: number, step: KusdStep) => setProgress({ index, total, step });
	const label = progress
		? interpolate(c.progress, { step: c.steps[STEP_LABEL[progress.step.action] ?? 'swap'], n: progress.index + 1, total: progress.total })
		: null;

	/** One flow at a time: the ref blocks a second click synchronously, before the first await. */
	const exclusive = async (work: () => Promise<void>) => {
		if (inFlight.current) return;
		inFlight.current = true;
		setPending(true);
		onBusyChange?.(true);
		try {
			await work();
		} finally {
			inFlight.current = false;
			setPending(false);
			onBusyChange?.(false);
			setProgress(null);
		}
	};

	const failed = (error: unknown) => toast.error(c.failed, describeError(error instanceof CashoutStrandedError ? error.cause : error, dict));

	/** The destination as Yellow Card takes it, or why it cannot go yet. Shows normalised numbers as sent. */
	const destination = (): Destination | string => {
		if (!corridor) return b.invalid.country;
		if (!networkId) return b.invalid.operator;
		const payoutNumber = normalizePhoneForCountry(momoNumber, corridor.country);
		if (!isInternationalPhone(payoutNumber)) return c.invalidMomoNumber;
		if (!accountName.trim()) return c.invalidAccountName;
		if (!customer.name.trim()) return b.invalid.name;
		const contactPhone = normalizePhoneForCountry(customer.phone ?? '', corridor.country);
		if (!isInternationalPhone(contactPhone)) return b.invalid.phone;
		if (payoutNumber !== momoNumber) setMomoNumber(payoutNumber);
		if (contactPhone !== customer.phone) setCustomer((x) => ({ ...x, phone: contactPhone }));
		return { corridor, payoutNumber, contactPhone };
	};

	/**
	 * Opens the Yellow Card payout for exactly `gemAmt` USDT and returns where to send it. Otherwise it
	 * shows why and returns null. Nothing is sent unless the answer is an open payout for that amount
	 * at a real address.
	 */
	const openPayout = async (gemAmt: bigint, owner: `0x${string}`): Promise<OpenPayout | null> => {
		setFormError('');
		const dest = destination();
		if (typeof dest === 'string') {
			setFormError(dest);
			return null;
		}
		if (!idemKeyRef.current) idemKeyRef.current = makeIdempotencyKey(owner);
		try {
			const w = await createRampWithdrawal({
				idempotencyKey: idemKeyRef.current,
				userWallet: owner,
				usdAmount: formatUnits(gemAmt, GEM.decimals),
				channelId: dest.corridor.channelId,
				country: dest.corridor.country,
				currency: dest.corridor.currency,
				networkId,
				momoNumber: dest.payoutNumber,
				accountName: accountName.trim(),
				sender: { ...customer, country: dest.corridor.country, phone: dest.contactPhone },
			});
			idemKeyRef.current = null; // answered: the next payout gets a fresh key
			const recipient = w.depositAddress ? parseRecipient(w.depositAddress) : null;
			const sameAmount = /^\d+(\.\d{1,6})?$/.test(w.usdAmount) && parseUnits(w.usdAmount, GEM.decimals) === gemAmt;
			if (w.state !== 'awaiting_funds' || !recipient || !sameAmount) throw new UnexpectedPayoutError();
			return { withdrawal: w, recipient };
		} catch (error) {
			// A definitive rejection ends this attempt; an unknown outcome keeps the key for the retry.
			if (error instanceof RampApiError && !error.outcomeUnknown) idemKeyRef.current = null;
			setFormError(cashoutErrorText(error, dict));
			return null;
		}
	};

	const run = () =>
		exclusive(async () => {
			if (!plan || !wallet || !address) return;
			const open = await openPayout(plan.gemAmt, address);
			if (!open) return;
			try {
				const result = await cashout({ plan, recipient: open.recipient, kusdAllowance: wallet.kusdAllowance }, onStep);
				setWithdrawal(open.withdrawal);
				setSent(result);
				setInput('');
			} catch (error) {
				// Added to any earlier stranded USDT: one resume sends all of it.
				if (error instanceof CashoutStrandedError) setStranded((prev) => ({ gemAmt: (prev?.gemAmt ?? 0n) + error.gemAmt }));
				failed(error);
			}
		});

	const resume = () =>
		exclusive(async () => {
			if (!stranded || !address) return;
			// A fresh payout for the stranded USDT: the earlier one was never funded and simply expires.
			const open = await openPayout(stranded.gemAmt, address);
			if (!open) return;
			try {
				const result = await resumeBridge({ gemAmt: stranded.gemAmt, recipient: open.recipient }, onStep);
				setStranded(null);
				setWithdrawal(open.withdrawal);
				setSent(result);
				setInput('');
			} catch (error) {
				failed(error);
			}
		});

	/** The local-currency estimate for the planned USDT; an estimate only, so a failed quote just shows none. */
	const quoteFor = async (cor: RampCorridor | null) => {
		setQuote(null);
		if (!cor || !plan) return;
		const seq = ++quoteSeqRef.current;
		try {
			const q = await fetchRampWithdrawQuote(cor.country, cor.currency, formatUnits(plan.gemAmt, GEM.decimals));
			if (seq === quoteSeqRef.current) setQuote(q);
		} catch {
			// the create call reports real errors
		}
	};

	const startOver = () => {
		setSent(null);
		setWithdrawal(null);
		setInput('');
		setQuote(null);
		setFormError('');
		setCorridorId('');
		setNetworkId('');
		setMomoNumber('');
		setAccountName('');
		setCustomer({ name: '', country: '' });
	};

	const setCust = (patch: Partial<RampCustomer>) => setCustomer((x) => ({ ...x, ...patch }));
	const kycExtra = corridor ? COUNTRY_KYC_EXTRAS[corridor.country] : undefined;

	if (sent) {
		const payout = liveWithdrawal ?? withdrawal;
		const state = String(payout?.state ?? 'awaiting_funds');
		const paid = state === 'paid';
		const lost = state === 'failed' || state === 'expired';
		const headline = paid
			? payout?.localAmount && payout.currency
				? interpolate(c.payout.paid, { amount: fmt.number(Number(payout.localAmount)), currency: payout.currency, number: momoNumber })
				: interpolate(c.payout.paidNoAmount, { number: momoNumber })
			: lost
				? c.payout[state as 'failed' | 'expired']
				: interpolate(c.sent, { amount: showAmount(sent.gemAmt, GEM.decimals, fmt, 6) });
		return (
			<div className="space-y-4">
				<div className="flex items-start gap-3 rounded-xl border border-line bg-surface-alt p-4">
					{paid ? (
						<CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
					) : lost ? (
						<XCircle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
					) : (
						<Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-gold" aria-hidden />
					)}
					<div className="text-sm">
						<p className="font-semibold">{headline}</p>
						{!paid && !lost && <p className="mt-1 text-muted-foreground">{c.status[delivery]}</p>}
					</div>
				</div>
				<div className="flex flex-col gap-2 text-[13px]">
					<a href={getExplorerTxUrl(CHAIN_IDS.KALYCHAIN, sent.hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-gold hover:underline">
						{c.viewTx}
						<ExternalLink className="size-3.5" aria-hidden />
					</a>
					<a href={getExplorerAddressUrl(CHAIN_IDS.POLYGON, sent.recipient)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-gold hover:underline">
						{c.viewPolygon}
						<ExternalLink className="size-3.5" aria-hidden />
					</a>
				</div>
				<Button variant="outline" className="w-full" onClick={startOver}>
					{c.again}
				</Button>
			</div>
		);
	}

	return (
		<div>
			<p className="mb-5 text-sm text-muted-foreground">{c.subtitle}</p>

			{stranded && (
				<div className="mb-5 rounded-xl border border-gold/50 bg-gold-soft p-4 text-sm">
					<p className="font-semibold">{c.resumeTitle}</p>
					<p className="mt-1 text-muted-foreground">{c.resumeBody}</p>
					{!strandedHeld && <p className="mt-1 text-[12px] text-danger">{interpolate(c.resumeMissing, { amount: showAmount(stranded.gemAmt, GEM.decimals, fmt, 6) })}</p>}
					<Button className="mt-3 w-full" disabled={!canResume} onClick={resume}>
						{busy && <Loader2 className="animate-spin" aria-hidden />}
						{interpolate(c.resume, { amount: showAmount(stranded.gemAmt, GEM.decimals, fmt, 6) })}
					</Button>
				</div>
			)}

			<div className="rounded-xl border border-line bg-surface-alt p-4">
				<div className="mb-2 flex items-center justify-between text-[12px] text-muted-foreground">
					<label htmlFor="cashout-amount" className="font-semibold uppercase tracking-[0.1em] text-muted-deep">
						{c.amount}
					</label>
					{wallet && (
						<span className="flex items-center gap-2">
							{interpolate(c.balance, { amount: `${showAmount(wallet.kusdBalance, KUSD_TOKEN.decimals, fmt)} ${KUSD_TOKEN.symbol}` })}
							<button type="button" className="font-semibold text-gold hover:underline" onClick={() => setInput(exactAmount(maxKusd ?? wallet.kusdBalance, KUSD_TOKEN.decimals))}>
								{c.max}
							</button>
						</span>
					)}
				</div>
				<div className="flex items-center gap-3">
					<Input
						id="cashout-amount"
						inputMode="decimal"
						placeholder="0.0"
						value={input}
						aria-invalid={invalidAmount}
						disabled={busy}
						onChange={(e) => {
							setInput(e.target.value);
							setQuote(null);
							quoteSeqRef.current++; // a quote still in flight is for the old amount
						}}
						onBlur={() => void quoteFor(corridor)}
						className="min-w-0 flex-1 border-0 bg-transparent px-0 text-2xl font-semibold shadow-none focus-visible:ring-0"
					/>
					<span className="font-display text-lg font-semibold">{KUSD_TOKEN.symbol}</span>
				</div>
			</div>

			<div className="-my-3 flex justify-center">
				<span className="relative z-10 flex size-9 items-center justify-center rounded-full border border-line bg-surface-hi text-gold">
					<ArrowDown className="size-4" aria-hidden />
				</span>
			</div>

			<div className="rounded-xl border border-line bg-surface-alt p-4">
				<div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-deep">{c.youReceive}</div>
				<div className="flex items-center gap-3">
					<span className="min-w-0 flex-1 truncate text-2xl font-semibold tabular-nums">{plan ? showAmount(plan.gemAmt, GEM.decimals, fmt, 6) : '0.0'}</span>
					<span className="font-display text-lg font-semibold">{GEM.symbol}</span>
				</div>
			</div>

			<div className="mt-5 space-y-4">
				<Field id="cashout-country" label={b.country}>
					<Select
						value={corridorId}
						onValueChange={(id) => {
							setCorridorId(id);
							void quoteFor(corridors?.find((x) => x.channelId === id) ?? null);
						}}
						disabled={!corridors || busy}
					>
						<SelectTrigger id="cashout-country" className="border-line bg-surface-hi">
							<SelectValue placeholder={corridors ? b.countryPlaceholder : b.countriesLoading} />
						</SelectTrigger>
						<SelectContent>
							{corridors?.map((x) => (
								<SelectItem key={x.channelId} value={x.channelId}>
									{interpolate(b.corridorOption, { country: countryDisplayName(x.country, locale), currency: x.currency, rail: b.rail.momo })}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{channels.error && <p className="text-[12.5px] text-danger">{interpolate(b.countriesFailed, { error: cashoutErrorText(channels.error, dict) })}</p>}
				</Field>
				{corridor && (
					<>
						<Field id="cashout-operator" label={b.operator}>
							<Select value={networkId} onValueChange={setNetworkId} disabled={busy}>
								<SelectTrigger id="cashout-operator" className="border-line bg-surface-hi">
									<SelectValue placeholder={b.operatorPlaceholder} />
								</SelectTrigger>
								<SelectContent>
									{operators.map((n) => (
										<SelectItem key={n.id} value={n.id}>
											{n.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
						<Field id="cashout-momo-number" label={c.momoNumber}>
							<Input
								id="cashout-momo-number"
								inputMode="tel"
								value={momoNumber}
								disabled={busy}
								onChange={(e) => setMomoNumber(e.target.value)}
								placeholder="+225 07 01 23 45 67"
								className="border-line bg-surface-hi"
							/>
						</Field>
						<Field id="cashout-account-name" label={c.accountName}>
							<Input id="cashout-account-name" value={accountName} disabled={busy} onChange={(e) => setAccountName(e.target.value)} className="border-line bg-surface-hi" />
						</Field>
					</>
				)}
			</div>

			<dl className="mt-4 space-y-2 text-[13px]">
				{quote && corridor && quote.currency === corridor.currency && (
					<>
						<Row label={c.receive} value={interpolate(c.receiveValue, { amount: fmt.number(quote.receiveLocal), currency: quote.currency })} />
						<Row label={c.ycFee} value={interpolate(c.ycFeeValue, { amount: fmt.number(quote.feeLocal), currency: quote.currency })} />
					</>
				)}
				<Row label={c.rate} value={c.rateValue} />
				<Row label={dict.kusd.swap.fee} value={feeLabel} />
				<Row label={c.arrival} value={c.arrivalValue} />
				<Row label={c.available} value={available !== undefined ? usdtLimit(available) : '—'} />
			</dl>

			<div className="mt-5 space-y-3 border-t border-line pt-5">
				<div>
					<h3 className="font-display font-semibold">{b.details}</h3>
					<p className="text-[12.5px] text-muted-foreground">{b.detailsHint}</p>
				</div>
				<Input aria-label={b.name} placeholder={b.name} value={customer.name} disabled={busy} onChange={(e) => setCust({ name: e.target.value })} className="border-line bg-surface-hi" />
				<Input aria-label={b.email} placeholder={b.email} value={customer.email ?? ''} disabled={busy} onChange={(e) => setCust({ email: e.target.value })} className="border-line bg-surface-hi" />
				<Input aria-label={b.phone} placeholder={b.phone} value={customer.phone ?? ''} disabled={busy} onChange={(e) => setCust({ phone: e.target.value })} className="border-line bg-surface-hi" />
				<Input aria-label={b.address} placeholder={b.address} value={customer.address ?? ''} disabled={busy} onChange={(e) => setCust({ address: e.target.value })} className="border-line bg-surface-hi" />
				<Input aria-label={b.dob} placeholder={b.dob} value={customer.dob ?? ''} disabled={busy} onChange={(e) => setCust({ dob: e.target.value })} className="border-line bg-surface-hi" />
				<div className="grid gap-3 sm:grid-cols-2">
					<Input aria-label={b.idType} placeholder={b.idType} value={customer.idType ?? ''} disabled={busy} onChange={(e) => setCust({ idType: e.target.value })} className="border-line bg-surface-hi" />
					<Input aria-label={b.idNumber} placeholder={b.idNumber} value={customer.idNumber ?? ''} disabled={busy} onChange={(e) => setCust({ idNumber: e.target.value })} className="border-line bg-surface-hi" />
				</div>
				{kycExtra && (
					<div className="grid gap-3 sm:grid-cols-2">
						<Input
							aria-label={b.kycExtras[kycExtra].label}
							placeholder={b.kycExtras[kycExtra].label}
							value={customer.additionalIdType ?? ''}
							disabled={busy}
							onChange={(e) => setCust({ additionalIdType: e.target.value })}
							className="border-line bg-surface-hi"
						/>
						<Input
							aria-label={b.kycExtras[kycExtra].number}
							placeholder={b.kycExtras[kycExtra].number}
							value={customer.additionalIdNumber ?? ''}
							disabled={busy}
							onChange={(e) => setCust({ additionalIdNumber: e.target.value })}
							className="border-line bg-surface-hi"
						/>
					</div>
				)}
			</div>

			{(shown || rounded) && (
				<p role={shown ? 'alert' : undefined} className={shown ? 'mt-3 text-[12.5px] text-danger' : 'mt-3 text-[12.5px] text-muted-foreground'}>
					{shown ?? interpolate(c.rounded, { amount: plan ? showAmount(plan.cost, KUSD_TOKEN.decimals, fmt, 6) : '' })}
				</p>
			)}

			<div className="mt-5">
				{!address ? (
					<ClientOnlyConnectWallet className="w-full" />
				) : (
					<Button className="w-full" disabled={!ready || busy} onClick={run}>
						{busy && <Loader2 className="animate-spin" aria-hidden />}
						{busy && label ? label : plan ? c.cashout : c.enterAmount}
					</Button>
				)}
			</div>
		</div>
	);
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-3">
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="font-semibold tabular-nums">{value}</dd>
		</div>
	);
}
```

In `src/i18n/dictionaries/en/kusd.ts`, replace the whole `cashout: { … }` section with:
```ts
	cashout: {
		subtitle:
			'Cash out KUSD to mobile money. Your KUSD is swapped 1:1 for USDT and sent over the KalySwap bridge to Yellow Card, which pays your number in local currency — usually within 15 minutes.',
		amount: 'You cash out',
		balance: 'Balance: {amount}',
		max: 'Max',
		youReceive: 'Sent to Yellow Card',
		momoNumber: 'Mobile money number that receives the money',
		accountName: 'Name on the mobile money account',
		receive: 'You receive',
		receiveValue: '≈ {amount} {currency}',
		ycFee: 'Yellow Card fee',
		ycFeeValue: '{amount} {currency} (included)',
		rate: 'Rate',
		rateValue: '1 KUSD = 1 USDT',
		arrival: 'Arrival',
		arrivalValue: '~10–15 min',
		available: 'Available to cash out',
		insufficient: 'Insufficient KUSD balance',
		overPocket: 'The PSM can pay out only {amount} right now.',
		overCollateral: 'Only {amount} can be cashed out right now. Try a smaller amount, or try again later.',
		belowMin: 'The minimum cash-out is ${min}.',
		aboveMax: 'The maximum cash-out is ${max}.',
		invalidMomoNumber: 'Enter a valid mobile money number — your local number or international format (e.g. +2250701234567)',
		invalidAccountName: 'Enter the name on the mobile money account',
		badResponse: 'The cash-out service sent back an unexpected answer. Nothing was sent — please try again.',
		halted: 'Cash-outs are paused.',
		rounded: 'USDT has 6 decimals, so {amount} KUSD will be used.',
		steps: {
			approve: 'Approve KUSD',
			swap: 'Swap KUSD for USDT',
			bridge: 'Send USDT to Yellow Card',
		},
		progress: '{step} ({n}/{total})…',
		cashout: 'Cash out',
		enterAmount: 'Enter an amount',
		sent: 'Sent {amount} USDT to Yellow Card',
		status: {
			untracked: 'On its way to Yellow Card — usually 8–10 minutes. Use the links below to follow it.',
			pending: 'On its way to Yellow Card — usually 8–10 minutes. You can close this page; the payout continues.',
			delivered: 'Arrived at Yellow Card — paying your mobile money now.',
			slow: 'Still on its way. You can close this page; the payout continues.',
		},
		payout: {
			paid: 'Paid to your mobile money: {amount} {currency} sent to {number}',
			paidNoAmount: 'Paid to your mobile money ({number})',
			failed: 'Yellow Card could not pay this number. It returns your USDT to your wallet address on Polygon.',
			expired: 'This cash-out expired before the USDT reached Yellow Card. Yellow Card returns any USDT that arrives late to your wallet address on Polygon.',
		},
		viewTx: 'View the transfer on KalyScan',
		viewPolygon: 'View the payment to Yellow Card on PolygonScan',
		resumeTitle: 'Your USDT is in your wallet on KalyChain',
		resumeBody: 'The swap went through, but the transfer to Yellow Card did not. Send it now to the same mobile money number:',
		resume: 'Send {amount} USDT to Yellow Card',
		resumeMissing: 'Your wallet no longer holds {amount} USDT on KalyChain.',
		failed: 'Cash-out failed',
		again: 'New cash-out',
		errors: {
			paused: 'Cash-outs are temporarily paused. Please try again later.',
			notFound: 'Cash-out not found.',
		},
	},
```
In `src/i18n/dictionaries/fr/kusd.ts`, replace its `cashout: { … }` section with:
```ts
	cashout: {
		subtitle:
			'Retirez vos KUSD vers le mobile money. Vos KUSD sont échangés 1:1 contre des USDT et envoyés par le pont KalySwap à Yellow Card, qui paie votre numéro en monnaie locale — généralement en moins de 15 minutes.',
		amount: 'Vous retirez',
		balance: 'Solde : {amount}',
		max: 'Max',
		youReceive: 'Envoyé à Yellow Card',
		momoNumber: 'Numéro mobile money qui reçoit l’argent',
		accountName: 'Nom du titulaire du compte mobile money',
		receive: 'Vous recevez',
		receiveValue: '≈ {amount} {currency}',
		ycFee: 'Frais Yellow Card',
		ycFeeValue: '{amount} {currency} (inclus)',
		rate: 'Taux',
		rateValue: '1 KUSD = 1 USDT',
		arrival: 'Arrivée',
		arrivalValue: '~10 à 15 min',
		available: 'Disponible au retrait',
		insufficient: 'Solde KUSD insuffisant',
		overPocket: 'Le PSM ne peut verser que {amount} pour le moment.',
		overCollateral: 'Seulement {amount} peuvent être retirés pour le moment. Essayez un montant plus petit, ou réessayez plus tard.',
		belowMin: 'Le retrait minimum est de {min} $.',
		aboveMax: 'Le retrait maximum est de {max} $.',
		invalidMomoNumber: 'Saisissez un numéro mobile money valide — votre numéro local ou au format international (ex. +2250701234567)',
		invalidAccountName: 'Saisissez le nom du titulaire du compte mobile money',
		badResponse: 'Le service de retrait a renvoyé une réponse inattendue. Rien n’a été envoyé — veuillez réessayer.',
		halted: 'Les retraits sont suspendus.',
		rounded: 'USDT a 6 décimales, donc {amount} KUSD seront utilisés.',
		steps: {
			approve: 'Approuver les KUSD',
			swap: 'Échanger les KUSD contre des USDT',
			bridge: 'Envoyer les USDT à Yellow Card',
		},
		progress: '{step} ({n}/{total})…',
		cashout: 'Retirer',
		enterAmount: 'Saisissez un montant',
		sent: '{amount} USDT envoyés à Yellow Card',
		status: {
			untracked: 'En route vers Yellow Card — généralement 8 à 10 minutes. Suivez-le avec les liens ci-dessous.',
			pending: 'En route vers Yellow Card — généralement 8 à 10 minutes. Vous pouvez fermer cette page ; le paiement continue.',
			delivered: 'Arrivé chez Yellow Card — paiement de votre mobile money en cours.',
			slow: 'Toujours en route. Vous pouvez fermer cette page ; le paiement continue.',
		},
		payout: {
			paid: 'Payé sur votre mobile money : {amount} {currency} envoyés au {number}',
			paidNoAmount: 'Payé sur votre mobile money ({number})',
			failed: 'Yellow Card n’a pas pu payer ce numéro. Il renvoie vos USDT à votre adresse de portefeuille sur Polygon.',
			expired: 'Ce retrait a expiré avant que les USDT n’arrivent chez Yellow Card. Yellow Card renvoie les USDT arrivés en retard à votre adresse de portefeuille sur Polygon.',
		},
		viewTx: 'Voir le transfert sur KalyScan',
		viewPolygon: 'Voir le paiement à Yellow Card sur PolygonScan',
		resumeTitle: 'Vos USDT sont dans votre portefeuille sur KalyChain',
		resumeBody: "L'échange a abouti, mais pas l'envoi vers Yellow Card. Envoyez-les maintenant au même numéro mobile money :",
		resume: 'Envoyer {amount} USDT à Yellow Card',
		resumeMissing: 'Votre portefeuille ne détient plus {amount} USDT sur KalyChain.',
		failed: 'Échec du retrait',
		again: 'Nouveau retrait',
		errors: {
			paused: 'Les retraits sont temporairement suspendus. Veuillez réessayer plus tard.',
			notFound: 'Retrait introuvable.',
		},
	},
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/kusd src/i18n src/hooks && npx tsc --noEmit`
Expected: PASS (25 cases in `CashoutPanel.test.tsx`, counting the 4 `it.each` rows; the other kusd, i18n and hook tests unchanged), tsc clean.

- [ ] **Step 5: Mutation checks.** Make each change, confirm the named test FAILS, then revert it:
1. In `run`, pass a hard-coded address instead of `open.recipient` → "creates the Yellow Card payout … cashes out to its deposit address" fails.
2. Drop `!sameAmount` from the `UnexpectedPayoutError` check → the "a different amount" row fails.
3. In `resume`, bridge to the stranded error's old recipient instead of `open.recipient` → "resumes stranded USDT into a fresh payout" fails.

- [ ] **Step 6: Hand-off.** Do not stage or commit.

---

### Task 4: Sell label, and whole-branch verification

**Files:**
- Modify: `src/components/kusd/BuySellKusd.tsx`, `src/components/kusd/__tests__/BuySellKusd.test.tsx`
- Modify: `src/i18n/dictionaries/en/kusd.ts`, `src/i18n/dictionaries/fr/kusd.ts` (`buySell.sellMethods`)

**Interfaces:**
- Produces: Sell offers `usdt` ("USDT on KalyChain") and `mobileMoney` ("Mobile money").

- [ ] **Step 1: Update the failing test** — in `src/components/kusd/__tests__/BuySellKusd.test.tsx`, replace both uses of `t.sellMethods.yellowCard` with `t.sellMethods.mobileMoney`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/kusd/__tests__/BuySellKusd.test.tsx`
Expected: FAIL — `sellMethods.mobileMoney` is undefined.

- [ ] **Step 3: Implement**

`src/components/kusd/BuySellKusd.tsx`:
- `type SellMethod = 'usdt' | 'yellowCard';` → `type SellMethod = 'usdt' | 'mobileMoney';`
- `(['usdt', 'yellowCard'] as const)` → `(['usdt', 'mobileMoney'] as const)`
- `sellMethod === 'yellowCard' ?` → `sellMethod === 'mobileMoney' ?`
- the doc comment's second paragraph becomes: "Buying takes local currency (Yellow Card) or USDT (the PSM, 1:1). Selling is KUSD → USDT through the PSM on KalyChain, or KUSD → mobile money: the same swap, then the bridge straight to a Yellow Card payout."

`src/i18n/dictionaries/en/kusd.ts`: `sellMethods: { usdt: 'USDT on KalyChain', mobileMoney: 'Mobile money' },`
`src/i18n/dictionaries/fr/kusd.ts`: `sellMethods: { usdt: 'USDT sur KalyChain', mobileMoney: 'Mobile money' },`

- [ ] **Step 4: Whole branch**

```bash
grep -rn "yellowCard\|resumeConfirm\|resumeTo\|invalidAddress\|cashout\.confirm\|cashout\.address" src   # expect nothing
npm test 2>&1 | tail -15
npx tsc --noEmit
npm run lint
npm run build 2>&1 | tail -20
```
Expected:
- the grep prints nothing;
- every test passes;
- tsc and lint are clean;
- the build succeeds.

The existing fork test needs no change (the swap and bridge steps are untouched). It may be re-run on a fresh anvil (`anvil --fork-url https://mainrpc.kalychain.io/rpc --port 8555 --auto-impersonate`, then `KUSD_FORK_RPC=http://127.0.0.1:8555 npx vitest run src/utils/__tests__/kusdPlans.fork.test.ts`). Stop anvil by its PID from `ss -ltnp | grep 8555`.

- [ ] **Step 5: Browser smoke test (read-only, only once the keeper's withdraw API is deployed, with the user's go).**
1. Open `https://kalyswap.localhost/kusd` → Sell → Mobile money with agent-browser (`--ignore-https-errors --args --no-sandbox`).
2. Confirm the corridor list loads from the live keeper, a quote shows after typing an amount, and EN and FR read correctly.
3. Do not click Cash out. The first real payout is the spec §7 live test, done with the user and the boss.

- [ ] **Step 6: Hand-off.** Report the test count, the build and the smoke-test result to the user. Do not stage or commit.
