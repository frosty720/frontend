'use client';

import { useState } from 'react';
import { Pill, type PillTone } from '@/components/primitives/Pill';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import V3ManageModal from '@/components/liquidity/v3/V3ManageModal';
import type { V3PoolData } from '@/hooks/useV3PoolDiscovery';
import type { V3Position } from '@/services/dex/IV3DexService';
import { useDict } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { positionState, type PositionState } from '@/utils/pools';

const TONES: Record<PositionState, PillTone> = { inRange: 'success', outOfRange: 'gold', closed: 'muted', open: 'info' };

interface PoolPositionsDialogProps {
	pool: V3PoolData | null;
	onClose: () => void;
	onUpdate: () => void;
}

/**
 * Every position the wallet holds in one pool, each with its own Collect / Manage. A pool can hold
 * several NFT positions (different ranges, or a closed one still owed fees), so none may be hidden.
 */
export default function PoolPositionsDialog({ pool, onClose, onUpdate }: PoolPositionsDialogProps) {
	const dict = useDict();
	const p = dict.pools;
	const [managed, setManaged] = useState<{ position: V3Position; tab: 'remove' | 'collect' } | null>(null);

	const currentTick = pool?.tick !== undefined && pool?.tick !== null ? parseInt(String(pool?.tick), 10) : null;
	const pair = pool ? `${pool.token0.symbol} / ${pool.token1.symbol}` : '';

	return (
		<>
			<Dialog open={Boolean(pool) && !managed} onOpenChange={(open) => { if (!open) onClose(); }}>
				<DialogContent className="border-line bg-surface sm:max-w-lg" aria-describedby={undefined}>
					<DialogHeader>
						<DialogTitle>{interpolate(p.positionsTitle, { pair })}</DialogTitle>
					</DialogHeader>
					{pool && pool.userPositions.length === 0 ? (
						<p className="text-sm text-muted-foreground">{p.positionsEmpty}</p>
					) : (
						<ul className="space-y-2">
							{pool?.userPositions.map((position) => {
								const state = positionState(position, currentTick);
								return (
									<li key={position.tokenId.toString()} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface-alt px-3 py-2.5">
										<span className="flex min-w-0 items-center gap-2">
											<span className="font-mono text-sm text-cream">#{position.tokenId.toString()}</span>
											<Pill tone={TONES[state]}>{p[state]}</Pill>
										</span>
										<span className="flex shrink-0 gap-2">
											<Button size="sm" variant="secondary" onClick={() => setManaged({ position, tab: 'collect' })}>
												{p.collect}
											</Button>
											<Button size="sm" variant="outline" onClick={() => setManaged({ position, tab: 'remove' })}>
												{p.manage}
											</Button>
										</span>
									</li>
								);
							})}
						</ul>
					)}
				</DialogContent>
			</Dialog>

			{managed && (
				<V3ManageModal
					key={managed.position.tokenId.toString()}
					isOpen
					onClose={() => {
						setManaged(null);
						onClose();
					}}
					position={managed.position}
					onUpdate={onUpdate}
					initialTab={managed.tab}
				/>
			)}
		</>
	);
}
