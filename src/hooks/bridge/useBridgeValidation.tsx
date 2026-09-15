// Bridge Validation Hook - Form validation for bridge transfers
// This hook handles validation for bridge transfer forms

import { useState, useCallback } from 'react';
import { isAddress, parseUnits } from 'viem';
import { useBridgeContext } from './useBridgeContext';
import { useWallet } from '../useWallet';
import { bridgeLogger } from '@/lib/logger';
import { describeError } from '@/i18n/errorText';
import { useDict } from '@/i18n/hooks';

export interface BridgeFormValues {
  originChain: string;
  destinationChain: string;
  tokenIndex: number | null;
  amount: string;
  recipient: string;
}

export interface ValidationErrors {
  originChain?: string;
  destinationChain?: string;
  tokenIndex?: string;
  amount?: string;
  recipient?: string;
  form?: string;
}

export function useBridgeValidation() {
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isValidating, setIsValidating] = useState(false);
  const { warpCore } = useBridgeContext();
  const { address: account } = useWallet();
  const dict = useDict();

  const validate = useCallback(async (values: BridgeFormValues): Promise<ValidationErrors> => {
    const newErrors: ValidationErrors = {};
    const f = dict.bridge.form;
    // The Hyperlane SDK words its validation messages in English; show our own text for the field
    // (insufficient-funds wording maps to the translated funds message) and keep the SDK's for the log.
    const sdkText = (message: string, fallback: string) =>
      /insufficient|exceeds balance|balance too low/i.test(message) ? dict.errors.insufficientFunds : fallback;

    try {
      setIsValidating(true);

      // Basic field validation
      if (!values.originChain) {
        newErrors.originChain = f.errorOriginRequired;
      }

      if (!values.destinationChain) {
        newErrors.destinationChain = f.errorDestinationRequired;
      }

      if (values.originChain === values.destinationChain) {
        newErrors.destinationChain = f.errorSameChain;
      }

      if (values.tokenIndex === null) {
        newErrors.tokenIndex = f.errorTokenRequired;
      }

      if (!values.amount || values.amount === '0') {
        newErrors.amount = f.errorAmountRequired;
      } else if (isNaN(Number(values.amount)) || Number(values.amount) <= 0) {
        newErrors.amount = f.errorAmountPositive;
      }

      if (!values.recipient) {
        newErrors.recipient = f.errorRecipientRequired;
      } else if (!isAddress(values.recipient)) {
        newErrors.recipient = f.errorRecipientInvalid;
      }

      // If basic validation fails, return early
      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return newErrors;
      }

      // Advanced validation with Hyperlane SDK
      if (warpCore && account && values.tokenIndex !== null) {
        try {
          const tokens = warpCore.tokens;
          if (values.tokenIndex >= tokens.length) {
            newErrors.tokenIndex = f.errorTokenInvalid;
            setErrors(newErrors);
            return newErrors;
          }

          const token = tokens[values.tokenIndex];
          if (!token) {
            newErrors.tokenIndex = dict.errors.tokenNotFound;
            setErrors(newErrors);
            return newErrors;
          }

          // Parse amount with token decimals
          const amountWei = parseUnits(values.amount, token.decimals);
          const tokenAmount = token.amount(amountWei.toString());

          // Validate with Hyperlane SDK
          const validation = await warpCore.validateTransfer({
            originTokenAmount: tokenAmount,
            destination: values.destinationChain,
            recipient: values.recipient,
            sender: account,
          });

          // Map Hyperlane validation errors to our error format
          // The validation result can be null/undefined if no errors
          if (validation) {
            if (Object.keys(validation).length > 0) bridgeLogger.debug('Hyperlane validation:', validation);
            if (validation.amount) newErrors.amount = sdkText(validation.amount, f.errorSdkAmount);
            if (validation.recipient) newErrors.recipient = sdkText(validation.recipient, f.errorSdkRecipient);
            if (validation.form) newErrors.form = sdkText(validation.form, f.errorSdkForm);
          }

        } catch (err) {
          bridgeLogger.error('Validation error:', err);
          newErrors.form = describeError(err, dict);
        }
      }

      setErrors(newErrors);
      return newErrors;
    } catch (err) {
      bridgeLogger.error('Validation failed:', err);
      const validationErrors = { form: describeError(err, dict) };
      setErrors(validationErrors);
      return validationErrors;
    } finally {
      setIsValidating(false);
    }
  }, [warpCore, account, dict]);

  const isValid = Object.keys(errors).length === 0;

  return {
    validate,
    isValid,
    isValidating,
    errors,
  };
}
