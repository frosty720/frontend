/**
 * The redesign runs on brand tokens (globals.css). Anything that reaches for the old
 * slate/gray/blue palette, the Tailwind v2 CDN, `!important` overrides, or the dropped
 * "V4" label is a regression. ENFORCED grows by one entry per migration phase until it
 * covers all of src/app and src/components.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', '..');

/** Paths (relative to src/) that must already be on the new theme. */
const ENFORCED = [
	'app/globals.css',
	'app/[locale]/layout.tsx',
	'app/[locale]/page.tsx',
	'app/[locale]/not-found.tsx',
	'app/[locale]/[...rest]',
	'app/[locale]/kusd',
	'app/[locale]/lend',
	'app/[locale]/card',
	'app/[locale]/vaults',
	'components/vaults',
	'app/[locale]/swaps/page.tsx',
	'app/[locale]/bridge',
	'app/[locale]/pools',
	'app/[locale]/launchpad/[address]',
	'components/bridge',
	'components/liquidity',
	'components/onramp',
	'components/wallet/CutoverNotice.tsx',
	'components/swap/TokenSelectorModal.tsx',
	'components/swap/ErrorDisplay.tsx',
	'components/swap/PairStatsPanel.tsx',
	'components/pools/TokenSelector.tsx',
	'components/launchpad/ProjectHeader.tsx',
	'components/launchpad/ProjectStats.tsx',
	'components/launchpad/ProjectProgress.tsx',
	'components/launchpad/ParticipationForm.tsx',
	'components/launchpad/UserContributions.tsx',
	'components/launchpad/ProjectOwnerControls.tsx',
	'components/launchpad/ProjectSocialLinks.tsx',
	'components/launchpad/ProjectConfiguration.tsx',
	'components/launchpad/TokenCreator.tsx',
	'components/launchpad/RewardsTokenManager.tsx',
	'components/launchpad/PresaleCreator.tsx',
	'components/launchpad/FairlaunchCreator.tsx',
	'app/[locale]/farm',
	'components/farming/V3StakingModal.tsx',
	'components/farming/V3UnstakingModal.tsx',
	'components/farming/V3ManageModal.tsx',
	'app/[locale]/farm/page.tsx',
	'app/[locale]/stake/page.tsx',
	'app/[locale]/launchpad/page.tsx',
	'components/dashboard',
	'components/swap/MultichainSwapInterface.tsx',
	'components/swap/SwapInterfaceWrapper.tsx',
	'components/swap/SwapRoutePanel.tsx',
	'components/swap/RecentSwapsPanel.tsx',
	'components/pools/PoolsTable.tsx',
	'components/pools/PoolPositionsDialog.tsx',
	'components/farming/FarmCard.tsx',
	'components/staking/StakeCard.tsx',
	'components/staking/StakePositionCard.tsx',
	'components/staking/StakeNetworkCard.tsx',
	'components/launchpad/LaunchpadProjectCard.tsx',
	'components/shell',
	'components/primitives',
	'components/ui',
	'components/wallet/ConnectWallet.tsx',
	'components/wallet/ClientOnlyConnectWallet.tsx',
	'i18n',
];

const FORBIDDEN: Array<[RegExp, string]> = [
	[/tailwindcss@2/, 'Tailwind v2 CDN'],
	[/!important/, '!important override'],
	[/\b(text|bg|border|ring|from|to|via)-(gray|slate|zinc|neutral|stone|blue)-\d/, 'old palette class'],
	[/\bbg-white\b/, 'bg-white'],
	[/#fef3c7/i, 'old amber-50 text color'],
	[/\bV4\b/, 'V4 label'],
];

function walk(path: string, out: string[] = []): string[] {
	if (!existsSync(path)) return out;
	if (statSync(path).isFile()) {
		if (/\.(tsx?|css)$/.test(path)) out.push(path);
		return out;
	}
	for (const entry of readdirSync(path)) {
		if (entry === '__tests__') continue;
		walk(join(path, entry), out);
	}
	return out;
}

describe('no old theme in migrated paths', () => {
	it('every enforced path exists', () => {
		const missing = ENFORCED.filter((p) => !existsSync(join(SRC, p)));
		expect(missing).toEqual([]);
	});

	it('contains no old-theme markers', () => {
		const offenders: string[] = [];
		for (const rel of ENFORCED) {
			for (const file of walk(join(SRC, rel))) {
				const text = readFileSync(file, 'utf8');
				for (const [re, label] of FORBIDDEN) {
					if (re.test(text)) offenders.push(`${file.replace(SRC, 'src')}: ${label}`);
				}
			}
		}
		expect(offenders).toEqual([]);
	});
});
