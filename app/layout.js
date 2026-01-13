import ThemeRegistry from '@/components/ThemeRegistry/ThemeRegistry';
import { Nunito, Quicksand } from 'next/font/google';
import { schoolConfig } from '@/lib/config';
import './globals.css';

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

export const metadata = {
  title: `${schoolConfig.name} - Admin Portal`,
  description: `${schoolConfig.tagline} - School Administration Portal`,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${nunito.variable} ${quicksand.variable}`}>
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
