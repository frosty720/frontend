import { CHAIN_IDS } from '@/config/chains';
// Wallet Compatibility Validation for Bridge Operations
// Validates wallet compatibility with specific chains and bridge operations

import { loggerHelpers } from './logger';

export interface WalletCompatibility {
  isCompatible: boolean;
  issues: string[];
  warnings: string[];
}

export interface ChainWalletConfig {
  chainId: number;
  chainName: string;
  supportedWallets: string[];
  requiredFeatures: string[];
}

// Chain-specific wallet configurations
const CHAIN_WALLET_CONFIGS: Record<string, ChainWalletConfig> = {
  kalychain: {
    chainId: CHAIN_IDS.KALYCHAIN,
    chainName: 'KalyChain',
    supportedWallets: ['metamask', 'walletconnect', 'coinbase', 'internal'],
    requiredFeatures: ['eth_sendTransaction', 'eth_signTransaction'],
  },
  arbitrum: {
    chainId: 42161,
    chainName: 'Arbitrum One',
    supportedWallets: ['metamask', 'walletconnect', 'coinbase', 'internal'],
    requiredFeatures: ['eth_sendTransaction', 'eth_signTransaction'],
  },
  bsc: {
    chainId: 56,
    chainName: 'BNB Smart Chain',
    supportedWallets: ['metamask', 'walletconnect', 'coinbase', 'internal'],
    requiredFeatures: ['eth_sendTransaction', 'eth_signTransaction'],
  },
  polygon: {
    chainId: CHAIN_IDS.POLYGON,
    chainName: 'Polygon',
    supportedWallets: ['metamask', 'walletconnect', 'coinbase', 'internal'],
    requiredFeatures: ['eth_sendTransaction', 'eth_signTransaction'],
  },
};

export const walletValidation = {
  // Validate wallet compatibility with a specific chain
  validateWalletForChain: async (
    walletType: string,
    chainName: string,
    walletProvider?: any
  ): Promise<WalletCompatibility> => {
    const result: WalletCompatibility = {
      isCompatible: true,
      issues: [],
      warnings: [],
    };

    try {
      const chainConfig = CHAIN_WALLET_CONFIGS[chainName];
      if (!chainConfig) {
        result.isCompatible = false;
        result.issues.push(`Unsupported chain: ${chainName}`);
        return result;
      }

      // Check if wallet type is supported
      if (!chainConfig.supportedWallets.includes(walletType)) {
        result.isCompatible = false;
        result.issues.push(`Wallet ${walletType} is not supported on ${chainConfig.chainName}`);
      }

      // Check wallet provider capabilities
      if (walletProvider) {
        for (const feature of chainConfig.requiredFeatures) {
          if (!walletProvider[feature] && !walletProvider.request) {
            result.warnings.push(`Wallet may not support required feature: ${feature}`);
          }
        }

        // Check if wallet can switch to the required chain
        if (walletProvider.request) {
          try {
            // Test if wallet supports chain switching
            const chainId = await walletProvider.request({ method: 'eth_chainId' });
            if (parseInt(chainId, 16) !== chainConfig.chainId) {
              result.warnings.push(`Wallet is on different chain. May need to switch to ${chainConfig.chainName}`);
            }
          } catch (error) {
            result.warnings.push('Unable to verify current chain');
          }
        }
      }

      loggerHelpers.validation(
        `Wallet validation for ${walletType} on ${chainName}`,
        { isCompatible: result.isCompatible, issues: result.issues, warnings: result.warnings }
      );

      return result;
    } catch (error) {
      loggerHelpers.validationError('Wallet validation failed', { walletType, chainName, error });
      result.isCompatible = false;
      result.issues.push('Failed to validate wallet compatibility');
      return result;
    }
  },

  // Validate wallet for bridge transfer (both origin and destination chains)
  validateWalletForTransfer: async (
    walletType: string,
    originChain: string,
    destinationChain: string,
    walletProvider?: any
  ): Promise<WalletCompatibility> => {
    const originValidation = await walletValidation.validateWalletForChain(
      walletType,
      originChain,
      walletProvider
    );

    const destValidation = await walletValidation.validateWalletForChain(
      walletType,
      destinationChain,
      walletProvider
    );

    return {
      isCompatible: originValidation.isCompatible && destValidation.isCompatible,
      issues: [...originValidation.issues, ...destValidation.issues],
      warnings: [...originValidation.warnings, ...destValidation.warnings],
    };
  },

  // Get supported wallets for a chain
  getSupportedWallets: (chainName: string): string[] => {
    const chainConfig = CHAIN_WALLET_CONFIGS[chainName];
    return chainConfig ? chainConfig.supportedWallets : [];
  },

  // Check if a specific wallet is supported on a chain
  isWalletSupported: (walletType: string, chainName: string): boolean => {
    const supportedWallets = walletValidation.getSupportedWallets(chainName);
    return supportedWallets.includes(walletType);
  },

  // Get chain configuration
  getChainConfig: (chainName: string): ChainWalletConfig | null => {
    return CHAIN_WALLET_CONFIGS[chainName] || null;
  },

  // Validate internal wallet capabilities
  validateInternalWallet: async (
    chainName: string,
    walletAddress: string
  ): Promise<WalletCompatibility> => {
    const result: WalletCompatibility = {
      isCompatible: true,
      issues: [],
      warnings: [],
    };

    try {
      const chainConfig = CHAIN_WALLET_CONFIGS[chainName];
      if (!chainConfig) {
        result.isCompatible = false;
        result.issues.push(`Unsupported chain: ${chainName}`);
        return result;
      }

      // Check if internal wallet is supported
      if (!chainConfig.supportedWallets.includes('internal')) {
        result.isCompatible = false;
        result.issues.push(`Internal wallet not supported on ${chainConfig.chainName}`);
      }

      // Validate wallet address format
      if (!walletAddress || walletAddress.length !== 42 || !walletAddress.startsWith('0x')) {
        result.isCompatible = false;
        result.issues.push('Invalid wallet address format');
      }

      loggerHelpers.validation(
        `Internal wallet validation for ${chainName}`,
        { address: walletAddress, result }
      );

      return result;
    } catch (error) {
      loggerHelpers.validationError('Internal wallet validation failed', { chainName, walletAddress, error });
      result.isCompatible = false;
      result.issues.push('Failed to validate internal wallet');
      return result;
    }
  },

  // Get user-friendly validation message
  getValidationMessage: (validation: WalletCompatibility): string => {
    if (validation.isCompatible) {
      if (validation.warnings.length > 0) {
        return `Wallet is compatible with warnings: ${validation.warnings.join(', ')}`;
      }
      return 'Wallet is fully compatible';
    } else {
      return `Wallet compatibility issues: ${validation.issues.join(', ')}`;
    }
  },
};
