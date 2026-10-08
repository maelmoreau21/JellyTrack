// Package migrations embeds the database schema migration scripts.
package migrations

import "embed"

// Files contains the SQL migration files for SQLite and PostgreSQL.
//
//go:embed sqlite/*.sql postgres/*.sql
var Files embed.FS
