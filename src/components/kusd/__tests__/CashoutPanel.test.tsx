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
let kusdBalance = 500n * WAD;
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
	usePsmWallet: () => ({ data: { gemBalance, gemAllowance: 0n, kusdBalance, kusdAllowance: 0n } }),
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
	kusdBalance = 500n * WAD;
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

	it('blocks a cash-out above what Polygon can release, without ever showing the limit', () => {
		renderPanel();
		typeAmount('200');
		expect(screen.getByRole('alert').textContent).toBe(t.overLimit);
		expect(button().disabled).toBe(true);
		expect(screen.queryByText(/194/)).toBeNull();
	});

	it('says the same, without the number, when the PSM cannot pay it out', () => {
		collateral = 2_000n * USDT;
		kusdBalance = 2_000n * WAD;
		renderPanel();
		typeAmount('1500'); // the PSM pocket holds 1,419 USDT
		expect(screen.getByRole('alert').textContent).toBe(t.overLimit);
		expect(screen.queryByText(/1,419/)).toBeNull();
	});

	it('refuses an amount under the keeper\'s minimum', async () => {
		renderPanel();
		typeAmount('2');
		expect(await screen.findByText(interpolate(t.belowMin, { min: '5' }))).toBeTruthy();
		expect(button().disabled).toBe(true);
	});

	it('cashes out whole cents only, and says how much KUSD that uses', async () => {
		cashout.mockResolvedValue(sentTo(DEPOSIT, 10_120_000n));
		renderPanel();
		await fill('10.129');
		expect(screen.getByText(interpolate(t.rounded, { amount: '10.12' }))).toBeTruthy();
		fireEvent.click(button());
		await waitFor(() => expect(cashout).toHaveBeenCalledTimes(1));
		expect(creates[0].usdAmount).toBe('10.12');
		expect(cashout.mock.calls[0][0]).toMatchObject({ plan: { gemAmt: 10_120_000n, cost: 10_120_000_000_000_000_000n } });
	});

	it('lets through anything up to the limit, to the cent', async () => {
		collateral = 386_099_040n; // 386.09904 USDT (wallet holds 500 KUSD)
		renderPanel();
		await fill('386.10');
		expect(screen.getByRole('alert')).toBeTruthy();
		typeAmount('386.09');
		expect(screen.queryByRole('alert')).toBeNull();
		expect(button().disabled).toBe(false);
	});

	it('Max fills the wallet balance, so it never reveals the limit', () => {
		renderPanel();
		fireEvent.click(screen.getByRole('button', { name: t.max }));
		expect((screen.getByLabelText(t.amount) as HTMLInputElement).value).toBe('500'); // balance 500 KUSD, limit 194 USDT
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
		['another currency', { currency: 'GHS' }],
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

	it('never reuses a pending key for a changed destination (a corrected number after a timeout)', async () => {
		cashout.mockResolvedValue(sentTo(DEPOSIT));
		onCreate = () => json({ error: 'keeper_unreachable' }, 504);
		renderPanel();
		await fill('50');
		fireEvent.click(button());
		await screen.findByText(b.errors.network);
		fireEvent.change(screen.getByLabelText(t.momoNumber), { target: { value: '07 09 99 99 99' } });
		onCreate = (body, n) => json(payout(body, n), 201);
		fireEvent.click(button());
		await waitFor(() => expect(cashout).toHaveBeenCalledTimes(1));
		expect(creates[1].momoNumber).toBe('+2250709999999');
		expect(creates[1].idempotencyKey).not.toBe(creates[0].idempotencyKey);
	});

	it('keeps the key, and sends nothing, while the keeper is still creating the payout', async () => {
		cashout.mockResolvedValue(sentTo(DEPOSIT));
		onCreate = () => json({ error: 'keeper_unreachable' }, 504);
		renderPanel();
		await fill('50');
		fireEvent.click(button());
		await screen.findByText(b.errors.network);
		onCreate = (body, n) => json(payout(body, n, { state: 'created', depositAddress: null }), 200);
		fireEvent.click(button());
		await screen.findByText(t.payoutPending);
		expect(cashout).not.toHaveBeenCalled();
		onCreate = (body, n) => json(payout(body, n), 200);
		fireEvent.click(button());
		await waitFor(() => expect(cashout).toHaveBeenCalledTimes(1));
		expect(new Set(creates.map((c) => c.idempotencyKey)).size).toBe(1);
	});

	it('does not bridge to a payout that waited too long in the wallet; the USDT is resumed into a fresh one', async () => {
		gemBalance = 50n * USDT;
		cashout.mockImplementationOnce(async (_args: unknown, onStep: (index: number, total: number, step: { action: string }) => void) => {
			// The wallet prompts stayed open 31 minutes; useCashout calls the bridge-step callback before sending and
			// strands the USDT when it throws (pinned in useCashout.test.tsx).
			const later = performance.now() + 31 * 60_000;
			const clock = vi.spyOn(performance, 'now').mockReturnValue(later);
			try {
				onStep(2, 3, { action: 'bridgeTransfer' });
			} catch (error) {
				throw new CashoutStrandedError(50n * USDT, DEPOSIT, error);
			} finally {
				clock.mockRestore();
			}
			return sentTo(DEPOSIT);
		});
		resumeBridge.mockResolvedValue(sentTo(DEPOSIT2));
		renderPanel();
		await fill('50');
		fireEvent.click(button());
		await waitFor(() => expect(toastError).toHaveBeenCalledWith(t.failed, en.errors.cashoutPayoutStale));
		fireEvent.click(await resumeButton(50));
		await waitFor(() => expect(resumeBridge).toHaveBeenCalledWith({ gemAmt: 50n * USDT, recipient: DEPOSIT2 }, expect.any(Function)));
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
