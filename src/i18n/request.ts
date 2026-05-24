import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import type { AbstractIntlMessages } from 'use-intl/core';
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

export default getRequestConfig(async () => {
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get('locale')?.value;
    const locale = isSupportedLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;
    const localeMessages = (await import(`../../messages/${locale}.json`)).default;

    return {
        locale,
        messages: mergeMessages(localeMessages, mergeMessages(fallbackMessages, enMessages)) as AbstractIntlMessages
    };
});
