import type en from '../en/cutover';

/** One-time KalyChain relaunch notice (FR). */
const cutover: typeof en = {
	title: 'KalyChain est passé sur une nouvelle chaîne',
	intro: 'KalyChain a relancé sa chaîne. Le KLC devient maintenant du',
	ratio: 'KMT au taux de 110:1',
	introRest:
		'(110 KLC = 1 KMT). Vos soldes, pools et positions ont été migrés automatiquement — il n’y a rien à réclamer.',
	addNetworkBefore: 'Pour continuer à trader, ajoutez le nouveau réseau',
	addNetworkAfter: 'à votre portefeuille. Les portefeuilles intégrés (e-mail/réseaux sociaux) basculent automatiquement.',
	connected: 'Connecté à {network}. Vous êtes sur la nouvelle chaîne.',
	multipleWallets: 'Vous avez plusieurs portefeuilles installés — choisissez celui avec lequel vous tradez.',
	addNetworkButton: 'Ajouter le réseau dans {wallet}',
	checkingButton: 'Vérification de {wallet}…',
	noWalletDetected:
		'Aucun portefeuille de navigateur détecté. Si vous utilisez le portefeuille intégré, vous êtes déjà sur le nouveau réseau — continuez simplement.',
	cancelled: 'Demande annulée dans {wallet}. Rien n’a changé — vous pouvez réessayer.',
	stillOnAnotherNetwork:
		'{wallet} a accepté la demande mais est toujours sur un autre réseau. Ouvrez-le et basculez manuellement vers « {network} ».',
	addFailed:
		'{wallet} n’a pas pu ajouter le réseau. S’il possède déjà une entrée KalyChain utilisant ce RPC, supprimez d’abord cette ancienne entrée, puis réessayez.',
	dismiss: 'Continuer',
};

export default cutover;
