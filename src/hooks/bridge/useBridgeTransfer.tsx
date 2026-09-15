// Bridge Transfer Hook - Core transfer logic adapted from Hyperlane
// This hook handles bridge transfer operations with full status tracking

import { useState, useCallback } from 'react';
import {
  createPublicClient,
  custom,
  decodeFunctionData,
  erc20Abi,
  parseUnits,
  type EIP1193Provider,
} from 'viem';
import type { providers } from 'ethers';
import {
  ChainMap,
  CoreAddresses,
  MultiProtocolCore,
  MultiProtocolProvider,
  ProviderType,
} from '@hyperlane-xyz/sdk';
import { useBridgeContext } from './useBridgeContext';
import { useWallet } from '../useWallet';
import {
  useTransferStore,
  TransferStatus,
  TransferContext,
  txCategoryToStatuses,
  humanizeBridgeError,
  describeBridgeFailure,
  type BridgeFailure,
} from './useTransferStore';
import { useToast } from '@/components/ui/toast';
import { bridgeHelpers } from '@/utils/bridge/bridgeHelpers';
import { loggerHelpers } from '@/utils/bridge/logger';
import { bridgeLogger } from '@/lib/logger';
import { UserError } from '@/lib/userError';
import { describeError } from '@/i18n/errorText';
import { useDict } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';

export interface TransferParams {
  originChain: string;
  destinationChain: string;
  tokenIndex: number;
  amount: string;
  recipient: string;
}

// Extract the Hyperlane message id from a confirmed transfer receipt.
// Mirrors tryGetMsgIdFromTransferReceipt in the hyperlane-warp-ui repo:
// actual core addresses are not required for id extraction, so stubs suffice.
function tryGetMsgIdFromReceipt(
  multiProvider: MultiProtocolProvider,
  origin: string,
  receipt: providers.TransactionReceipt
): string | undefined {
  try {
    const addressStubs = multiProvider
      .getKnownChainNames()
      .reduce<ChainMap<CoreAddresses>>((acc, chainName) => {
        acc[chainName] = { validatorAnnounce: '', proxyAdmin: '', mailbox: '' };
        return acc;
      }, {});
    const core = new MultiProtocolCore(multiProvider, addressStubs);
    const messages = core.extractMessageIds(origin, {
      type: ProviderType.EthersV5,
      receipt,
    });
    return messages.length ? messages[0].messageId : undefined;
  } catch (error) {
    bridgeLogger.error('Could not extract message id from receipt:', error);
    return undefined;
  }
}

