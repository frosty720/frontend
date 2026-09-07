'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, BarChart2, Layers, Wallet, ArrowUpRight } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import './home.css';

export default function Home() {
  return (
    <MainLayout>
      {/* Hero Section */}
      <section className="hero-section py-16 md:py-24 relative overflow-hidden">
        <div className="container mx-auto px-4 relative">
          <div className="max-w-3xl mx-auto text-center fade-in">
            <h1 className="hero-title text-4xl md:text-5xl font-bold mb-6">
              Welcome to KalySwap
            </h1>
            <p className="hero-description text-lg md:text-xl mb-8">
              The premier decentralized exchange on KalyChain. Trade tokens, provide liquidity, and earn rewards.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/swaps">
                <Button size="lg" className="btn-primary">
                  Get Started <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/swaps">
                <Button size="lg" className="btn-secondary">
                  Start Trading
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section">
        <div className="container mx-auto px-4">
          <h2 className="features-title text-2xl md:text-3xl font-bold text-center">
            Everything you need to trade on KalyChain
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 slide-up">
            {/* Feature 1 */}
            <Card className="feature-card">
              <CardContent className="p-0">
                <div className="p-6">
                  <div className="feature-icon-container">
                    <BarChart2 className="feature-icon h-6 w-6" />
                  </div>
                  <h3 className="feature-title">Trade Tokens</h3>
                  <p className="feature-description">
                    Swap tokens instantly with low fees and high liquidity. Access the best rates on KalyChain.
                  </p>
                </div>
                <div className="feature-footer">
                  <Link href="/swaps" className="feature-link text-sm">
                    Start trading <ArrowUpRight className="ml-1 h-3 w-3" />
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* Feature 2 */}
            <Card className="feature-card">
              <CardContent className="p-0">
                <div className="p-6">
                  <div className="feature-icon-container">
                    <Layers className="feature-icon h-6 w-6" />
                  </div>
                  <h3 className="feature-title">Provide Liquidity</h3>
                  <p className="feature-description">
                    Earn fees by providing liquidity to trading pairs. Put your assets to work and generate passive income.
                  </p>
                </div>
                <div className="feature-footer">
                  <Link href="/pools" className="feature-link text-sm">
                    Add liquidity <ArrowUpRight className="ml-1 h-3 w-3" />
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* Feature 3 */}
            <Card className="feature-card">
              <CardContent className="p-0">
                <div className="p-6">
                  <div className="feature-icon-container">
                    <Wallet className="feature-icon h-6 w-6" />
                  </div>
                  <h3 className="feature-title">Stake & Earn</h3>
                  <p className="feature-description">
                    Stake KLC and earn rewards from the platform. Maximize your returns with our staking program.
                  </p>
                </div>
                <div className="feature-footer">
                  <Link href="/stake" className="feature-link text-sm">
                    Start staking <ArrowUpRight className="ml-1 h-3 w-3" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="stats-section text-white">
        <div className="container mx-auto px-4 relative">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 slide-up">
            <Card className="stats-card">
              <CardContent className="p-6 text-center">
                <p className="stats-number">$10M+</p>
                <p className="stats-label">Total Volume</p>
              </CardContent>
            </Card>

            <Card className="stats-card">
              <CardContent className="p-6 text-center">
                <p className="stats-number">5,000+</p>
                <p className="stats-label">Active Users</p>
              </CardContent>
            </Card>

            <Card className="stats-card">
              <CardContent className="p-6 text-center">
                <p className="stats-number">100+</p>
                <p className="stats-label">Trading Pairs</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="container mx-auto px-4">
          <Card className="cta-card border-0">
            <CardContent className="p-8 md:p-12 text-center">
              <h2 className="cta-title">
                Ready to start trading on KalyChain?
              </h2>
              <p className="cta-description max-w-2xl mx-auto">
                Join thousands of users already trading on KalySwap. Connect a wallet and start swapping in seconds — no account needed.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/pools">
                  <Button size="lg" className="btn-primary">
                    Provide Liquidity
                  </Button>
                </Link>
                <Link href="/swaps">
                  <Button size="lg" className="btn-secondary">
                    Start Trading
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </MainLayout>
  );
}
