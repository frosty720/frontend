/**
 * @vitest-environment jsdom
 *
 * Composition test for the restyled project detail page: the header renders the
 * project's name/status, the back link is locale-aware (useLocaleHref), the
 * participation form shows for a live sale, and the owner-only section is gated
 * by the existing ownership check (connected wallet === projectData.owner).
 */
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';
import { interpolate } from '@/i18n/interpolate';

const OWNER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const OTHER = '0x000000000000000000000000000000000000dEaD';
const CONTRACT = '0x1111111111111111111111111111111111111111';

let currentAddress = OWNER;
let projectData: Record<string, unknown>;
const refetch = vi.fn();

vi.mock('next/navigation', () => ({
	useParams: () => ({ address: CONTRACT }),
}));

vi.mock('@/hooks/launchpad/useProjectDetails', () => ({
	useProjectDetails: () => ({ projectData, loading: false, error: null, refetch }),
}));

vi.mock('wagmi', () => ({
	useAccount: () => ({ address: currentAddress, isConnected: true }),
	usePublicClient: () => ({
		getBalance: vi.fn().mockResolvedValue(0n),
		readContract: vi.fn().mockResolvedValue(0n),
		waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: 'success' }),
	}),
	useWalletClient: () => ({ data: { chain: { id: 3890 }, writeContract: vi.fn().mockResolvedValue('0xhash') } }),
}));

vi.mock('@/hooks/useWallet', () => ({
	useWallet: () => ({ isConnected: true, address: currentAddress }),
}));

vi.mock('@/hooks/launchpad/useParticipation', () => ({
	useParticipation: () => ({
		isLoading: false,
		error: null,
		transactionHash: null,
		userContribution: null,
		participate: vi.fn(),
		claimTokens: vi.fn(),
		claimRefund: vi.fn(),
		fetchUserContribution: vi.fn(),
		canParticipate: vi.fn(),
		getContributionLimits: vi.fn().mockResolvedValue({ min: '0.1', max: '10' }),
	}),
}));

vi.mock('@/lib/logger', () => ({
	launchpadLogger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('@/components/wallet/ClientOnlyConnectWallet', () => ({
	ClientOnlyConnectWallet: () => <button>connect-stub</button>,
}));

vi.mock('@/components/ui/toast', () => ({
	useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import ProjectDetailPage from '../page';

function renderPage() {
	return render(
		<DictionaryProvider dict={en} locale="en">
			<ProjectDetailPage />
		</DictionaryProvider>,
	);
}

function baseProject(overrides: Record<string, unknown> = {}) {
	return {
		id: '1',
		name: 'AfriPay',
		description: 'Mobile money on-chain',
		saleToken: '0x2222222222222222222222222222222222222222',
		baseToken: '0x0000000000000000000000000000000000000000',
		tokenRate: '20',
		softCap: '100000',
		hardCap: '900000',
		presaleStart: '2026-01-01T00:00:00Z',
		presaleEnd: '2026-02-01T00:00:00Z',
		contractAddress: CONTRACT,
		type: 'presale',
		status: 'Active',
		totalRaised: '0',
		totalParticipants: 0,
		isFinalized: false,
		owner: OWNER,
		cancelled: false,
		finalized: false,
		progress: 10,
		timeRemaining: 3600,
		isActive: true,
		canParticipate: true,
		...overrides,
	};
}

describe('launchpad project detail page', () => {
	beforeEach(() => {
		currentAddress = OWNER;
		refetch.mockClear();
	});
	afterEach(cleanup);

	it('renders the header with the project name, status, and a locale-aware back link', () => {
		projectData = baseProject();
		renderPage();

		expect(screen.getByRole('heading', { name: 'AfriPay' })).toBeTruthy();
		expect(screen.getAllByText(en.launchpadProject.statusActive).length).toBeGreaterThan(0);
		const back = screen.getByText(en.launchpadProject.back).closest('a');
		expect(back?.getAttribute('href')).toBe('/launchpad');
	});

	it('renders the participation form for a live, contributable sale', () => {
		projectData = baseProject({ canParticipate: true, type: 'presale' });
		renderPage();

		expect(
			screen.getByText(interpolate(en.launchpadProject.participation.title, { type: en.launchpad.typePresale })),
		).toBeTruthy();
	});

	it('shows owner controls only when the connected wallet is the project owner', () => {
		projectData = baseProject();
		renderPage();
		expect(screen.getByText(en.launchpadProject.owner.title)).toBeTruthy();

		cleanup();
		currentAddress = OTHER;
		renderPage();
		expect(screen.queryByText(en.launchpadProject.owner.title)).toBeNull();
	});
});
