/**
 * The cash-out sends USDT over the same Hyperlane route the Bridge page uses. If these addresses
 * drift from the bridge config, USDT would be burned on KalyChain toward a router that does not
 * release it — so they are pinned to warpRoutes.ts here. (The Polygon Mailbox address was read
 * from the Polygon router's mailbox() on 2026-10-02; the fork test checks the KalyChain one.)
 */
import { describe, expect, it } from 'vitest';
import { bridgeChains } from '@/config/bridge/chains';
import { warpRouteConfigs } from '@/config/bridge/warpRoutes';
import { KUSD_CASHOUT, KUSD_PSM } from '@/config/kusd';

const usdtOn = (chainName: string) => warpRouteConfigs.tokens.find((t) => t.chainName === chainName && t.symbol === 'USDT');

describe('KUSD cash-out route', () => {
	it('sends the KalyChain USDT the PSM pays out, which is the route synthetic connected to Polygon', () => {
		const kaly = usdtOn('kalychain');
		expect(kaly?.addressOrDenom).toBe(KUSD_PSM.gem.address);
		expect(kaly?.connections?.map((c) => c.token)).toContain(`ethereum|polygon|${KUSD_CASHOUT.polygonRouter}`);
	});

	it('targets the Polygon collateral router and the USDT it releases', () => {
		const polygon = usdtOn('polygon');
		expect(polygon?.addressOrDenom).toBe(KUSD_CASHOUT.polygonRouter);
		expect(polygon?.collateralAddressOrDenom).toBe(KUSD_CASHOUT.polygonUsdt);
		expect(bridgeChains.polygon.domainId).toBe(KUSD_CASHOUT.destinationDomain);
	});
});
