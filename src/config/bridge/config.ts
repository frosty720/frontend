// Bridge Configuration - Adapted from Hyperlane Bridge UI
// This file contains core bridge configuration settings

import { ChainMap } from '@hyperlane-xyz/sdk';

const isDevMode = process?.env?.NODE_ENV === 'development';
const version = process?.env?.NEXT_PUBLIC_VERSION || '0.0.0';
const registryUrl = process?.env?.NEXT_PUBLIC_REGISTRY_URL || undefined;
const explorerApiKeys = JSON.parse(process?.env?.EXPLORER_API_KEYS || '{}');
const walletConnectProjectId = process?.env?.NEXT_PUBLIC_WALLET_CONNECT_ID || '';

interface BridgeConfig {
  enableExplorerLink: boolean; // Include a link to the hyperlane explorer in the transfer modal
  explorerApiKeys: Record<string, string>; // Optional map of API keys for block explorer
  isDevMode: boolean; // Enables some debug features in the app
  registryUrl: string | undefined; // Optional URL to use a custom registry instead of the published canonical version
  showDisabledTokens: boolean; // Show/Hide invalid token options in the selection modal
  showTipBox: boolean; // Show/Hide the blue tip box above the transfer form
  version: string; // Matches version number in package.json
  walletConnectProjectId: string; // Project ID provided by walletconnect
  supportedChains: string[]; // List of supported chain names for bridge operations
  defaultOriginChain: string; // Default origin chain for bridge transfers
  defaultDestinationChain: string; // Default destination chain for bridge transfers
}

export const bridgeConfig: BridgeConfig = Object.freeze({
  enableExplorerLink: true,
  explorerApiKeys,
  isDevMode,
  registryUrl,
  showDisabledTokens: true,
  showTipBox: true,
  version,
  walletConnectProjectId,
  supportedChains: ['kalychain', 'arbitrum', 'bsc', 'polygon'],
  defaultOriginChain: 'arbitrum',
  defaultDestinationChain: 'kalychain',
});
