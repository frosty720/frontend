import { describe, expect, it } from 'vitest';
import { humanizeBridgeError, describeBridgeFailure, TransferStatus } from '../useTransferStore';
import en from '@/i18n/dictionaries/en';
import fr from '@/i18n/dictionaries/fr';

describe('humanizeBridgeError', () => {
  it('maps wallet rejections regardless of stage or wording', () => {
    expect(
      humanizeBridgeError(new Error('User rejected the request.'), TransferStatus.SigningApproval)
    ).toEqual({ code: 'userRejected' });
    expect(
      humanizeBridgeError(
        new Error('MetaMask Tx Signature: User denied transaction signature.'),
        TransferStatus.SigningTransfer
      )
    ).toEqual({ code: 'userRejected' });
  });

  it('maps chain mismatch errors to a wallet-connection message', () => {
    expect(
      humanizeBridgeError(
        new Error('ChainMismatchError: The current chain of the wallet (id: 3888) does not match'),
        TransferStatus.SigningTransfer
      )
    ).toEqual({ code: 'chainMismatch' });
  });

  it('maps timeout errors to a network-busy message', () => {
    expect(
      humanizeBridgeError(new Error('block height exceeded'), TransferStatus.ConfirmingTransfer)
    ).toEqual({ code: 'timeout' });
    expect(
      humanizeBridgeError(new Error('Request timeout while waiting for response'), TransferStatus.ConfirmingApproval)
    ).toEqual({ code: 'timeout' });
  });

  // Regression: a wallet still pointed at the retired testnetrpc host reported
  // "Failed to sign transfer transaction", sending the user after their signature instead of
  // their network settings. Unreachable-network errors must name the real fault.
  it('maps unreachable-network errors to an RPC/connection message, not a signing failure', () => {
    for (const raw of [
      'HttpRequestError: HTTP request failed. URL: https://testnetrpc.kalychain.io/rpc',
      'TypeError: Failed to fetch',
      'fetch failed',
      'NetworkError when attempting to fetch resource',
    ]) {
      expect(humanizeBridgeError(new Error(raw), TransferStatus.SigningTransfer)).toEqual({
        code: 'networkUnreachable',
      });
    }
  });

  it('falls back to the message for the stage where the error occurred', () => {
    expect(
      humanizeBridgeError(
        new Error('execution reverted: ERC20: transfer amount exceeds allowance'),
        TransferStatus.ConfirmingApproval
      )
    ).toEqual({ code: 'stage', stage: TransferStatus.ConfirmingApproval });
    expect(
      humanizeBridgeError(
        new Error('An unknown RPC error occurred.'),
        TransferStatus.SigningTransfer
      )
    ).toEqual({ code: 'stage', stage: TransferStatus.SigningTransfer });
  });

  it('uses the generic fallback for stages without a mapped message', () => {
    expect(humanizeBridgeError(new Error('boom'), TransferStatus.ConfirmedTransfer)).toEqual({
      code: 'stage',
      stage: TransferStatus.ConfirmedTransfer,
    });
  });

  it('handles non-Error inputs', () => {
    expect(humanizeBridgeError('User rejected the request', TransferStatus.SigningApproval)).toEqual({
      code: 'userRejected',
    });
    expect(humanizeBridgeError(undefined, TransferStatus.ConfirmedTransfer)).toEqual({
      code: 'stage',
      stage: TransferStatus.ConfirmedTransfer,
    });
  });
});

describe('describeBridgeFailure', () => {
  it('renders each classification in the reader language', () => {
    expect(describeBridgeFailure({ code: 'userRejected' }, en)).toBe(en.errors.userRejected);
    expect(describeBridgeFailure({ code: 'userRejected' }, fr)).toBe(fr.errors.userRejected);
    expect(describeBridgeFailure({ code: 'chainMismatch' }, fr)).toBe(fr.errors.chainMismatch);
    expect(describeBridgeFailure({ code: 'timeout' }, fr)).toBe(fr.errors.timeout);
    expect(describeBridgeFailure({ code: 'networkUnreachable' }, fr)).toBe(fr.errors.networkUnreachable);
  });

  it('interpolates params for codes that need them', () => {
    expect(describeBridgeFailure({ code: 'switchChain', params: { chain: 'Arbitrum One' } }, fr)).toBe(
      fr.errors.switchChain.replace('{chain}', 'Arbitrum One')
    );
  });

  it('renders the per-stage message, falling back to the generic one for stages without a mapping', () => {
    expect(describeBridgeFailure({ code: 'stage', stage: TransferStatus.Preparing }, fr)).toBe(
      fr.errors.bridgeStages.preparing
    );
    expect(describeBridgeFailure({ code: 'stage', stage: TransferStatus.ConfirmedTransfer }, fr)).toBe(
      fr.errors.bridgeStages.fallback
    );
  });

  it('falls back to the generic stage text for a plain-string legacy record instead of showing raw English', () => {
    expect(describeBridgeFailure('some old English error message', fr)).toBe(fr.errors.bridgeStages.fallback);
    expect(describeBridgeFailure(undefined, fr)).toBe(fr.errors.bridgeStages.fallback);
  });
});
