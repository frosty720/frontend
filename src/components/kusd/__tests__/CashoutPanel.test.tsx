/**
 * @vitest-environment jsdom
 *
 * Cash-out to Yellow Card. Money-safety rules: nothing is sent while the Polygon side of the route
 * holds less USDT than the cash-out (or is unknown), nothing is sent to an unconfirmed or malformed
 * address, editing the address un-confirms it, a double click never starts two cash-outs, and when the
 * hook reports the USDT stranded (swap mined, bridge not sent) the user is offered the bridge step
 * alone — to the address currently shown and confirmed, and only while the wallet still holds it.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';
import { CashoutStrandedError } from '@/utils/kusdCashout';

const WALLET = '0x1111111111111111111111111111111111111111';
const YC = '0x52908400098527886E0F7030069857D2E4169EE7';
const YC2 = '0x2222222222222222222222222222222222222222';
const USDT = 10n ** 6n;
const WAD = 10n ** 18n;
let collateral: bigint | undefined;
let gemBalance = 0n;
let tout = 0n;
const cashout = vi.fn();
const resumeBridge = vi.fn();
const toastError = vi.fn();

vi.mock('wagmi', () => ({ useAccount: () => ({ address: WALLET }) }));
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

import CashoutPanel from '../CashoutPanel';

const t = en.kusd.cashout;
const button = () => screen.getByRole('button', { name: new RegExp(`^(${t.cashout}|${t.enterAmount})$`) }) as HTMLButtonElement;

function fill(amount: string, address = YC, confirm = true) {
	fireEvent.change(screen.getByLabelText(t.amount), { target: { value: amount } });
	fireEvent.change(screen.getByLabelText(t.address), { target: { value: address } });
	if (confirm) fireEvent.click(screen.getByLabelText(t.confirm));
}

function renderPanel(onBusyChange?: (busy: boolean) => void) {
	render(
		<DictionaryProvider dict={en} locale="en">
			<CashoutPanel onBusyChange={onBusyChange} />
		</DictionaryProvider>,
	);
}

beforeEach(() => {
	collateral = 194n * USDT;
	gemBalance = 0n;
	tout = 0n;
	cashout.mockReset();
	resumeBridge.mockReset();
	toastError.mockReset();
	render(
		<DictionaryProvider dict={en} locale="en">
			<CashoutPanel />
		</DictionaryProvider>,
	);
});
afterEach(cleanup);

describe('CashoutPanel', () => {
	it('blocks a cash-out above the USDT on the Polygon side, and names the limit', () => {
		fill('200');
		expect(screen.getByRole('alert').textContent).toContain('194');
		expect(button().disabled).toBe(true);
	});

	it('needs a valid address and the confirmation tick; editing the address un-ticks it', () => {
		fill('50', '0x1234', false);
		expect(screen.getByRole('alert').textContent).toBe(t.invalidAddress);
		fireEvent.change(screen.getByLabelText(t.address), { target: { value: YC } });
		expect(button().disabled).toBe(true);
		fireEvent.click(screen.getByLabelText(t.confirm));
		expect(button().disabled).toBe(false);
		fireEvent.change(screen.getByLabelText(t.address), { target: { value: YC.toLowerCase() } });
		expect((screen.getByLabelText(t.confirm) as HTMLInputElement).checked).toBe(false);
		expect(button().disabled).toBe(true);
	});

	it('notes when digits beyond USDT’s 6 decimals will not be spent', () => {
		fill('10.1234567');
		expect(screen.getByText(/USDT has 6 decimals/)).toBeTruthy();
	});

	it('sends the plan for the typed amount to the checksummed address, then shows the transfer', async () => {
		cashout.mockResolvedValue({ gemAmt: 50n * USDT, recipient: YC, hash: `0x${'cd'.repeat(32)}`, messageId: `0x${'ab'.repeat(32)}` });
		fill('50', YC.toLowerCase());
		fireEvent.click(button());
		await waitFor(() => expect(screen.getByText(t.status.pending)).toBeTruthy());
		expect(cashout.mock.calls[0][0]).toEqual({ plan: { gemAmt: 50n * USDT, cost: 50n * WAD }, recipient: YC, kusdAllowance: 0n });
	});

	it('starts one cash-out for a double click', async () => {
		cashout.mockReturnValue(new Promise(() => undefined)); // still in flight
		fill('50');
		fireEvent.click(button());
		fireEvent.click(button());
		await waitFor(() => expect(cashout).toHaveBeenCalledTimes(1));
		expect(cashout).toHaveBeenCalledTimes(1);
	});

	it('offers the bridge step alone, showing where it goes, when the hook reports the USDT stranded', async () => {
		gemBalance = 50n * USDT;
		cashout.mockRejectedValue(new CashoutStrandedError(50n * USDT, YC, new Error('User rejected the request.')));
		resumeBridge.mockResolvedValue({ gemAmt: 50n * USDT, recipient: YC, hash: `0x${'cd'.repeat(32)}`, messageId: null });
		fill('50');
		fireEvent.click(button());
		const resume = (await screen.findByRole('button', { name: /Send 50 USDT to Yellow Card/ })) as HTMLButtonElement;
		expect(screen.getByRole('alert').textContent).toContain(YC);
		fireEvent.click(resume);
		await waitFor(() => expect(resumeBridge).toHaveBeenCalledWith({ gemAmt: 50n * USDT, recipient: YC }, expect.any(Function)));
	});

	it('sends a resume to the corrected address once it is confirmed again', async () => {
		gemBalance = 50n * USDT;
		cashout.mockRejectedValue(new CashoutStrandedError(50n * USDT, YC, new Error('User rejected the request.')));
		resumeBridge.mockResolvedValue({ gemAmt: 50n * USDT, recipient: YC2, hash: `0x${'cd'.repeat(32)}`, messageId: null });
		fill('50');
		fireEvent.click(button());
		const resume = (await screen.findByRole('button', { name: /Send 50 USDT to Yellow Card/ })) as HTMLButtonElement;
		fireEvent.change(screen.getByLabelText(t.address), { target: { value: YC2 } });
		expect(resume.disabled).toBe(true); // not confirmed yet
		fireEvent.click(screen.getByLabelText(t.confirm));
		expect(screen.getByRole('alert').textContent).toContain(YC2);
		fireEvent.click(resume);
		await waitFor(() => expect(resumeBridge).toHaveBeenCalledWith({ gemAmt: 50n * USDT, recipient: YC2 }, expect.any(Function)));
	});

	it('keeps resume disabled when the wallet no longer holds the stranded USDT', async () => {
		gemBalance = 10n * USDT;
		cashout.mockRejectedValue(new CashoutStrandedError(50n * USDT, YC, new Error('User rejected the request.')));
		fill('50');
		fireEvent.click(button());
		const resume = (await screen.findByRole('button', { name: /Send 50 USDT to Yellow Card/ })) as HTMLButtonElement;
		expect(resume.disabled).toBe(true);
	});

	it('does not offer a resume for a failure that left nothing stranded', async () => {
		gemBalance = 50n * USDT;
		cashout.mockRejectedValue(new Error('User rejected the request.'));
		fill('50');
		fireEvent.click(button());
		await waitFor(() => expect(toastError).toHaveBeenCalled());
		expect(screen.queryByRole('button', { name: /Send 50 USDT to Yellow Card/ })).toBeNull();
	});

	it('sends one resume for a double click', async () => {
		gemBalance = 50n * USDT;
		cashout.mockRejectedValue(new CashoutStrandedError(50n * USDT, YC, new Error('User rejected the request.')));
		resumeBridge.mockReturnValue(new Promise(() => undefined));
		fill('50');
		fireEvent.click(button());
		const resume = await screen.findByRole('button', { name: /Send 50 USDT to Yellow Card/ });
		fireEvent.click(resume);
		fireEvent.click(resume);
		await waitFor(() => expect(resumeBridge).toHaveBeenCalledTimes(1));
		expect(resumeBridge).toHaveBeenCalledTimes(1);
	});

	it('names the Polygon limit rounded down, so typing the number shown goes through', () => {
		cleanup();
		collateral = 386_099_040n; // 386.09904 USDT (wallet holds 500 KUSD)
		renderPanel();
		fill('400');
		expect(screen.getByRole('alert').textContent).toContain('386.09 USDT');
		fireEvent.change(screen.getByLabelText(t.amount), { target: { value: '386.09' } });
		expect(screen.queryByRole('alert')).toBeNull();
		expect(button().disabled).toBe(false);
	});

	it('Max fills the most that can go out now: the smaller of the KUSD balance and the Polygon limit', () => {
		fireEvent.click(screen.getByRole('button', { name: t.max }));
		expect((screen.getByLabelText(t.amount) as HTMLInputElement).value).toBe('194'); // balance 500 KUSD, limit 194 USDT
	});

	it('shows the PSM fee, and none when it is zero', () => {
		expect(screen.getByText(en.kusd.swap.noFee)).toBeTruthy();
		cleanup();
		tout = WAD / 100n; // 1%
		renderPanel();
		expect(screen.getByText('1%')).toBeTruthy();
	});

	it('adds a second stranded amount to the first, so one resume sends both', async () => {
		gemBalance = 80n * USDT;
		cashout.mockRejectedValueOnce(new CashoutStrandedError(50n * USDT, YC, new Error('User rejected the request.')));
		cashout.mockRejectedValueOnce(new CashoutStrandedError(30n * USDT, YC, new Error('User rejected the request.')));
		fill('50');
		fireEvent.click(button());
		await screen.findByRole('button', { name: /Send 50 USDT to Yellow Card/ });
		fireEvent.change(screen.getByLabelText(t.amount), { target: { value: '30' } });
		fireEvent.click(button());
		expect(await screen.findByRole('button', { name: /Send 80 USDT to Yellow Card/ })).toBeTruthy();
	});

	it('starts "New cash-out" from a blank form', async () => {
		cashout.mockResolvedValue({ gemAmt: 50n * USDT, recipient: YC, hash: `0x${'cd'.repeat(32)}`, messageId: null });
		fill('50');
		fireEvent.click(button());
		fireEvent.click(await screen.findByRole('button', { name: t.again }));
		expect((screen.getByLabelText(t.amount) as HTMLInputElement).value).toBe('');
		expect((screen.getByLabelText(t.address) as HTMLInputElement).value).toBe('');
		expect((screen.getByLabelText(t.confirm) as HTMLInputElement).checked).toBe(false);
	});

	it('tells the page it is busy for the whole flow, so the page can lock its tabs', async () => {
		cleanup();
		const onBusyChange = vi.fn();
		let finish: (value: unknown) => void = () => undefined;
		cashout.mockReturnValue(new Promise((resolve) => (finish = resolve)));
		renderPanel(onBusyChange);
		fill('50');
		fireEvent.click(button());
		expect(onBusyChange).toHaveBeenLastCalledWith(true);
		finish({ gemAmt: 50n * USDT, recipient: YC, hash: `0x${'cd'.repeat(32)}`, messageId: null });
		await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(false));
	});

	it('stays disabled while the Polygon collateral is unknown', () => {
		cleanup();
		collateral = undefined;
		render(
			<DictionaryProvider dict={en} locale="en">
				<CashoutPanel />
			</DictionaryProvider>,
		);
		fill('5');
		expect(button().disabled).toBe(true);
	});
});
