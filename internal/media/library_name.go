package media

// LibraryNameSQL displays real names, inheriting missing episode/track names
// through scoped parents. Technical collection categories are never names.
// alias is a trusted SQL alias supplied by the application.
func LibraryNameSQL(alias string, driver ...string) string {
	return `COALESCE(` + recordedLibrarySQL(alias) + `,(WITH RECURSIVE ancestors("id","serverId","parentId","libraryName","depth") AS (
 SELECT p."id",p."serverId",p."parentId",p."libraryName",1 FROM "Media" p WHERE p."serverId"=` + alias + `."serverId" AND ` + ParentMatchSQL("p", alias, driver...) + `
 UNION SELECT p."id",p."serverId",p."parentId",p."libraryName",a."depth"+1 FROM "Media" p JOIN ancestors a ON p."serverId"=a."serverId" AND ` + ParentMatchSQL("p", "a", driver...) + ` WHERE a."depth"<64 AND ` + recordedLibrarySQL("a") + ` IS NULL
 ) SELECT "libraryName" FROM ancestors WHERE ` + recordedLibrarySQL("ancestors") + ` IS NOT NULL ORDER BY "depth","id" LIMIT 1),'Unknown')`
}

func recordedLibrarySQL(alias string) string {
	return `CASE WHEN LOWER(TRIM(COALESCE(` + alias + `."libraryName",''))) IN ('','unknown','undefined','null','n/a','?') THEN NULL ELSE ` + alias + `."libraryName" END`
}
