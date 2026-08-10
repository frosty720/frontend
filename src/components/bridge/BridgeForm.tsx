// Bridge Form Component - Main bridge transfer form using React Hook Form
// Adapted from Hyperlane TransferTokenForm with shadcn/ui components

'use client';

import { bridgeLogger } from '@/lib/logger';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ArrowUpDown, ArrowRight, ChevronLeft, CheckCircle, AlertCircle, Clock } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

import { useActiveAccount } from 'thirdweb/react';

import { useBridgeContext } from '@/hooks/bridge/useBridgeContext';
import { useBridgeTransfer } from '@/hooks/bridge/useBridgeTransfer';
import { useBridgeBalances } from '@/hooks/bridge/useBridgeBalances';
import { useBridgeValidation } from '@/hooks/bridge/useBridgeValidation';
import { useFeeQuotes } from '@/hooks/bridge/useFeeQuotes';
import { useWallet } from '@/hooks/useWallet';
import { bridgeHelpers } from '@/utils/bridge/bridgeHelpers';

import { ChainSelector } from './ChainSelector';
import { TokenSelector } from './TokenSelector';
import { TransactionReview } from './TransactionReview';
import { TransferStatus } from './TransferStatus';
import { useTransferStore } from '@/hooks/bridge/useTransferStore';

// Form validation schema
const bridgeFormSchema = z.object({
  originChain: z.string().min(1, 'Origin chain is required'),
  destinationChain: z.string().min(1, 'Destination chain is required'),
  tokenIndex: z.number().nullable(),
  amount: z.string().min(1, 'Amount is required'),
  recipient: z.string().min(1, 'Recipient address is required'),
});

export type BridgeFormValues = z.infer<typeof bridgeFormSchema>;

