import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, isSupportedLocale } from './locales';

export default getRequestConfig(async () => {
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get('locale')?.value;
    const locale = isSupportedLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;

    return {
        locale,
        messages: (await import(`../../messages/${locale}.json`)).default
    };
});
