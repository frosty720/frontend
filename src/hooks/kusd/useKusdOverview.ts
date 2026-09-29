'use client';

import { useQuery } from '@tanstack/react-query';
import { erc20Abi, zeroAddress } from 'viem';
import { usePublicClient } from 'wagmi';
import { spotterAbi, v3FactoryAbi, v3PoolAbi, vatAbi } from '@/config/abis/kusd';
import { CHAIN_IDS } from '@/config/chains';
import { V3_CONTRACTS } from '@/config/dex/v3-config';
import { KUSD_CORE, KUSD_ILKS, KUSD_PEG_FEE_TIERS, KUSD_PSM, KUSD_TOKEN } from '@/config/kusd';
import { ilkOpen, kusdPriceFromSqrt, protocolBacking, RAY, type ProtocolBacking } from '@/utils/kusd';

export interface KusdPeg {
	pool: `0x${string}`;
	/** Fee tier in hundredths of a bip (100 = 0.01%). */
	fee: number;
	/** USD per KUSD, USDT counted as $1. */
	price: number;
}

export interface KusdProtocol {
	supply: bigint;
	/** KUSD the PSM holds (paid out for USDT deposits). */
	psmKusd: bigint;
	/** USDT backing in the pocket (paid out for KUSD redemptions). */
	pocketUsdt: bigint;
	/** The deepest KUSD/USDT pool, or null before one exists. */
	peg: KusdPeg | null;
	/** Collateral types currently open for borrowing (a ceiling and an oracle price). */
	openIlks: number;
	/** Reserves, circulating KUSD and backing %, all from chain reads (utils/kusd protocolBacking). */
	backing: ProtocolBacking;
}

/** Within ±0.5% of $1: the band the peg keeper defends. */
export function isOnPeg(price: number): boolean {
	return Math.abs(price - 1) <= 0.005;
}

export function useKusdProtocol() {
	const client = usePublicClient({ chainId: CHAIN_IDS.KALYCHAIN });
	return useQuery({
		queryKey: ['kusdOverview'],
		enabled: Boolean(client),
		refetchInterval: 60_000,
		queryFn: async (): Promise<KusdProtocol> => {
			const [supply, psmKusd, pocketUsdt, pools, ilks, vatDebt, joinBalances, mats] = await Promise.all([
				client!.readContract({ address: KUSD_TOKEN.address, abi: erc20Abi, functionName: 'totalSupply' }),
				client!.readContract({ address: KUSD_TOKEN.address, abi: erc20Abi, functionName: 'balanceOf', args: [KUSD_PSM.address] }),
				client!.readContract({ address: KUSD_PSM.gem.address, abi: erc20Abi, functionName: 'balanceOf', args: [KUSD_PSM.pocket] }),
				Promise.all(
					KUSD_PEG_FEE_TIERS.map((fee) =>
						client!.readContract({
							address: V3_CONTRACTS.V3_CORE_FACTORY,
							abi: v3FactoryAbi,
							functionName: 'getPool',
							args: [KUSD_TOKEN.address, KUSD_PSM.gem.address, fee],
						}),
					),
				),
				Promise.all(KUSD_ILKS.map((ilk) => client!.readContract({ address: KUSD_CORE.vat, abi: vatAbi, functionName: 'ilks', args: [ilk.ilk] }))),
				client!.readContract({ address: KUSD_CORE.vat, abi: vatAbi, functionName: 'debt' }),
				Promise.all(KUSD_ILKS.map((ilk) => client!.readContract({ address: ilk.token, abi: erc20Abi, functionName: 'balanceOf', args: [ilk.gemJoin] }))),
				Promise.all(KUSD_ILKS.map((ilk) => client!.readContract({ address: KUSD_CORE.spotter, abi: spotterAbi, functionName: 'ilks', args: [ilk.ilk] }))),
			]);

			let peg: KusdPeg | null = null;
			let deepest = 0n;
			for (const [i, pool] of pools.entries()) {
				if (pool === zeroAddress) continue;
				const [liquidity, slot0, token0] = await Promise.all([
					client!.readContract({ address: pool, abi: v3PoolAbi, functionName: 'liquidity' }),
					client!.readContract({ address: pool, abi: v3PoolAbi, functionName: 'slot0' }),
					client!.readContract({ address: pool, abi: v3PoolAbi, functionName: 'token0' }),
				]);
				if (liquidity <= deepest) continue;
				deepest = liquidity;
				const kusdIsToken0 = token0.toLowerCase() === KUSD_TOKEN.address.toLowerCase();
				peg = { pool, fee: KUSD_PEG_FEE_TIERS[i], price: kusdPriceFromSqrt(slot0[0], kusdIsToken0, KUSD_TOKEN.decimals, KUSD_PSM.gem.decimals) };
			}

			const openIlks = ilks.filter(([, , spot, line]) => ilkOpen({ line, spot })).length;
			const backing = protocolBacking({
				vatDebt,
				psmKusd,
				pocketGem: pocketUsdt,
				gemDecimals: KUSD_PSM.gem.decimals,
				collateral: KUSD_ILKS.map((ilk, i) => ({ balance: joinBalances[i], decimals: ilk.decimals, spot: ilks[i][2], mat: mats[i][1] })),
			});
			return { supply, psmKusd, pocketUsdt, peg, openIlks, backing };
		},
	});
}

export interface KusdWallet {
	kusd: bigint;
	usdt: bigint;
	/** Internal Vat KUSD (from a borrow or an auction), WAD. */
	vatKusd: bigint;
}

export function useKusdWallet(owner: `0x${string}` | undefined) {
	const client = usePublicClient({ chainId: CHAIN_IDS.KALYCHAIN });
	return useQuery({
		queryKey: ['kusdWallet', owner],
		enabled: Boolean(client && owner),
		refetchInterval: 60_000,
		queryFn: async (): Promise<KusdWallet> => {
			const [kusd, usdt, vatRad] = await Promise.all([
				client!.readContract({ address: KUSD_TOKEN.address, abi: erc20Abi, functionName: 'balanceOf', args: [owner!] }),
				client!.readContract({ address: KUSD_PSM.gem.address, abi: erc20Abi, functionName: 'balanceOf', args: [owner!] }),
				client!.readContract({ address: KUSD_CORE.vat, abi: vatAbi, functionName: 'kusd', args: [owner!] }),
			]);
			return { kusd, usdt, vatKusd: vatRad / RAY };
		},
	});
}
