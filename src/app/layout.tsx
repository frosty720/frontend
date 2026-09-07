import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { WalletProviders } from '@/components/providers/WalletProviders';
import { ToastProvider } from '@/components/ui/toast';
import { CutoverNotice } from '@/components/wallet/CutoverNotice';

const inter = localFont({
  src: [
    { path: '../fonts/Inter-Regular.ttf', weight: '400', style: 'normal' },
    { path: '../fonts/Inter-Medium.ttf', weight: '500', style: 'normal' },
    { path: '../fonts/Inter-SemiBold.ttf', weight: '600', style: 'normal' },
    { path: '../fonts/Inter-Bold.ttf', weight: '700', style: 'normal' },
  ],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'KalySwap - Decentralized Exchange',
  description: 'Trade tokens on KalyChain with KalySwap DEX',
  icons: {
    icon: '/favicon.ico',
    apple: '/icon.png',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      </head>
      <body className={`${inter.className}`} suppressHydrationWarning={true}>
        <ToastProvider>
          <WalletProviders>
              {children}
              <CutoverNotice />
          </WalletProviders>
        </ToastProvider>
      </body>
    </html>
  );
}
