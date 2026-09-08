import { describe, expect, it } from 'vitest';
import { humanizeBridgeError, TransferStatus, errorMessages } from '../useTransferStore';

describe('humanizeBridgeError', () => {
  it('maps wallet rejections regardless of stage or wording', () => {
    expect(
      humanizeBridgeError(new Error('User rejected the request.'), TransferStatus.SigningApproval)
    ).toBe('Transaction rejected in wallet.');
    expect(
      humanizeBridgeError(
        new Error('MetaMask Tx Signature: User denied transaction signature.'),
        TransferStatus.SigningTransfer
      )
    ).toBe('Transaction rejected in wallet.');
  });

  it('maps chain mismatch errors to a wallet-connection message', () => {
    expect(
      humanizeBridgeError(
        new Error('ChainMismatchError: The current chain of the wallet (id: 3888) does not match'),
        TransferStatus.SigningTransfer
      )
    ).toBe('Wallet must be connected to the origin chain.');
  });

  it('maps timeout errors to a network-busy message', () => {
    expect(
      humanizeBridgeError(new Error('block height exceeded'), TransferStatus.ConfirmingTransfer)
    ).toBe('Transaction timed out, the network may be busy. Please try again.');
    expect(
      humanizeBridgeError(new Error('Request timeout while waiting for response'), TransferStatus.ConfirmingApproval)
    ).toBe('Transaction timed out, the network may be busy. Please try again.');
  });

  // Regression: a wallet still pointed at the retired testnetrpc host reported
  // "Failed to sign transfer transaction", sending the user after their signature instead of
  // their network settings. Unreachable-network errors must name the real fault.
  it('maps unreachable-network errors to an RPC/connection message, not a signing failure', () => {
    const expected =
      'Could not reach the network. Check your wallet is connected to KalyChain (chain 3890) with a working RPC, then try again.';
    for (const raw of [
      'HttpRequestError: HTTP request failed. URL: https://testnetrpc.kalychain.io/rpc',
      'TypeError: Failed to fetch',
      'fetch failed',
      'NetworkError when attempting to fetch resource',
    ]) {
      expect(humanizeBridgeError(new Error(raw), TransferStatus.SigningTransfer)).toBe(expected);
    }
  });

  it('falls back to the message for the stage where the error occurred', () => {
    expect(
      humanizeBridgeError(
        new Error('execution reverted: ERC20: transfer amount exceeds allowance'),
        TransferStatus.ConfirmingApproval
      )
    ).toBe(errorMessages[TransferStatus.ConfirmingApproval]);
    expect(
      humanizeBridgeError(
        new Error('An unknown RPC error occurred.'),
        TransferStatus.SigningTransfer
      )
    ).toBe(errorMessages[TransferStatus.SigningTransfer]);
  });

  it('uses the generic fallback for stages without a mapped message', () => {
    expect(humanizeBridgeError(new Error('boom'), TransferStatus.ConfirmedTransfer)).toBe(
      'Unable to transfer tokens. Please try again.'
    );
  });

  it('handles non-Error inputs', () => {
    expect(humanizeBridgeError('User rejected the request', TransferStatus.SigningApproval)).toBe(
      'Transaction rejected in wallet.'
    );
    expect(humanizeBridgeError(undefined, TransferStatus.ConfirmedTransfer)).toBe(
      'Unable to transfer tokens. Please try again.'
    );
  });
});
