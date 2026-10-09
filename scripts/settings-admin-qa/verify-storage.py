"""Print only booleans for synthetic secret preservation; never disclose values."""
import json, sqlite3
from pathlib import Path
root=Path(__file__).resolve().parents[2]
db=sqlite3.connect(root/'scratch/settings-admin-qa/settings-admin.db')
sso,key=db.execute("SELECT ssoSettings,pluginApiKey FROM GlobalSettings WHERE id='global'").fetchone()
rows=db.execute("SELECT id,jellyfinApiKey FROM Server WHERE id IN ('qa-primary','qa-secondary')").fetchall()
print(json.dumps({'ssoSecretPreserved':json.loads(sso)['clientSecret']=='QA-sso-secret-keep-2026','globalPluginKeyPreserved':key=='QA-plugin-global-key-2026-'+('a'*40),'serverSecretsPreserved':len(rows)==2 and all(secret=='QA-server-secret-'+sid for sid,secret in rows)}))
