// Transfer Status Component - Shows current transfer progress
// Displays transfer status with progress indicators and transaction links

'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExternalLink, Clock, CheckCircle, AlertCircle, ArrowRight, Copy } from 'lucide-react';
import { useTransferStore, TransferStatus as TransferStatusEnum, transferStatusHelpers } from '@/hooks/bridge/useTransferStore';
import { bridgeHelpers } from '@/utils/bridge/bridgeHelpers';
import { useToast } from '@/components/ui/toast';

interface TransferStatusProps {
  className?: string;
}

export function TransferStatus({ className }: TransferStatusProps) {
  const { transfers, getLatestTransfer } = useTransferStore();
  const latestTransfer = getLatestTransfer();
  const toast = useToast();

  const handleCopyAddress = async (address: string, label: string) => {
    const success = await bridgeHelpers.copyToClipboard(address);
    if (success) {
      toast.success('Copied!', `${label} copied to clipboard`);
    } else {
      toast.error('Copy Failed', `Failed to copy ${label}`);
    }
  };

  if (!latestTransfer) {
    return null;
  }

  const isInProgress = transferStatusHelpers.isInProgress(latestTransfer.status);
  const isSuccess = transferStatusHelpers.isSuccess(latestTransfer.status);
  const isFailed = transferStatusHelpers.isFailed(latestTransfer.status);

  const getStatusIcon = () => {
    if (isSuccess) return <CheckCircle className="h-5 w-5 text-green-600" />;
    if (isFailed) return <AlertCircle className="h-5 w-5 text-red-600" />;
    return <Clock className="h-5 w-5 text-blue-600 animate-spin" />;
  };

  const getStatusColor = () => {
    if (isSuccess) return 'border-green-200 bg-green-50';
    if (isFailed) return 'border-red-200 bg-red-50';
    return 'border-blue-200 bg-blue-50';
  };

  const getProgressPercentage = () => {
    const statusOrder = [
      TransferStatusEnum.Preparing,
      TransferStatusEnum.CreatingTxs,
      TransferStatusEnum.SigningApproval,
      TransferStatusEnum.ConfirmingApproval,
      TransferStatusEnum.SigningTransfer,
      TransferStatusEnum.ConfirmingTransfer,
      TransferStatusEnum.ConfirmedTransfer,
      TransferStatusEnum.Delivered,
    ];

    const currentIndex = statusOrder.indexOf(latestTransfer.status);
    if (currentIndex === -1) return 0;
    
    return Math.round(((currentIndex + 1) / statusOrder.length) * 100);
  };

  return (
    <Card className={`${className} ${getStatusColor()} border-2`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          {getStatusIcon()}
          Transfer Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Transfer Details */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium">
              {bridgeHelpers.getChainDisplayName(latestTransfer.origin)}
            </span>
            <ArrowRight className="h-4 w-4 text-gray-400" />
            <span className="font-medium">
              {bridgeHelpers.getChainDisplayName(latestTransfer.destination)}
            </span>
          </div>
          <span className="text-gray-600">
            {latestTransfer.amount} {bridgeHelpers.getTokenSymbol(latestTransfer.originTokenAddressOrDenom)}
          </span>
        </div>

        {/* Progress Bar */}
        {isInProgress && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-600">
              <span>Progress</span>
              <span>{getProgressPercentage()}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${getProgressPercentage()}%` }}
              />
            </div>
          </div>
        )}

        {/* Status Message */}
        <div className="text-center">
          <p className={`font-medium ${transferStatusHelpers.getStatusColor(latestTransfer.status)}`}>
            {transferStatusHelpers.getStatusMessage(latestTransfer.status)}
          </p>
          {latestTransfer.errorMessage && (
            <p className="text-sm text-red-600 mt-1">{latestTransfer.errorMessage}</p>
          )}
        </div>

        {/* Transaction Links */}
        {latestTransfer.txHash && (
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              size="sm"
              asChild
              className="w-full"
            >
              <a
                href={bridgeHelpers.getTransactionUrl(latestTransfer.txHash, latestTransfer.origin)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2"
              >
                View Transaction
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
            
          </div>
        )}

        {/* Hyperlane Message ID — the public Hyperlane explorer does not index
            self-hosted KalyChain, so show a copyable id for support instead */}
        {latestTransfer.msgId && (
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <span>Message ID: </span>
            <span className="font-mono">
              {latestTransfer.msgId.slice(0, 10)}...{latestTransfer.msgId.slice(-8)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCopyAddress(latestTransfer.msgId!, 'Message ID')}
              className="h-6 w-6 p-0 hover:bg-muted"
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Recipient Address */}
        <div className="flex items-center justify-center gap-2 text-xs text-gray-600">
          <span>To: </span>
          <span className="font-mono">
            {latestTransfer.recipient.slice(0, 6)}...{latestTransfer.recipient.slice(-4)}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleCopyAddress(latestTransfer.recipient, 'Recipient address')}
            className="h-6 w-6 p-0 hover:bg-gray-100"
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>

        {/* Timestamp */}
        <div className="text-xs text-gray-500 text-center">
          {new Date(latestTransfer.timestamp).toLocaleString()}
        </div>
      </CardContent>
    </Card>
  );
}

// Transfer History Component - Shows all transfers
export function TransferHistory({ className }: { className?: string }) {
  const { transfers, clearTransfers } = useTransferStore();

  if (transfers.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No transfers yet</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Transfer History</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={clearTransfers}
          className="text-xs"
        >
          Clear
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {transfers.slice().reverse().map((transfer, index) => (
          <div
            key={`${transfer.timestamp}-${index}`}
            className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">
                {transferStatusHelpers.getStatusIcon(transfer.status)}
              </span>
              <div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">
                    {bridgeHelpers.getChainDisplayName(transfer.origin)}
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium">
                    {bridgeHelpers.getChainDisplayName(transfer.destination)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {transfer.amount} {bridgeHelpers.getTokenSymbol(transfer.originTokenAddressOrDenom)}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className={`text-xs font-medium ${transferStatusHelpers.getStatusColor(transfer.status)}`}>
                {transferStatusHelpers.getStatusMessage(transfer.status)}
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(transfer.timestamp).toLocaleDateString()}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
