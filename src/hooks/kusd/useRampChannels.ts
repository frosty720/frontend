'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchRampChannels } from '@/lib/ramp';

/**
 * Yellow Card's live deposit corridors, via the keeper (/ramp-api/channels). One query shared by the
 * buy form and the Buy/Sell page's payment-methods panel, so the page asks the keeper once.
 * No retries: while the ramp is offline the form says so at once instead of spinning.
 */
export function useRampChannels() {
	return useQuery({
		queryKey: ['rampChannels'],
		queryFn: fetchRampChannels,
		staleTime: 5 * 60_000,
		retry: false,
	});
}
