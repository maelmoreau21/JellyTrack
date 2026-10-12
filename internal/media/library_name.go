package media

// LibraryNameSQL displays real names, inheriting missing episode/track names
// through scoped parents. Technical collection categories are never names.
// alias is a trusted SQL alias supplied by the application.
func LibraryNameSQL(alias string) string {
	return `COALESCE(NULLIF(` + alias + `."libraryName",''),
 (SELECT COALESCE(NULLIF(parent."libraryName",''),
   (SELECT NULLIF(grandparent."libraryName",'') FROM "Media" grandparent WHERE grandparent."serverId"=parent."serverId" AND (grandparent."id"=parent."parentId" OR grandparent."jellyfinMediaId"=parent."parentId") ORDER BY grandparent."id" LIMIT 1))
 FROM "Media" parent WHERE parent."serverId"=` + alias + `."serverId" AND (parent."id"=` + alias + `."parentId" OR parent."jellyfinMediaId"=` + alias + `."parentId") ORDER BY parent."id" LIMIT 1),'Unknown')`
}
