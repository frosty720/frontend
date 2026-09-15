import type en from '../en/yields';

/** Dashboard portfolio chart, traders stat, claim-all and daily yield (FR). */
const yields: typeof en = {
	rangeLabel: 'Période du graphique',
	ranges: {
		'1D': '1J',
		'1W': '1S',
		'1M': '1M',
		'1Y': '1A',
	},
	chartNote: 'Quantités actuelles du portefeuille et des KMT stakés, valorisées aux prix passés — pas un historique réalisé. Les positions de liquidité ne sont pas incluses.',
	chartAria: 'Avoirs actuels valorisés de {from} à {to}',
	chartNotEnough: 'Pas encore assez d’historique de prix pour cette période.',
	chartError: 'Impossible de charger l’historique des prix.',
	chartUnpriced: 'Exclus, sans historique de prix : {count}',
	chartNow: 'Maintenant',
	traders: 'Traders',
	perDay: '≈ +{amount}/jour (estim.)',
	perDayHint: 'Estimation : staking et vaults à leur APR configuré. Les farms et les frais de LP ne sont pas inclus.',
	claimUsd: 'Réclamer ≈ {amount}',
	claimAll: 'Tout réclamer',
	claimNothing: 'Rien à réclamer',
	claiming: 'Réclamation : {step}… ({current}/{total})',
	stepStaking: 'récompenses de staking KMT',
	stepFarm: 'récompenses de farm {symbol}',
	stepVaults: 'récompenses des vaults',
	claimDone: 'Récompenses réclamées',
	claimStopped: 'Réclamation interrompue : {step}',
};

export default yields;
