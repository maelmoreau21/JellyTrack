"""Run only the isolated users fixture, with the freshly built Go binary."""
import json, os, subprocess, sys
from pathlib import Path

root=Path(__file__).resolve().parents[2]
work=root/'scratch/users-qa'
work.mkdir(parents=True,exist_ok=True)
state=work/'final-audit-process.json'
binary=work/'final-audit-users.exe'
if '--stop' in sys.argv:
    if state.exists():
        pid=int(json.loads(state.read_text())['pid'])
        check=subprocess.run(['powershell','-NoProfile','-Command',f"Get-CimInstance Win32_Process -Filter 'ProcessId = {pid}' | Select-Object CommandLine | ConvertTo-Json -Compress"],capture_output=True,text=True)
        data=json.loads(check.stdout) if check.stdout.strip() else None
        if data and str(binary).lower() in data['CommandLine'].lower():
            subprocess.run(['taskkill','/PID',str(pid),'/T','/F'],check=True)
    sys.exit(0)
subprocess.run(['go','build','-o',str(binary),'.'],cwd=root,check=True)
env=dict(os.environ)
for key in list(env):
    if key.startswith(('JELLYTRACK_','JELLYFIN_','JELLYGATE_','OIDC_','AUTH_','AUTHENTIK_','DATABASE_','POSTGRES_','DB_','LOCAL_ADMIN_','NEXTAUTH_','REDIS_','VALKEY_')) or key in ('BACKUP_DIR','LOG_DIR','PLUGIN_KEY_PEPPER','PORT','TZ'):
        env.pop(key)
env.update(DATABASE_DRIVER='sqlite',DATABASE_PATH=str(work/'users.db'),JELLYTRACK_PORT='3330',JELLYTRACK_SECRET='Users-QA-only-secret-2026-0123456789abcdef',JELLYTRACK_LOCAL_ADMIN_USER='usersadmin',JELLYTRACK_LOCAL_ADMIN_PASSWORD='Users-QA-test-2026!',JELLYTRACK_MODE='single',TZ='UTC',BACKUP_DIR=str(work/'backups'),LOG_DIR=str(work/'logs'),JELLYFIN_URL='',JELLYFIN_API_KEY='')
with (work/'final-stdout.log').open('w') as out,(work/'final-stderr.log').open('w') as err:
    process=subprocess.Popen([str(binary)],cwd=work,env=env,stdout=out,stderr=err,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
state.write_text(json.dumps({'pid':process.pid}))
print('Users isolated QA started on 3330, PID',process.pid)
