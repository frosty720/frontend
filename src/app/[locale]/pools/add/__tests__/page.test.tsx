/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';

const USDT = '0x6318EcDbae6B469D39C38949eDC671f4bA8A6172';
const WKMT = '0xf90F0Bd56558Ac12F7FC285571D38181d2feD69b';
let search = new URLSearchParams();
let existing: Set<number> | undefined;
let formProps: { fee: number } | null = null;

vi.mock('next/navigation', () => ({ useSearchParams: () => search, useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/useResolvedChainId', () => ({ useResolvedChainId: () => 3890 }));
vi.mock('@/hooks/v3/useV3PoolState', () => ({ useV3ExistingFeeTiers: () => ({ data: existing }) }));
vi.mock('@/components/pools/TokenSelector', () => ({ default: ({ placeholder }: { placeholder: string }) => <div>{placeholder}</div> }));
vi.mock('@/components/liquidity/v3/V3AddLiquidity', () => ({
	default: (props: { fee: number }) => {
		formProps = props;
		return <div>form fee {props.fee}</div>;
	},
}));

import PoolsAddPage from '../page';

function renderPage() {
	render(
		<DictionaryProvider dict={en} locale="en">
			<PoolsAddPage />
		</DictionaryProvider>,
	);
}

describe('Add liquidity page', () => {
	beforeEach(() => {
		search = new URLSearchParams();
		existing = undefined;
		formProps = null;
	});
	afterEach(cleanup);

	it('offers every fee tier, defaulting to 0.3%', () => {
		renderPage();
		const tiers = screen.getAllByRole('radio');
		expect(tiers.map((tier) => tier.textContent?.match(/^[\d.]+%/)?.[0])).toEqual(['0.01%', '0.05%', '0.3%', '1%']);
		expect(tiers.map((tier) => tier.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true', 'false']);
	});

	it('labels which tiers already have a pool for the pair', () => {
		existing = new Set([3000]);
		renderPage();
		const tiers = screen.getAllByRole('radio');
		expect(tiers[2].textContent).toContain(en.liquidity.addPage.feeExists);
		expect(tiers[0].textContent).toContain(en.liquidity.addPage.feeNew);
	});

	it('opens the form at the tier from the pool link, and ignores unsupported tiers', () => {
		search = new URLSearchParams({ tokenA: USDT, tokenB: WKMT, fee: '500' });
		renderPage();
		expect(formProps?.fee).toBe(500);
		cleanup();
		search = new URLSearchParams({ tokenA: USDT, tokenB: WKMT, fee: '2500' });
		renderPage();
		expect(formProps?.fee).toBe(3000);
	});

	it('passes the picked tier to the deposit form', () => {
		search = new URLSearchParams({ tokenA: USDT, tokenB: WKMT });
		renderPage();
		fireEvent.click(screen.getByRole('button', { name: en.liquidity.addPage.back }));
		fireEvent.click(screen.getAllByRole('radio')[3]);
		fireEvent.click(screen.getByRole('button', { name: en.liquidity.addPage.continue }));
		expect(formProps?.fee).toBe(10000);
	});
});
