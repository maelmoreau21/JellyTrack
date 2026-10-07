import fr from "./messages/fr.json";
import en from "./messages/en.json";
import de from "./messages/de.json";
import es from "./messages/es.json";
import it from "./messages/it.json";

export type Locale = "fr" | "en" | "de" | "es" | "it";

export const LOCALES: { code: Locale; label: string; flag: string }[] = [
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "it", label: "Italiano", flag: "🇮🇹" },
];

const messages: Record<Locale, Record<string, any>> = { fr, en, de, es, it };

let currentLocale: Locale = (localStorage.getItem("jellytrack_locale") as Locale) || "fr";
if (!messages[currentLocale]) currentLocale = "fr";

const listeners: Set<() => void> = new Set();

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale) {
  if (messages[locale]) {
    currentLocale = locale;
    try {
      localStorage.setItem("jellytrack_locale", locale);
    } catch {}
    listeners.forEach((fn) => fn());
  }
}

export function subscribeLocale(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function t(path: string, fallback?: string): string {
  const parts = path.split(".");
  let cur: any = messages[currentLocale];
  for (const part of parts) {
    if (cur && typeof cur === "object" && part in cur) {
      cur = cur[part];
    } else {
      // Fallback to english
      let enCur: any = messages["en"];
      for (const ep of parts) {
        if (enCur && typeof enCur === "object" && ep in enCur) {
          enCur = enCur[ep];
        } else {
          return fallback || path;
        }
      }
      return typeof enCur === "string" ? enCur : fallback || path;
    }
  }
  return typeof cur === "string" ? cur : fallback || path;
}
