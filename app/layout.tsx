import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import AppShell from '@/components/layout/AppShell';
import DevToolsBlocker from '@/components/DevToolsBlocker';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Convertify',
  description: 'The all-in-one workspace for your digital files. Fast, secure, and completely free.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <AntdRegistry>
          <AppShell>{children}</AppShell>
        </AntdRegistry>
        <DevToolsBlocker />
      </body>
    </html>
  );
}
