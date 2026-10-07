import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { ChatProvider } from '@/lib/chat-context';
import { ToastProvider } from '@/components/ui/Toast';
import { ThemeController, themeBootScript } from '@/components/ui/ThemeController';
import { PwaProvider } from '@/lib/pwa';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'CEngine',
  description: 'Real-time messaging for people and teams.',
  // app/manifest.ts, app/icon.png and app/apple-icon.png are linked automatically
  applicationName: 'CEngine',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'CEngine',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#1b1c20' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The boot script sets data-theme/data-accent before hydration
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        {/* CEngine has its own dark theme: ask the Dark Reader extension not to restyle the
            page (its DOM edits before hydration otherwise cause hydration mismatch errors) */}
        <meta name="darkreader-lock" />
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} h-full flex flex-col font-sans`}
      >
        <ThemeController />
        <ToastProvider>
          <PwaProvider>
            <AuthProvider>
              <ChatProvider>{children}</ChatProvider>
            </AuthProvider>
          </PwaProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
