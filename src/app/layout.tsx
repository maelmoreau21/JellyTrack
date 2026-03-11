import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Sidebar } from '@/components/Sidebar'
import { AuthProvider } from '@/components/AuthProvider'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { ThemeProvider } from '@/components/ThemeProvider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'JellyTrack Dashboard',
  description: 'Advanced analytics for Jellyfin',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`antialiased min-h-screen overflow-x-hidden ${inter.className} selection:bg-primary selection:text-primary-foreground flex bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50`}>
        <ThemeProvider>
          <NextIntlClientProvider messages={messages}>
            <AuthProvider>
              <Sidebar />
              <main className="flex-1 min-w-0 h-[calc(100dvh-3.5rem)] md:h-screen overflow-y-auto overflow-x-hidden pt-14 md:pt-0">
                {children}
              </main>
            </AuthProvider>
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
