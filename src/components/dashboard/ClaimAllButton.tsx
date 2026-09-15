'use client';

import { useState } from 'react';
import { Gift, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { describeError } from '@/i18n/errorText';
import { useDict, useFormat } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { runClaimSteps, type ClaimStep } from '@/utils/dashboard';

export interface ClaimAllProps {
	steps: ClaimStep[];
	/** USD value of everything claimable; null when part of it has no price. */
	usd: number | null;
	/** Readable name of a step, e.g. "KMT staking rewards". */
	label: (step: ClaimStep) => string;
	/** Sends one step; must resolve only after its receipt succeeded. */
	execute: (step: ClaimStep) => Promise<void>;
	/** Runs after every attempt, complete or not, so balances refresh. */
	onFinished: () => void;
}

/** Claims every claimable reward, one transaction after another, stopping at the first failure. */
export default function ClaimAllButton({ steps, usd, label, execute, onFinished }: ClaimAllProps) {
	const dict = useDict();
	const fmt = useFormat();
	const toast = useToast();
	const y = dict.yields;
	const [running, setRunning] = useState<{ plan: ClaimStep[]; index: number } | null>(null);

	const start = async () => {
		const plan = steps;
		setRunning({ plan, index: 0 });
		const result = await runClaimSteps(plan, execute, (index) => setRunning({ plan, index }));
		setRunning(null);
		if (result.ok) {
			toast.success(y.claimDone);
		} else {
			toast.error(interpolate(y.claimStopped, { step: label(result.step) }), describeError(result.error, dict));
		}
		onFinished();
	};

	let text: string;
	if (running) {
		text = interpolate(y.claiming, {
			step: label(running.plan[running.index]),
			current: String(running.index + 1),
			total: String(running.plan.length),
		});
	} else if (steps.length === 0) {
		text = y.claimNothing;
	} else {
		text = usd !== null ? interpolate(y.claimUsd, { amount: fmt.usd(usd) }) : y.claimAll;
	}

	return (
		<Button size="lg" className="mt-4 w-full" onClick={start} disabled={running !== null || steps.length === 0}>
			{running ? <Loader2 className="animate-spin" aria-hidden /> : <Gift aria-hidden />}
			<span aria-live="polite">{text}</span>
		</Button>
	);
}
