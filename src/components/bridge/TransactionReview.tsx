// Transaction Review Component - Transaction review and confirmation
// Adapted from Hyperlane ReviewDetails with shadcn/ui components

'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Loader2, ExternalLink } from 'lucide-react';
import { useBridgeContext } from '@/hooks/bridge/useBridgeContext';
import { useTokenApproval } from '@/hooks/bridge/useTokenApproval';
import { bridgeHelpers } from '@/utils/bridge/bridgeHelpers';
import { BridgeFormValues } from './BridgeForm';
import { BridgeFees } from '@/hooks/bridge/useFeeQuotes';
import { useDict } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';

interface TransactionReviewProps {
  formValues: BridgeFormValues;
  fees: BridgeFees | null;
  isLoading: boolean;
  lastUpdated?: number;
  onRefreshFees?: () => void;
}

export function TransactionReview({
  formValues,
  fees,
  isLoading,
  lastUpdated,
  onRefreshFees
}: TransactionReviewProps) {
  const dict = useDict();
  const { warpCore } = useBridgeContext();

  // Get token information
  const token = formValues.tokenIndex !== null && warpCore?.tokens
    ? warpCore.tokens[formValues.tokenIndex]
    : null;

  const destinationToken = token?.getConnectionForChain(formValues.destinationChain)?.token;

  // Check if token approval is required
  const { isApproveRequired, isLoading: isApprovalLoading } = useTokenApproval({
    tokenIndex: formValues.tokenIndex,
    amount: formValues.amount,
    enabled: !isLoading && !!token && !!formValues.amount
  });

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">{dict.bridge.review.title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2 text-sm text-muted-foreground">
              {dict.bridge.review.loading}
            </span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Transfer Summary */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">{dict.bridge.review.summaryTitle}</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{dict.bridge.review.from}</span>
                  <span>{bridgeHelpers.getChainDisplayName(formValues.originChain)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{dict.bridge.review.to}</span>
                  <span>{bridgeHelpers.getChainDisplayName(formValues.destinationChain)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{dict.bridge.review.token}</span>
                  <span>{token?.symbol || dict.bridge.review.unknownToken}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{dict.bridge.review.amount}</span>
                  <span>{formValues.amount} {token?.symbol}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{dict.bridge.review.recipient}</span>
                  <span className="font-mono text-xs">
                    {bridgeHelpers.truncateAddress(formValues.recipient)}
                  </span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Token Addresses */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">{dict.bridge.review.addressesTitle}</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">{dict.bridge.review.originToken}</span>
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-xs">
                      {bridgeHelpers.truncateAddress(token?.addressOrDenom || '')}
                    </span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </div>
                </div>
                {destinationToken?.addressOrDenom && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">{dict.bridge.review.destinationToken}</span>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-xs">
                        {bridgeHelpers.truncateAddress(destinationToken.addressOrDenom)}
                      </span>
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Transaction Steps */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">{dict.bridge.review.stepsTitle}</h4>
              <div className="space-y-2 text-sm">
                {isApprovalLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-muted-foreground">{dict.bridge.review.checkingApproval}</span>
                  </div>
                ) : (
                  <>
                    {isApproveRequired && (
                      <div className="flex items-start gap-2 p-2 bg-info/10 border border-info/25 rounded">
                        <div className="flex-shrink-0 w-5 h-5 bg-info text-ink rounded-full flex items-center justify-center text-xs font-medium">
                          1
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-cream">{dict.bridge.review.approveStepTitle}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {interpolate(dict.bridge.review.approveStepBody, { symbol: token?.symbol ?? '' })}
                          </div>
                          {token?.collateralAddressOrDenom && (
                            <div className="text-xs text-info mt-1 font-mono">
                              {interpolate(dict.bridge.review.approveStepToken, { address: bridgeHelpers.truncateAddress(token.collateralAddressOrDenom) })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="flex items-start gap-2 p-2 bg-success/10 border border-success/25 rounded">
                      <div className="flex-shrink-0 w-5 h-5 bg-success text-ink rounded-full flex items-center justify-center text-xs font-medium">
                        {isApproveRequired ? '2' : '1'}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-success">{dict.bridge.review.transferStepTitle}</div>
                        <div className="text-xs text-success mt-1">
                          {interpolate(dict.bridge.review.transferStepBody, {
                            amount: formValues.amount,
                            symbol: token?.symbol ?? '',
                            chain: bridgeHelpers.getChainDisplayName(formValues.destinationChain),
                          })}
                        </div>
                        <div className="text-xs text-success mt-1 font-mono">
                          {interpolate(dict.bridge.review.transferStepTo, { address: bridgeHelpers.truncateAddress(formValues.recipient) })}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <Separator />

            {/* Fee Breakdown */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">{dict.bridge.review.feesTitle}</h4>
              <div className="space-y-1 text-sm">
                {fees?.localQuote && fees.localQuote.amount > BigInt(0) && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{dict.bridge.review.localGas}</span>
                    <span>
                      {bridgeHelpers.formatTokenAmount(fees.localQuote)} {fees.localQuote.token.symbol}
                    </span>
                  </div>
                )}
                {fees?.interchainQuote && fees.interchainQuote.amount > BigInt(0) && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{dict.bridge.review.interchainGas}</span>
                    <span>
                      {bridgeHelpers.formatTokenAmount(fees.interchainQuote)} {fees.interchainQuote.token.symbol}
                    </span>
                  </div>
                )}
                {fees?.totalFee && (
                  <>
                    <Separator className="my-2" />
                    <div className="flex justify-between font-medium">
                      <span>{dict.bridge.review.totalFees}</span>
                      <span>
                        {bridgeHelpers.formatTokenAmount(fees.totalFee)} {fees.totalFee.token.symbol}
                      </span>
                    </div>
                  </>
                )}
                {!fees?.localQuote && !fees?.interchainQuote && (
                  <div className="text-center text-muted-foreground">
                    {dict.bridge.review.feesUnavailable}
                  </div>
                )}
              </div>
            </div>

            {/* Important Notes */}
            <div className="bg-surface-alt rounded-lg p-3">
              <h4 className="text-sm font-medium mb-2">{dict.bridge.review.notesTitle}</h4>
              <ul className="text-xs text-muted-foreground space-y-1">
                {isApproveRequired && (
                  <li>• {dict.bridge.review.noteApprove}</li>
                )}
                <li>• {dict.bridge.review.noteDuration}</li>
                <li>• {dict.bridge.review.noteRecipient}</li>
                <li>• {dict.bridge.review.noteGas}</li>
                <li>• {dict.bridge.review.noteIrreversible}</li>
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
