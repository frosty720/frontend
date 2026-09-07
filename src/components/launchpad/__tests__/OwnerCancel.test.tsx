/**
 * @vitest-environment jsdom
 *
 * The owner's Cancel button was a placebo: a 2-second setTimeout followed by
 * onRefresh(), with nothing sent on-chain. The owner believed the sale was cancelled.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const writeContract = vi.fn().mockResolvedValue('0xhash');
const waitForTransactionReceipt = vi.fn().mockResolvedValue({ status: 'success' });
const OWNER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const CONTRACT = '0x1111111111111111111111111111111111111111';

vi.mock('wagmi', () => ({
	useAccount: () => ({ address: OWNER, isConnected: true }),
	useWalletClient: () => ({ data: { chain: { id: 3890 }, writeContract } }),
	usePublicClient: () => ({ waitForTransactionReceipt }),
}));
vi.mock('@/hooks/useWallet', () => ({
	useWallet: () => ({ isConnected: true, address: OWNER }),
}));
vi.mock('@/lib/logger', () => ({
	launchpadLogger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import ProjectOwnerControls from '../ProjectOwnerControls';

function renderControls(type: 'presale' | 'fairlaunch') {
	const projectData: any = {
		contractAddress: CONTRACT,
		owner: OWNER,
		type,
		dexVersion: 'v3',
		status: 'Active',
		isActive: true,
		finalized: false,
	};
	return render(<ProjectOwnerControls projectData={projectData} onRefresh={vi.fn()} />);
}

describe('owner Cancel', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(window, 'alert').mockImplementation(() => {});
		waitForTransactionReceipt.mockResolvedValue({ status: 'success' });
	});

	it('actually sends cancelPresale for a presale', async () => {
		renderControls('presale');
		fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

		await waitFor(() => expect(writeContract).toHaveBeenCalled());
		const call = writeContract.mock.calls[0][0];
		expect(call.functionName).toBe('cancelPresale');
		expect(call.address).toBe(CONTRACT);
	});

	it('sends cancelFairlaunch for a fairlaunch', async () => {
		renderControls('fairlaunch');
		fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

		await waitFor(() => expect(writeContract).toHaveBeenCalled());
		expect(writeContract.mock.calls[0][0].functionName).toBe('cancelFairlaunch');
	});

	it('carries the KalyChain gas floor', async () => {
		renderControls('presale');
		fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

		await waitFor(() => expect(writeContract).toHaveBeenCalled());
		expect(writeContract.mock.calls[0][0].maxPriorityFeePerGas).toBe(21_000_000_000n);
	});

	it('reports failure instead of claiming the sale was cancelled', async () => {
		waitForTransactionReceipt.mockResolvedValue({ status: 'reverted' });
		const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
		renderControls('presale');
		fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

		await waitFor(() => expect(alertSpy).toHaveBeenCalled());
		expect(alertSpy.mock.calls[0][0]).toMatch(/Cancel failed/);
	});
});
