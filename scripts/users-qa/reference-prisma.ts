// QA adapter for synthetic isolated users.db only; historical components unchanged.
import fixture from '../../qa-users-fixture.json';
const data: any = fixture;
const tables: any = {user:'User',server:'Server',media:'Media',playbackHistory:'PlaybackHistory',telemetryEvent:'TelemetryEvent'};
function enrich(model: string, row: any): any {
 const r={...row};
 for(const k of ['startedAt','endedAt','lastActive','createdAt','updatedAt','dateAdded'])if(r[k])r[k]=new Date(r[k]);
 if(model==='user')r.playbackHistory=(data.PlaybackHistory||[]).filter((p:any)=>p.userId===r.id).map((p:any)=>enrich('playbackHistory',p));
 if(model==='playbackHistory'){
  r.media=enrich('media',(data.Media||[]).find((m:any)=>m.id===r.mediaId)||{});
  r.user={...(data.User||[]).find((u:any)=>u.id===r.userId)};
  r.telemetryEvents=(data.TelemetryEvent||[]).filter((e:any)=>e.playbackId===r.id).map((e:any)=>enrich('telemetryEvent',e));
 }
 return r;
}
function matches(row:any,where:any):boolean {
 if(!where)return true;
 return Object.entries(where).every(([key,value]:any)=>{
  if(key==='AND')return (Array.isArray(value)?value:[value]).every((w:any)=>matches(row,w));
  if(key==='OR')return value.some((w:any)=>matches(row,w));
  if(key==='NOT')return !matches(row,value);
  const got=row[key];
  if(value===null)return got==null;
  if(typeof value!=='object'||value instanceof Date)return got instanceof Date?got.getTime()===new Date(value).getTime():got===value;
  if('not' in value)return value.not===null?got!=null:got!==value.not;
  if('in' in value)return value.in.includes(got);
  if('gte' in value)return got>=value.gte;
  if('lte' in value)return got<=value.lte;
  if('equals' in value)return value.mode==='insensitive'?String(got).toLowerCase()===String(value.equals).toLowerCase():got===value.equals;
  if('contains' in value)return String(got||'').toLowerCase().includes(String(value.contains).toLowerCase());
  return matches(got||{},value);
 });
}
function selection(row:any,select:any):any {
 if(!select)return row;
 const out:any={};for(const [k,v]of Object.entries(select) as any){if(v===true)out[k]=row[k];else if(v&&typeof v==='object')out[k]=Array.isArray(row[k])?row[k].map((r:any)=>selection(r,v.select)):selection(row[k]||{},v.select);}
 return out;
}
export function qaUsersPrisma() {
 return new Proxy({}, {get(_t,model:string):any {
  if(model==='$connect'||model==='$disconnect')return async()=>{};
  if(model.startsWith('$query'))return async()=>[];
  if(model==='$transaction')return async(fn:any)=>typeof fn==='function'?fn(qaUsersPrisma()):Promise.all(fn);
  return new Proxy({}, {get(_x,method:string):any {return async(args:any={})=>{
   let rows=(data[tables[model]]||[]).map((r:any)=>enrich(model,r)).filter((r:any)=>matches(r,args.where));
   if(model==='globalSettings')return {id:'global',wrappedVisible:true,wrappedPeriodEnabled:false,ssoSettings:null};
   if(method==='count')return rows.length;
   if(method==='groupBy'){
    const groups=new Map<string,any>();for(const r of rows){const key=JSON.stringify(args.by.map((k:string)=>r[k]));let g=groups.get(key);if(!g){g={};for(const k of args.by)g[k]=r[k];g._count={_all:0};g._sum={durationWatched:0};g._max={startedAt:null,endedAt:null};groups.set(key,g);}g._count._all++;g._sum.durationWatched+=r.durationWatched||0;for(const k of ['startedAt','endedAt'])if(r[k]&&(!g._max[k]||r[k]>g._max[k]))g._max[k]=r[k];}return [...groups.values()];
   }
   if(method==='aggregate')return {_sum:{durationWatched:rows.reduce((s:number,r:any)=>s+(r.durationWatched||0),0)},_count:{_all:rows.length}};
   if(args.orderBy){const order=Array.isArray(args.orderBy)?args.orderBy:[args.orderBy];rows.sort((a:any,b:any)=>{for(const o of order){const [key,dir]:any=Object.entries(o)[0];if(a[key]<b[key])return dir==='asc'?-1:1;if(a[key]>b[key])return dir==='asc'?1:-1;}return 0;});}
   if(args.skip)rows=rows.slice(args.skip);if(args.take)rows=rows.slice(0,args.take);
   rows=rows.map((r:any)=>selection(r,args.select));
   if(method==='findMany')return rows;
   if(method==='findFirst'||method==='findUnique')return rows[0]||null;
   return {};
  };}});
 }});
}
