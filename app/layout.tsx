import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cosmos | Mission Knowledge',
  description: 'A workspace for mission documents and knowledge.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
