'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchRampWithdrawal, fetchRampWithdrawChannels, isTerminalWithdrawalState } from '@/lib/ramp';

const STATUS_POLL_MS = 5_000;

/**
 * Yellow Card's live mobile-money payout corridors, via the keeper (/ramp-api/withdraw-channels).
 * No retries: while the ramp is offline the form says so at once instead of spinning.
 */
export function useRampWithdrawChannels() {
	return useQuery({
		queryKey: ['rampWithdrawChannels'],
		queryFn: fetchRampWithdrawChannels,
		staleTime: 5 * 60_000,
		retry: false,
	});
}

/** A cash-out's payout status from the keeper (a database read there), every 5 s until it is final. */
export function useRampWithdrawal(withdrawalId: string | null) {
	return useQuery({
		queryKey: ['rampWithdrawal', withdrawalId],
		enabled: Boolean(withdrawalId),
		retry: false,
		queryFn: () => fetchRampWithdrawal(withdrawalId!),
		refetchInterval: (query) => (query.state.data && isTerminalWithdrawalState(String(query.state.data.state)) ? false : STATUS_POLL_MS),
	});
}
