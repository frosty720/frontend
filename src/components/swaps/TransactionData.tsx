'use client';

import { CHAIN_IDS, KALYCHAIN_EXPLORER_URL } from '@/config/chains';
import { isSupportedDexChain } from '@/config/contracts';

import { useState, useEffect } from 'react';
import { usePairSwaps, type FormattedSwap } from '@/hooks/usePairSwaps';
import { useChainId } from 'wagmi';
import { getAddressUrl, getExplorerName } from '@/utils/explorerLinks';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  ArrowUpDown,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Loader2
} from 'lucide-react';

// Use DexTransaction from the hook

interface TransactionDataProps {
  selectedPair?: {
    token0Symbol: string;
    token1Symbol: string;
    pairAddress?: string;
  };
  userAddress?: string | null;
}

export default function TransactionData({ selectedPair, userAddress }: TransactionDataProps) {
  const chainId = useChainId();
  const [activeTab, setActiveTab] = useState<'recent' | 'my'>('recent');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Use the subgraph/GeckoTerminal for pair-specific transactions
  const {
    swaps,
    loading,
    error,
    refetch
  } = usePairSwaps({
    pairAddress: selectedPair?.pairAddress,
    // User filtering works on any chain we have a subgraph for — gating this to
    // CHAIN_IDS.KALYCHAIN meant "My Trades" silently showed everyone's trades elsewhere.
    userAddress: activeTab === 'my' && isSupportedDexChain(chainId) ? userAddress : null,
    limit: itemsPerPage * 5, // Get more transactions since we'll paginate client-side
    chainId: chainId,
  });

  // Client-side pagination for swap transactions
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedSwaps = swaps.slice(startIndex, endIndex);
  const totalPages = Math.ceil(swaps.length / itemsPerPage);

  // Reset page when switching tabs
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  // Format timestamp
  const formatTime = (timestamp: Date | string) => {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  };

  // Format address
  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };



  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">Transaction History</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'recent' | 'my')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="recent">Recent Trades</TabsTrigger>
            <TabsTrigger value="my" disabled={!userAddress}>
              My Trades
            </TabsTrigger>
          </TabsList>

          <TabsContent value="recent" className="mt-6">
            <div className="space-y-4">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="ml-2">Loading transactions...</span>
                </div>
              ) : paginatedSwaps.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No recent transactions found</p>
                  {selectedPair && (
                    <p className="text-sm mt-1">
                      for {selectedPair.token0Symbol}/{selectedPair.token1Symbol} pair
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedSwaps.map((swap) => (
                        <TableRow key={swap.id}>
                          <TableCell className="font-medium">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              swap.type === 'BUY'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {swap.type}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="text-sm">
                                {swap.token0Amount} {swap.token0Symbol}
                              </div>
                              <div className="text-sm">
                                {swap.token1Amount} {swap.token1Symbol}
                              </div>
                              {swap.amountUSD > 0 && (
                                <div className="text-xs text-gray-500">
                                  ${swap.amountUSD.toFixed(2)}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Success
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {formatAddress(swap.from)}
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {formatTime(swap.timestamp)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => window.open(`${KALYCHAIN_EXPLORER_URL}/tx/${swap.hash}`, '_blank')}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-500">
                        Page {currentPage} of {totalPages}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                        >
                          Next
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="my" className="mt-6">
            <div className="space-y-4">
              {!userAddress ? (
                <div className="text-center py-8 text-gray-500">
                  <p>Connect your wallet to view your transaction history</p>
                </div>
              ) : (chainId === 56 || chainId === 42161) ? (
                // For BSC and Arbitrum, show explorer link instead
                <div className="text-center py-8">
                  <p className="text-gray-400 mb-4">
                    View your complete transaction history on {getExplorerName(chainId)}
                  </p>
                  {selectedPair && (
                    <p className="text-sm text-gray-500 mb-4">
                      for {selectedPair.token0Symbol}/{selectedPair.token1Symbol} pair
                    </p>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => {
                      const explorerUrl = getAddressUrl(chainId, userAddress);
                      window.open(explorerUrl, '_blank', 'noopener,noreferrer');
                    }}
                    className="border-amber-200/20 hover:border-amber-200/40 hover:bg-amber-200/5"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View on {getExplorerName(chainId)}
                  </Button>
                </div>
              ) : loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="ml-2">Loading your transactions...</span>
                </div>
              ) : paginatedSwaps.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No transactions found for your account</p>
                  {selectedPair && (
                    <p className="text-sm mt-1">
                      for {selectedPair.token0Symbol}/{selectedPair.token1Symbol} pair
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedSwaps.map((swap) => (
                        <TableRow key={swap.id}>
                          <TableCell className="font-medium">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              swap.type === 'BUY'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {swap.type}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="text-sm">
                                {swap.token0Amount} {swap.token0Symbol}
                              </div>
                              <div className="text-sm">
                                {swap.token1Amount} {swap.token1Symbol}
                              </div>
                              {swap.amountUSD > 0 && (
                                <div className="text-xs text-gray-500">
                                  ${swap.amountUSD.toFixed(2)}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Success
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {formatTime(swap.timestamp)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => window.open(`${KALYCHAIN_EXPLORER_URL}/tx/${swap.hash}`, '_blank')}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-500">
                        Page {currentPage} of {totalPages}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                        >
                          Next
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
