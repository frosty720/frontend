'use client';

import { Wallet } from 'lucide-react';
import { ClientOnlyConnectWallet } from '@/components/wallet/ClientOnlyConnectWallet';
import { useDict } from '@/i18n/hooks';
import { EmptyState } from './EmptyState';
import { Panel } from './Panel';

export function ConnectPrompt({ body }: { body?: string }) {
	const dict = useDict();
	return (
		<Panel>
			<EmptyState icon={Wallet} title={dict.common.connectWallet} body={body ?? dict.common.connectBody} action={<ClientOnlyConnectWallet />} />
		</Panel>
	);
}
