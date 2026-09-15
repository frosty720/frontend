import type en from '../en/vaultDetails';

/** Vault page extras: minted per tier, ROI cap, in-app claim (FR). */
const vaultDetails: typeof en = {
	minted: 'Frappés : {count}',
	roiCap: 'Rapporte jusqu’à {pct} du prix',
	claimAll: 'Tout réclamer',
	claiming: 'Réclamation…',
	claimDone: 'Récompenses des vaults réclamées',
	claimFailed: 'Échec de la réclamation',
};

export default vaultDetails;
