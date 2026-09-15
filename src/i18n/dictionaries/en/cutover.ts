/** One-time KalyChain relaunch notice (EN — source of truth for this namespace). */
const cutover = {
	title: 'KalyChain has moved to a new chain',
	intro: 'KalyChain has relaunched. KLC is now',
	ratio: 'KMT at a 110:1 ratio',
	introRest:
		'(110 KLC = 1 KMT). Your balances, pools, and positions were migrated automatically — there is nothing to claim.',
	addNetworkBefore: 'To keep trading, add the new',
	addNetworkAfter: 'network to your wallet. In-app wallets (email/social) switch automatically.',
	connected: 'Connected to {network}. You are on the new chain.',
	multipleWallets: 'You have more than one wallet installed — pick the one you trade with.',
	addNetworkButton: 'Add network in {wallet}',
	checkingButton: 'Check {wallet}…',
	noWalletDetected:
		'No browser wallet detected. If you use the in-app wallet, you are already on the new network — just continue.',
	cancelled: 'Request cancelled in {wallet}. Nothing changed — you can try again.',
	stillOnAnotherNetwork:
		'{wallet} accepted the request but is still on another network. Open it and switch to "{network}" manually.',
	addFailed:
		'{wallet} could not add the network. If it already has a KalyChain entry using this RPC, remove that old entry first, then try again.',
	dismiss: 'Continue',
};

export default cutover;