// After an approval is mined on our RPC, wallets like MetaMask still simulate
// the follow-up transfer against their own node (e.g. Infura), which can lag a
// few seconds behind. Submitting the transfer before the wallet's node has seen
// the new allowance makes the wallet warn "likely to fail" and can get the
// submission rejected. Poll the allowance through the wallet's own provider
// until the approval is visible there. Returns false when there is no injected
// provider to check against (e.g. in-app wallets) or the poll gave up.
async function waitForWalletToSeeApproval(
  tokenAddress: string,
  approveData: string,
  owner: string
): Promise<boolean> {
  const injected =
    typeof window !== 'undefined'
      ? (window as { ethereum?: EIP1193Provider }).ethereum
      : undefined;
  if (!injected) return false;
  try {
    const decoded = decodeFunctionData({ abi: erc20Abi, data: approveData as `0x${string}` });
    if (decoded.functionName !== 'approve') return false;
    const [spender, amount] = decoded.args;
    const walletProviderClient = createPublicClient({ transport: custom(injected) });
    for (let attempt = 0; attempt < 15; attempt++) {
      const allowance = await walletProviderClient.readContract({
        address: tokenAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [owner as `0x${string}`, spender],
      });
      if (allowance >= amount) return true;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  } catch (error) {
    bridgeLogger.warn('Could not verify allowance via wallet provider:', error);
  }
  return false;
}

export function useBridgeTransfer() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { warpCore, multiProvider } = useBridgeContext();
  const { address: account, signTransaction, chainId } = useWallet();
  const { addTransfer, updateTransferStatus } = useTransferStore();
  const toast = useToast();
  const dict = useDict();

  const transfer = useCallback(async (params: TransferParams) => {
    if (!warpCore || !multiProvider || !account) {
      const notReady = new UserError('bridgeNotReady');
      toast.error(dict.bridge.errors.bridgeErrorTitle, describeError(notReady, dict));
      throw notReady;
    }

    loggerHelpers.transferStart(params);
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    let transferIndex: number | undefined;
    let currentStatus: TransferStatus = TransferStatus.Preparing;

    try {
      // Check if we need to switch chains
      const originChainId = multiProvider.getChainMetadata(params.originChain).chainId;
      if (chainId && chainId !== originChainId) {
        loggerHelpers.chainSwitch(`Chain ${chainId}`, `${params.originChain} (${originChainId})`);

        // Manual chain switch required - show user-friendly message
        const switchError = new UserError('switchChain', { chain: bridgeHelpers.getChainDisplayName(params.originChain) });
        toast.error(dict.bridge.errors.chainSwitchTitle, describeError(switchError, dict));
        loggerHelpers.chainSwitch('Manual chain switch required', `${params.originChain} (${originChainId})`);
        throw switchError;
      }

      // Get tokens from warp core
      const tokens = warpCore.tokens;
      if (params.tokenIndex >= tokens.length) {
        throw new UserError('tokenNotFound');
      }

      const token = tokens[params.tokenIndex];
      if (!token) {
        throw new UserError('tokenNotFound');
      }

      // Parse amount with token decimals
      const amountWei = parseUnits(params.amount, token.decimals);
      const tokenAmount = token.amount(amountWei.toString());

      // Find destination token connection
      const connection = token.getConnectionForChain(params.destinationChain);
      if (!connection) {
        throw new UserError('noBridgeRoute', {
          origin: bridgeHelpers.getChainDisplayName(params.originChain),
          destination: bridgeHelpers.getChainDisplayName(params.destinationChain),
        });
      }

      // Add transfer to store
      const transferContext: TransferContext = {
        timestamp: Date.now(),
        status: TransferStatus.Preparing,
        origin: params.originChain,
        destination: params.destinationChain,
        originTokenAddressOrDenom: token.addressOrDenom,
        destTokenAddressOrDenom: connection.token.addressOrDenom,
        sender: account,
        recipient: params.recipient,
        amount: params.amount,
      };

      transferIndex = addTransfer(transferContext);
      updateTransferStatus(transferIndex, TransferStatus.Preparing);

      // Check destination collateral sufficiency (CRITICAL GAP FIXED)
      bridgeLogger.debug('🔍 Checking destination collateral...');
      const isCollateralSufficient = await warpCore.isDestinationCollateralSufficient({
        originTokenAmount: tokenAmount,
        destination: params.destinationChain,
      });

      if (!isCollateralSufficient) {
        const collateralError = new UserError('insufficientCollateral');
        toast.error(dict.bridge.errors.transferFailedTitle, describeError(collateralError, dict));
        updateTransferStatus(transferIndex, TransferStatus.Failed, undefined, undefined, { code: 'insufficientCollateral' });
        throw collateralError;
      }

      // Validate transfer
      bridgeLogger.debug('✅ Validating transfer...');
      const validation = await warpCore.validateTransfer({
        originTokenAmount: tokenAmount,
        destination: params.destinationChain,
        recipient: params.recipient,
        sender: account,
      });

      if (validation && Object.keys(validation).length > 0) {
        // The Hyperlane SDK's own validation message (English, unbounded set of possible
        // strings) — kept for the log/thrown Error so classification below still works, but
        // never shown to the user: only the translated generic stage text is.
        const sdkMessage = Object.values(validation)[0] as string;
        const validationFailure: BridgeFailure = { code: 'stage', stage: TransferStatus.Preparing };
        toast.error(dict.bridge.errors.validationFailedTitle, describeBridgeFailure(validationFailure, dict));
        updateTransferStatus(transferIndex, TransferStatus.Failed, undefined, undefined, validationFailure);
        throw new Error(sdkMessage);
      }

      // Update status: Creating transactions
      updateTransferStatus(transferIndex, (currentStatus = TransferStatus.CreatingTxs));

      // Get transfer transactions
      bridgeLogger.debug('📝 Creating transfer transactions...');
      const transferTxs = await warpCore.getTransferRemoteTxs({
        originTokenAmount: tokenAmount,
        destination: params.destinationChain,
        recipient: params.recipient,
        sender: account,
      });

      bridgeLogger.debug(`📋 Created ${transferTxs.length} transactions`);
      transferTxs.forEach((tx, index) => {
        bridgeLogger.debug(`Transaction ${index + 1}:`, {
          category: tx.category
        });
      });

      // Execute transactions with status tracking
      const txHashes: string[] = [];
      let msgId: string | undefined;
      for (const tx of transferTxs) {
        const category = tx.category || 'transfer';
        const [signingStatus, confirmingStatus] = txCategoryToStatuses[category as keyof typeof txCategoryToStatuses] ||
          [TransferStatus.SigningTransfer, TransferStatus.ConfirmingTransfer];

        // Update status: Signing
        updateTransferStatus(transferIndex, (currentStatus = signingStatus));

        bridgeLogger.debug(`✍️ Signing ${category} transaction...`);
        const txHash = await signTransaction(tx);
        txHashes.push(txHash);

        // Update status: Confirming
        updateTransferStatus(transferIndex, (currentStatus = confirmingStatus), txHash);

        bridgeLogger.debug(`⏳ Confirming ${category} transaction: ${txHash}`);

        // Every transaction must be mined before we move on. For approvals,
        // submitting the transfer earlier makes its gas estimation run against
        // a node that has not seen the allowance yet, reverting with
        // "ERC20: transfer amount exceeds allowance" (seen on Polygon). For
        // transfers, success must only be reported once the tx actually landed.
        const provider = multiProvider.getEthersV5Provider(params.originChain);
        const receipt = await provider.waitForTransaction(txHash);
        if (receipt.status === 0) {
          throw new UserError('bridgeReverted', { chain: bridgeHelpers.getChainDisplayName(params.originChain), hash: txHash });
        }
        bridgeLogger.debug(`✅ ${category} transaction confirmed: ${txHash}`);

        // Do not submit the transfer until the wallet's own node can see the
        // approval, otherwise its gas simulation fails and the UX degrades.
        if (category === 'approval') {
          const populated = (tx as { transaction?: { to?: string; data?: string } }).transaction;
          const walletSawApproval =
            typeof populated?.to === 'string' && typeof populated?.data === 'string'
              ? await waitForWalletToSeeApproval(populated.to, populated.data, account)
              : false;
          if (!walletSawApproval) {
            // No injected provider to check against — give lagging wallet
            // nodes a couple of extra blocks instead.
            await provider.waitForTransaction(txHash, 3);
          }
        }

        if (category === 'transfer') {
          msgId = tryGetMsgIdFromReceipt(multiProvider, params.originChain, receipt);
          if (msgId) bridgeLogger.debug(`📧 Hyperlane message id: ${msgId}`);
        }

        // Show transaction confirmed toast
        const explorerUrl = bridgeHelpers.getTransactionUrl(txHash, params.originChain);
        toast.success(
          dict.bridge.toasts.txConfirmedTitle,
          interpolate(dict.bridge.toasts.txConfirmedBody, { hash: `${txHash.slice(0, 6)}...${txHash.slice(-4)}` }),
          { duration: 8000, link: explorerUrl ? { label: dict.bridge.toasts.viewOnExplorer, url: explorerUrl } : undefined },
        );
      }

      // Update final status
      updateTransferStatus(transferIndex, TransferStatus.ConfirmedTransfer, txHashes[txHashes.length - 1], msgId);

      // Show success toast
      toast.success(
        dict.bridge.toasts.bridgeStartedTitle,
        interpolate(dict.bridge.toasts.bridgeStartedBody, {
          amount: params.amount,
          token: token.symbol,
          from: bridgeHelpers.getChainDisplayName(params.originChain),
          to: bridgeHelpers.getChainDisplayName(params.destinationChain),
        }),
        { duration: 10000 },
      );

      setSuccessMessage(interpolate(dict.bridge.form.transferInitiated, { count: txHashes.length }));
      bridgeLogger.debug('🎉 Bridge transfer completed successfully!');

      return transferTxs;
    } catch (err) {
      // Raw error goes to the log; users see the stage-aware message.
      bridgeLogger.error(`❌ Bridge transfer failed at stage ${currentStatus}:`, err);
      const failure = humanizeBridgeError(err, currentStatus);
      const errorMessage = describeBridgeFailure(failure, dict);

      // Update transfer status to failed if we have a transfer index
      if (transferIndex !== undefined) {
        updateTransferStatus(transferIndex, TransferStatus.Failed, undefined, undefined, failure);
      }

      // Show error toast
      toast.error(dict.bridge.toasts.bridgeFailedTitle, errorMessage, { duration: 10000 });

      setError(errorMessage);
      setSuccessMessage(null);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [warpCore, multiProvider, account, signTransaction, addTransfer, updateTransferStatus, toast, dict]);

  return {
    transfer,
    isLoading,
    error,
    successMessage,
  };
}
