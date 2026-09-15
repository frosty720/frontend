'use client';

import { useState } from 'react';
import {
	AlertTriangle,
	AlertCircle,
	XCircle,
	Info,
	RefreshCw,
	Settings,
	ChevronDown,
	ChevronUp,
	ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useDict } from '@/i18n/hooks';
import { cn } from '@/lib/utils';
import { getSwapErrorText, SwapError, SwapErrorSeverity } from '@/utils/swapErrors';

interface ErrorDisplayProps {
	error: SwapError;
	onRetry?: () => void;
	onAdjust?: () => void;
	onReset?: () => void;
	onConnectWallet?: () => void;
	isRetrying?: boolean;
	className?: string;
}

/** Severity-based styling, shared by the full and compact displays. Only 4 semantic status
 * tones exist in this theme, so HIGH and CRITICAL share the danger tone (the icon and the
 * destructive button variant still tell them apart). */
function severityStyles(severity: SwapErrorSeverity) {
	switch (severity) {
		case SwapErrorSeverity.LOW:
			return { container: 'border-info/25 bg-info/10', icon: 'text-info', text: 'text-info', Icon: Info };
		case SwapErrorSeverity.MEDIUM:
			return { container: 'border-gold/25 bg-gold-soft', icon: 'text-gold-light', text: 'text-gold-light', Icon: AlertTriangle };
		case SwapErrorSeverity.HIGH:
			return { container: 'border-danger/25 bg-danger/10', icon: 'text-danger', text: 'text-danger', Icon: AlertCircle };
		case SwapErrorSeverity.CRITICAL:
		default:
			return { container: 'border-danger/25 bg-danger/10', icon: 'text-danger', text: 'text-danger', Icon: XCircle };
	}
}

export default function ErrorDisplay({ error, onRetry, onAdjust, onReset, onConnectWallet, isRetrying = false, className = '' }: ErrorDisplayProps) {
	const dict = useDict();
	const t = dict.swapDetails.error;
	const text = getSwapErrorText(error, dict);
	const [showDetails, setShowDetails] = useState(false);

	const styles = severityStyles(error.severity);
	const IconComponent = styles.Icon;

	const handleAction = () => {
		switch (error.actionType) {
			case 'retry':
				onRetry?.();
				break;
			case 'adjust':
				onAdjust?.();
				break;
			case 'reset':
				onReset?.();
				break;
			case 'external':
				onConnectWallet?.();
				break;
		}
	};

	return (
		<Card className={cn('border', styles.container, className)}>
			<CardContent className="pt-4">
				<div className="flex items-start gap-3">
					<IconComponent className={cn('mt-0.5 size-5 shrink-0', styles.icon)} aria-hidden />

					<div className="min-w-0 flex-1">
						<h4 className={cn('mb-1 font-medium', styles.text)}>{text.title}</h4>

						<p className={cn('mb-3 text-sm', styles.text)}>{text.message}</p>

						{text.suggestion && <p className={cn('mb-3 text-sm opacity-90', styles.text)}>💡 {text.suggestion}</p>}

						<div className="mb-3 flex items-center gap-2">
							{text.action && (
								<Button
									onClick={handleAction}
									disabled={isRetrying}
									size="sm"
									variant={error.severity === SwapErrorSeverity.CRITICAL ? 'destructive' : 'default'}
									className="h-8"
								>
									{isRetrying ? (
										<>
											<RefreshCw className="mr-1 size-3 animate-spin" />
											{t.retrying}
										</>
									) : (
										<>
											{error.actionType === 'retry' && <RefreshCw className="mr-1 size-3" />}
											{error.actionType === 'adjust' && <Settings className="mr-1 size-3" />}
											{error.actionType === 'external' && <ExternalLink className="mr-1 size-3" />}
											{text.action}
										</>
									)}
								</Button>
							)}

							{error.severity === SwapErrorSeverity.CRITICAL && onReset && (
								<Button onClick={onReset} size="sm" variant="outline" className="h-8">
									{t.resetForm}
								</Button>
							)}
						</div>

						{error.details && (
							<div>
								<Button
									onClick={() => setShowDetails(!showDetails)}
									variant="ghost"
									size="sm"
									className={cn('h-6 p-0 hover:bg-transparent', styles.text)}
								>
									{showDetails ? (
										<>
											<ChevronUp className="mr-1 size-3" />
											{t.hideDetails}
										</>
									) : (
										<>
											<ChevronDown className="mr-1 size-3" />
											{t.showDetails}
										</>
									)}
								</Button>

								{showDetails && (
									<div className={cn('mt-2 break-all rounded bg-surface-alt p-2 font-mono text-xs', styles.text)}>{error.details}</div>
								)}
							</div>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

/**
 * Compact error display for inline use.
 */
export function CompactErrorDisplay({
	error,
	onRetry,
	isRetrying = false,
	className = '',
}: {
	error: SwapError;
	onRetry?: () => void;
	isRetrying?: boolean;
	className?: string;
}) {
	const dict = useDict();
	const text = getSwapErrorText(error, dict);
	const styles = severityStyles(error.severity);
	const IconComponent = styles.Icon;

	return (
		<div className={cn('flex items-center gap-2 rounded-lg border p-2', styles.container, className)}>
			<IconComponent className={cn('size-4 shrink-0', styles.icon)} aria-hidden />

			<div className="min-w-0 flex-1">
				<p className={cn('text-sm font-medium', styles.text)}>{text.title}</p>
				<p className={cn('text-xs opacity-90', styles.text)}>{text.message}</p>
			</div>

			{error.retryable && onRetry && (
				<Button onClick={onRetry} disabled={isRetrying} size="sm" variant="ghost" className="size-6 p-0">
					<RefreshCw className={cn('size-3', isRetrying && 'animate-spin')} />
				</Button>
			)}
		</div>
	);
}
