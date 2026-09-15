import type en from '../en/onramp';

/** Buy-crypto-with-card widget (FR). */
const onramp: typeof en = {
	notConfigured:
		'AlchemyPay n’est pas configuré. Veuillez définir NEXT_PUBLIC_ALCHEMYPAY_APP_ID dans vos variables d’environnement.',
	connectHint: 'Connectez votre portefeuille pour recevoir automatiquement les cryptomonnaies achetées sur votre adresse.',
	iframeTitle: 'Widget d’achat AlchemyPay',
	poweredBy: 'Propulsé par AlchemyPay',
	footerBody: 'Achetez des cryptomonnaies par carte de crédit, carte de débit ou virement bancaire',
};

export default onramp;
