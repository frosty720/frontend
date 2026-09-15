import type en from '../en/swapDetails';

/** Swap token picker dialog, swap error box, pair stats, trade history (FR). */
const swapDetails: typeof en = {
	pairStats: {
		title: 'Statistiques de la paire',
		price: 'Prix',
		volume: 'Volume 24 h',
		liquidity: 'Liquidité',
	},

	recent: {
		all: 'Toutes',
		mine: 'Les miennes',
	},

	tokenSelector: {
		searchPlaceholder: 'Rechercher un nom ou coller une adresse',
		nameHeader: 'Jeton',
		balanceHeader: 'Solde',
		noResults: 'Aucun jeton trouvé',
		invalidAddressHint: 'Adresse de jeton invalide ou erreur réseau',
		loadingToken: 'Chargement des informations du jeton…',
		invalidAddressFormat: 'Format d’adresse de jeton invalide',
		tokenAlreadyExists: 'Ce jeton figure déjà dans la liste',
		failedToFetchToken: 'Échec du chargement des informations du jeton',
		listLabel: 'Liste de jetons KalySwap',
		change: 'Changer',
	},

	error: {
		showDetails: 'Afficher les détails',
		hideDetails: 'Masquer les détails',
		retrying: 'Nouvelle tentative…',
		resetForm: 'Réinitialiser le formulaire',
	},
};

export default swapDetails;
