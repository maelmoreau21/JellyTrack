"""Extend only the synthetic QA adapter; historical components stay unchanged."""
from pathlib import Path
import json, subprocess
root = Path(__file__).resolve().parents[2]
reference = root / 'scratch/navigation-qa/main-reference'
relative = reference.relative_to(root).as_posix()
assert subprocess.check_output(['git','check-ignore',relative],cwd=root,text=True).strip() == relative
adapter = reference / 'src/lib/qa-users-prisma.ts'
source = adapter.read_text(encoding='utf-8')
marker = " if(model==='playbackHistory'){"
addition = " if(model==='media')r.playbackHistory=(data.PlaybackHistory||[]).filter((p:any)=>p.mediaId===r.id).map((p:any)=>({...p,startedAt:new Date(p.startedAt),endedAt:p.endedAt?new Date(p.endedAt):null}));\n"
if addition not in source:
    assert marker in source
    source=source.replace(marker,addition+marker)
    adapter.write_text(source,encoding='utf-8')
fixture=reference/'qa-users-fixture.json'
data=json.loads(fixture.read_text(encoding='utf-8'))
for index,server in enumerate(data.get('Server',[])):
    # Synthetic disabled loopback servers must have distinct selectable URLs.
    assert server['url'] in ('http://127.0.0.1:9','http://localhost:9'), 'Unexpected QA fixture server URL'
    server['url']='http://127.0.0.1:9' if index==0 else 'http://localhost:9'
fixture.write_text(json.dumps(data),encoding='utf-8')
print('Synthetic media/playback relation supplied to historical cleanup; components untouched.')
