'use client';

import { Fragment } from 'react';
import { ArrowRight } from 'lucide-react';
import { Panel } from '@/components/primitives/Panel';
import { TokenAvatar } from '@/components/primitives/TokenAvatar';
import type { Token } from '@/config/dex/types';
import { getV3Config } from '@/config/dex/v3-config';
import { useDict } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { routeHops } from '@/utils/swapDisplay';

interface SwapRoutePanelProps {
	fromToken: Token | null;
	toToken: Token | null;
	/** Token path of the current quote (addresses), or null before a quote exists. */
	route: string[] | null;
	tokens: Token[];
	/** The connected chain, which decides the venue: KalySwap V3, Uniswap V3 or PancakeSwap V3. */
	chainId: number;
}

export default function SwapRoutePanel({ fromToken, toToken, route, tokens, chainId }: SwapRoutePanelProps) {
	const dict = useDict();
	const hops = routeHops(fromToken, toToken, route, tokens);
	// Naming the wrong DEX is how the Arbitrum route read "KalySwap V3" (2026-09-17).
	const venue = getV3Config(chainId)?.name ?? '';

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
										{venue}
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
			<p className="mt-3 text-[12.5px] text-muted-deep">{route ? interpolate(dict.swap.routeBody, { venue }) : dict.swap.routeHint}</p>
		</Panel>
	);
}
