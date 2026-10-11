// Source-based reproduction of main getCumulativeCompletionEntries on its aligned fixture.
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../..'), fixture = JSON.parse(fs.readFileSync(path.join(root, 'scratch/navigation-qa/main-reference/qa-users-fixture.json')));
const media = new Map(fixture.Media.map(item => [item.id, item]));
const alice = new Set(fixture.User.filter(user => user.jellyfinUserId === 'alice').map(user => user.id));
const groups = new Map();
for (const history of fixture.PlaybackHistory.filter(item => alice.has(item.userId))) {
  const item = media.get(history.mediaId);
  if (!item) continue;
  const key = `${history.userId}::server::${history.mediaId}`;
  if (!groups.has(key)) groups.set(key, { key, type: item.type, watched: 0, runtime: Number(item.durationMs) });
  groups.get(key).watched += Number(history.durationWatched) || 0;
}
const counts = {};
for (const row of groups.values()) {
  const percent = row.runtime > 0 ? Math.min(100, row.watched * 100000 / row.runtime) : 0;
  // UserStatsCharts only selects type, not collectionType. The historical
  // normalizeLibraryKey alias map lacks Audio, Track and MusicAlbum.
  const music = ['music', 'musics', 'musique', 'musiques', 'album', 'albums'].includes(String(row.type).toLowerCase());
  const thresholds = music ? [60, 30, 12] : [80, 20, 10];
  row.percent = percent;
  row.bucket = percent >= thresholds[0] ? 'completed' : percent >= thresholds[1] ? 'partial' : percent >= thresholds[2] ? 'abandoned' : 'skipped';
  counts[row.bucket] = (counts[row.bucket] || 0) + 1;
}
const report = { date: new Date().toISOString(), scope: 'Read-only aligned fixture cumulative completion, source reproduction; groups keep user IDs and media IDs. Main UserStatsCharts omits collectionType, and normalizeLibraryKey lacks Audio/Track/MusicAlbum aliases, causing the default 80/20/10 rule for these audio items. Go deliberately uses 60/30/12 music rules.', counts, groups: [...groups.values()] };
fs.writeFileSync(path.join(root, 'docs/parity-restoration/visual-profile-completion-source.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(counts));
