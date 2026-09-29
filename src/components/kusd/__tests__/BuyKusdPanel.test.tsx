/**
 * @vitest-environment jsdom
 *
 * Buying KUSD with local currency. The money-safety rule: a retry after an UNKNOWN outcome (the
 * keeper did not answer) must reuse the idempotency key so the keeper can dedupe instead of opening
 * a second Yellow Card payment; a definitive rejection starts a fresh attempt. Also: local phone
 * numbers go out in international format (the Burkina Faso regression), and a resumed deposit
 * (?deposit=) lands on its final screen.
 */
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';
import fr from '@/i18n/dictionaries/fr';

const WALLET = '0xfF409DBD66bD013385c41cb55D8cD90902BB4c80';
const replace = vi.fn();
let account: string | undefined = WALLET;

vi.mock('wagmi', () => ({ useAccount: () => ({ address: account }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }), usePathname: () => '/kusd' }));
// Radix Select needs pointer APIs jsdom lacks; a native select exercises the same value flow.
vi.mock('@/components/ui/select', () => {
	const Ctx = React.createContext<{ value: string; onValueChange: (v: string) => void; id?: string }>({ value: '', onValueChange: () => undefined });
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

import BuyKusdPanel from '../BuyKusdPanel';

const BF_MOMO = {
	channelId: 'bf-momo',
	country: 'BF',
	currency: 'XOF',
	channelType: 'momo',
	min: 1000,
	max: 5_000_000,
	estimatedSettlementTime: 5,
	networks: [{ id: 'net-mobicash', name: 'Mobicash', accountNumberType: 'phone' }],
};

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
let onDeposit: Handler;
let onStatus: Handler;
const deposits: Array<Record<string, unknown>> = [];

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
	account = WALLET;
	deposits.length = 0;
	replace.mockClear();
	onDeposit = () => json({ depositId: 'dep-00000001', state: 'awaiting_payment', fiatAmount: '5000', fiatCurrency: 'XOF' });
	onStatus = () => json({ depositId: 'dep-00000001', state: 'awaiting_payment' });
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
			const url = String(input);
			if (url === '/ramp-api/channels') return json({ corridors: [BF_MOMO], minDepositUsd: '5' });
			if (url.startsWith('/ramp-api/quote')) return json({ payoutUsd: '8.25' });
			if (url === '/ramp-api/deposits') {
				deposits.push(JSON.parse(String(init?.body)));
				return onDeposit(url, init);
			}
			if (url.startsWith('/ramp-api/deposits/')) return onStatus(url, init);
			throw new Error(`unexpected fetch ${url}`);
		}),
	);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function renderPanel(props: { initialDepositId?: string } = {}, dict = en, locale: 'en' | 'fr' = 'en') {
	// A fresh client per render: the corridor list is a shared query, and each test mocks its own keeper.
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<QueryClientProvider client={client}>
			<DictionaryProvider dict={dict} locale={locale}>
				<BuyKusdPanel {...props} />
			</DictionaryProvider>
		</QueryClientProvider>,
	);
}

async function fillForm() {
	await screen.findByText(/Burkina Faso — XOF \(mobile money\)/);
	fireEvent.change(screen.getByTestId('ramp-country'), { target: { value: 'bf-momo' } });
	fireEvent.change(await screen.findByLabelText(en.kusd.buy.momoPhone), { target: { value: '70 21 62 05' } });
	fireEvent.change(screen.getByLabelText(en.kusd.buy.amount), { target: { value: '5000' } });
	fireEvent.change(screen.getByLabelText(en.kusd.buy.name), { target: { value: 'Awa Ouédraogo' } });
	fireEvent.change(screen.getByLabelText(en.kusd.buy.phone), { target: { value: '70216205' } });
}
const submit = () => fireEvent.click(screen.getByRole('button', { name: en.kusd.buy.submit }));

describe('BuyKusdPanel', () => {
	it('lists corridors from the keeper with localized country names', async () => {
		renderPanel({}, fr, 'fr');
		expect(await screen.findByText('Burkina Faso — XOF (mobile money)')).toBeTruthy();
	});

	it('sends local phone numbers in international format, with the operator (the BF regression)', async () => {
		renderPanel();
		await fillForm();
		submit();
		await screen.findByText(en.kusd.buy.pay.titleMomo);
		expect(deposits).toHaveLength(1);
		const body = deposits[0] as { customer: { phone: string; country: string }; source: Record<string, string>; userWallet: string; channelId: string };
		expect(body.customer.phone).toBe('+22670216205');
		expect(body.customer.country).toBe('BF');
		expect(body.source).toEqual({ accountType: 'momo', accountNumber: '+22670216205', networkId: 'net-mobicash' });
		expect(body.userWallet).toBe(WALLET);
		expect(body.channelId).toBe('bf-momo');
	});

	it('sends the buyer\'s language, which picks the page Yellow Card returns them to', async () => {
		renderPanel({}, en, 'fr');
		await fillForm();
		submit();
		await screen.findByText(en.kusd.buy.pay.titleMomo);
		expect((deposits[0] as { locale?: string }).locale).toBe('fr');
	});

	it('REUSES the idempotency key after an unknown outcome (keeper unreachable) so a retry cannot pay twice', async () => {
		onDeposit = () => json({ error: 'keeper_unreachable' }, 504);
		renderPanel();
		await fillForm();
		submit();
		expect(await screen.findByText(en.kusd.buy.errors.network)).toBeTruthy();
		onDeposit = () => json({ depositId: 'dep-00000001', state: 'awaiting_payment' });
		submit();
		await screen.findByText(en.kusd.buy.pay.titleMomo);
		expect(deposits).toHaveLength(2);
		expect(deposits[1].idempotencyKey).toBe(deposits[0].idempotencyKey);
	});

	it('starts a FRESH attempt after a definitive rejection, and explains it', async () => {
		onDeposit = () => json({ error: 'amount_out_of_range' }, 422);
		renderPanel();
		await fillForm();
		submit();
		expect(await screen.findByText(en.kusd.buy.errors.amount_out_of_range)).toBeTruthy();
		submit();
		await waitFor(() => expect(deposits).toHaveLength(2));
		expect(deposits[1].idempotencyKey).not.toBe(deposits[0].idempotencyKey);
	});

	it('blocks submission without a payout wallet or a name', async () => {
		account = undefined;
		renderPanel();
		await fillForm();
		fireEvent.change(screen.getByLabelText(en.kusd.buy.wallet), { target: { value: '0x123' } });
		submit();
		expect(await screen.findByText(en.kusd.buy.invalid.wallet)).toBeTruthy();
		expect(deposits).toHaveLength(0);
	});

	it('resumes a returned deposit (?deposit=) on its final screen with the payout link', async () => {
		onStatus = () => json({ depositId: 'dep-00000001', state: 'paid', payoutTxHash: `0x${'ab'.repeat(32)}` });
		renderPanel({ initialDepositId: 'dep-00000001' });
		expect(await screen.findByText(en.kusd.buy.done.paid)).toBeTruthy();
		expect(screen.getByText(en.kusd.buy.done.viewTx).closest('a')?.getAttribute('href')).toContain(`/tx/0x${'ab'.repeat(32)}`);
		fireEvent.click(screen.getByRole('button', { name: en.kusd.buy.done.again }));
		expect(replace).toHaveBeenCalledWith('/kusd');
	});
});
