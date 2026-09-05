import type { Metadata } from 'next';

import './globals.css';

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
    <html lang="pt-BR">
      <body className="relative">
        <div className="relative z-10 flex min-h-screen flex-col">
          <header className="flex items-center justify-between border-b border-lab-border px-6 py-3 text-xs tracking-widest">
            <span className="font-bold">JUSQ&apos;S</span>
            <span className="text-lab-dim">SCREEN LAB · V0</span>
          </header>

          <main className="flex-1">{children}</main>

          <footer className="border-t border-lab-border px-6 py-2 text-[11px] text-lab-dim">
            experimento 01 - webrtc / realtime
          </footer>
        </div>
      </body>
    </html>
  );
}
