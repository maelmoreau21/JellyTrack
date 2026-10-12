package media

// ParentMatchSQL accepts internal IDs and both common Jellyfin UUID spellings.
// Server equality must be enforced by the caller.
func ParentMatchSQL(parent, child string, driver ...string) string {
	a := `REPLACE(` + parent + `."jellyfinMediaId",'-','')`
	b := `REPLACE(` + child + `."parentId",'-','')`
	hex := a + ` NOT GLOB '*[^a-fA-F0-9]*' AND ` + b + ` NOT GLOB '*[^a-fA-F0-9]*'`
	if len(driver) > 0 && driver[0] == "postgres" {
		hex = a + ` ~ '^[a-fA-F0-9]{32}$' AND ` + b + ` ~ '^[a-fA-F0-9]{32}$'`
	}
	return `(` + parent + `."id"=` + child + `."parentId" OR ` + parent + `."jellyfinMediaId"=` + child + `."parentId" OR (LENGTH(` + a + `)=32 AND LENGTH(` + b + `)=32 AND ` + hex + ` AND LOWER(` + a + `)=LOWER(` + b + `)))`
}
