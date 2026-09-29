'use client';

import { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import SavingsPanel from '@/components/kusd/SavingsPanel';
import AuctionsPanel from '@/components/lend/AuctionsPanel';
import BorrowPanel from '@/components/lend/BorrowPanel';
import DepositPanel from '@/components/lend/DepositPanel';
import LendDashboard from '@/components/lend/LendDashboard';
import MintPanel from '@/components/lend/MintPanel';
import WrapPanel from '@/components/lend/WrapPanel';
import { PageHeader } from '@/components/primitives/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDict } from '@/i18n/hooks';

/** kusd.kalychain.io's pages, in its order (Buy KUSD lives on /kusd). */
const TABS = ['dashboard', 'wrap', 'deposit', 'mint', 'borrow', 'auctions', 'savings'] as const;
type LendTab = (typeof TABS)[number];

function isLendTab(value: string | null): value is LendTab {
	return TABS.includes(value as LendTab);
}

/** Lend & Borrow: the KUSD protocol pages, one tab each; ?tab= (and ?ilk=) make every view linkable. */
export default function LendPage() {
	// useSearchParams needs a Suspense boundary under the App Router.
	return (
		<Suspense>
			<LendPageContent />
		</Suspense>
	);
}

function LendPageContent() {
	const dict = useDict();
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const tabParam = params.get('tab');
	const tab: LendTab = isLendTab(tabParam) ? tabParam : 'dashboard';

	// The URL is the tab state, so dashboard links (?tab=deposit&ilk=USDT-A) switch tabs too.
	const select = (value: string) => {
		if (isLendTab(value)) router.replace(`${pathname}?tab=${value}`, { scroll: false });
	};

	return (
		<>
			<PageHeader title={dict.pages.lend.title} subtitle={dict.pages.lend.subtitle} />
			<Tabs value={tab} onValueChange={select}>
				<TabsList className="mb-5 flex-wrap">
					{TABS.map((key) => (
						<TabsTrigger key={key} value={key}>
							{dict.lend.tabs[key]}
						</TabsTrigger>
					))}
				</TabsList>
				<TabsContent value="dashboard">
					<LendDashboard />
				</TabsContent>
				<TabsContent value="wrap">
					<WrapPanel />
				</TabsContent>
				<TabsContent value="deposit">
					<DepositPanel />
				</TabsContent>
				<TabsContent value="mint">
					<MintPanel />
				</TabsContent>
				<TabsContent value="borrow">
					<BorrowPanel />
				</TabsContent>
				<TabsContent value="auctions">
					<AuctionsPanel />
				</TabsContent>
				<TabsContent value="savings">
					<SavingsPanel />
				</TabsContent>
			</Tabs>
		</>
	);
}
