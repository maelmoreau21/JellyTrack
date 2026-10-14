export type TranslationValue = string | number | boolean | null | TranslationValue[] | { [key: string]: TranslationValue };
export type TranslationDictionary = { [key: string]: TranslationValue };
export interface LocaleState {
  locale: string;
  translations: TranslationDictionary;
  fallbackTranslations: TranslationDictionary;
}
const locales = ['fr', 'en', 'de', 'es', 'it', 'nl', 'pl', 'pt-BR', 'ru', 'zh'];
function resolve(dictionary: TranslationDictionary, path: string): TranslationValue | undefined {
  return path.split('.').reduce<TranslationValue | undefined>((value, key) =>
    value && typeof value === 'object' ? (value as TranslationDictionary)[key] : undefined, dictionary);
}
export function createI18n(state: LocaleState, renderNavigation: () => unknown, navigate: (path: string, replace: boolean, force: boolean) => unknown) {
  return {
    async init() {
      const fallback = (async () => { try {
        const response = await fetch('/assets/messages/fr.json');
        if (response.ok) state.fallbackTranslations = await response.json();
      } catch { /* Keep the available fallback when the asset cannot be fetched. */ } })();
      if (state.locale === 'fr') {
        await fallback;
        state.translations = state.fallbackTranslations;
        document.documentElement.lang = 'fr';
        localStorage.setItem('jt_locale', 'fr');
      } else await Promise.all([fallback, this.loadLocale(state.locale)]);
      this.applyTranslationsToDOM();
    },
    async loadLocale(locale: string) {
      if (!locales.includes(locale)) locale = 'fr';
      try {
        const response = await fetch(`/assets/messages/${locale}.json`);
        if (response.ok) {
          state.translations = await response.json();
          state.locale = locale;
          document.documentElement.lang = locale;
          localStorage.setItem('jt_locale', locale);
        }
      } catch (error) { console.warn('Failed to load translations for', locale, error); }
    },
    t(path: string, params: Record<string, string | number | boolean> = {}, defaultValue = ''): TranslationValue {
      let value = resolve(state.translations, path);
      if (value === undefined) value = resolve(state.fallbackTranslations, path);
      if (value === undefined) return defaultValue || '';
      if (typeof value === 'string') {
        for (const [key, replacement] of Object.entries(params)) value = value.replaceAll(`{${key}}`, String(replacement));
      }
      return value;
    },
    applyTranslationsToDOM() {
      for (const [attribute, target] of [['data-i18n', null], ['data-i18n-placeholder', 'placeholder']] as const) {
        document.querySelectorAll(`[${attribute}]`).forEach((element) => {
          const value = this.t(element.getAttribute(attribute) || '');
          if (typeof value === 'string' && value.trim()) {
            if (target) element.setAttribute(target, value);
            else element.textContent = value;
          }
        });
      }
    },
    async changeLocale(locale: string) {
      await this.loadLocale(locale);
      this.applyTranslationsToDOM();
      renderNavigation();
      navigate(window.location.pathname + window.location.search, true, true);
    }
  };
}
