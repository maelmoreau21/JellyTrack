"""Run QA copies with synthetic credentials and an isolated working directory.

No .env file is opened. Child app variables are reset before starting a server.
"""
import argparse, json, os, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRATCH = ROOT / 'scratch/settings-admin-qa'
SECRET = 'Settings-admin-QA-only-secret-2026-0123456789abcdef'
parser = argparse.ArgumentParser()
parser.add_argument('--reference', action='store_true')
parser.add_argument('--stop', action='store_true')
parser.add_argument('--single', action='store_true')
args = parser.parse_args()
SCRATCH.mkdir(parents=True, exist_ok=True)
kind = 'reference' if args.reference else 'go'
state_file = SCRATCH / (kind + '-process.json')
if args.stop:
    if state_file.exists():
        state = json.loads(state_file.read_text())
        # Verify executable and command before stopping only the recorded fixture.
        check = subprocess.run(['powershell', '-NoProfile', '-Command',
            f"Get-CimInstance Win32_Process -Filter 'ProcessId = {int(state['pid'])}' | Select-Object ExecutablePath,CommandLine | ConvertTo-Json -Compress"], capture_output=True, text=True)
        value = json.loads(check.stdout) if check.stdout.strip() else None
        if value and state['marker'].lower() in value['CommandLine'].lower():
            subprocess.run(['taskkill', '/PID', str(state['pid']), '/T', '/F'], check=True)
        else:
            print('Recorded QA process already stopped; no other process touched.')
    sys.exit(0)

env = dict(os.environ)
for key in list(env):
    if key.startswith(('JELLYTRACK_', 'JELLYFIN_', 'JELLYGATE_', 'OIDC_', 'AUTH_', 'AUTHENTIK_', 'DATABASE_', 'POSTGRES_', 'DB_', 'LOCAL_ADMIN_', 'NEXTAUTH_', 'REDIS_', 'VALKEY_')) or key in ('BACKUP_DIR', 'LOG_DIR', 'PLUGIN_KEY_PEPPER', 'PORT', 'TZ'):
        env.pop(key)
if args.reference:
    work = ROOT / 'scratch/navigation-qa/main-reference'
    if not work.is_dir() or ROOT / 'scratch' not in work.parents:
        raise SystemExit('Prepare the ignored historical QA archive first.')
    env.update(PRISMA_USE_STUB='true', NEXTAUTH_SECRET='navigation-qa-reference-secret-at-least-32-characters', NEXTAUTH_URL='http://localhost:3341', JELLYTRACK_MODE='multi', TZ='UTC', NEXT_TELEMETRY_DISABLED='1')
    fonts = ROOT / 'scratch/navigation-qa/cached-google-fonts.cjs'
    if fonts.is_file(): env['NEXT_FONT_GOOGLE_MOCKED_RESPONSES'] = str(fonts)
    env['NEXT_SWC_PATH'] = str(work / 'node_modules/@next/swc-win32-x64-msvc/next-swc.win32-x64-msvc.node')
    # The bundled SWC loader needs a short cache path on Windows. See README.
    env['SWC_NATIVE_BINDING_CACHE'] = 'Q:\\'
    command = ['node', str(work / 'node_modules/next/dist/bin/next'), 'dev', '--webpack', '--port', '3341', '--hostname', '127.0.0.1']
    marker = str(work / 'node_modules/next/dist/bin/next')
else:
    executable = SCRATCH / 'settings-admin-qa.exe'
    subprocess.run(['go', 'build', '-o', str(executable), '.'], cwd=ROOT, check=True)
    work = SCRATCH
    env.update(DATABASE_DRIVER='sqlite', DATABASE_PATH=str(SCRATCH / 'settings-admin.db'), JELLYTRACK_PORT='3340', JELLYTRACK_SECRET=SECRET, JELLYTRACK_LOCAL_ADMIN_USER='settingsadmin', JELLYTRACK_LOCAL_ADMIN_PASSWORD='Settings-admin-QA-test-2026!', JELLYTRACK_MODE='single' if args.single else 'multi', TZ='UTC', BACKUP_DIR=str(SCRATCH / 'backups'), LOG_DIR=str(SCRATCH / 'logs'), JELLYFIN_URL='', JELLYFIN_API_KEY='')
    command = [str(executable)]
    marker = str(executable)
with (SCRATCH / (kind + '-stdout.log')).open('w') as out, (SCRATCH / (kind + '-stderr.log')).open('w') as err:
    process = subprocess.Popen(command, cwd=work, env=env, stdout=out, stderr=err, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
state_file.write_text(json.dumps({'pid':process.pid, 'marker':marker}))
print(kind, 'fixture started, PID', process.pid)
