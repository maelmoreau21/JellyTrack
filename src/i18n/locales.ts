export const AVAILABLE_LOCALES = [
    { code: 'fr', label: 'Français', flag: '🇫🇷', iso: 'fr' },
    { code: 'en', label: 'English', flag: '🇬🇧', iso: 'gb' },
    { code: 'de', label: 'Deutsch', flag: '🇩🇪', iso: 'de' },
    { code: 'es', label: 'Español', flag: '🇪🇸', iso: 'es' },
    { code: 'it', label: 'Italiano', flag: '🇮🇹', iso: 'it' },
    { code: 'nl', label: 'Nederlands', flag: '🇳🇱', iso: 'nl' },
    { code: 'pl', label: 'Polski', flag: '🇵🇱', iso: 'pl' },
    { code: 'pt-BR', label: 'Português (BR)', flag: '🇧🇷', iso: 'br' },
    { code: 'ru', label: 'Русский', flag: '🇷🇺', iso: 'ru' },
    { code: 'zh', label: '中文', flag: '🇨🇳', iso: 'cn' },
] as const;

export type LocaleCode = typeof AVAILABLE_LOCALES[number]['code'];

export const DEFAULT_LOCALE: LocaleCode = 'en';

export function isSupportedLocale(value: string | undefined | null): value is LocaleCode {
    if (!value) return false;
    return AVAILABLE_LOCALES.some((locale) => locale.code === value);
}
