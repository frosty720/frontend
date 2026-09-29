import { MAINNET_CONTRACTS } from '@/config/contracts';

/**
 * KUSD (MakerDAO DSS fork) on KalyChain 3890.
 * Source of truth: kalychain-ops/files/kmt-3890/addresses.json → kusd, tokens.
 *
 * 3890 launched PSM-only: every CDP ilk has a zero debt ceiling and no oracle price (spot 0), so
 * borrowing stays closed until governance opens an ilk. The UI reads that state on-chain rather
 * than assuming it.
 */

export const KUSD_TOKEN = {
	symbol: 'KUSD',
	address: '0xFDb3307a16442ed5A7C040AE1600a3B3D3C8e7D9',
	decimals: 18,
} as const;

export const KUSD_CORE = {
	vat: '0x27f56Ab259CbA4A69e779d712F6dd27b6A6aeCC6',
	pot: '0x14d856578d6b86AeBE8C2ABBa4f4983C6A943EFa',
	spotter: '0xd1B01Ab0bcB76B9bf88A41Fd1C87Fb7C89c9dA60',
	jug: '0x2Da3076FC64F455ED50531E91A7c81031D06719b',
	kusdJoin: '0xCABC917c1a2dA2973ac455491Adab2ACb554Fd9B',
	dog: '0x4F4447477146f997F3D44d227B633Ced20506BC3',
	flapper: '0x505BaAE056396F28C8e757803a7f924B1A04EB70',
	flopper: '0x57A8e257AC667A02f1959bdfF111e29a667EF74A',
} as const;

/** sKLC: 1:1 wrapper of the native coin (KMT on 3890), the bid token of surplus/debt auctions. */
export const SKLC_TOKEN = {
	symbol: 'sKLC',
	address: '0x80f6040833FefbF961CA4a20Ad704AAdD3a43716',
	decimals: 18,
} as const;

export interface StableToken {
	symbol: string;
	address: `0x${string}`;
	decimals: number;
}

/**
 * The USDT lite-PSM: sellGem swaps USDT → KUSD 1:1 (the USDT lands in the pocket), buyGem swaps
 * KUSD → USDT 1:1 (paid out of the pocket). Fees tin/tout are read live.
 */
export const KUSD_PSM = {
	address: '0xe9d8b5b224A8e2d949b9819c8ECb72a6662ebF94',
	pocket: '0xAb4538aFb596c701e4CF1A7780A710a6E3406EE8',
	gem: { symbol: 'USDT', address: MAINNET_CONTRACTS.USDT as `0x${string}`, decimals: 6 } satisfies StableToken,
} as const;

/** DSProxy stack for the savings rate: Pot.join/exit run through the user's proxy (KssProxyActionsDsr). */
export const KUSD_PROXY = {
	registry: '0x3ab9f329Dd96EcDbe21be3cF45786beb4216E66c',
	actionsDsr: '0xd074F8611AA4F6daeeaae17421a395cbE8fa0637',
} as const;

export type IlkKey = 'WBTC-A' | 'WETH-A' | 'USDT-A' | 'USDC-A' | 'DAI-A';

export interface KusdIlk {
	key: IlkKey;
	/** bytes32 of the ilk name, as the Vat, Spotter and Jug key it. */
	ilk: `0x${string}`;
	symbol: string;
	/** The token's name, shown next to the symbol (the ilk key "WBTC-A" is a protocol ID, never a label). */
	name: string;
	token: `0x${string}`;
	decimals: number;
	gemJoin: `0x${string}`;
	clipper: `0x${string}`;
}

/** bytes32 of an ASCII ilk name, right-padded with zeros. */
export function ilkBytes32(name: string): `0x${string}` {
	const hex = Array.from(name, (c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
	return `0x${hex.padEnd(64, '0')}`;
}

export const KUSD_ILKS: readonly KusdIlk[] = [
	{
		key: 'WBTC-A',
		ilk: ilkBytes32('WBTC-A'),
		symbol: 'WBTC',
		name: 'Wrapped Bitcoin',
		token: MAINNET_CONTRACTS.WBTC as `0x${string}`,
		decimals: 8,
		gemJoin: '0x6BADb4a1cB00dE3069555191f1E3391B2c58d459',
		clipper: '0x680aB6654A76e0F2dB3eEeCA42B42516e5a1945F',
	},
	{
		key: 'WETH-A',
		ilk: ilkBytes32('WETH-A'),
		symbol: 'ETH',
		name: 'Ether',
		token: MAINNET_CONTRACTS.ETH as `0x${string}`,
		decimals: 18,
		gemJoin: '0x3ea23F0BB9479D723Eb7370bEFe5368DF6ee826c',
		clipper: '0x686911F278E64c31E476169D1ac06E877B211323',
	},
	{
		key: 'USDT-A',
		ilk: ilkBytes32('USDT-A'),
		symbol: 'USDT',
		name: 'Tether USD',
		token: MAINNET_CONTRACTS.USDT as `0x${string}`,
		decimals: 6,
		gemJoin: '0xCaAAc89835A5D7493edA7470b57E4C1517c1921f',
		clipper: '0xD0a1d1b8E10625eE7Ed4Be4Aa7afA7f169411FBd',
	},
	{
		key: 'USDC-A',
		ilk: ilkBytes32('USDC-A'),
		symbol: 'USDC',
		name: 'USD Coin',
		token: MAINNET_CONTRACTS.USDC as `0x${string}`,
		decimals: 6,
		gemJoin: '0xf0BbD784D49F3dBE742a39f6D2367fe923CE11cd',
		clipper: '0xfe4a1F892096Ef6de5AF352cd8f25F7461e9deCe',
	},
	{
		key: 'DAI-A',
		ilk: ilkBytes32('DAI-A'),
		symbol: 'DAI',
		name: 'Dai Stablecoin',
		token: MAINNET_CONTRACTS.DAI as `0x${string}`,
		decimals: 18,
		gemJoin: '0x421fb81abCd1f9304020e2eDe4566584a15F841E',
		clipper: '0x4E7001fa7fecB09407e5570d72b6703a44Ea7d48',
	},
];

/** V3 fee tiers searched for the KUSD/USDT pool that prices the peg (the launch pool is 0.01%). */
export const KUSD_PEG_FEE_TIERS = [100, 500, 3000, 10000] as const;
