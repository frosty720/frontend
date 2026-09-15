'use client';

import { BridgeCard } from '@/components/bridge/BridgeCard';
import { TransferHistory } from '@/components/bridge/TransferStatus';
import { PageHeader } from '@/components/primitives/PageHeader';
import { TransferStoreProvider } from '@/hooks/bridge/useTransferStore';
import { useDict } from '@/i18n/hooks';

/** Bridge page in the app layout: bridge form left, transfer history right (same split as Swap). */
export default function BridgePage() {
	const dict = useDict();
	return (
		<TransferStoreProvider>
			<PageHeader title={dict.pages.bridge.title} subtitle={dict.pages.bridge.subtitle} />
			<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,520px)_minmax(0,530px)] xl:justify-between">
				<div className="min-w-0">
					<BridgeCard />
				</div>
				<div className="min-w-0">
					<TransferHistory className="w-full" />
				</div>
			</div>
		</TransferStoreProvider>
	);
}
