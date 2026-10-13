/**
 * @vitest-environment jsdom
 *
 * The asset list's pills: memes (all flagged unverified by Arcus) show none, while any other token
 * the router has not verified still carries the Unverified warning.
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';
import type { StockAsset } from '@/lib/stocks';
import StockList from '../StockList';

const asset = (symbol: string, group: StockAsset['group'], verified: boolean, address: `0x${string}`): StockAsset => ({
	address,
	symbol,
	name: `${symbol} token`,
	decimals: 18,
	group,
	verified,
});

const MEME = asset('CASHCAT', 'meme', false, '0x1111111111111111111111111111111111111111');
const ODD_STOCK = asset('ODD', 'stock', false, '0x2222222222222222222222222222222222222222');
const TSLA = asset('TSLA', 'stock', true, '0x3333333333333333333333333333333333333333');

function renderList(assets: StockAsset[]) {
	return render(
		<DictionaryProvider dict={en} locale="en">
			<StockList assets={assets} prices={{}} selected={undefined} onSelect={vi.fn()} loading={false} failed={false} onRetry={vi.fn()} />
		</DictionaryProvider>,
	);
}

const row = (symbol: string) => screen.getByText(symbol).closest('button') as HTMLElement;

afterEach(cleanup);

describe('StockList pills', () => {
	it('shows no Unverified pill on a meme', () => {
		renderList([MEME, ODD_STOCK, TSLA]);
		expect(within(row('CASHCAT')).queryByText(en.stocks.unverified)).toBeNull();
	});

	it('still flags an unverified token outside the memes', () => {
		renderList([MEME, ODD_STOCK, TSLA]);
		expect(within(row('ODD')).getByText(en.stocks.unverified)).toBeTruthy();
		expect(within(row('TSLA')).queryByText(en.stocks.unverified)).toBeNull();
	});
});
