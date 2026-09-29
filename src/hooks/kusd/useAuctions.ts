'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { erc20Abi, zeroAddress } from 'viem';
import { useAccount, usePublicClient } from 'wagmi';
import { clipperAbi, flapperAbi, flopperAbi, vatAbi } from '@/config/abis/kusd';
import { CHAIN_IDS } from '@/config/chains';
import { KUSD_CORE, KUSD_ILKS, KUSD_TOKEN, SKLC_TOKEN, type KusdIlk } from '@/config/kusd';
import { UserError } from '@/lib/userError';
import { fromWad, RAY } from '@/utils/kusd';
import { dealStep, flapBidSteps, flopBidSteps, gemExitStep, takeSteps } from '@/utils/kusdPlans';
import { useKusdSteps } from './useKusdWriter';

/** How many of the most recent surplus / debt auctions to check for live or unsettled bids. */
const RECENT_KICKS = 20n;

export interface ClipSale {
	ilk: KusdIlk;
	id: bigint;
	/** Collateral left, WAD. */
	lot: bigint;
	/** KUSD still to raise, RAD. */
	tab: bigint;
	/** Current price, RAY per WAD of collateral. */
	price: bigint;
	needsRedo: boolean;
}

export interface HouseBid {
	house: 'flap' | 'flop';
	id: bigint;
	/** Flap: sKLC bid (WAD). Flop: KUSD bid (RAD). */
	bid: bigint;
	/** Flap: KUSD lot (RAD). Flop: sKLC lot (WAD). */
	lot: bigint;
	guy: `0x${string}`;
	tic: number;
	end: number;
}

/** A surplus/debt auction is over once its bid expired (tic) or its deadline (end) passed. */
export function auctionEnded(bid: Pick<HouseBid, 'tic' | 'end'>, now: number): boolean {
	return (bid.tic !== 0 && bid.tic < now) || bid.end < now;
}

export interface AuctionsData {
	clips: ClipSale[];
	houses: HouseBid[];
	/** Minimum bid increment, WAD (1.05e18 = 5%). */
	flapBeg: bigint;
	flopBeg: bigint;
}

export function useAuctions() {
	const client = usePublicClient({ chainId: CHAIN_IDS.KALYCHAIN });
	return useQuery({
		queryKey: ['kusdAuctions'],
		enabled: Boolean(client),
		refetchInterval: 30_000,
		queryFn: async (): Promise<AuctionsData> => {
			const clips = (
				await Promise.all(
					KUSD_ILKS.map(async (ilk) => {
						const ids = await client!.readContract({ address: ilk.clipper, abi: clipperAbi, functionName: 'list' });
						return Promise.all(
							ids.map(async (id) => {
								const [needsRedo, price, lot, tab] = await client!.readContract({ address: ilk.clipper, abi: clipperAbi, functionName: 'getStatus', args: [id] });
								return { ilk, id, lot, tab, price, needsRedo };
							}),
						);
					}),
				)
			).flat();

			const houseBids = async (house: 'flap' | 'flop') => {
				const address = house === 'flap' ? KUSD_CORE.flapper : KUSD_CORE.flopper;
				const abi = house === 'flap' ? flapperAbi : flopperAbi;
				const kicks = await client!.readContract({ address, abi, functionName: 'kicks' });
				const from = kicks > RECENT_KICKS ? kicks - RECENT_KICKS + 1n : 1n;
				const ids = kicks === 0n ? [] : Array.from({ length: Number(kicks - from + 1n) }, (_, i) => from + BigInt(i));
				const bids = await Promise.all(
					ids.map(async (id) => {
						const [bid, lot, guy, tic, end] = await client!.readContract({ address, abi, functionName: 'bids', args: [id] });
						return { house, id, bid, lot, guy, tic: Number(tic), end: Number(end) };
					}),
				);
				return bids.filter((b) => b.guy !== zeroAddress); // dealt auctions are deleted
			};
			const [flaps, flops, flapBeg, flopBeg] = await Promise.all([
				houseBids('flap'),
				houseBids('flop'),
				client!.readContract({ address: KUSD_CORE.flapper, abi: flapperAbi, functionName: 'beg' }),
				client!.readContract({ address: KUSD_CORE.flopper, abi: flopperAbi, functionName: 'beg' }),
			]);
			return { clips, houses: [...flaps, ...flops], flapBeg, flopBeg };
		},
	});
}

