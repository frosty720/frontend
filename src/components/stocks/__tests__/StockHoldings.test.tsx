/**
 * @vitest-environment jsdom
 *
 * "Your holdings" shows USDG and ETH with their logos — both are bundled files, so a missing file
 * would show initials (or a broken image) instead.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';
import { USDG } from '@/config/stocks';
import StockHoldings from '../StockHoldings';

afterEach(cleanup);

const balances = { usdg: 12_500_000n, eth: 10n ** 15n, tokens: {}, wrapped: {} };

describe('StockHoldings currency rows', () => {
	it('shows the USDG and ETH logos', () => {
		render(
			<DictionaryProvider dict={en} locale="en">
				<StockHoldings assets={[]} prices={{}} balances={balances} onSelect={vi.fn()} />
			</DictionaryProvider>,
		);
		expect(screen.getByRole('img', { name: 'USDG' }).getAttribute('src')).toBe(USDG.logoURI);
		expect(screen.getByRole('img', { name: 'ETH' }).getAttribute('src')).toBe('/tokens/eth.png');
	});

	it('ships the USDG logo it points at', () => {
		expect(existsSync(path.join(process.cwd(), 'public', USDG.logoURI))).toBe(true);
	});
});
