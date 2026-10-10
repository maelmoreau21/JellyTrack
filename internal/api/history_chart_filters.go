package api

import "strings"

func historyLibraryCategory(value string, args *[]any) string {
	value = strings.ToLower(value)
	aliases := map[string][]string{
		"movies":  {"movies", "movie", "films", "film"},
		"tvshows": {"tvshows", "tv", "series", "season", "episode", "shows"},
		"music":   {"music", "audio", "track", "musicalbum", "albums"},
		"books":   {"books", "book", "audiobook"},
	}
	values := aliases[value]
	if len(values) == 0 {
		values = []string{value}
	}
	marks := make([]string, len(values))
	for i, alias := range values {
		marks[i] = "?"
		*args = append(*args, alias)
	}
	return strings.Join(marks, ",")
}

// Chart labels contain a normalized language and sometimes the selected codec.
// Free-text filters retain codec/language substring matching.
func historyTrackFilter(kind, codecColumn, languageColumn, value string) (string, []any) {
	codec := `LOWER(TRIM(COALESCE(p."` + codecColumn + `",'')))`
	language := `LOWER(TRIM(COALESCE(p."` + languageColumn + `",'')))`
	unknown := `('','none','off','disabled','unknown','unk','und','undefined','null','n/a','na','-')`
	visual := `m."type" NOT IN ('Audio','Track','MusicAlbum','Book','AudioBook')`
	if kind == "subtitle" {
		switch strings.ToUpper(value) {
		case "NONE", "OFF":
			return `(` + visual + ` AND ` + language + ` IN ` + unknown + ` AND ` + codec + ` IN ` + unknown + `)`, nil
		case "UNKNOWN":
			return `(` + visual + ` AND ` + language + ` IN ` + unknown + ` AND ` + codec + ` NOT IN ` + unknown + `)`, nil
		}
	}
	label, selectedCodec := value, ""
	if start := strings.Index(value, " ("); start > 0 && strings.HasSuffix(value, ")") {
		label, selectedCodec = value[:start], strings.TrimSpace(value[start+2:len(value)-1])
	}
	if len(label) != 2 || strings.ToUpper(label) != label {
		return `(` + codec + ` LIKE LOWER(?) OR ` + language + ` LIKE LOWER(?))`, []any{"%" + value + "%", "%" + value + "%"}
	}
	aliases := map[string][]string{
		"FR": {"fre", "fra", "french"}, "EN": {"eng", "english"}, "ES": {"spa", "spanish"}, "PT": {"por", "portuguese"},
		"DE": {"deu", "ger", "german"}, "IT": {"ita", "italian"}, "NL": {"nld", "dutch"}, "ZH": {"zho", "chi", "chinese"},
		"JA": {"jpn", "japanese"}, "KO": {"kor", "korean"}, "RU": {"rus", "russian"}, "PL": {"pol", "polish"},
	}
	variants := append([]string{strings.ToLower(label)}, aliases[label]...)
	parts, args := []string{}, []any{}
	for _, alias := range variants {
		parts = append(parts, `(`+language+`=? OR `+language+` LIKE ? OR `+language+` LIKE ? OR `+language+` LIKE ? OR `+language+` LIKE ?)`)
		args = append(args, alias, alias+"-%", alias+"_%", alias+" %", alias+"/%")
	}
	clause := "(" + strings.Join(parts, " OR ") + ")"
	if selectedCodec != "" {
		clause += " AND " + codec + "=LOWER(?)"
		args = append(args, selectedCodec)
	}
	if kind == "subtitle" || selectedCodec != "" {
		clause += " AND " + visual
	}
	return "(" + clause + ")", args
}
