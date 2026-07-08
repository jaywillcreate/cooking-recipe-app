import type { Metadata } from 'next';
import { Archivo, IBM_Plex_Mono, Pacifico } from 'next/font/google';
import './globals.css';

const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-archivo',
  display: 'swap',
});
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});
// Playful script for the "Tasty" part of the wordmark.
const pacifico = Pacifico({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-script',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'TastyEmber — AI Recipe Creator',
  description: 'Discover, create, and collect personalized recipes. A new recipe invented for you every day.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${plexMono.variable} ${pacifico.variable}`}>
      <body>{children}</body>
    </html>
  );
}
