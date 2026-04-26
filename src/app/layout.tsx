import type { Metadata } from 'next'
import { Sora } from 'next/font/google'
import './globals.css'
import { Sidebar } from '@/components/Sidebar'
import { AuthProvider } from '@/components/AuthProvider'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { ThemeProvider } from '@/components/ThemeProvider'
import { RouteBodyClass } from '@/components/RouteBodyClass'
import prisma from '@/lib/prisma'

const sora = Sora({
  subsets: ['latin'],
  variable: '--font-sora',
  weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'JellyTrack Dashboard',
  description: 'Advanced analytics for Jellyfin',
  icons: {
    icon: '/logo.svg',
    shortcut: '/logo.svg',
    apple: '/logo.svg',
  },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  // Evaluate wrapped visibility for Sidebar
  const settings = await prisma.globalSettings.findUnique({ where: { id: "global" } }) as any;
  let isWrappedVisible = true;
  if (settings?.wrappedVisible === false) {
      isWrappedVisible = false;
  } else if (settings?.wrappedPeriodEnabled !== false && settings) {
      const now = new Date();
      const currentYear = now.getFullYear();
      const startMonthRaw = settings.wrappedStartMonth || 12;
      const endMonthRaw = settings.wrappedEndMonth || 1;
      const start = new Date(currentYear, startMonthRaw - 1, settings.wrappedStartDay || 1);
      const end = new Date(currentYear + (endMonthRaw < startMonthRaw ? 1 : 0), endMonthRaw - 1, settings.wrappedEndDay || 31);
      if (now < start || now > end) {
          isWrappedVisible = false;
      }
  }

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${sora.variable} ${sora.className} antialiased min-h-screen overflow-x-hidden selection:bg-primary selection:text-primary-foreground flex`}>
        <RouteBodyClass />
        <ThemeProvider>
          <NextIntlClientProvider messages={messages}>
            <AuthProvider>
              <Sidebar isWrappedVisible={isWrappedVisible} />
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
