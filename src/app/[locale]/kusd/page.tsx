'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import BuySellKusd from '@/components/kusd/BuySellKusd';
import { PageHeader } from '@/components/primitives/PageHeader';
import { useDict } from '@/i18n/hooks';
import { isRampDepositId } from '@/lib/ramp';

/** Buy / Sell KUSD, in the layout of the boss's design mock. Savings and the dashboard live on the Lend page. */
export default function KusdPage() {
	// useSearchParams needs a Suspense boundary under the App Router.
	return (
		<Suspense>
			<KusdPageContent />
		</Suspense>
	);
}

function KusdPageContent() {
	const dict = useDict();
	const params = useSearchParams();
	// ?deposit=<id> is where Yellow Card's hosted payment (e.g. Wave) sends the customer back to.
	const depositParam = params.get('deposit');
	const depositId = depositParam && isRampDepositId(depositParam) ? depositParam : undefined;
	// kusd.kalychain.io links "Swap USDT for KUSD" here as ?tab=swap.
	const initialMethod = !depositId && params.get('tab') === 'swap' ? 'usdt' : 'local';

	return (
		<>
			<PageHeader title={dict.pages.kusd.title} subtitle={dict.pages.kusd.subtitle} />
			<BuySellKusd initialDepositId={depositId} initialMethod={initialMethod} />
		</>
	);
}
