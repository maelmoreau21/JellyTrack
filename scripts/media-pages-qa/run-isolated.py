"""Build/run the embedded Go assets against an isolated synthetic database."""
import argparse, json, os, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / 'scratch/media-pages-qa'
STATE = WORK / 'process.json'
parser = argparse.ArgumentParser()
parser.add_argument('--stop', action='store_true')
args = parser.parse_args()
WORK.mkdir(parents=True, exist_ok=True)

def running():
    if not STATE.exists(): return None
    state = json.loads(STATE.read_text())
    result = subprocess.run(['powershell', '-NoProfile', '-Command',
        f"Get-CimInstance Win32_Process -Filter 'ProcessId = {int(state['pid'])}' | Select-Object ExecutablePath,CommandLine | ConvertTo-Json -Compress"], capture_output=True, text=True)
    value = json.loads(result.stdout) if result.stdout.strip() else None
    if value and str(WORK / 'media-pages-qa.exe').lower() in str(value['CommandLine']).lower(): return state['pid']
    return None

pid = running()
if args.stop:
    if pid: subprocess.run(['taskkill','/PID',str(pid),'/T','/F'],check=True)
    print('Isolated QA stopped.' if pid else 'No isolated QA process running.')
    sys.exit(0)
if pid: raise SystemExit('Stop the recorded QA process before rebuilding.')
binary = WORK / 'media-pages-qa.exe'
subprocess.run(['go','build','-o',str(binary),'.'],cwd=ROOT,check=True)
env = dict(os.environ)
for key in list(env):
    if key.startswith(('JELLYTRACK_', 'JELLYFIN_', 'JELLYGATE_', 'OIDC_', 'AUTH_', 'AUTHENTIK_', 'DATABASE_', 'POSTGRES_', 'DB_', 'LOCAL_ADMIN_', 'NEXTAUTH_', 'REDIS_', 'VALKEY_')) or key in ('BACKUP_DIR','LOG_DIR','PLUGIN_KEY_PEPPER','PORT','TZ'):
        env.pop(key)
env.update(DATABASE_DRIVER='sqlite',DATABASE_PATH=str(WORK/'media-pages.db'),JELLYTRACK_PORT='3350',JELLYTRACK_SECRET='Media-pages-QA-only-secret-2026-0123456789abcdef',JELLYTRACK_LOCAL_ADMIN_USER='mediaadmin',JELLYTRACK_LOCAL_ADMIN_PASSWORD='Media-pages-QA-test-2026!',JELLYTRACK_MODE='multi',TZ='UTC',BACKUP_DIR=str(WORK/'backups'),LOG_DIR=str(WORK/'logs'),JELLYFIN_URL='',JELLYFIN_API_KEY='')
with (WORK/'stdout.log').open('w') as out,(WORK/'stderr.log').open('w') as err:
    process = subprocess.Popen([str(binary)],cwd=WORK,env=env,stdout=out,stderr=err,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
STATE.write_text(json.dumps({'pid':process.pid}))
print('Isolated Go QA on 127.0.0.1:3350, PID',process.pid)
