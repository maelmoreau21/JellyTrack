"""Reuse the existing QA scripts and snapshot evidence under this audit only."""
import argparse,json,os,shutil,subprocess,sys,time
from pathlib import Path

root=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser()
parser.add_argument('suite',choices=['users','settings','media'])
parser.add_argument('--only',nargs='+',help='Rerun selected scripts; preserve other execution results.')
args=parser.parse_args()
out=root/'docs/final-audit/suites'/args.suite
out.mkdir(parents=True,exist_ok=True)
env=dict(os.environ)
env['PLAYWRIGHT_MODULE']=env.get('PLAYWRIGHT_MODULE',r'C:\Users\Mael\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright')
env['PYTHONUTF8']='1'
env['NODE_OPTIONS']='--require "'+(root/'scripts/final-audit/robust-writes.cjs').as_posix()+'"'
env['REFERENCE_ROOT']=str(root/'scratch/final-audit/no-reference') # Do not replace the visual agent's shared fixture.
if args.suite=='users':
    env['JELLYTRACK_SECRET']='Users-QA-only-secret-2026-0123456789abcdef'
    steps=[('python','seed-users.py'),*[("node",name+'.cjs') for name in ['browser-users','profile-controls','list-pagination','historical-preferences','audiobook','telemetry','wrapped-theme']]]
    directory='users-qa';source='users-validation'
elif args.suite=='settings':
    steps=[('python','seed.py'),('node','browser.cjs'),('python','seed.py'),('node','forms.cjs'),('node','admin.cjs'),('node','modes.cjs')]
    directory='settings-admin-qa';source='settings-admin-validation'
else:
    steps=[('node','browser.cjs'),('node','interactions.cjs')]
    directory='media-pages-qa';source='media-pages-validation'
results=json.loads((out/'execution.json').read_text(encoding='utf-8')) if args.only and (out/'execution.json').exists() else []
if args.only: steps=[step for step in steps if step[1] in args.only]
for runtime,name in steps:
    start=time.time()
    process=subprocess.run([sys.executable if runtime=='python' else runtime,str(root/'scripts'/directory/name)],cwd=root,env=env,capture_output=True,text=True,encoding='utf-8',errors='replace')
    (out/(name+'.txt')).write_text(process.stdout+'\n'+process.stderr,encoding='utf-8')
    results=[row for row in results if row['script']!=directory+'/'+name]
    results.append({'script':directory+'/'+name,'exitCode':process.returncode,'seconds':round(time.time()-start,2),'recordedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())})
    for file in (root/'docs'/source).glob('*.json'):
        # Copy only reports produced during this invocation, never old evidence.
        if file.stat().st_mtime>=start-1:
            shutil.copy2(file,out/file.name)
    (out/'execution.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
    print(name,'PASS' if process.returncode==0 else 'FAIL',flush=True)
print(json.dumps(results),flush=True)
if any(r['exitCode'] for r in results):sys.exit(1)
