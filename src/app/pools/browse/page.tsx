'use client';

import MainLayout from '@/components/layout/MainLayout';
import PoolListWrapper from '@/components/pools/PoolListWrapper';

export default function BrowsePoolsPage() {
  // Add-liquidity routing lives on the pool card itself (V3PoolCard), which knows the
  // pool's fee tier. The old page-level handler only knew the token pair.
  return (
    <MainLayout>
      <div className="min-h-screen pools-container">
        <PoolListWrapper />
      </div>
    </MainLayout>
  );
}
