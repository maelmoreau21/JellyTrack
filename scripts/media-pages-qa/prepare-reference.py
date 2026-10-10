"""Extend only the ignored synthetic Prisma fixture adapter, never main components."""
import subprocess,sqlite3,json
from pathlib import Path
root=Path(__file__).resolve().parents[2]
reference=root/'scratch/navigation-qa/main-reference'
assert subprocess.check_output(['git','check-ignore',reference.relative_to(root).as_posix()],cwd=root,text=True).strip()
adapter=reference/'src/lib/qa-users-prisma.ts'
text=adapter.read_text(encoding='utf-8')
text=text.replace('({...p,startedAt:new Date(p.startedAt),endedAt:p.endedAt?new Date(p.endedAt):null})','({...p,user:{...(data.User||[]).find((u:any)=>u.id===p.userId)},startedAt:new Date(p.startedAt),endedAt:p.endedAt?new Date(p.endedAt):null})')
text=text.replace('g._max={startedAt:null,endedAt:null};','g._max={startedAt:null,endedAt:null};g._min={startedAt:null,endedAt:null};')
text=text.replace("if(r[k]&&(!g._max[k]||r[k]>g._max[k]))g._max[k]=r[k];","{if(r[k]&&(!g._max[k]||r[k]>g._max[k]))g._max[k]=r[k];if(r[k]&&(!g._min[k]||r[k]<g._min[k]))g._min[k]=r[k];}")
# Implement the requested aggregation contract from actual fixture rows.
matcher_start=text.index('function matches(')
matcher_end=text.index('function selection(',matcher_start)
text=text[:matcher_start]+'''function matches(row:any,where:any):boolean {
 if(!where)return true;
 if(Array.isArray(where))return where.every(w=>matches(row,w));
 return Object.entries(where).every(([key,value]:any)=>{
  if(key==='AND')return (Array.isArray(value)?value:[value]).every(w=>matches(row,w));
  if(key==='OR')return (Array.isArray(value)?value:[value]).some(w=>matches(row,w));
  if(key==='NOT')return (Array.isArray(value)?value:[value]).every(w=>!matches(row,w));
  const got=row?.[key];
  if(value===null)return got==null;
  if(typeof value!=='object'||value instanceof Date)return got instanceof Date?got.getTime()===new Date(value).getTime():got===value;
  const operators=['not','in','notIn','gte','lte','gt','lt','equals','contains','startsWith','endsWith','has','hasSome','hasEvery','isEmpty','mode'];
  if(!Object.keys(value).some(k=>operators.includes(k)))return matches(got||{},value);
  return Object.entries(value).every(([op,want]:any)=>{
   switch(op){
    case 'mode':return true;
    case 'not':return want===null?got!=null:typeof want==='object'?!matches({x:got},{x:want}):got!==want;
    case 'in':return want.includes(got);
    case 'notIn':return !want.includes(got);
    case 'gte':return got>=want;
    case 'lte':return got<=want;
    case 'gt':return got>want;
    case 'lt':return got<want;
    case 'equals':return value.mode==='insensitive'?String(got).toLowerCase()===String(want).toLowerCase():got===want;
    case 'contains':return String(got||'').toLowerCase().includes(String(want).toLowerCase());
    case 'startsWith':return String(got||'').toLowerCase().startsWith(String(want).toLowerCase());
    case 'endsWith':return String(got||'').toLowerCase().endsWith(String(want).toLowerCase());
    case 'has':return Array.isArray(got)&&got.includes(want);
    case 'hasSome':return Array.isArray(got)&&want.some((v:any)=>got.includes(v));
    case 'hasEvery':return Array.isArray(got)&&want.every((v:any)=>got.includes(v));
    case 'isEmpty':return Array.isArray(got)&&(got.length===0)===want;
    default:throw Error('Unsupported fixture predicate '+op);
   }
  });
 });
}
''' + text[matcher_end:]
start=text.index("   const aggregate=") if "   const aggregate=" in text else text.index("   if(method==='groupBy'){")
end=text.index("   if(args.orderBy)",start)
text=text[:start]+'''   const aggregate=(values:any[])=>{
    const out:any={};
    for(const op of ['_sum','_avg','_min','_max'])if(args[op]){out[op]={};for(const k of Object.keys(args[op])){const actual=values.map(r=>r[k]).filter(v=>v!=null);out[op][k]=actual.length?op==='_sum'?actual.reduce((s,v)=>s+Number(v),0):op==='_avg'?actual.reduce((s,v)=>s+Number(v),0)/actual.length:op==='_min'?actual.reduce((s,v)=>v<s?v:s):actual.reduce((s,v)=>v>s?v:s):null;}}
    if(args._count===true)out._count=values.length;else if(args._count){out._count={};for(const k of Object.keys(args._count))out._count[k]=k==='_all'?values.length:values.filter(r=>r[k]!=null).length;}
    return out;
   };
   if(method==='groupBy'){
    const groups=new Map<string,any[]>();for(const r of rows){const key=JSON.stringify(args.by.map((k:string)=>r[k]));groups.set(key,[...(groups.get(key)||[]),r]);}
    rows=[...groups.values()].map(values=>({...Object.fromEntries(args.by.map((k:string)=>[k,values[0][k]])),...aggregate(values)}));
   }
   if(method==='aggregate')return aggregate(rows);
''' + text[end:]
oldsort="const [key,dir]:any=Object.entries(o)[0];if(a[key]<b[key])return dir==='asc'?-1:1;if(a[key]>b[key])return dir==='asc'?1:-1;"
newsort="const [key,order]:any=Object.entries(o)[0];const nested=typeof order==='object'?Object.entries(order)[0]:null;const dir=nested?nested[1]:order, av=nested?a[key]?.[nested[0]]:a[key],bv=nested?b[key]?.[nested[0]]:b[key];if(av<bv)return dir==='asc'?-1:1;if(av>bv)return dir==='asc'?1:-1;"
text=text.replace(oldsort,newsort).replace("if(method==='findMany')return rows;","if(method==='findMany'||method==='groupBy')return rows;")
adapter.write_text(text,encoding='utf-8')
fixture=reference/'qa-users-fixture.json'
backup=reference/'qa-users-fixture-before-media.json'
if not backup.exists():backup.write_bytes(fixture.read_bytes())
db=sqlite3.connect(root/'scratch/media-pages-qa/media-pages.db');db.row_factory=sqlite3.Row
data={table:[dict(row) for row in db.execute('SELECT * FROM "'+table+'"')] for table in ['User','Server','Media','PlaybackHistory','TelemetryEvent','ActiveStream']}
for row in data['Media']:
    for key in ['genres','directors','actors','studios']:row[key]=json.loads(row[key])
fixture.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
print('Synthetic adapter: actual relations/groupBy/aggregates and shared SQLite fixture supplied. Original main components untouched.')
