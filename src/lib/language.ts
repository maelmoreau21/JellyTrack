export function normalizeLanguageTag(value: string | null | undefined): string | null {
    if (!value) return null;
    let s = String(value).trim();
    // remove parenthesized parts: "English (AAC)" -> "English"
    s = s.replace(/\(.*\)/, '').trim();
    // split on common separators and pick first token
    s = s.split(/[\/\\,;]+/)[0].trim();
    // normalize underscores to hyphens
    s = s.replace(/_/g, '-');

    const low = s.toLowerCase();

    // If it's a 2-letter code or region variant like en or en-US, return primary 2-letter code
    const twoMatch = low.match(/^([a-z]{2})(?:[-_][a-z]{2})?$/i);
    if (twoMatch) return twoMatch[1].toUpperCase();

    // Map common 3-letter codes and short tokens to 2-letter
    const quickMap: Record<string, string> = {
        'fre': 'FR', 'fra': 'FR', 'eng': 'EN', 'spa': 'ES', 'por': 'PT', 'deu': 'DE', 'ger': 'DE', 'ita': 'IT', 'nld': 'NL', 'zho': 'ZH', 'chi': 'ZH', 'jpn': 'JA', 'kor': 'KO', 'rus': 'RU', 'pol': 'PL'
    };
    const token = low.split(/\s+/)[0];
    if (quickMap[token]) return quickMap[token];

    // Map common full names
    const nameMap: Record<string, string> = {
        'french': 'FR', 'english': 'EN', 'spanish': 'ES', 'portuguese': 'PT', 'german': 'DE', 'italian': 'IT', 'dutch': 'NL', 'chinese': 'ZH', 'japanese': 'JA', 'korean': 'KO', 'russian': 'RU', 'polish': 'PL'
    };
    if (nameMap[token]) return nameMap[token];

    // Fallback: take first two alpha characters if available
    const letters = token.replace(/[^a-z]+/g, '');
    if (letters.length >= 2) return letters.substring(0, 2).toUpperCase();

    return null;
}
