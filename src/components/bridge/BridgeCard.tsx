// Bridge Card Component - Main bridge interface card
// This component contains the bridge form with context provider

'use client';

import React from 'react';
import { BridgeProvider } from '@/hooks/bridge/useBridgeContext';
import { BridgeForm } from './BridgeForm';

export function BridgeCard() {
  return (
    <BridgeProvider>
      <div className="w-full max-w-[31rem]">
        <BridgeForm />
      </div>
    </BridgeProvider>
  );
}
