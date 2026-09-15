'use client';

import { useMemo } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { Card, CardContent } from '@/components/ui/card';
import { ExternalLink, AlertCircle, Info } from 'lucide-react';
import { useDict } from '@/i18n/hooks';

interface AlchemyPayWidgetProps {
  /** Default fiat currency (e.g., 'USD', 'EUR') */
  defaultFiat?: string;
  /** Default crypto to purchase (e.g., 'USDT', 'ETH') */
  defaultCrypto?: string;
  /** Default network (e.g., 'BSC', 'ETH', 'POLYGON') */
  defaultNetwork?: string;
  /** Widget height in pixels */
  height?: number;
  /** Show buy or sell tab */
  showTable?: 'buy' | 'sell';
}

/**
 * AlchemyPay On-Ramp Widget Component
 *
 * Embeds the AlchemyPay iframe for fiat-to-crypto purchases.
 * Automatically pre-fills the user's wallet address when connected.
 *
 * @see https://alchemypay.readme.io/docs/alchemypay-on-ramp
 */
export function AlchemyPayWidget({
  defaultFiat = 'USD',
  defaultCrypto = 'USDT',
  defaultNetwork = 'BSC',
  height = 625,
  showTable = 'buy',
}: AlchemyPayWidgetProps) {
  const dict = useDict();
  const { address, isConnected } = useWallet();

  // Get the AlchemyPay App ID from environment variable
  const appId = process.env.NEXT_PUBLIC_ALCHEMYPAY_APP_ID;

  // Build the iframe URL with parameters
  const iframeSrc = useMemo(() => {
    if (!appId) return null;

    const baseUrl = 'https://ramp.alchemypay.org';
    const params = new URLSearchParams();

    // Required parameter
    params.set('appId', appId);

    // Optional parameters
    params.set('fiat', defaultFiat);
    params.set('crypto', defaultCrypto);
    params.set('network', defaultNetwork);
    params.set('showTable', showTable);

    // Pre-fill wallet address if connected
    if (isConnected && address) {
      params.set('address', address);
    }

    return `${baseUrl}?${params.toString()}`;
  }, [appId, defaultFiat, defaultCrypto, defaultNetwork, showTable, isConnected, address]);

  // Show error if no App ID is configured
  if (!appId) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 p-4 rounded-lg bg-danger/10 text-danger border border-danger/25">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <p className="text-sm">
              {dict.onramp.notConfigured}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-full">
      {/* Connection status hint */}
      {!isConnected && (
        <div className="flex items-center gap-3 p-4 mb-4 rounded-lg bg-surface-alt border border-line">
          <Info className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {dict.onramp.connectHint}
          </p>
        </div>
      )}

      {/* AlchemyPay iframe */}
      <div
        className="relative w-full rounded-lg overflow-hidden bg-surface"
        style={{ minHeight: height }}
      >
        <iframe
          title={dict.onramp.iframeTitle}
          src={iframeSrc || ''}
          height={height}
          style={{
            display: 'block',
            width: '100%',
            maxHeight: `${height}px`,
            maxWidth: '500px',
            margin: '0 auto',
            border: 'none',
            borderRadius: '10px',
          }}
          allow="accelerometer; autoplay; camera; gyroscope; payment"
          allowFullScreen
        />
      </div>

      {/* Footer with info */}
      <div className="mt-4 text-center text-xs text-muted-foreground">
        <p className="flex items-center justify-center gap-1">
          {dict.onramp.poweredBy}
          <a
            href="https://alchemypay.org"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center hover:text-gold-light"
          >
            <ExternalLink className="h-3 w-3 ml-1" />
          </a>
        </p>
        <p className="mt-1">
          {dict.onramp.footerBody}
        </p>
      </div>
    </div>
  );
}

export default AlchemyPayWidget;
