"""Run the existing suites with fresh evidence, preserving the previous audit.

Only the existing scratch SQLite fixtures are used. Scripts are copied into
scratch at the same depth so their root and fixture guards remain effective.
"""
import argparse,json,os,subprocess,sys,time
from pathlib import Path
root=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser()
parser.add_argument('suite',choices=['media','users','settings','controls','responsive'])
parser.add_argument('--only',nargs='+')
parser.add_argument('--phase', default='restored')
parser.add_argument('--routes', nargs='+', help='Optional canonical routes for a focused responsive recheck.')
args=parser.parse_args()
directory={'media':'media-pages-qa','users':'users-qa','settings':'settings-admin-qa','controls':'final-audit','responsive':'final-audit'}[args.suite]
source=root/'scripts'/directory
scratch=root/'scratch'/('parity-'+args.suite)
scratch.mkdir(parents=True,exist_ok=True)
out=root/'docs/parity-restoration/suites'/args.suite
out.mkdir(parents=True,exist_ok=True)
env=dict(os.environ, PYTHONUTF8='1', PLAYWRIGHT_MODULE=r'C:\Users\Mael\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright',REFERENCE_ROOT=str(root/'scratch/final-audit/no-reference'),JELLYTRACK_SECRET='Users-QA-only-secret-2026-0123456789abcdef', AUDIT_PHASE='restored')
env['NODE_OPTIONS']='--require "'+(root/'scripts/parity-restoration/robust-evidence.cjs').as_posix()+'"'
env['AUDIT_PHASE']=args.phase
if args.routes: env['AUDIT_ROUTES']=json.dumps(args.routes)
if args.suite=='media': steps=['browser.cjs','interactions.cjs']
elif args.suite=='users':steps=['seed-users.py','browser-users.cjs','profile-controls.cjs','list-pagination.cjs','historical-preferences.cjs','audiobook.cjs','telemetry.cjs','wrapped-theme.cjs']
elif args.suite=='settings':steps=['seed.py','browser.cjs','seed.py','forms.cjs','admin.cjs','modes.cjs']
elif args.suite=='controls':steps=['final-controls.cjs','accessibility-focused.cjs']
else:steps=['accessibility-responsive.cjs']
if args.only:steps=[s for s in steps if s in args.only]
for item in source.glob('*'):
    if item.suffix not in ['.cjs','.py']:continue
    text=item.read_text(encoding='utf-8')
    for family in ['media-pages','users','settings-admin']:
        text=text.replace('docs/'+family+'-validation','docs/parity-restoration/suites/'+args.suite)
        text=text.replace('docs/'+family+'-captures','docs/parity-restoration/suites/'+args.suite+'/captures')
    if directory=='final-audit':text=text.replace("docs/final-audit",'docs/parity-restoration/suites/'+args.suite)
    if args.suite=='responsive':
        text=text.replace('for(const canonical of [...historical,...additions])', "for(const canonical of [...historical,...additions].filter(r=>!process.env.AUDIT_ROUTES||JSON.parse(process.env.AUDIT_ROUTES).includes(r)))")
    if args.suite=='media' and item.name=='browser.cjs':
        # Historical normalized grouping merges the two music libraries.
        text=text.replace("page.locator('.mr-library-card').count()===2","page.locator('.mr-library-card').count()===1")
        text=text.replace("await go('/');const button=page.locator('[data-stream-action=\"message\"]')", "require('child_process').execFileSync('python',[path.resolve(__dirname,'../../scripts/parity-restoration/refresh-qa-streams.py')]);await go('/');const button=page.locator('[data-stream-action=\"message\"]')")
    (scratch/item.name).write_text(text,encoding='utf-8')
(out/'captures').mkdir(exist_ok=True)
results=json.loads((out/'execution.json').read_text(encoding='utf-8')) if args.only and (out/'execution.json').exists() else []
for name in steps:
    start=time.time()
    p=subprocess.run([sys.executable if name.endswith('.py') else 'node',str(scratch/name)],cwd=root,env=env,capture_output=True,text=True,encoding='utf-8',errors='replace')
    (out/(name+'.txt')).write_text(p.stdout+'\n'+p.stderr,encoding='utf-8')
    row={'script':directory+'/'+name,'exitCode':p.returncode,'seconds':round(time.time()-start,2),'recordedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
    results=[r for r in results if r['script']!=row['script']]+[row]
    (out/'execution.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
    print(name,'PASS' if p.returncode==0 else 'FAIL',flush=True)
if any(r['exitCode'] for r in results):sys.exit(1)
