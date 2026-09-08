'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ArrowDown, AlertTriangle, Info } from 'lucide-react';
import { Token } from '@/config/dex/types';

interface SwapConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  fromToken: Token | null;
  toToken: Token | null;
  fromAmount: string;
  toAmount: string;
  slippage: string;
  priceImpact?: string;
  priceImpactSeverity?: 'low' | 'medium' | 'high' | 'critical';
  priceImpactWarning?: string | null;
  estimatedGas?: string;
  exchangeRate?: string;
  isLoading?: boolean;
}

export default function SwapConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  fromToken,
  toToken,
  fromAmount,
  toAmount,
  slippage,
  priceImpact,
  priceImpactSeverity = 'low',
  priceImpactWarning,
  estimatedGas,
  exchangeRate,
  isLoading = false
}: SwapConfirmationModalProps) {
  
  // Calculate minimum received after slippage
  const calculateMinimumReceived = () => {
    if (!toAmount || !slippage) return '0';
    const slippageMultiplier = (100 - parseFloat(slippage)) / 100;
    const minimumReceived = parseFloat(toAmount) * slippageMultiplier;
    return minimumReceived.toFixed(6);
  };

  // Calculate exchange rate
  const getExchangeRate = () => {
    if (exchangeRate) return exchangeRate;
    if (!fromAmount || !toAmount || parseFloat(fromAmount) === 0) return '0';
    const rate = parseFloat(toAmount) / parseFloat(fromAmount);
    return rate.toFixed(6);
  };

  // Get price impact styling based on severity
  const getPriceImpactStyling = () => {
    switch (priceImpactSeverity) {
      case 'critical':
        return { color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' };
      case 'high':
        return { color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' };
      case 'medium':
        return { color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200' };
      case 'low':
      default:
        return { color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' };
    }
  };

  const TokenIcon = ({ token }: { token: Token }) => {
    const [imageError, setImageError] = React.useState(false);

    return imageError ? (
      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-bold text-gray-600">
        {token.symbol.charAt(0)}
      </div>
    ) : (
      <img
        src={token.logoURI}
        alt={token.symbol}
        className="w-8 h-8 rounded-full"
        onError={() => setImageError(true)}
      />
    );
  };

  const priceImpactStyling = getPriceImpactStyling();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="!bg-stone-900 !border-amber-500/30 text-white max-w-md p-0" style={{ backgroundColor: '#1c1917', borderColor: 'rgba(245, 158, 11, 0.3)' }}>
        {/* Header */}
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="text-xl font-bold text-white">Confirm Swap</DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-4">
          {/* Swap Summary */}
          <div className="text-center space-y-3">
            <div className="text-sm" style={{ color: '#fef3c7' }}>You're swapping</div>
            
            {/* From Token */}
            <div className="flex items-center justify-center gap-3 p-3 bg-stone-800/80 border border-amber-500/30 rounded-lg">
              {fromToken && <TokenIcon token={fromToken} />}
              <div>
                <div className="font-semibold text-lg text-white">{fromAmount} {fromToken?.symbol}</div>
                <div className="text-sm" style={{ color: '#fef3c7' }}>{fromToken?.name}</div>
              </div>
            </div>

            {/* Arrow */}
            <div className="flex justify-center">
              <ArrowDown className="h-5 w-5 text-gray-400" />
            </div>

            {/* To Token */}
            <div className="flex items-center justify-center gap-3 p-3 bg-stone-800/80 border border-amber-500/30 rounded-lg">
              {toToken && <TokenIcon token={toToken} />}
              <div>
                <div className="font-semibold text-lg text-white">~{toAmount} {toToken?.symbol}</div>
                <div className="text-sm" style={{ color: '#fef3c7' }}>{toToken?.name}</div>
              </div>
            </div>
          </div>

          {/* Transaction Details */}
          <div className="space-y-3 pt-2">
            <div className="text-sm font-medium text-white">Transaction Details</div>
            
            <div className="space-y-2 text-sm">
              {/* Exchange Rate */}
              <div className="flex justify-between">
                <span style={{ color: '#fef3c7' }}>Exchange Rate</span>
                <span className="font-medium text-white">
                  1 {fromToken?.symbol} = {getExchangeRate()} {toToken?.symbol}
                </span>
              </div>

              {/* Minimum Received */}
              <div className="flex justify-between">
                <span style={{ color: '#fef3c7' }}>Minimum Received</span>
                <span className="font-medium text-white">
                  {calculateMinimumReceived()} {toToken?.symbol}
                </span>
              </div>

              {/* Price Impact */}
              {priceImpact && (
                <div className="flex justify-between">
                  <span style={{ color: '#fef3c7' }}>Price Impact</span>
                  <span className={`font-medium ${priceImpactStyling.color}`}>
                    {parseFloat(priceImpact) < 0.01 ? '<0.01%' : `${parseFloat(priceImpact).toFixed(2)}%`}
                  </span>
                </div>
              )}

              {/* Slippage Tolerance */}
              <div className="flex justify-between">
                <span style={{ color: '#fef3c7' }}>Slippage Tolerance</span>
                <span className="font-medium text-white">{slippage}%</span>
              </div>

              {/* Network Fee */}
              {estimatedGas && (
                <div className="flex justify-between">
                  <span style={{ color: '#fef3c7' }}>Network Fee</span>
                  <span className="font-medium text-white">~{estimatedGas} KMT</span>
                </div>
              )}
            </div>
          </div>

          {/* Enhanced Price Impact Warning */}
          {priceImpactWarning && (priceImpactSeverity === 'medium' || priceImpactSeverity === 'high' || priceImpactSeverity === 'critical') && (
            <div className={`p-3 rounded-lg ${priceImpactStyling.bg} border ${priceImpactStyling.border}`}>
              <div className="flex items-start gap-2">
                <AlertTriangle className={`h-4 w-4 mt-0.5 ${priceImpactStyling.color}`} />
                <div className="text-sm">
                  <div className={`font-medium ${priceImpactStyling.color}`}>
                    {priceImpactSeverity === 'critical' ? 'Critical Price Impact!' :
                     priceImpactSeverity === 'high' ? 'High Price Impact' :
                     'Price Impact Warning'}
                  </div>
                  <div className="text-gray-300 mt-1">
                    {priceImpactWarning}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* High Slippage Warning */}
          {parseFloat(slippage) > 5 && (
            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 text-yellow-400" />
                <div className="text-sm">
                  <div className="font-medium text-yellow-400">High Slippage</div>
                  <div className="text-yellow-300 mt-1">
                    Your slippage tolerance is high. You may receive significantly less than expected.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 bg-stone-700 hover:bg-stone-600 text-white border-amber-500/30"
            >
              Back
            </Button>
            <Button
              onClick={onConfirm}
              disabled={isLoading}
              className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Confirming...
                </div>
              ) : (
                'Confirm Swap'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