export interface AuctionWallet {
	internalKusd: bigint;
	kusdAllowance: bigint;
	sklcBalance: bigint;
	sklcAllowanceFlap: bigint;
	flopperHoped: boolean;
	clipperHoped: Record<string, boolean>;
}

export function useAuctionWallet(owner: `0x${string}` | undefined) {
	const client = usePublicClient({ chainId: CHAIN_IDS.KALYCHAIN });
	return useQuery({
		queryKey: ['kusdAuctionWallet', owner],
		enabled: Boolean(client && owner),
		refetchInterval: 30_000,
		queryFn: async (): Promise<AuctionWallet> => {
			const can = (usr: `0x${string}`) => client!.readContract({ address: KUSD_CORE.vat, abi: vatAbi, functionName: 'can', args: [owner!, usr] });
			const [rad, kusdAllowance, sklcBalance, sklcAllowanceFlap, flop, clips] = await Promise.all([
				client!.readContract({ address: KUSD_CORE.vat, abi: vatAbi, functionName: 'kusd', args: [owner!] }),
				client!.readContract({ address: KUSD_TOKEN.address, abi: erc20Abi, functionName: 'allowance', args: [owner!, KUSD_CORE.kusdJoin] }),
				client!.readContract({ address: SKLC_TOKEN.address, abi: erc20Abi, functionName: 'balanceOf', args: [owner!] }),
				client!.readContract({ address: SKLC_TOKEN.address, abi: erc20Abi, functionName: 'allowance', args: [owner!, KUSD_CORE.flapper] }),
				can(KUSD_CORE.flopper),
				Promise.all(KUSD_ILKS.map((ilk) => can(ilk.clipper))),
			]);
			return {
				internalKusd: rad / RAY,
				kusdAllowance,
				sklcBalance,
				sklcAllowanceFlap,
				flopperHoped: flop === 1n,
				clipperHoped: Object.fromEntries(KUSD_ILKS.map((ilk, i) => [ilk.key, clips[i] === 1n])),
			};
		},
	});
}

const AUCTION_QUERY_KEYS = [['kusdAuctions'], ['kusdAuctionWallet'], ['kusdVault'], ['kusdWallet'], ['kusdWrap']];

/** Auction actions, each a plan from utils/kusdPlans.ts. */
export function useAuctionActions() {
	const run = useKusdSteps();
	const { address } = useAccount();
	const client = usePublicClient({ chainId: CHAIN_IDS.KALYCHAIN });
	const queryClient = useQueryClient();
	const refresh = useCallback(() => Promise.all(AUCTION_QUERY_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey }))), [queryClient]);

	const owner = () => {
		if (!address) throw new UserError('walletNotConnected');
		if (!client) throw new UserError('rpcUnavailable');
		return address;
	};

	return {
		/** Buy `amt` (WAD) of a Clipper lot at no more than `maxPrice`, then send the collateral to the wallet. */
		take: async (sale: ClipSale, amt: bigint, maxPrice: bigint, maxCostWad: bigint, wallet: AuctionWallet) => {
			const who = owner();
			try {
				await run(
					takeSteps(sale.ilk, who, sale.id, amt, maxPrice, maxCostWad, {
						internalKusdWad: wallet.internalKusd,
						clipperHoped: wallet.clipperHoped[sale.ilk.key] ?? false,
						allowanceToKusdJoin: wallet.kusdAllowance,
					}),
				);
				const gem = await client!.readContract({ address: KUSD_CORE.vat, abi: vatAbi, functionName: 'gem', args: [sale.ilk.ilk, who] });
				const tokens = fromWad(gem, sale.ilk.decimals);
				if (tokens > 0n) await run([gemExitStep(sale.ilk, who, tokens)]);
			} finally {
				await refresh();
			}
		},
		tend: async (id: bigint, lot: bigint, bid: bigint, wallet: AuctionWallet) => {
			owner();
			try {
				await run(flapBidSteps(id, lot, bid, wallet.sklcAllowanceFlap));
			} finally {
				await refresh();
			}
		},
		dent: async (id: bigint, lot: bigint, bid: bigint, wallet: AuctionWallet) => {
			const who = owner();
			try {
				await run(flopBidSteps(who, id, lot, bid, { internalKusdWad: wallet.internalKusd, flopperHoped: wallet.flopperHoped, allowanceToKusdJoin: wallet.kusdAllowance }));
			} finally {
				await refresh();
			}
		},
		deal: async (house: 'flap' | 'flop', id: bigint) => {
			owner();
			try {
				await run([dealStep(house, id)]);
			} finally {
				await refresh();
			}
		},
	};
}
