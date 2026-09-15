import { TokenAvatar } from './TokenAvatar';

interface TokenRef {
	symbol: string;
	logoURI?: string;
}

export function TokenPair({ a, b, size = 28 }: { a: TokenRef; b: TokenRef; size?: number }) {
	return (
		<span className="inline-flex items-center">
			<TokenAvatar symbol={a.symbol} logoURI={a.logoURI} size={size} />
			<span className="-ml-2 rounded-full ring-2 ring-surface">
				<TokenAvatar symbol={b.symbol} logoURI={b.logoURI} size={size} />
			</span>
		</span>
	);
}
