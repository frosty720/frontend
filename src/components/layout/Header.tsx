'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';
import { ClientOnlyConnectWallet } from '@/components/wallet/ClientOnlyConnectWallet';

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  return (
    <header className="bg-slate-900/95 backdrop-blur-sm border-b sticky top-0 z-40 shadow-lg" style={{ borderBottomColor: 'rgba(255, 255, 255, 0.2)' }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center">
            <Link href="/" className="flex items-center">
              <img
                src="/icons/KalySwapLogo.png"
                alt="KalySwap Logo"
                className="h-8 w-8 mr-3"
              />
              <span
                className="text-xl md:text-2xl font-bold"
                style={{
                  background: 'linear-gradient(to right, #fbbf24, #d97706)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text'
                }}
              >
                KalySwap
              </span>
            </Link>

            <nav className="ml-10 hidden md:flex space-x-8">
              <Link
                href="/swaps"
                className={`text-sm font-semibold transition-all duration-200 px-3 py-2 rounded-md ${
                  pathname === '/swaps'
                    ? 'text-white bg-amber-500/20 border border-amber-500/30 shadow-lg'
                    : 'hover:text-white hover:bg-white/10'
                }`}
                style={{ color: pathname === '/swaps' ? undefined : '#fef3c7' }}
              >
                Swap
              </Link>
              <Link
                href="/pools"
                className={`text-sm font-semibold transition-all duration-200 px-3 py-2 rounded-md ${
                  pathname === '/pools'
                    ? 'text-white bg-amber-500/20 border border-amber-500/30 shadow-lg'
                    : 'hover:text-white hover:bg-white/10'
                }`}
                style={{ color: pathname === '/pools' ? undefined : '#fef3c7' }}
              >
                Pools
              </Link>
              <Link
                href="/farm"
                className={`text-sm font-semibold transition-all duration-200 px-3 py-2 rounded-md ${
                  pathname === '/farm'
                    ? 'text-white bg-amber-500/20 border border-amber-500/30 shadow-lg'
                    : 'hover:text-white hover:bg-white/10'
                }`}
                style={{ color: pathname === '/farm' ? undefined : '#fef3c7' }}
              >
                Farm
              </Link>
              <Link
                href="/bridge"
                className={`text-sm font-semibold transition-all duration-200 px-3 py-2 rounded-md ${
                  pathname === '/bridge'
                    ? 'text-white bg-amber-500/20 border border-amber-500/30 shadow-lg'
                    : 'hover:text-white hover:bg-white/10'
                }`}
                style={{ color: pathname === '/bridge' ? undefined : '#fef3c7' }}
              >
                Bridge
              </Link>
              <Link
                href="/stake"
                className={`text-sm font-semibold transition-all duration-200 px-3 py-2 rounded-md ${
                  pathname === '/stake'
                    ? 'text-white bg-amber-500/20 border border-amber-500/30 shadow-lg'
                    : 'hover:text-white hover:bg-white/10'
                }`}
                style={{ color: pathname === '/stake' ? undefined : '#fef3c7' }}
              >
                Stake
              </Link>
              <Link
                href="/launchpad"
                className={`text-sm font-semibold transition-all duration-200 px-3 py-2 rounded-md ${
                  pathname === '/launchpad'
                    ? 'text-white bg-amber-500/20 border border-amber-500/30 shadow-lg'
                    : 'hover:text-white hover:bg-white/10'
                }`}
                style={{ color: pathname === '/launchpad' ? undefined : '#fef3c7' }}
              >
                Launchpad
              </Link>
            </nav>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMobileMenu}
              className="text-slate-300 hover:text-white hover:bg-slate-800/50"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </Button>
          </div>

          <div className="hidden md:flex items-center space-x-4">
            {/* Wallet Connection */}
            <ClientOnlyConnectWallet />
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-slate-900/95 backdrop-blur-sm border-b shadow-lg" style={{ borderBottomColor: 'rgba(255, 255, 255, 0.2)' }}>
          <div className="container mx-auto px-4 py-3">
            <nav className="flex flex-col space-y-3">
              <Link
                href="/swaps"
                className={`text-sm font-semibold transition-all duration-200 px-3 py-2 rounded-md ${
                  pathname === '/swaps'
                    ? 'text-white bg-amber-500/20 border border-amber-500/30 shadow-lg'
                    : 'hover:text-white hover:bg-white/10'
                }`}
                style={{ color: pathname === '/swaps' ? undefined : '#fef3c7' }}
                onClick={() => setMobileMenuOpen(false)}
              >
                Swap
              </Link>
              <Link
                href="/pools"
                className={`text-sm font-semibold transition-all duration-200 px-3 py-2 rounded-md ${
                  pathname === '/pools'
                    ? 'text-white bg-amber-500/20 border border-amber-500/30 shadow-lg'
                    : 'hover:text-white hover:bg-white/10'
                }`}
                style={{ color: pathname === '/pools' ? undefined : '#fef3c7' }}
                onClick={() => setMobileMenuOpen(false)}
              >
                Pools
              </Link>
              <Link
                href="/farm"
                className={`text-sm font-semibold transition-all duration-200 px-3 py-2 rounded-md ${
                  pathname === '/farm'
                    ? 'text-white bg-amber-500/20 border border-amber-500/30 shadow-lg'
                    : 'hover:text-white hover:bg-white/10'
                }`}
                style={{ color: pathname === '/farm' ? undefined : '#fef3c7' }}
                onClick={() => setMobileMenuOpen(false)}
              >
                Farm
              </Link>
              <Link
                href="/bridge"
                className={`text-sm font-semibold transition-all duration-200 px-3 py-2 rounded-md ${
                  pathname === '/bridge'
                    ? 'text-white bg-amber-500/20 border border-amber-500/30 shadow-lg'
                    : 'hover:text-white hover:bg-white/10'
                }`}
                style={{ color: pathname === '/bridge' ? undefined : '#fef3c7' }}
                onClick={() => setMobileMenuOpen(false)}
              >
                Bridge
              </Link>
              <Link
                href="/stake"
                className={`text-sm font-semibold transition-all duration-200 px-3 py-2 rounded-md ${
                  pathname === '/stake'
                    ? 'text-white bg-amber-500/20 border border-amber-500/30 shadow-lg'
                    : 'hover:text-white hover:bg-white/10'
                }`}
                style={{ color: pathname === '/stake' ? undefined : '#fef3c7' }}
                onClick={() => setMobileMenuOpen(false)}
              >
                Stake
              </Link>
              <Link
                href="/launchpad"
                className={`text-sm font-semibold transition-all duration-200 px-3 py-2 rounded-md ${
                  pathname === '/launchpad'
                    ? 'text-white bg-amber-500/20 border border-amber-500/30 shadow-lg'
                    : 'hover:text-white hover:bg-white/10'
                }`}
                style={{ color: pathname === '/launchpad' ? undefined : '#fef3c7' }}
                onClick={() => setMobileMenuOpen(false)}
              >
                Launchpad
              </Link>

              <div className="pt-3 border-t border-slate-700/50 flex flex-col space-y-3">
                {/* Mobile Wallet Connection */}
                <div className="pb-2">
                  <ClientOnlyConnectWallet className="w-full" />
                </div>
              </div>
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