export function BridgeForm() {
  const [isReview, setIsReview] = useState(false);
  const { address: account } = useWallet();
  const thirdwebAccount = useActiveAccount();
  const { getLatestTransfer } = useTransferStore();
  const latestTransfer = getLatestTransfer();

  const {
    selectedOriginChain,
    selectedDestinationChain,
    selectedTokenIndex,
    transferAmount,
    recipientAddress,
    setSelectedOriginChain,
    setSelectedDestinationChain,
    setSelectedTokenIndex,
    setTransferAmount,
    setRecipientAddress,
    swapChains,
    resetForm,
    warpCore,
  } = useBridgeContext();

  // Initialize form with context values
  const form = useForm<BridgeFormValues>({
    resolver: zodResolver(bridgeFormSchema),
    defaultValues: {
      originChain: selectedOriginChain,
      destinationChain: selectedDestinationChain,
      tokenIndex: selectedTokenIndex,
      amount: transferAmount,
      recipient: recipientAddress,
    },
    mode: 'onChange',
  });

  // Get form values for hooks
  const formValues = form.watch();

  // Bridge hooks
  const { transfer, isLoading: isTransferring, error: transferError, successMessage } = useBridgeTransfer();
  const { validate, isValidating } = useBridgeValidation();

  const { originBalance, destinationBalance } = useBridgeBalances({
    originChain: formValues.originChain,
    destinationChain: formValues.destinationChain,
    tokenIndex: formValues.tokenIndex,
  });

  const { fees, isLoading: isLoadingFees, lastUpdated, refreshFees } = useFeeQuotes({
    originChain: formValues.originChain,
    destinationChain: formValues.destinationChain,
    tokenIndex: formValues.tokenIndex,
    amount: formValues.amount,
    recipient: formValues.recipient,
  }, isReview);

  // Handle form submission
  const onSubmit = async (values: BridgeFormValues) => {
    if (!isReview) {
      // First submission - validate and show review
      const errors = await validate(values);
      if (Object.keys(errors).length === 0) {
        setIsReview(true);
      } else {
        // Set form errors
        Object.entries(errors).forEach(([field, message]) => {
          form.setError(field as keyof BridgeFormValues, { message });
        });
      }
    } else {
      // Second submission - execute transfer
      if (values.tokenIndex !== null) {
        try {
          await transfer({
            originChain: values.originChain,
            destinationChain: values.destinationChain,
            tokenIndex: values.tokenIndex,
            amount: values.amount,
            recipient: values.recipient,
          });

          // Reset form after successful transfer
          setIsReview(false);
          resetForm();
          form.reset();
        } catch (error) {
          bridgeLogger.error('Transfer failed:', error);
          setIsReview(false);
        }
      }
    }
  };

  // Handle chain swap
  const handleSwapChains = () => {
    swapChains();
    form.setValue('originChain', selectedDestinationChain);
    form.setValue('destinationChain', selectedOriginChain);
    form.setValue('tokenIndex', null);
    setSelectedTokenIndex(null);
  };

  // Handle max amount
  const handleMaxAmount = () => {
    if (originBalance) {
      const maxAmount = bridgeHelpers.calculateMaxAmount(originBalance, fees?.totalFee || null);
      form.setValue('amount', maxAmount);
      setTransferAmount(maxAmount);
    }
  };

  // Handle self recipient
  // Prefer the Thirdweb in-app wallet address (the user's KalySwap identity) over
  // any wagmi-visible account, which may be a background-auto-connected MetaMask.
  const handleSelfRecipient = () => {
    const selfAddress = thirdwebAccount?.address ?? account;
    if (selfAddress) {
      form.setValue('recipient', selfAddress);
      setRecipientAddress(selfAddress);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="w-100 sm:w-[31rem]">
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Chain Selection Section */}
            <div className="flex items-center justify-between gap-4">
              <FormField
                control={form.control}
                name="originChain"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>From</FormLabel>
                    <FormControl>
                      <ChainSelector
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value);
                          setSelectedOriginChain(value);
                        }}
                        disabled={isReview}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex flex-col items-center pt-6">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleSwapChains}
                  disabled={isReview}
                  className="h-8 w-8"
                >
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </div>

              <FormField
                control={form.control}
                name="destinationChain"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>To</FormLabel>
                    <FormControl>
                      <ChainSelector
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value);
                          setSelectedDestinationChain(value);
                        }}
                        disabled={isReview}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Polygon finality notice — validators wait out Polygon's reorg
                window before signing, so outbound transfers are slow */}
            {formValues.originChain === 'polygon' && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <Clock className="h-5 w-5 text-amber-600 flex-shrink-0" />
                <p className="text-sm text-amber-700">
                  Transfers from Polygon take up to 10 minutes to arrive while
                  the bridge waits for Polygon finality.
                </p>
              </div>
            )}

            {/* Token and Amount Section */}
            <div className="flex items-end justify-between gap-4">
              <FormField
                control={form.control}
                name="tokenIndex"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Token</FormLabel>
                    <FormControl>
                      <TokenSelector
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value);
                          setSelectedTokenIndex(value);
                        }}
                        originChain={formValues.originChain}
                        destinationChain={formValues.destinationChain}
                        disabled={isReview}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <div className="flex justify-between items-center">
                      <FormLabel>Amount</FormLabel>
                      {originBalance && (
                        <span className="text-xs text-muted-foreground">
                          Balance: {bridgeHelpers.formatTokenAmount(originBalance)}
                        </span>
                      )}
                    </div>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type="text"
                          placeholder="0.00"
                          disabled={isReview}
                          className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          {...field}
                          onChange={(e) => {
                            // Only allow numeric input with decimal
                            const value = e.target.value;
                            if (value === '' || /^\d*\.?\d*$/.test(value)) {
                              field.onChange(value);
                              setTransferAmount(value);
                            }
                          }}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleMaxAmount}
                          disabled={isReview || !originBalance}
                          className="absolute right-1 top-1 h-7 px-2 text-xs"
                        >
                          Max
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Recipient Section */}
            <FormField
              control={form.control}
              name="recipient"
              render={({ field }) => (
                <FormItem>
                  <div className="flex justify-between items-center">
                    <FormLabel>Recipient Address</FormLabel>
                    {destinationBalance && (
                      <span className="text-xs text-muted-foreground">
                        Remote balance: {bridgeHelpers.formatTokenAmount(destinationBalance)}
                      </span>
                    )}
                  </div>
                  <FormControl>
                    <div className="relative">
                      <Input
                        placeholder="0x123456..."
                        disabled={isReview}
                        {...field}
                        onChange={(e) => {
                          field.onChange(e.target.value);
                          setRecipientAddress(e.target.value);
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleSelfRecipient}
                        disabled={isReview || !account}
                        className="absolute right-1 top-1 h-7 px-2 text-xs"
                      >
                        Self
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Success Message */}
            {successMessage && (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                <p className="text-sm text-green-700">{successMessage}</p>
              </div>
            )}

            {/* Error Message */}
            {transferError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-700">{transferError}</p>
              </div>
            )}

            {/* Transaction Review */}
            {isReview && (
              <TransactionReview
                formValues={formValues}
                fees={fees}
                isLoading={isLoadingFees}
                lastUpdated={lastUpdated}
                onRefreshFees={refreshFees}
              />
            )}

            {/* Submit Button */}
            <div className="pt-4">
              {!isReview ? (
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isValidating || !account}
                >
                  {isValidating ? 'Validating...' : 'Continue'}
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsReview(false)}
                    className="flex-1"
                  >
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={isTransferring}
                  >
                    {isTransferring ? 'Sending...' : (
                      <>
                        Send to {bridgeHelpers.getChainDisplayName(formValues.destinationChain)}
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>

    {/* Transfer Status Display */}
    {latestTransfer && (
      <TransferStatus className="w-100 sm:w-[31rem]" />
    )}
  </div>
  );
}
