'use client';

import { useState } from 'react';
import { CreditCard } from 'lucide-react';
import { AlchemyPayWidget } from '@/components/onramp';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDict } from '@/i18n/hooks';

/** Top-bar card on-ramp: opens the AlchemyPay widget in a dialog. Icon-only below lg. */
export function BuyCryptoButton() {
	const dict = useDict();
	const [open, setOpen] = useState(false);

	return (
		<>
			<button
				type="button"
				aria-label={dict.shell.buyWithCard}
				title={dict.shell.buyWithCard}
				onClick={() => setOpen(true)}
				className="inline-flex items-center gap-2 rounded-[10px] border border-line bg-surface px-3 py-2 text-[13px] font-semibold text-gold transition-colors hover:text-gold-light"
			>
				<CreditCard className="size-4" />
				<span className="hidden lg:inline">{dict.shell.buyWithCard}</span>
			</button>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="max-w-[560px] border-line bg-surface">
					<DialogHeader>
						<DialogTitle>{dict.shell.buyWithCard}</DialogTitle>
					</DialogHeader>
					<AlchemyPayWidget defaultFiat="USD" defaultCrypto="KMT" defaultNetwork="KALYCHAIN" height={560} />
				</DialogContent>
			</Dialog>
		</>
	);
}
