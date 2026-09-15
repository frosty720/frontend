'use client';

import { Github, MessageCircle, Send, Twitter } from 'lucide-react';
import { DOCS_URL } from './nav';
import { useDict } from '@/i18n/hooks';

const SOCIAL = [
	{ key: 'twitter', href: 'https://x.com/KalyChainEVM', icon: Twitter },
	{ key: 'github', href: 'https://github.com/kalycoinproject/', icon: Github },
	{ key: 'telegram', href: 'https://t.me/KalyChain', icon: Send },
	{ key: 'discord', href: 'https://discord.gg/tTe8BmcAks', icon: MessageCircle },
] as const;

export function Footer() {
	const dict = useDict();
	return (
		<footer className="flex flex-col items-center gap-3 border-t border-line px-6 py-6 text-center text-[12.5px] text-muted-deep sm:flex-row sm:justify-between">
			<span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
				<span>{dict.footer.line}</span>
				<a href="https://kalychain.io" target="_blank" rel="noopener noreferrer" className="text-muted-foreground transition-colors hover:text-gold">
					{dict.footer.site}
				</a>
				<a href={DOCS_URL} target="_blank" rel="noopener noreferrer" className="text-muted-foreground transition-colors hover:text-gold">
					{dict.footer.docs}
				</a>
			</span>
			<div className="flex items-center gap-3">
				{SOCIAL.map(({ key, href, icon: Icon }) => (
					<a
						key={key}
						href={href}
						target="_blank"
						rel="noopener noreferrer"
						aria-label={dict.footer[key]}
						className="text-muted-foreground transition-colors hover:text-gold"
					>
						<Icon className="size-4" />
					</a>
				))}
			</div>
		</footer>
	);
}
