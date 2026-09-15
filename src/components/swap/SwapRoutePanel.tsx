'use client';

import { Fragment } from 'react';
import { ArrowRight } from 'lucide-react';
import { Panel } from '@/components/primitives/Panel';
import { TokenAvatar } from '@/components/primitives/TokenAvatar';
import type { Token } from '@/config/dex/types';
import { useDict } from '@/i18n/hooks';
import { routeHops } from '@/utils/swapDisplay';

interface SwapRoutePanelProps {
	fromToken: Token | null;
	toToken: Token | null;
	/** Token path of the current quote (addresses), or null before a quote exists. */
	route: string[] | null;
	tokens: Token[];
}

export default function SwapRoutePanel({ fromToken, toToken, route, tokens }: SwapRoutePanelProps) {
	const dict = useDict();
	const hops = routeHops(fromToken, toToken, route, tokens);

	return (
		<Panel title={dict.swap.routeTitle}>
			{hops.length > 0 && (
				<div className="flex flex-wrap items-center gap-2">
					{hops.map((hop, index) => (
						<Fragment key={`${hop.symbol}-${index}`}>
							{index > 0 && (
								<>
									<ArrowRight className="size-4 text-muted-foreground" aria-hidden />
									<span className="rounded-lg border border-line bg-surface-alt px-2.5 py-1 text-[12.5px] text-muted-foreground">
										{dict.swap.routeVenue}
									</span>
									<ArrowRight className="size-4 text-muted-foreground" aria-hidden />
								</>
							)}
							<span title={hop.symbol}>
								<TokenAvatar symbol={hop.symbol} logoURI={hop.logoURI} size={26} />
							</span>
						</Fragment>
					))}
				</div>
			)}
			<p className="mt-3 text-[12.5px] text-muted-deep">{route ? dict.swap.routeBody : dict.swap.routeHint}</p>
		</Panel>
	);
}
