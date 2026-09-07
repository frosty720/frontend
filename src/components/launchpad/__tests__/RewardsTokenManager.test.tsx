/**
 * @vitest-environment jsdom
 *
 * depositRewards() pulls the reward token with transferFrom, so the RewardsToken
 * contract — not the tracker, and not the router — is the spender needing an allowance.
 * It also reverts while the tracker has no eligible supply, which is the normal state
 * right after creation because the deployer holds everything and is excluded.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const writeContract = vi.fn().mockResolvedValue('0xhash');
const readContract = vi.fn();
const waitForTransactionReceipt = vi.fn().mockResolvedValue({ status: 'success' });

const USER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const TOKEN = '0x1111111111111111111111111111111111111111';
const REWARD = '0x6318EcDbae6B469D39C38949eDC671f4bA8A6172'; // USDT, 6 dp
const TRACKER = '0x2222222222222222222222222222222222222222';

vi.mock('wagmi', () => ({
	useAccount: () => ({ address: USER, isConnected: true }),
	useChainId: () => 3890,
	usePublicClient: () => ({ readContract, waitForTransactionReceipt }),
	useWalletClient: () => ({ data: { chain: { id: 3890 }, writeContract } }),
}));
vi.mock('thirdweb/react', () => ({
	useActiveAccount: () => undefined,
	useActiveWalletChain: () => undefined,
}));
vi.mock('@/lib/logger', () => ({
	launchpadLogger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import RewardsTokenManager from '../RewardsTokenManager';

function stubChain({ eligibleSupply, allowance, withdrawable = 0n }: {
	eligibleSupply: bigint; allowance: bigint; withdrawable?: bigint;
}) {
	readContract.mockImplementation(async ({ address, functionName }: any) => {
		switch (functionName) {
			case 'name': return 'Demo Rewards';
			case 'symbol': return address.toLowerCase() === REWARD.toLowerCase() ? 'USDT' : 'DEMO';
			case 'decimals': return address.toLowerCase() === REWARD.toLowerCase() ? 6 : 18;
			case 'rewardToken': return REWARD;
			case 'dividendTracker': return TRACKER;
			case 'totalRewardsDistributed': return 0n;
			case 'totalSupply': return eligibleSupply;   // the tracker's eligible supply
			case 'withdrawableRewardsOf': return withdrawable;
			case 'balanceOf': return 500_000_000n;       // 500 USDT
			case 'allowance': return allowance;
			default: throw new Error(`unexpected read: ${functionName}`);
		}
	});
}

const writes = () => writeContract.mock.calls.map((c) => c[0]);

describe('RewardsTokenManager', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		waitForTransactionReceipt.mockResolvedValue({ status: 'success' });
	});

	it('approves the RewardsToken contract as spender, then deposits', async () => {
		stubChain({ eligibleSupply: 1000n, allowance: 0n });
		render(<RewardsTokenManager tokenAddress={TOKEN} />);

		await waitFor(() => expect(screen.getByLabelText(/Amount to deposit/i)).toBeTruthy());
		fireEvent.change(screen.getByLabelText(/Amount to deposit/i), { target: { value: '25' } });
		fireEvent.click(screen.getByRole('button', { name: /Deposit USDT/i }));

		await waitFor(() => expect(writeContract).toHaveBeenCalledTimes(2));
		const [approve, deposit] = writes();
		expect(approve.functionName).toBe('approve');
		expect(approve.address).toBe(REWARD);
		expect(approve.args[0]).toBe(TOKEN); // the token contract, NOT the tracker
		expect(deposit.functionName).toBe('depositRewards');
		expect(deposit.address).toBe(TOKEN);
	});

	it('deposits in the REWARD token\'s decimals', async () => {
		stubChain({ eligibleSupply: 1000n, allowance: 0n });
		render(<RewardsTokenManager tokenAddress={TOKEN} />);

		await waitFor(() => expect(screen.getByLabelText(/Amount to deposit/i)).toBeTruthy());
		fireEvent.change(screen.getByLabelText(/Amount to deposit/i), { target: { value: '25' } });
		fireEvent.click(screen.getByRole('button', { name: /Deposit USDT/i }));

		await waitFor(() => expect(writeContract).toHaveBeenCalledTimes(2));
		// 25 USDT at 6 dp — not 25e18, and not the token's own 18 dp
		expect(writes()[1].args[0]).toBe(25_000_000n);
	});

	it('skips the approval when the allowance already covers it', async () => {
		stubChain({ eligibleSupply: 1000n, allowance: 100_000_000n });
		render(<RewardsTokenManager tokenAddress={TOKEN} />);

		await waitFor(() => expect(screen.getByLabelText(/Amount to deposit/i)).toBeTruthy());
		fireEvent.change(screen.getByLabelText(/Amount to deposit/i), { target: { value: '25' } });
		fireEvent.click(screen.getByRole('button', { name: /Deposit USDT/i }));

		await waitFor(() => expect(writeContract).toHaveBeenCalledTimes(1));
		expect(writes()[0].functionName).toBe('depositRewards');
	});

	it('explains and blocks the deposit while nobody is eligible', async () => {
		stubChain({ eligibleSupply: 0n, allowance: 0n });
		render(<RewardsTokenManager tokenAddress={TOKEN} />);

		await waitFor(() => expect(screen.getByText(/No eligible holders yet/i)).toBeTruthy());
		expect(screen.getByRole('button', { name: /Deposit USDT/i })).toHaveProperty('disabled', true);
	});

	it('does not deposit if the approval reverted', async () => {
		stubChain({ eligibleSupply: 1000n, allowance: 0n });
		waitForTransactionReceipt.mockResolvedValue({ status: 'reverted' });
		render(<RewardsTokenManager tokenAddress={TOKEN} />);

		await waitFor(() => expect(screen.getByLabelText(/Amount to deposit/i)).toBeTruthy());
		fireEvent.change(screen.getByLabelText(/Amount to deposit/i), { target: { value: '25' } });
		fireEvent.click(screen.getByRole('button', { name: /Deposit USDT/i }));

		await waitFor(() => expect(screen.getByText(/Approval failed/i)).toBeTruthy());
		expect(writes().map((c) => c.functionName)).toEqual(['approve']);
	});

	it('refuses an amount larger than the depositor\'s balance', async () => {
		stubChain({ eligibleSupply: 1000n, allowance: 0n });
		render(<RewardsTokenManager tokenAddress={TOKEN} />);

		await waitFor(() => expect(screen.getByLabelText(/Amount to deposit/i)).toBeTruthy());
		fireEvent.change(screen.getByLabelText(/Amount to deposit/i), { target: { value: '9999' } });
		fireEvent.click(screen.getByRole('button', { name: /Deposit USDT/i }));

		await waitFor(() => expect(screen.getByText(/Not enough USDT/i)).toBeTruthy());
		expect(writeContract).not.toHaveBeenCalled();
	});

	it('only enables Claim when something is actually claimable', async () => {
		stubChain({ eligibleSupply: 1000n, allowance: 0n, withdrawable: 0n });
		const { unmount } = render(<RewardsTokenManager tokenAddress={TOKEN} />);
		await waitFor(() => expect(screen.getByRole('button', { name: /Claim Rewards/i })).toBeTruthy());
		expect(screen.getByRole('button', { name: /Claim Rewards/i })).toHaveProperty('disabled', true);
		unmount();

		stubChain({ eligibleSupply: 1000n, allowance: 0n, withdrawable: 5_000_000n });
		render(<RewardsTokenManager tokenAddress={TOKEN} />);
		await waitFor(() =>
			expect(screen.getByRole('button', { name: /Claim Rewards/i })).toHaveProperty('disabled', false)
		);
	});

	it('carries the KalyChain gas floor on the deposit', async () => {
		stubChain({ eligibleSupply: 1000n, allowance: 100_000_000n });
		render(<RewardsTokenManager tokenAddress={TOKEN} />);

		await waitFor(() => expect(screen.getByLabelText(/Amount to deposit/i)).toBeTruthy());
		fireEvent.change(screen.getByLabelText(/Amount to deposit/i), { target: { value: '1' } });
		fireEvent.click(screen.getByRole('button', { name: /Deposit USDT/i }));

		await waitFor(() => expect(writeContract).toHaveBeenCalled());
		expect(writes()[0].maxPriorityFeePerGas).toBe(21_000_000_000n);
	});
});
