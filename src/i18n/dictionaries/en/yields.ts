/** Dashboard portfolio chart, traders stat, claim-all and daily yield (EN — source of truth for this namespace). */
const yields = {
	rangeLabel: 'Chart range',
	ranges: {
		'1D': '1D',
		'1W': '1W',
		'1M': '1M',
		'1Y': '1Y',
	},
	chartNote: 'Today’s wallet and staked KMT amounts, valued at past prices — not realised history. Liquidity positions are not included.',
	chartAria: 'Current holdings valued from {from} to {to}',
	chartNotEnough: 'Not enough price history for this range yet.',
	chartError: 'Could not load price history.',
	chartUnpriced: 'Left out, no price history: {count}',
	chartNow: 'Now',
	traders: 'Traders',
	perDay: '≈ +{amount}/day (est.)',
	perDayHint: 'Estimate: staking and vaults at their configured APR. Farms and LP fees are not included.',
	claimUsd: 'Claim ≈ {amount}',
	claimAll: 'Claim all',
	claimNothing: 'Nothing to claim',
	claiming: 'Claiming {step}… ({current}/{total})',
	stepStaking: 'KMT staking rewards',
	stepFarm: '{symbol} farm rewards',
	stepVaults: 'vault rewards',
	claimDone: 'Rewards claimed',
	claimStopped: 'Claim stopped at {step}',
};

export default yields;
