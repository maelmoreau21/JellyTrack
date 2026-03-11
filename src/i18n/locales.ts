export const AVAILABLE_LOCALES = [
    { code: 'fr', label: 'FranÃ§ais', flag: 'ðŸ‡«ðŸ‡·' },
    { code: 'en', label: 'English', flag: 'ðŸ‡¬ðŸ‡§' },
    { code: 'de', label: 'Deutsch', flag: 'ðŸ‡©ðŸ‡ª' },
    { code: 'es', label: 'EspaÃ±ol', flag: 'ðŸ‡ªðŸ‡¸' },
    { code: 'it', label: 'Italiano', flag: 'ðŸ‡®ðŸ‡¹' },
    { code: 'nl', label: 'Nederlands', flag: 'ðŸ‡³ðŸ‡±' },
    { code: 'pl', label: 'Polski', flag: 'ðŸ‡µðŸ‡±' },
    { code: 'pt-BR', label: 'PortuguÃªs (BR)', flag: 'ðŸ‡§ðŸ‡·' },
    { code: 'ru', label: 'Ð ÑƒÑÑÐºÐ¸Ð¹', flag: 'ðŸ‡·ðŸ‡º' },
    { code: 'zh', label: 'ä¸­æ–‡', flag: 'ðŸ‡¨ðŸ‡³' },
] as const;

export type LocaleCode = typeof AVAILABLE_LOCALES[number]['code'];

export const DEFAULT_LOCALE: LocaleCode = 'fr';

export function isSupportedLocale(value: string | undefined | null): value is LocaleCode {
    if (!value) return false;
    return AVAILABLE_LOCALES.some((locale) => locale.code === value);
}
