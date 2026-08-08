import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import type { AbstractIntlMessages } from 'next-intl';
import enMessages from '../../messages/en.json';
import fallbackMessages from '../../messages/fallback.json';
import { DEFAULT_LOCALE, isSupportedLocale } from './locales';

function mergeMessages(primary: unknown, fallback: unknown): unknown {
    if (primary === null || primary === undefined) return fallback;
    if (fallback === null || fallback === undefined) return primary;

    if (Array.isArray(primary) || Array.isArray(fallback)) {
        return primary;
    }

    if (typeof primary !== 'object' || typeof fallback !== 'object') {
        return primary;
    }

    const merged: Record<string, unknown> = { ...(fallback as Record<string, unknown>) };
    for (const [key, value] of Object.entries(primary as Record<string, unknown>)) {
        const fallbackValue = merged[key];
        if (
            value &&
            fallbackValue &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            typeof fallbackValue === 'object' &&
            !Array.isArray(fallbackValue)
        ) {
            merged[key] = mergeMessages(value, fallbackValue);
        } else {
            merged[key] = value;
        }
    }

    return merged;
}

/**
 * Parses the Accept-Language header and returns the best supported locale.
 * Falls back to DEFAULT_LOCALE if nothing matches.
 * Example: "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7" → "fr"
 */
function resolveLocaleFromAcceptLanguage(acceptLanguage: string | null): string {
    if (!acceptLanguage) return DEFAULT_LOCALE;

    // Parse each language tag with its q-value, sort by priority (highest q first)
    const langs = acceptLanguage
        .split(',')
        .map((entry) => {
            const [tag, q] = entry.trim().split(';q=');
            return { tag: tag.trim(), q: q ? parseFloat(q) : 1.0 };
        })
        .sort((a, b) => b.q - a.q);

    for (const { tag } of langs) {
        // Try exact match first (e.g. "pt-BR")
        if (isSupportedLocale(tag)) return tag;
        // Then try the base language (e.g. "pt" from "pt-BR")
        const base = tag.split('-')[0];
        if (isSupportedLocale(base)) return base;
    }

    return DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get('locale')?.value;

    let locale: string;
    if (isSupportedLocale(cookieLocale)) {
        // 1. User has explicitly chosen a language — respect it
        locale = cookieLocale;
    } else {
        // 2. No cookie — check middleware-injected header first, then detect
        //    the browser's preferred language via Accept-Language header.
        const headerStore = await headers();
        const middlewareLocale = headerStore.get('x-detected-locale');
        if (middlewareLocale && isSupportedLocale(middlewareLocale)) {
            locale = middlewareLocale;
        } else {
            const acceptLanguage = headerStore.get('accept-language');
            locale = resolveLocaleFromAcceptLanguage(acceptLanguage);
        }
    }

    const localeMessages = (await import(`../../messages/${locale}.json`)).default;

    return {
        locale,
        messages: mergeMessages(localeMessages, mergeMessages(fallbackMessages, enMessages)) as AbstractIntlMessages
    };
});
