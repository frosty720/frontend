/**
 * @vitest-environment jsdom
 *
 * Claim-all sends one transaction per step, in order, and must stop at the first failure — a later
 * claim must never go out after an earlier one failed — while naming the failed step to the user.
 */
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';
import type { ClaimStep } from '@/utils/dashboard';
import { TransactionRevertedError } from '@/utils/transactions';

const toast = { success: vi.fn(), error: vi.fn() };
vi.mock('@/components/ui/toast', () => ({ useToast: () => toast }));

import ClaimAllButton from '../ClaimAllButton';

const STEPS: ClaimStep[] = [{ kind: 'staking' }, { kind: 'farm', token: '0xaaaa', amount: 5n }, { kind: 'vaults', ids: [1n, 2n] }];
const LABELS: Record<ClaimStep['kind'], string> = { staking: 'KMT staking rewards', farm: 'KMT farm rewards', vaults: 'vault rewards' };
const label = (step: ClaimStep) => LABELS[step.kind];

function renderButton(props: { steps?: ClaimStep[]; usd?: number | null; execute?: (step: ClaimStep) => Promise<void>; onFinished?: () => void }) {
	const execute = props.execute ?? vi.fn(async () => undefined);
	const onFinished = props.onFinished ?? vi.fn();
	render(
		<DictionaryProvider dict={en} locale="en">
			<ClaimAllButton steps={props.steps ?? STEPS} usd={props.usd === undefined ? 12.34 : props.usd} label={label} execute={execute} onFinished={onFinished} />
		</DictionaryProvider>,
	);
	return { execute, onFinished };
}

describe('ClaimAllButton', () => {
	beforeEach(() => {
		toast.success.mockClear();
		toast.error.mockClear();
	});
	afterEach(cleanup);

	it('is disabled with nothing to claim', () => {
		const { execute } = renderButton({ steps: [] });
		const button = screen.getByRole('button', { name: en.yields.claimNothing }) as HTMLButtonElement;
		expect(button.disabled).toBe(true);
		fireEvent.click(button);
		expect(execute).not.toHaveBeenCalled();
	});

	it('shows the USD total when every claimable is priced, and plain "Claim all" when not', () => {
		renderButton({});
		expect(screen.getByRole('button', { name: 'Claim ≈ $12.34' })).toBeTruthy();
		cleanup();
		renderButton({ usd: null });
		expect(screen.getByRole('button', { name: en.yields.claimAll })).toBeTruthy();
	});

	it('runs every step in order, reports progress, then toasts success and refreshes', async () => {
		const order: string[] = [];
		let release: () => void = () => undefined;
		const execute = vi.fn((step: ClaimStep) => {
			order.push(step.kind);
			if (step.kind !== 'staking') return Promise.resolve();
			return new Promise<void>((resolve) => {
				release = resolve;
			});
		});
		const { onFinished } = renderButton({ execute });
		fireEvent.click(screen.getByRole('button'));
		await waitFor(() => expect(screen.getByRole('button', { name: 'Claiming KMT staking rewards… (1/3)' })).toBeTruthy());
		expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
		release();
		await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));
		expect(order).toEqual(['staking', 'farm', 'vaults']);
		expect(toast.success).toHaveBeenCalledWith(en.yields.claimDone);
		expect(toast.error).not.toHaveBeenCalled();
	});

	it('stops at the first failure, names the step, and still refreshes', async () => {
		const execute = vi.fn(async (step: ClaimStep) => {
			if (step.kind === 'farm') throw new TransactionRevertedError('0xhash', 'claimReward');
		});
		const { onFinished } = renderButton({ execute });
		fireEvent.click(screen.getByRole('button'));
		await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));
		expect(execute).toHaveBeenCalledTimes(2);
		expect(execute).not.toHaveBeenCalledWith(STEPS[2]);
		expect(toast.error).toHaveBeenCalledWith('Claim stopped at KMT farm rewards', 'Claim reward failed: the transaction was reverted on-chain.');
		expect(toast.success).not.toHaveBeenCalled();
	});
});
