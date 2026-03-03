export const AVAILABLE_LOCALES = [
    { code: 'fr', label: 'Français', flag: '🇫🇷' },
    { code: 'en', label: 'English', flag: '🇬🇧' },
    { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
    { code: 'es', label: 'Español', flag: '🇪🇸' },
    { code: 'it', label: 'Italiano', flag: '🇮🇹' },
    { code: 'nl', label: 'Nederlands', flag: '🇳🇱' },
    { code: 'pl', label: 'Polski', flag: '🇵🇱' },
    { code: 'pt-BR', label: 'Português (BR)', flag: '🇧🇷' },
    { code: 'ru', label: 'Русский', flag: '🇷🇺' },
    { code: 'zh', label: '中文', flag: '🇨🇳' },
] as const;

export type LocaleCode = typeof AVAILABLE_LOCALES[number]['code'];

export const DEFAULT_LOCALE: LocaleCode = 'fr';

export function isSupportedLocale(value: string | undefined | null): value is LocaleCode {
    if (!value) return false;
    return AVAILABLE_LOCALES.some((locale) => locale.code === value);
}
