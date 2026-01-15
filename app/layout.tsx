import ThemeRegistry from '@/components/ThemeRegistry/ThemeRegistry';
import { Nunito, Quicksand } from 'next/font/google';
import { getSettings } from '@/app/actions/settings';
import { Metadata } from 'next';
import './globals.css';

// This admin portal is fully data-driven and depends on a live DB connection.
// Force dynamic rendering so builds don't require DB access during prerender.
export const dynamic = 'force-dynamic';

const nunito = Nunito({
  weight: ['400', '500', '600', '700', '800'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-nunito',
});

const quicksand = Quicksand({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-quicksand',
});

export async function generateMetadata(): Promise<Metadata> {
  try {
    const settings = await getSettings();
    return {
      title: `${settings.schoolName} - Admin Portal`,
      description: `${settings.schoolTagline} - School Administration Portal`,
    };
  } catch {
    return {
      title: 'Admin Portal',
      description: 'School Administration Portal',
    };
  }
}

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
      </head>
      <body className={`${nunito.variable} ${quicksand.variable}`}>
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
