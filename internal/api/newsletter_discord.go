package api

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/database"
	"github.com/maelmoreau21/jellytrack/internal/history"
)

func (h *Handler) monthlyDiscordPayload(ctx context.Context, today time.Time) (map[string]any, error) {
	start := today.AddDate(0, 0, -30)
	since := start.Format(time.RFC3339Nano)
	where := `p."startedAt">=? AND ` + history.ZappingClause("p")
	var duration, plays int64
	if err := h.db.QueryRowContext(ctx, database.Bind(`SELECT COALESCE(SUM(p."durationWatched"),0),COUNT(*) FROM "PlaybackHistory" p WHERE `+where, h.driver), since).Scan(&duration, &plays); err != nil {
		return nil, err
	}
	rows, err := h.db.QueryContext(ctx, database.Bind(`SELECT COALESCE(m."title",'Média inconnu'),COALESCE(m."type",'Vidéo'),SUM(p."durationWatched") FROM "PlaybackHistory" p LEFT JOIN "Media" m ON m."id"=p."mediaId" WHERE `+where+` GROUP BY p."mediaId",m."title",m."type" ORDER BY SUM(p."durationWatched") DESC,p."mediaId" ASC LIMIT 3`, h.driver), since)
	if err != nil {
		return nil, err
	}
	podium := []string{}
	for rows.Next() {
		var title, kind string
		var seconds int64
		if err = rows.Scan(&title, &kind, &seconds); err != nil {
			break
		}
		podium = append(podium, fmt.Sprintf("%d. **%s** (%s) — *%.1fh*", len(podium)+1, title, kind, float64(seconds)/3600))
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		return nil, err
	}
	name, hours := "Aucun", float64(0)
	userRows, err := h.db.QueryContext(ctx, database.Bind(`SELECT COALESCE(u."username",'Utilisateur'),SUM(p."durationWatched") FROM "PlaybackHistory" p LEFT JOIN "User" u ON u."id"=p."userId" WHERE `+where+` GROUP BY p."userId",u."username" ORDER BY SUM(p."durationWatched") DESC,p."userId" ASC LIMIT 1`, h.driver), since)
	if err != nil {
		return nil, err
	}
	if userRows.Next() {
		var seconds int64
		err = userRows.Scan(&name, &seconds)
		hours = float64(seconds) / 3600
	}
	if err == nil {
		err = userRows.Err()
	}
	userRows.Close()
	if err != nil {
		return nil, err
	}
	mediaText := "Aucune lecture sur la période."
	if len(podium) > 0 {
		mediaText = strings.Join(podium, "\n")
	}
	months := []string{"janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."}
	date := func(t time.Time) string {
		return fmt.Sprintf("%02d %s %d", t.Day(), months[int(t.Month())-1], t.Year())
	}
	return map[string]any{
		"username": "JellyTrack Rewind", "avatar_url": "https://raw.githubusercontent.com/maelmoreau21/JellyTrack/main/public/icon.svg",
		"embeds": []map[string]any{{"title": "✨ JellyTrack Rewind — Bilan du Mois", "description": fmt.Sprintf("Voici le récapitulatif des 30 derniers jours (%s au %s) sur votre serveur multimédia !", date(start), date(today)), "color": 11164867,
			"fields": []map[string]any{{"name": "⏱️ Temps de Visionnage", "value": fmt.Sprintf("**%.0f heures**", float64(duration)/3600), "inline": true}, {"name": "🎬 Lectures Totales", "value": fmt.Sprintf("**%d sessions**", plays), "inline": true}, {"name": "👑 Spectateur du Mois", "value": fmt.Sprintf("**%s** (%.0fh)", name, hours), "inline": false}, {"name": "🏆 Podium des Médias", "value": mediaText, "inline": false}},
			"footer": map[string]string{"text": "JellyTrack • Analyse & Statistiques pour Jellyfin"}, "timestamp": today.Format(time.RFC3339)}},
	}, nil
}
