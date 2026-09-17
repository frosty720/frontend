/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';
import fr from '@/i18n/dictionaries/fr';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => '/pools' }));
vi.mock('wagmi', () => ({ useAccount: () => ({ isConnected: false }) }));
vi.mock('@/hooks/useV3PoolDiscovery', () => ({
	useV3PoolDiscovery: () => ({ pools: [], allPools: [], userPoolsCount: 0, loading: false, error: null, searchTerm: '', setSearchTerm: vi.fn(), refetch: vi.fn() }),
}));
vi.mock('@/hooks/useTokenLists', () => ({ useTokenLists: () => ({ tokens: [] }) }));
vi.mock('@/hooks/useTokenUsdPrices', () => ({ useTokenUsdPrices: () => ({}) }));
vi.mock('@/hooks/usePool24hStats', () => ({ usePool24hStats: () => ({ data: {} }) }));
vi.mock('@/components/pools/PoolPositionsDialog', () => ({ default: () => null }));

import PoolsPage from '../page';

afterEach(() => {
	cleanup();
	push.mockClear();
});

describe('Pools page', () => {
	it('opens the new-position flow from the header, even with no pools yet', () => {
		render(
			<DictionaryProvider dict={en} locale="en">
				<PoolsPage />
			</DictionaryProvider>,
		);
		fireEvent.click(screen.getByRole('button', { name: en.liquidity.addPage.newPosition }));
		expect(push).toHaveBeenCalledWith('/pools/add');
	});

	it('keeps the locale prefix in French', () => {
		render(
			<DictionaryProvider dict={fr} locale="fr">
				<PoolsPage />
			</DictionaryProvider>,
		);
		fireEvent.click(screen.getByRole('button', { name: fr.liquidity.addPage.newPosition }));
		expect(push).toHaveBeenCalledWith('/fr/pools/add');
	});
});
