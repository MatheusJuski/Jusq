import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';

import './globals.css';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

export const metadata: Metadata = {
  title: "Jusq's",
  description:
    'A personal playground for realtime systems, games, simulations and digital experiments.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={poppins.variable}>
      <body className="relative">
        <div className="relative z-10 flex min-h-screen flex-col">
          <header className="flex items-center justify-between px-6 py-5 sm:px-10">
            <a href="/" className="group flex items-center gap-2.5">
              <span
                aria-hidden
                className="size-2.5 rounded-full bg-lilac transition-transform group-hover:scale-125"
              />
              <span className="text-[15px] font-semibold tracking-tight">
                Jusq&apos;s
              </span>
            </a>
          </header>

          <main className="flex-1">{children}</main>

          <footer className="px-6 py-6 text-[12px] text-denim/70 sm:px-10">
            WebRTC e sistemas realtime
          </footer>
        </div>
      </body>
    </html>
  );
}
