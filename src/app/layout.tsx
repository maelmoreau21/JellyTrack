import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Sidebar } from '@/components/Sidebar'
import { AuthProvider } from '@/components/AuthProvider'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'JellyTulli Dashboard',
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
    <html lang={locale} className="dark">
      <body className={`dark bg-zinc-950 text-zinc-50 antialiased min-h-screen overflow-x-hidden ${inter.className} selection:bg-primary selection:text-primary-foreground flex`}>
        <NextIntlClientProvider messages={messages}>
          <AuthProvider>
            <Sidebar />
            <main className="flex-1 min-w-0 h-[calc(100dvh-3.5rem)] md:h-screen overflow-y-auto overflow-x-hidden pt-14 md:pt-0">
              {children}
            </main>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
