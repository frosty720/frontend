/** Swap token picker dialog, swap error box, pair stats, trade history (EN — source of truth for this namespace). */
const swapDetails = {
	pairStats: {
		title: 'Pair stats',
		price: 'Price',
		volume: 'Volume 24h',
		liquidity: 'Liquidity',
	},

	recent: {
		all: 'All',
		mine: 'Mine',
	},

	tokenSelector: {
		searchPlaceholder: 'Search name or paste address',
		nameHeader: 'Token name',
		balanceHeader: 'Balance',
		noResults: 'No tokens found',
		invalidAddressHint: 'Invalid token address or network error',
		loadingToken: 'Loading token metadata…',
		invalidAddressFormat: 'Invalid token address format',
		tokenAlreadyExists: 'Token already exists in the list',
		failedToFetchToken: 'Failed to fetch token metadata',
		listLabel: 'KalySwap Tokenlist',
		change: 'Change',
	},

	error: {
		showDetails: 'Show details',
		hideDetails: 'Hide details',
		retrying: 'Retrying…',
		resetForm: 'Reset form',
	},
};

export default swapDetails;
