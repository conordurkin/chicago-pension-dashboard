import type { Metadata } from 'next';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import './globals.css';
import { TopNav } from '@/components/layout/TopNav';
import { Footer } from '@/components/layout/Footer';

export const metadata: Metadata = {
  title: 'Chicago Pension Dashboard',
  description:
    "Tracking the funding, projections, and scenarios for Chicago's four city pension funds.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen flex flex-col bg-white text-slate-900">
        <NuqsAdapter>
          <TopNav />
          <main className="flex-1">{children}</main>
          <Footer />
        </NuqsAdapter>
      </body>
    </html>
  );
}
