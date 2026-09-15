
/* Bewerbungs Tracker Coach 1.0.1 — pure, read-only interpretation of TN backups. */
(function(root){
  'use strict';
  const TYPES=['inserate','bewerbungsbriefe','schnupperberichte','weitereDokumente'];
  const TITLES={inserate:'Inserat',bewerbungsbriefe:'Bewerbungsbrief',schnupperberichte:'Schnupperbericht',weitereDokumente:'Weiteres Dokument'};
  const STANDARD=Object.freeze({
    week:Object.freeze({id:'week',name:'Wochenplan',content:'due',period:'workweek',state:'all',scope:'all'}),
    done:Object.freeze({id:'done',name:'Diese Woche erledigt',content:'done',period:'week',state:'done',scope:'all'}),
    history:Object.freeze({id:'history',name:'Gesamtverlauf',content:'history',period:'all',state:'all',scope:'all'})
  });
  const PERIODS=[['today','Heute'],['workweek','Aktuelle Woche · Mo–Fr'],['week','Aktuelle Woche · Mo–So'],['lastweek','Letzte Woche · Mo–So'],['month','Aktueller Monat'],['last30','Letzte 30 Tage'],['next14','Nächste 14 Tage'],['all','Gesamter Zeitraum'],['range','Zeitraum festlegen']];
  const text=x=>typeof x==='string'?x:typeof x==='number'?String(x):'';
  const array=x=>Array.isArray(x)?x:[];
  const record=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
  const yes=x=>x===true||x==='true'||x===1||x==='1';
  const iso=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  const today=()=>iso(new Date());
  function date(x){const s=text(x).slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return '';const d=new Date(s+'T12:00:00');return Number.isFinite(d.getTime())&&iso(d)===s?s:''}
  function add(s,n){const d=new Date(s+'T12:00:00');d.setDate(d.getDate()+n);return iso(d)}
  function period(def,reference=today()){
    const d=new Date(reference+'T12:00:00'),mo=add(reference,-((d.getDay()+6)%7));
    switch(def.period){
      case 'today':return {from:reference,to:reference};
      case 'workweek':return {from:mo,to:add(mo,4)};
      case 'week':return {from:mo,to:add(mo,6)};
      case 'lastweek':return {from:add(mo,-7),to:add(mo,-1)};
      case 'month':return {from:iso(new Date(d.getFullYear(),d.getMonth(),1,12)),to:iso(new Date(d.getFullYear(),d.getMonth()+1,0,12))};
      case 'last30':return {from:add(reference,-29),to:reference};
      case 'next14':return {from:reference,to:add(reference,13)};
      case 'range':return {from:date(def.from),to:date(def.to)};
      default:return {from:'',to:''};
    }
  }
  const within=(value,p)=>!p.from&&!p.to||!!date(value)&&(!p.from||date(value)>=p.from)&&(!p.to||date(value)<=p.to);
  function documents(app){return TYPES.flatMap(kind=>array(app[kind]).map((r,i)=>({...r,id:text(r.id),name:text(r.name)||TITLES[kind],mime:text(r.mime),kind,kindLabel:TITLES[kind],index:i}))).filter(r=>r.id)}
  function parseField(data,key,fallback){if(!(key in data))return fallback;let value=data[key];if(typeof value==='string'){try{value=JSON.parse(value)}catch{throw new Error('Das Feld «'+key+'» im Backup ist beschädigt.')}}return value}
  function parseBackup(raw,filename='Backup.json'){
    if(typeof raw!=='string'||raw.length>180*1024*1024)throw new Error('Die Backupdatei ist leer oder grösser als 180 MB.');
    let b;try{b=JSON.parse(raw.replace(/^\uFEFF/,''))}catch{throw new Error('Die Datei ist kein lesbares JSON-Backup.')}
    if(!record(b)||b.format!=='kick-backup'||!record(b.data))throw new Error('Bitte eine JSON-Backupdatei aus dem Bewerbungs Tracker auswählen.');
    if(b.formatVersion!==undefined&&(!Number.isInteger(b.formatVersion)||b.formatVersion<1||b.formatVersion>3))throw new Error('Dieses Backupformat wird noch nicht unterstützt. Unterstützt werden Versionen 1–3.');
    if(!Object.hasOwn(b.data,'tracker')&&!Object.hasOwn(b.data,'generalTasksV1'))throw new Error('Im Backup fehlen die Bewerbungs- und Aufgabendaten.');
    const apps=parseField(b.data,'tracker',[]),general=parseField(b.data,'generalTasksV1',[]),profile=parseField(b.data,'profile',{});
    if(!Array.isArray(apps)||!Array.isArray(general)||!record(profile))throw new Error('Die Datenstruktur dieses Backups ist ungültig.');
    if(apps.length>10000||general.length>30000)throw new Error('Dieses Backup enthält zu viele Datensätze.');
    const seen=new Set();
    for(const a of apps){
      if(!record(a)||!['string','number'].includes(typeof a.id)||!text(a.id)||seen.has(text(a.id)))throw new Error('Bewerbungen ohne eindeutige Kennung können nicht zugeordnet werden.');
      seen.add(text(a.id));
      for(const k of ['journal','reflections',...TYPES])if(a[k]!==undefined&&(!Array.isArray(a[k])||a[k].some(x=>!record(x))))throw new Error('Ein Verlauf oder eine Dokumentliste ist beschädigt.');
      if(a.searchMode!==undefined&&!['lehrstelle','stelle','praktikum'].includes(a.searchMode))throw new Error('Das Backup enthält einen unbekannten Suchmodus.');
    }
    if(general.some(t=>!record(t)))throw new Error('Die allgemeinen Aufgaben sind beschädigt.');
    const files=b.nativeAttachments===undefined?[]:b.nativeAttachments;
    if(!Array.isArray(files)||files.some(f=>!record(f)||typeof f.id!=='string'||typeof f.data!=='string'))throw new Error('Die Dokumentdateien im Backup sind beschädigt.');
    const fileIds=new Set();for(const f of files){if(fileIds.has(f.id))throw new Error('Eine Dokumentkennung ist im Backup mehrfach vorhanden.');fileIds.add(f.id)}
    // Import only the professional records. Activation keys, arbitrary localStorage keys
    // and private general tasks are deliberately never copied to the coach database.
    const allowed=new Set(apps.flatMap(documents).map(f=>f.id));
    const name=[text(profile.first),text(profile.last)].filter(Boolean).join(' ').trim();
    return {name,profile:{first:text(profile.first),last:text(profile.last),job:text(profile.job)},apps,generalTasks:general.filter(t=>!yes(t.private)),sourceName:text(filename),createdAt:typeof b.createdAt==='string'&&Number.isFinite(Date.parse(b.createdAt))?b.createdAt:'',appVersion:text(b.appVersion),files:files.filter(f=>allowed.has(f.id)),missing:[...allowed].filter(id=>!fileIds.has(id))};
  }
  function decodeFile(f){
    const value=f.data.replace(/\s/g,'');
    if(!value||value.length>14*1024*1024||value.length%4===1||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw new Error('Ein Dokument ist leer, beschädigt oder grösser als 10 MB.');
    let raw;try{raw=atob(value)}catch{throw new Error('Ein Dokument enthält ungültige Dateidaten.')}
    if(raw.length>10*1024*1024)throw new Error('Ein Dokument ist grösser als 10 MB.');
    const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
    const mime=raw.startsWith('%PDF-')?'application/pdf':raw.startsWith('\x89PNG\r\n\x1a\n')?'image/png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':raw.startsWith('RIFF')&&raw.slice(8,12)==='WEBP'?'image/webp':'';
    if(!mime)throw new Error('Ein Dokument ist kein unterstütztes PDF, JPG, PNG oder WebP.');
    return {id:f.id,blob:new Blob([bytes],{type:mime}),mime};
  }
  const status=a=>text(a.status).trim().toLowerCase();
  const offer=a=>/zusage|angenommen|lehrvertrag|arbeitsvertrag|praktikumsvertrag/.test(status(a));
  const rejection=a=>/absage|abgelehnt/.test(status(a));
  const closed=a=>!text(a.next).trim()&&(offer(a)||rejection(a)||/abgeschlossen|zurückgezogen|beendet|nicht weiter/.test(status(a)));
  function scope(a,s){return s==='active'?!closed(a):s==='closed'?closed(a):s==='offers'?offer(a):s==='rejections'?rejection(a):true}
  const allApps=p=>array(p.apps);
  function appRows(people,{mode='all',scope:sc='all',query=''}={}){
    const q=query.trim().toLocaleLowerCase('de');
    return people.flatMap(p=>allApps(p).filter(a=>(mode==='all'||(a.searchMode||'lehrstelle')===mode)&&scope(a,sc)).map(a=>({p,a}))).filter(({p,a})=>!q||[p.name,a.company,a.job,a.contact,a.status].some(x=>text(x).toLocaleLowerCase('de').includes(q)));
  }
  function tasks(p,apps=allApps(p),general=true){
    const out=[];
    for(const a of apps){
      if(text(a.next).trim())out.push({id:'a:'+text(a.id),applicationId:text(a.id),participantId:p.id,participant:p.name,kind:'dossier',title:text(a.next),company:text(a.company),job:text(a.job),date:date(a.nextDate),time:text(a.nextTime),done:false,note:''});
      for(const [i,j] of array(a.journal).entries())if(yes(j.completedNext))out.push({id:'j:'+text(a.id)+':'+(text(j.id)||i),applicationId:text(a.id),participantId:p.id,participant:p.name,kind:'dossier',title:text(j.completedTaskTitle)||text(j.subject)||'Aufgabe erledigt',company:text(a.company),job:text(a.job),date:date(j.completedTaskDueDate),time:'',done:true,completedDate:date(j.date),completedTime:text(j.time),note:[text(j.note),text(j.result)].filter(Boolean).join('\n')});
    }
    if(general)for(const [i,t] of array(p.generalTasks).entries())if(!yes(t.private))out.push({id:'g:'+(text(t.id)||i),participantId:p.id,participant:p.name,kind:'general',title:text(t.title)||'Allgemeine Aufgabe',date:date(t.dueDate),time:text(t.dueTime),done:yes(t.done),completedDate:date(t.completedAt)||date(t.completedDate),completedTime:text(t.completedAt).slice(11,16),note:text(t.note),company:'',job:'',private:false});
    return out;
  }
  const taskSort=(a,b)=>(a.date||'9999-12-31').localeCompare(b.date||'9999-12-31')||(a.time||'99:99').localeCompare(b.time||'99:99')||text(a.participant).localeCompare(text(b.participant),'de')||a.title.localeCompare(b.title,'de');
  function dueState(t,reference=today(),time=new Date().toTimeString().slice(0,5)){return t.done?'done':!t.date?'undated':t.date<reference||t.date===reference&&t.time&&t.time<time?'overdue':t.date===reference?'today':'later'}
  function taskMatches(t,filter,reference=today()){
    if(filter==='done')return t.done;
    if(t.done)return false;
    if(filter==='focus')return !!t.date&&t.date<=reference;
    if(filter==='today')return t.date===reference;
    if(filter==='overdue')return dueState(t,reference)==='overdue';
    if(filter==='week')return within(t.date,period({period:'workweek'},reference));
    if(filter==='undated')return !t.date;
    return true;
  }
  const ANSWER_LABELS={overall:'Gesamteindruck',good:'Was lief gut?',improve:'Was möchte ich verbessern?',questions:'Offene Fragen',learned:'Was habe ich erfahren?',replyBy:'Rückmeldung bis',agreed:'Vereinbarter nächster Schritt',fit:'Passt der Beruf?',liked:'Was hat mir gefallen?',difficult:'Was war schwierig?',strong:'Meine Stärken',feedback:'Rückmeldung des Betriebs',applyIntent:'Möchte ich mich bewerben?'};
  const ANSWERS={sehr_gut:'Sehr gut',gut:'Gut',gemischt:'Gemischt',schwierig:'Eher schwierig',nicht_gut:'Nicht so gut',ja:'Ja',eher_ja:'Eher ja',unsicher:'Noch unsicher',eher_nein:'Eher nein',nein:'Nein',sehr_positiv:'Sehr positiv',positiv:'Positiv',kritisch:'Kritisch',vielleicht:'Vielleicht / noch klären',warten:'Rückmeldung abwarten',zweites_gespraech:'Zweites Gespräch',schnupperlehre:'Schnupperlehre',unterlagen:'Unterlagen nachreichen'};
  function reflection(r){return {id:r.id,title:r.kind==='interview'?'Reflexion Vorstellungsgespräch':'Reflexion Schnupperlehre',date:date(r.date),journalEntryId:r.journalEntryId,answers:Object.entries(record(r.answers)?r.answers:{}).filter(([,v])=>text(v)).map(([key,value])=>({label:ANSWER_LABELS[key]||key,value:ANSWERS[text(value)]||text(value)}))}}
  function metrics(apps){return [
    {key:'applications',label:'Bewerbungen',value:apps.length},
    {key:'active',label:'Aktiv',value:apps.filter(a=>!closed(a)).length},
    {key:'contacts',label:'Kontakte',value:apps.reduce((n,a)=>n+array(a.journal).filter(j=>!['Notiz / intern','Notiz',''].includes(text(j.type))).length,0)},
    {key:'interviews',label:'Gespräche',value:apps.reduce((n,a)=>n+array(a.journal).filter(j=>j.eventKey==='interview'||!j.eventKey&&j.type==='Vorstellungsgespräch').length,0)},
    {key:'offers',label:'Zusagen',value:apps.filter(offer).length},
    {key:'rejections',label:'Absagen',value:apps.filter(rejection).length}
  ]}
  function validateFilter(f){
    if(!record(f)||!text(f.name).trim()||text(f.name).length>60)throw new Error('Bitte einen Filternamen mit höchstens 60 Zeichen eingeben.');
    if(!['due','done','history'].includes(f.content)||!PERIODS.some(p=>p[0]===f.period)||!['all','open','done'].includes(f.state)||!['all','active','closed','offers','rejections','selected'].includes(f.scope))throw new Error('Bitte gültige Filtereinstellungen wählen.');
    if(f.scope==='selected'&&(!Array.isArray(f.appKeys)||!f.appKeys.length||f.appKeys.some(k=>typeof k!=='string')))throw new Error('Bitte mindestens eine Bewerbung für diesen Filter auswählen.');
    if(f.period==='range'&&(!date(f.from)||!date(f.to)||f.from>f.to))throw new Error('Bitte einen gültigen Zeitraum von–bis wählen.');
    return true;
  }
  function report(p,def,{documents:docs=false,generalTasks=true,mode='all'}={},reference=today()){
    validateFilter(def);const all=allApps(p).filter(a=>mode==='all'||(a.searchMode||'lehrstelle')===mode),apps=all.filter(a=>def.scope==='selected'?def.appKeys.includes(p.id+'|'+text(a.id)):scope(a,def.scope)),range=period(def,reference);
    const allTasks=tasks(p,apps,generalTasks);let rows=[],histories=[],generalRows=[];
    if(def.content==='due')rows=allTasks.filter(t=>within(t.date,range)&&(def.state==='all'||(def.state==='done'?t.done:!t.done)));
    if(def.content==='done')rows=allTasks.filter(t=>t.done&&within(t.completedDate,range)).map(t=>({...t,dueDate:t.date,date:t.completedDate,time:t.completedTime||''}));
    if(def.content==='history'){
      histories=apps.map(a=>({id:text(a.id),company:text(a.company),job:text(a.job),status:text(a.status),contact:text(a.contact),contactInfo:text(a.contactInfo),next:text(a.next),nextDate:date(a.nextDate),sourceUrl:text(a.sourceUrl),sourceText:text(a.sourceText),entries:array(a.journal).filter(j=>within(j.date,range)).slice().sort((a,b)=>text(a.date).localeCompare(text(b.date))||text(a.time).localeCompare(text(b.time))),reflections:array(a.reflections).filter(r=>within(r.date,range)).map(reflection)}));
      generalRows=allTasks.filter(t=>t.kind==='general'&&within(t.done?t.completedDate:t.date,range)).sort(taskSort);
    }else generalRows=rows.filter(t=>t.kind==='general');
    rows.sort(taskSort);const appIds=new Set(rows.map(t=>t.applicationId));
    const groups=docs?apps.filter(a=>def.content==='history'||appIds.has(text(a.id))).map(a=>({id:text(a.id),company:text(a.company),job:text(a.job),documents:documents(a)})).filter(a=>a.documents.length):[];
    return {reportSchema:214,key:def.content==='history'?'history':def.content==='done'?'done':'week',title:def.name,participant:p.name,participantId:p.id,backupDate:p.createdAt,sourceName:p.sourceName,generated:reference,language:'de',searchLabel:mode==='all'?'Lehrstellen · Stellen · Praktika':({lehrstelle:'Lehrstellensuche',stelle:'Stellensuche',praktikum:'Praktikumssuche'})[mode],periodLabel:range.from?range.from+' – '+range.to:'Gesamter Zeitraum',periodDescription:PERIODS.find(x=>x[0]===def.period)[1],filterDescription:({all:'Alle Bewerbungen',active:'Aktive Bewerbungen',closed:'Abgeschlossene Bewerbungen',offers:'Bewerbungen mit Zusage',rejections:'Bewerbungen mit Absage',selected:'Einzeln ausgewählte Bewerbungen'})[def.scope]+(def.content==='due'&&def.state!=='all'?' · '+(def.state==='open'?'Nur offene Aufgaben':'Nur erledigte Aufgaben'):''),scopeLabel:'Kennzahlen: gesamte Suche dieser Person im gewählten Suchmodus',metrics:metrics(all),options:{documents:docs,generalTasks},taskRows:rows,generalTaskRows:generalRows,histories,documentGroups:groups,count:def.content==='history'?histories.length:rows.length,itemLabel:def.content==='history'?'Bewerbungen':'Aufgaben',privacyNote:'Private allgemeine Aufgaben sind ausgeschlossen. Datenstand gemäss importiertem Backup.',optionSummary:'Dokumente als Bilder: '+(docs?'Ja':'Nein')+' · Allgemeine Aufgaben: '+(generalTasks?'Ja':'Nein'),unknownDue:allTasks.filter(t=>t.done&&!t.date&&within(t.completedDate,range)).length};
  }
  root.CoachModel=Object.freeze({STANDARD,PERIODS,TYPES,TITLES,text,array,record,yes,iso,today,date,add,period,within,documents,parseBackup,decodeFile,closed,offer,rejection,scope,appRows,tasks,taskSort,dueState,taskMatches,reflection,metrics,validateFilter,report});
})(typeof window!=='undefined'?window:globalThis);


/* Separate database for the coach app. A participant snapshot and its files commit together. */
(function(root){
  'use strict';let database;
  function open(){if(!root.indexedDB)return Promise.reject(new Error('Lokaler Speicher ist nicht verfügbar. Bitte die Datei in einem aktuellen Browser öffnen.'));if(!database)database=new Promise((resolve,reject)=>{const r=indexedDB.open('bewerbungs-tracker-coach-v1',1);r.onupgradeneeded=()=>{const db=r.result;db.createObjectStore('people',{keyPath:'id'});const f=db.createObjectStore('files',{keyPath:['participantId','id']});f.createIndex('participantId','participantId');db.createObjectStore('settings',{keyPath:'id'})};r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();database=null};resolve(r.result)};r.onerror=()=>{database=null;reject(r.error)};r.onblocked=()=>{database=null;reject(new Error('Bitte andere Fenster der Coach-App schliessen und erneut öffnen.'))}});return database}
  async function read(store,key){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly'),r=key===undefined?tx.objectStore(store).getAll():tx.objectStore(store).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
  function removeFiles(store,participantId){const r=store.index('participantId').openKeyCursor(IDBKeyRange.only(participantId));r.onsuccess=()=>{const c=r.result;if(c){store.delete(c.primaryKey);c.continue()}}}
  async function commit(person,files){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(['people','files'],'readwrite'),ps=tx.objectStore('people'),fs=tx.objectStore('files');
    // Cursor deletions must finish before any replacement is written: otherwise a
    // cursor could also visit and delete the newly added files of the same person.
    const req=fs.index('participantId').openKeyCursor(IDBKeyRange.only(person.id));
    req.onsuccess=()=>{const c=req.result;if(c){fs.delete(c.primaryKey);c.continue()}else{ps.put(person);for(const f of files)fs.put({participantId:person.id,id:f.id,blob:f.blob,mime:f.mime})}};
    tx.oncomplete=()=>resolve(person.id);tx.onerror=()=>reject(tx.error||new Error('Import konnte nicht gespeichert werden.'));tx.onabort=()=>reject(tx.error||new Error('Import abgebrochen. Die bisherigen Daten bleiben erhalten.'));
  })}
  async function forget(id){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(['people','files'],'readwrite');tx.objectStore('people').delete(id);removeFiles(tx.objectStore('files'),id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}
  async function setting(id,value){if(arguments.length===1)return (await read('settings',id))?.value;const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('settings','readwrite');tx.objectStore('settings').put({id,value});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}
  root.CoachStore=Object.freeze({open,people:()=>read('people'),file:(person,id)=>read('files',[person,id]),commit,forget,setting});
})(window);


'use strict';
const C=CoachModel,DB=CoachStore;
const S={people:[],view:'people',person:'all',mode:'all',query:'',taskFilter:'focus',appFilter:'active',detail:null,panel:'history',filters:[],reportFilter:'week',reportPeople:null,documents:false,general:true,epoch:0,modalToken:0,reportBusy:false,importBusy:false,revision:0};
const E=x=>C.text(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=id=>document.getElementById(id);
const icons={people:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6m1 4a4 4 0 0 1 3 4v2"/>',tasks:'<path d="m3 6 2 2 4-4M13 6h8M3 14l2 2 4-4m4 2h8M3 22h18"/>',apps:'<rect x="3" y="7" width="18" height="14" rx="3"/><path d="M8 7V3h8v4M3 13h18m-11 0v3h4v-3"/>',reports:'<path d="M7 3h8l4 4v14H5V3zM14 3v5h5M9 12h6M9 16h6"/>',upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',lock:'<rect x="6" y="10" width="12" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',x:'<path d="m6 6 12 12M18 6 6 18"/>',back:'<path d="m14 5-7 7 7 7"/>',doc:'<path d="M7 3h8l4 4v14H5V3zM14 3v5h5M9 12h6M9 16h6"/>'};
function icon(k){return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[k]||icons.doc}</svg>`}
function btn(action,label,kind='secondary',data={}){return `<button type="button" class="${kind}" data-action="${action}" ${Object.entries(data).map(([k,v])=>`data-${k}="${E(v)}"`).join(' ')}>${label}</button>`}
function fmt(d){const s=C.date(d);if(!s)return 'Unbekannt';return s.slice(8,10)+'.'+s.slice(5,7)+'.'+s.slice(0,4)}
function stamp(d){if(!d||!Number.isFinite(Date.parse(d)))return 'Datum unbekannt';return new Date(d).toLocaleString('de-CH',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}
function labelDay(d){return d===C.today()?'Heute':d===C.add(C.today(),1)?'Morgen':d?fmt(d):'Ohne Termin'}
function ageDays(p){return p.createdAt?Math.floor((Date.now()-Date.parse(p.createdAt))/86400000):null}
function initials(name){return name.trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase()}
function selectedPeople(){return S.people.filter(p=>S.person==='all'||p.id===S.person)}
function person(id){return S.people.find(p=>p.id===id)}
function deepFreeze(o){if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.freeze(o);Object.values(o).forEach(deepFreeze)}return o}
async function reloadPeople(){S.people=(await DB.people()).sort((a,b)=>a.name.localeCompare(b.name,'de')).map(deepFreeze);S.revision++;if(S.person!=='all'&&!person(S.person))S.person='all'}
function notify(message){const t=$('toast');t.textContent=message;t.hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>t.hidden=true,5000)}
function options(rows,value){return rows.map(([k,l])=>`<option value="${E(k)}" ${k===value?'selected':''}>${E(l)}</option>`).join('')}
function metricsHtml(rows){return `<div class="metrics" aria-label="Kennzahlen">${rows.map(m=>`<div class="metric"><strong>${m.value}</strong><span>${E(m.label)}</span></div>`).join('')}</div>`}
function readonly(){return `<span class="readonly">${icon('lock')} Nur ansehen</span>`}
function scopeBar(){return S.people.length?`<div class="scopebar"><div class="field"><label for="personScope">Teilnehmende Person</label><select id="personScope">${options([['all','Alle Teilnehmenden'],...S.people.map(p=>[p.id,p.name])],S.person)}</select></div><div class="field"><label for="modeScope">Suchmodus</label><select id="modeScope">${options([['all','Alle Sucharten'],['lehrstelle','Lehrstellen'],['stelle','Stellen'],['praktikum','Praktika']],S.mode)}</select></div></div>`:''}
function heading(title,subtitle,actions=''){return `<div class="headrow"><div><h1 tabindex="-1" id="pageTitle">${E(title)}</h1><p>${E(subtitle)}</p></div>${actions||readonly()}</div>`}
function empty(title,body,action=''){return `<div class="empty">${icon('people')}<h2>${E(title)}</h2><p>${E(body)}</p>${action}</div>`}
function navigate(view){S.detail=null;S.panel='history';S.query='';S.view=view;S.epoch++;render();window.scrollTo({top:0,behavior:'instant'});$('pageTitle')?.focus({preventScroll:true})}
function changePerson(id){S.person=id;S.detail=null;S.reportPeople=null;S.epoch++;render()}
function render(){
  S.epoch++;
  const content=S.detail?detailHtml():S.view==='people'?peopleHtml():S.view==='tasks'?tasksHtml():S.view==='apps'?appsHtml():reportsHtml();
  $('app').innerHTML=scopeBar()+content;
  document.querySelectorAll('[data-nav]').forEach(b=>{const on=b.dataset.nav===S.view;b.classList.toggle('active',on);b.setAttribute('aria-current',on?'page':'false')});
  if($('personScope'))$('personScope').onchange=e=>changePerson(e.target.value);
  if($('modeScope'))$('modeScope').onchange=e=>{S.mode=e.target.value;S.detail=null;render()};
  if($('search'))$('search').oninput=e=>{S.query=e.target.value;renderListOnly()};
  if($('taskFilter'))$('taskFilter').onchange=e=>{S.taskFilter=e.target.value;renderListOnly()};
  if($('appFilter'))$('appFilter').onchange=e=>{S.appFilter=e.target.value;renderListOnly()};
  if(S.view==='reports'&&!S.detail)bindReports();
}
function renderListOnly(){const host=$('listArea');if(!host)return;host.innerHTML=S.view==='people'?peopleCards():S.view==='tasks'?taskCards():appCards()}
function peopleHtml(){return heading('Teilnehmende','Bewerbungsstände aus den importierten Backups.')+(S.people.length?`<div class="filterbar"><input id="search" class="search" type="search" placeholder="Name suchen …" aria-label="Teilnehmende suchen" value="${E(S.query)}"></div><p class="caption">${S.people.length} Personen · Jede Person hat ihren eigenen Datenstand.</p><div id="listArea">${peopleCards()}</div><p class="footnote">Die Ansicht aktualisiert sich durch ein neues Backup. Es besteht keine Live-Verbindung zur App der Teilnehmenden.</p>`:empty('Alle Bewerbungswege im Blick','Lade ein oder mehrere Backups aus dem Bewerbungs Tracker. Danach kannst du Aufgaben, Verläufe, Reflexionen und Dokumente ansehen.',btn('import',icon('upload')+' Backups laden','primary')))+`<details class="footnote"><summary>Über diese Coach-App</summary><p>Version 1.0.1 · Die Daten bleiben auf diesem Gerät. Bewerbungen und Aufgaben können hier nicht verändert werden. Private allgemeine Aufgaben werden beim Import ausgeschlossen.</p><p><button class="textbutton" data-action="licenses">Open-Source-Lizenzen</button></p></details>`}
function peopleCards(){const rows=selectedPeople().filter(p=>p.name.toLocaleLowerCase('de').includes(S.query.toLocaleLowerCase('de')));return rows.length?`<div class="cards people-grid">${rows.map(p=>{const apps=p.apps.filter(a=>S.mode==='all'||(a.searchMode||'lehrstelle')===S.mode),tasks=C.tasks(p,apps),today=tasks.filter(t=>!t.done&&t.date===C.today()).length,late=tasks.filter(t=>C.dueState(t)==='overdue').length,age=ageDays(p);return `<article class="card"><div class="person-top"><span class="avatar">${E(initials(p.name))}</span><div><h2>${E(p.name)}</h2><small>${apps.length} Bewerbungen · ${apps.filter(a=>!C.closed(a)).length} aktiv</small></div></div><div class="pills"><span class="pill blue">${today} heute fällig</span>${late?`<span class="pill red">${late} überfällig</span>`:'<span class="pill neutral">Nichts überfällig</span>'}</div><div class="person-meta"><span>Backup: ${E(stamp(p.createdAt))}</span>${age===null?'<span class="warning-link">Datum im Backup fehlt</span>':age>=14?`<span class="warning-link">Stand vor ${age} Tagen</span>`:''}</div><div class="person-bottom">${btn('person','Ansehen','primary',{pid:p.id})}${btn('importinfo','Import ansehen','textbutton',{pid:p.id})}</div></article>`}).join('')}</div>`:empty('Keine Person gefunden','Passe die Namenssuche oder die Auswahl oben an.')}
function tasksHtml(){return heading('Aufgaben','Heute, überfällig und bereits erledigt – gemäss Backup.')+(!S.people.length?empty('Noch keine Backups geladen','Importiere zuerst das Backup einer teilnehmenden Person.',btn('import','Backups laden','primary')):`<div class="filterbar"><input id="search" class="search" type="search" placeholder="Aufgabe, Betrieb oder Person suchen …" aria-label="Aufgaben suchen" value="${E(S.query)}"><select class="control" id="taskFilter" aria-label="Aufgaben nach Termin filtern">${options([['focus','Heute & überfällig'],['today','Heute fällig'],['overdue','Überfällig'],['week','Diese Woche · Mo–Fr'],['all','Alle offenen Aufgaben'],['done','Erledigte Aufgaben'],['undated','Ohne Termin']],S.taskFilter)}</select></div><div id="listArea">${taskCards()}</div>`)}
function taskCards(){const q=S.query.toLocaleLowerCase('de');const rows=selectedPeople().flatMap(p=>C.tasks(p,p.apps.filter(a=>S.mode==='all'||(a.searchMode||'lehrstelle')===S.mode))).filter(t=>C.taskMatches(t,S.taskFilter)&&(!q||[t.title,t.company,t.participant].some(x=>x.toLocaleLowerCase('de').includes(q)))).sort(C.taskSort);return `<p class="caption">${rows.length} Aufgaben · Nach ${S.taskFilter==='done'?'ursprünglicher Fälligkeit':'Fälligkeit'} sortiert</p>`+(rows.length?`<div class="cards">${rows.map(taskCard).join('')}</div>`:empty('Keine passenden Aufgaben','Wähle einen anderen Aufgabenfilter oder eine andere Person.'))}
function taskCard(t){const state=C.dueState(t),meta=t.done?'Erledigt am '+fmt(t.completedDate):(state==='overdue'?'Überfällig · ':'')+labelDay(t.date)+(t.time?' · '+t.time:'');return `<article class="card task ${state}"><div class="task-copy"><div class="task-context">${E(t.participant)} · ${E(t.company||'Allgemeine Aufgabe')}</div><div class="task-title">${E(t.title)}</div><span class="due">${E(meta)}</span>${t.note?`<p class="small pre" style="margin-top:7px">${E(t.note)}</p>`:''}</div>${t.kind==='dossier'?btn('app','Ansehen','secondary',{pid:t.participantId,aid:t.applicationId}):'<span class="pill neutral">Allgemein</span>'}</article>`}
function appsHtml(){return heading('Bewerbungen','Betriebe, nächste Schritte und vollständige Verläufe.')+(!S.people.length?empty('Noch keine Backups geladen','Importiere zuerst das Backup einer teilnehmenden Person.',btn('import','Backups laden','primary')):`<div class="filterbar"><input id="search" class="search" type="search" placeholder="Betrieb, Beruf, Kontakt oder Person …" aria-label="Bewerbungen suchen" value="${E(S.query)}"><select class="control" id="appFilter" aria-label="Bewerbungen nach Status filtern">${options([['active','Aktive Bewerbungen'],['closed','Abgeschlossene Bewerbungen'],['all','Alle Bewerbungen'],['offers','Mit Zusage'],['rejections','Mit Absage']],S.appFilter)}</select></div><div id="listArea">${appCards()}</div>`)}
function appCards(){const rows=C.appRows(selectedPeople(),{mode:S.mode,scope:S.appFilter,query:S.query});return `<p class="caption">${rows.length} Bewerbungen</p>`+(rows.length?`<div class="cards">${rows.map(({p,a})=>`<article class="card"><div class="headrow"><div><div class="eyebrow">${E(p.name)}</div><h2>${E(a.company||'Betrieb')}</h2><p>${E(a.job||'Beruf nicht angegeben')}</p></div>${btn('app','Ansehen','secondary',{pid:p.id,aid:a.id})}</div><div class="pills"><span class="pill ${C.rejection(a)?'red':C.offer(a)?'blue':''}">${E(a.status||'Status nicht angegeben')}</span><span class="pill neutral">${C.array(a.journal).length} Einträge</span><span class="pill neutral">${C.documents(a).length} Dokumente</span></div>${a.next?`<p class="small" style="margin-top:12px"><strong>${E(a.next)}</strong> · ${E(labelDay(C.date(a.nextDate)))}</p>`:'<p class="small" style="margin-top:12px">Keine offene Aufgabe im Backup.</p>'}</article>`).join('')}</div>`:empty('Keine Bewerbungen für diese Auswahl','Wähle einen anderen Statusfilter oder ändere die Suche.'))}
function openApp(pid,aid){const p=person(pid),a=p?.apps.find(a=>C.text(a.id)===C.text(aid));if(!a)return;S.detail={pid,aid:C.text(aid)};S.panel='history';render();window.scrollTo({top:0,behavior:'instant'})}
function eventHtml(j){return `<article class="event"><div class="event-date">${E(fmt(j.date))}${j.time?' · '+E(j.time):''}</div><h3>${E(j.subject||j.type||'Eintrag')}</h3><small>${E([j.type,j.direction,j.person].filter(Boolean).join(' · '))}</small>${j.note?`<p class="pre">${E(j.note)}</p>`:''}${j.result?`<p class="pre">${E(j.result)}</p>`:''}${j.next?`<p class="next pre">Nächster Schritt: ${E(j.next)}${j.nextDate?' · '+E(fmt(j.nextDate)):''}</p>`:''}</article>`}
function reflectionHtml(r){const x=C.reflection(r);return `<article class="card"><div class="eyebrow">${E(fmt(x.date))}</div><h3>${E(x.title)}</h3>${x.answers.map(a=>`<div class="ref-item"><strong>${E(a.label)}</strong><p class="pre">${E(a.value)}</p></div>`).join('')}</article>`}
function detailHtml(){const p=person(S.detail.pid),a=p?.apps.find(a=>C.text(a.id)===S.detail.aid);if(!a){S.detail=null;return appsHtml()}
  const docs=C.documents(a),entries=C.array(a.journal).slice().sort((a,b)=>C.text(b.date).localeCompare(C.text(a.date))||C.text(b.time).localeCompare(C.text(a.time)));
  return btn('backdetail',icon('back')+' Zurück','textbutton screen-back')+heading(a.company||'Betrieb',p.name+' · Backup: '+stamp(p.createdAt))+`<div class="card detail-top"><h3>${E(a.job||'Beruf nicht angegeben')}</h3><p class="small" style="margin-top:5px">${E(a.status||'Status nicht angegeben')}</p><p style="margin-top:13px"><strong>${E(a.next||'Keine offene Aufgabe')}</strong></p>${a.next?`<p class="small">Fällig: ${E(labelDay(C.date(a.nextDate)))}</p>`:''}${a.contact||a.contactInfo?`<p class="small pre" style="margin-top:13px">${E([a.contact,a.contactInfo].filter(Boolean).join(' · '))}</p>`:''}</div><div class="tabs" role="group" aria-label="Bewerbungsansicht">${[['history','Verlauf',entries.length],['docs','Dokumente',docs.length],['reflection','Reflexionen',C.array(a.reflections).length]].map(([k,l,n])=>btn('panel',E(l)+' · '+n,S.panel===k?'active':'',{panel:k})).join('')}</div>`+(S.panel==='history'?(a.sourceText?`<details><summary>Text des Inserats</summary><p class="pre small">${E(a.sourceText)}</p></details>`:'')+(safeUrl(a.sourceUrl)?`<p class="small" style="margin-bottom:18px"><a href="${E(safeUrl(a.sourceUrl))}" target="_blank" rel="noopener noreferrer">Inserat öffnen ↗</a></p>`:'')+(entries.length?`<p class="caption">Neueste Einträge zuerst</p><div class="timeline">${entries.map(eventHtml).join('')}</div>`:empty('Noch keine Einträge','Dieses Backup enthält zu dieser Bewerbung noch keinen Verlauf.')):S.panel==='reflection'?(C.array(a.reflections).length?`<div class="cards">${C.array(a.reflections).slice().sort((a,b)=>C.text(b.date).localeCompare(C.text(a.date))).map(reflectionHtml).join('')}</div>`:empty('Noch keine Reflexionen','Im Backup sind keine Reflexionen zu dieser Bewerbung enthalten.')):docs.length?`<div class="cards">${docs.map(f=>`<article class="card docrow">${icon('doc')}<div class="docname"><strong>${E(f.name)}</strong><small>${E(f.kindLabel)}${f.createdAt?' · '+E(fmt(f.createdAt)):''}</small>${C.array(p.missing).includes(f.id)?'<p class="warning-link">Datei fehlt im Backup</p>':''}</div>${btn('document','Ansehen','secondary',{pid:p.id,aid:a.id,kind:f.kind,index:f.index})}</article>`).join('')}</div>`:empty('Keine Dokumente','In diesem Backup sind zu dieser Bewerbung keine Dokumente verknüpft.'));
}
function safeUrl(v){try{const u=new URL(C.text(v));return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}}
let lastFocus=null,modalCleanup=null;
function modal(title,html,onClose=null){closeModal(true);lastFocus=document.activeElement;S.modalToken++;$('modalHost').innerHTML=`<div class="modal-cover"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><h2 id="modalTitle" tabindex="-1">${E(title)}</h2>${html}</section><button class="float-close" type="button" data-action="closemodal" aria-label="Schliessen und zurück">${icon('x')}</button></div>`;modalCleanup=onClose;$('mainShell').inert=true;$('bottomNav').inert=true;$('topbar').inert=true;document.body.style.overflow='hidden';$('modalTitle').focus();return S.modalToken}
function closeModal(force=false){if(S.importBusy&&!force)return;const cleanup=modalCleanup;modalCleanup=null;S.modalToken++;$('modalHost').innerHTML='';$('mainShell').inert=false;$('bottomNav').inert=false;$('topbar').inert=false;document.body.style.overflow='';cleanup?.();lastFocus?.isConnected&&lastFocus.focus();lastFocus=null}
function importInfo(pid){const p=person(pid);if(!p)return;modal('Import von '+p.name,`<div class="import-summary"><p><strong>Backup erstellt:</strong> ${E(stamp(p.createdAt))}</p><p><strong>Hier importiert:</strong> ${E(stamp(p.importedAt))}</p><p><strong>Datei:</strong> ${E(p.sourceName)}</p><p><strong>App-Version:</strong> ${E(p.appVersion||'Nicht angegeben')}</p><p>${p.apps.length} Bewerbungen · ${p.apps.reduce((s,a)=>s+C.array(a.journal).length,0)} Einträge · ${p.fileCount||0} Dokumentdateien</p></div>${p.missing?.length?`<p class="info error">${p.missing.length} verknüpfte Dokumentdateien fehlen in diesem Backup. Für die vollständige Anzeige wird ein Backup mit diesen Dokumenten benötigt.</p>`:''}<p class="small">Ein neues Backup kannst du beim Import dieser Person zuordnen. Es ersetzt den hier angezeigten Stand.</p><div class="actions" style="margin-top:20px">${btn('import','Neues Backup laden','primary')}${btn('forgetask','Import entfernen','textbutton',{pid:p.id})}</div>`)}
function forgetAsk(pid){const p=person(pid);if(!p)return;modal('Import entfernen?',`<p>Die lokale Coach-Kopie von <strong>${E(p.name)}</strong> und ihre Dokumente werden von diesem Gerät entfernt.</p><p class="small" style="margin:12px 0 20px">Die ursprüngliche Backupdatei und die App der teilnehmenden Person bleiben erhalten.</p><div class="actions">${btn('forget','Import entfernen','danger',{pid})}${btn('closemodal','Abbrechen','secondary')}</div>`)}
async function forgetPerson(pid){try{await DB.forget(pid);closeModal();await reloadPeople();S.detail=null;render();notify('Import entfernt.')}catch{notify('Der Import konnte nicht entfernt werden.')}}
document.addEventListener('click',event=>{const b=event.target.closest('[data-action],[data-nav]');if(!b||b.disabled)return;if(b.dataset.nav){navigate(b.dataset.nav);return}const d=b.dataset;switch(d.action){
  case 'import':chooseImports();break;case 'person':S.person=d.pid;S.reportPeople=null;navigate('tasks');break;
  case 'app':openApp(d.pid,d.aid);break;case 'backdetail':S.detail=null;render();break;
  case 'panel':S.panel=d.panel;render();break;case 'closemodal':closeModal();break;
  case 'document':openDocument(d.pid,d.aid,d.kind,Number(d.index));break;
  case 'importinfo':importInfo(d.pid);break;case 'forgetask':forgetAsk(d.pid);break;case 'forget':forgetPerson(d.pid);break;
  case 'filternew':filterEditor();break;case 'filteredit':filterEditor(S.reportFilter);break;case 'filterdelete':deleteFilterAsk();break;case 'filterdeleteconfirm':deleteFilter(d.id);break;
  case 'filterSave':saveFilter();break;case 'report':exportReport(false);break;case 'shareReport':exportReport(true);break;
  case 'importCommit':commitImport();break;case 'importSkip':skipImport();break;
  case 'licenses':modal('Open-Source-Lizenzen',`<p class="small">PDF.js 6.3.289 · Mozilla Foundation · Apache 2.0</p><pre class="pre small" style="margin-top:18px">${E($('licensesText').textContent)}</pre>`);break;
}});
document.addEventListener('keydown',event=>{if(!$('modalHost').firstElementChild)return;if(event.key==='Escape'){event.preventDefault();closeModal()}if(event.key==='Tab'){const nodes=[...$('modalHost').querySelectorAll('button,input,select,a[href],textarea,summary')].filter(x=>!x.disabled&&!x.hidden&&!x.closest('[hidden]'));if(!nodes.length)return;const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}});
window.coachHandleBack=function(){if($('modalHost').firstElementChild){closeModal();return true}if(S.detail){S.detail=null;render();return true}if(S.view!=='people'){navigate('people');return true}if(S.person!=='all'){changePerson('all');return true}return false};
let coachBootReady=false,importFinishing=false;
async function bootCoach(){try{await DB.open();await reloadPeople();const saved=await DB.setting('filters');S.filters=C.array(saved).filter(f=>{try{return !C.STANDARD[f.id]&&/^custom_[a-f0-9-]+$/.test(f.id)&&C.validateFilter(f)}catch{return false}});render();coachBootReady=true;window.Android?.coachReadyForImports?.();resumeImports()}catch(e){$('app').innerHTML=empty('Speicher nicht verfügbar',e.message||'Bitte die App erneut öffnen.');$('importButton').disabled=true}}


/* Imports never restore TN localStorage into this application. */
let importQueue=[],importCandidate=null,importResults=[];
function newId(){return crypto.randomUUID?crypto.randomUUID():[4,2,2,2,6].map(n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),b=>b.toString(16).padStart(2,'0')).join('')).join('-')}
async function sourceHash(raw){if(!crypto.subtle)throw new Error('Dieser Browser unterstützt die sichere Prüfung der Backupdatei nicht. Bitte die HTML-Datei in Chrome, Edge oder Firefox öffnen.');return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))),x=>x.toString(16).padStart(2,'0')).join('')}
function readFileText(file){if(file.text)return file.text();return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(C.text(r.result));r.onerror=()=>reject(new Error('Datei konnte nicht gelesen werden.'));r.readAsText(file)})}
function chooseImports(){if(S.importBusy||importQueue.length){notify('Bitte den laufenden Import zuerst abschliessen.');return}closeModal();if(window.Android?.chooseCoachBackups){Android.chooseCoachBackups();return}$('backupInput').click()}
$('backupInput').addEventListener('change',async event=>{const list=Array.from(event.target.files||[]);event.target.value='';if(list.length)startImports(list.map(file=>({name:file.name,size:file.size,load:()=>readFileText(file)}))) });
window.onCoachBackupFiles=function(rows){const list=C.array(rows);startImports(list.map(f=>({sourceToken:f.token,name:f.name,size:f.size,release:()=>Android.releaseCoachImport(f.token),load:async()=>{const url=new URL(f.url);if(url.origin!==location.origin||!url.pathname.startsWith('/imports/'))throw new Error('Ungültige Importadresse.');const r=await fetch(url.href,{cache:'no-store'});if(!r.ok)throw new Error('Backupdatei konnte nicht geladen werden.');return r.text()}})));return true};
window.onCoachImportError=message=>notify(C.text(message)||'Backupdatei konnte nicht geladen werden.');
function resumeImports(){if(coachBootReady&&!S.reportBusy&&!S.importBusy&&!importCandidate&&!importFinishing&&importQueue.length)return nextImport()}
async function startImports(rows){
  const fresh=rows.filter(row=>!row.sourceToken||!importQueue.some(queued=>queued.sourceToken===row.sourceToken));
  if(!fresh.length)return;
  if(!importQueue.length&&!S.importBusy&&!importFinishing)importResults=[];
  const waiting=importQueue.length>0||S.reportBusy;
  importQueue.push(...fresh);const running=resumeImports();
  if(waiting)notify(fresh.length+' weitere Backupdatei(en) warten auf den Import.');
  await running;
}
async function nextImport(){
  if(!importQueue.length){importCandidate=null;S.importBusy=true;importFinishing=true;try{await reloadPeople()}finally{S.importBusy=false;importFinishing=false}if(importQueue.length){await nextImport();return}S.person='all';S.view='people';S.detail=null;S.query='';S.reportPeople=null;render();modal('Import abgeschlossen',importResults.map(r=>`<div class="import-result ${r.ok?'':'fail'}"><strong>${E(r.name)}</strong><br>${E(r.message)}</div>`).join('')+`<div class="actions" style="margin-top:20px">${btn('closemodal','Zur Übersicht','primary')}</div>`);return}
  const file=importQueue[0];S.importBusy=true;modal('Backup wird gelesen',`<p class="small"><span class="busy"></span>${E(file.name)}</p>`);
  try{
    if(file.size>180*1024*1024)throw new Error('Die Backupdatei ist grösser als 180 MB.');
    const raw=await file.load(),parsed=C.parseBackup(raw,file.name),hash=await sourceHash(raw);
    const duplicate=S.people.find(p=>p.sourceHash===hash);
    if(duplicate){importResults.push({name:file.name,ok:true,message:'Bereits bei '+duplicate.name+' importiert – keine zweite Kopie angelegt.'});file.release?.();importQueue.shift();S.importBusy=false;await nextImport();return}
    importCandidate={...parsed,sourceHash:hash};S.importBusy=false;showImportReview();
  }catch(e){file.release?.();importResults.push({name:file.name,ok:false,message:e.message||'Import fehlgeschlagen.'});importQueue.shift();S.importBusy=false;await nextImport()}
}
function showImportReview(){
  const c=importCandidate,matches=S.people.filter(p=>p.name.toLocaleLowerCase('de')===c.name.toLocaleLowerCase('de'));
  const defaultTarget=matches.length?'':'new';
  modal('Backup zuordnen',`<p class="caption">${E(c.sourceName)} · ${importQueue.length} Datei${importQueue.length===1?'':'en'} verbleibend</p><div class="import-summary"><h3>${E(c.name||'Name im Backup nicht ausgefüllt')}</h3><p>Backup vom ${E(stamp(c.createdAt))}</p><p>${c.apps.length} Bewerbungen · ${c.apps.reduce((n,a)=>n+C.array(a.journal).length,0)} Einträge · ${c.files.length} Dokumentdateien</p></div><div class="field"><label for="importTarget">Wem gehört dieses Backup?</label><select id="importTarget">${options([['','Bitte zuordnen …'],['new','Als neue teilnehmende Person hinzufügen'],...S.people.map(p=>[p.id,p.name+' · bisher '+stamp(p.createdAt)])],defaultTarget)}</select></div><div class="field" id="importNameField"><label for="importName">Name in der Coach-Übersicht</label><input id="importName" maxlength="80" value="${E(c.name)}" placeholder="Vorname Nachname"></div>${matches.length?'<p class="info">Dieser Name ist bereits vorhanden. Wähle bewusst die bestehende Person oder füge eine neue Person hinzu.</p>':''}<div id="importReplaceHint"></div>${c.missing.length?`<p class="info error">${c.missing.length} verknüpfte Dokumentdateien fehlen. Die Verläufe können importiert werden; diese Dokumente werden als fehlend gekennzeichnet.</p>`:''}<p id="importError" class="info error" role="alert" hidden></p><div class="actions">${btn('importCommit','Importieren','primary')}${btn('importSkip','Datei überspringen','secondary')}</div><p class="footnote">Die Originaldatei bleibt unverändert. Private allgemeine Aufgaben werden nicht übernommen.</p>`,()=>{if(importQueue.length&&!S.importBusy){for(const item of importQueue)item.release?.();importQueue=[];importCandidate=null}});
  $('importTarget').onchange=importTargetChanged;importTargetChanged();
}
function importTargetChanged(){const target=$('importTarget').value,p=person(target);$('importNameField').hidden=target!=='new';$('importReplaceHint').innerHTML=p?`<p class="info">Der angezeigte Stand von <strong>${E(p.name)}</strong> wird durch dieses Backup ersetzt. Es werden keine Verläufe verschiedener Personen vermischt.</p><label class="check"><input id="confirmPerson" type="checkbox">Ich habe die Zuordnung zu ${E(p.name)} geprüft.</label>${!importCandidate.createdAt||!p.createdAt||Date.parse(importCandidate.createdAt)<=Date.parse(p.createdAt)?'<p class="info error">Dieses Backup ist älter, gleich alt oder hat kein vergleichbares Datum.</p><label class="check"><input id="confirmOlder" type="checkbox">Diesen Datenstand trotzdem übernehmen.</label>':''}`:''}
async function commitImport(){
  if(S.importBusy||!importCandidate)return;const c=importCandidate,target=$('importTarget')?.value,existing=person(target),name=target==='new'?$('importName').value.trim():existing?.name;
  const fail=message=>{$('importError').textContent=message;$('importError').hidden=false};
  if(!target||target!=='new'&&!existing)return fail('Bitte zuerst die teilnehmende Person zuordnen.');
  if(!name)return fail('Bitte den Namen für die Coach-Übersicht eintragen.');
  if(existing&&!$('confirmPerson')?.checked)return fail('Bitte die Zuordnung zur bestehenden Person bestätigen.');
  if($('confirmOlder')&&!$('confirmOlder').checked)return fail('Bitte bestätigen, dass dieser ältere oder undatierte Stand übernommen werden soll.');
  S.importBusy=true;document.querySelectorAll('#modalHost button').forEach(b=>b.disabled=true);
  try{
    const files=[];for(const f of c.files){files.push(C.decodeFile(f));await new Promise(resolve=>setTimeout(resolve,0))}
    const id=existing?.id||newId();
    const record={id,name,profile:c.profile,apps:c.apps,generalTasks:c.generalTasks,sourceHash:c.sourceHash,sourceName:c.sourceName,createdAt:c.createdAt,importedAt:new Date().toISOString(),appVersion:c.appVersion,missing:c.missing,fileCount:files.length};
    await DB.commit(record,files);importResults.push({name:c.sourceName,ok:true,message:name+' · '+(existing?'Datenstand aktualisiert.':'Neu aufgenommen.')});
    importQueue[0]?.release?.();importQueue.shift();importCandidate=null;modalCleanup=null;await reloadPeople();S.importBusy=false;await nextImport();
  }catch(e){S.importBusy=false;document.querySelectorAll('#modalHost button').forEach(b=>b.disabled=false);fail(e.message||'Import fehlgeschlagen. Der bisherige Datenstand bleibt erhalten.')}
}
async function skipImport(){if(S.importBusy)return;importResults.push({name:importQueue[0]?.name||'Backup',ok:false,message:'Nicht importiert.'});importQueue[0]?.release?.();importQueue.shift();importCandidate=null;modalCleanup=null;await nextImport()}


'use strict';
let reportPdfLibraryPromise=null,reportPdfAssets=null;
function blobData(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('Dokument konnte nicht gelesen werden.'));r.readAsDataURL(blob)})}
const documentCache=new Map();let documentQueue=Promise.resolve();
function documentError(e){return e.name==='PasswordException'?'Dieses PDF ist passwortgeschützt. Für die Vorschau wird ein Backup mit einem entsperrten PDF benötigt.':e.message||'Dokument konnte nicht dargestellt werden.'}
function coachDocumentPages(pid,file,current=()=>true){
  const job=async()=>{if(!current())throw new DOMException('Ansicht geändert','AbortError');const key=pid+'|'+(person(pid)?.sourceHash||'')+'|'+file.id;
    if(documentCache.has(key))return documentCache.get(key);
    const stored=await DB.file(pid,file.id);if(!stored?.blob)throw new Error('Die Datei fehlt in diesem Backup. Bitte ein vollständiges Backup dieser Person laden.');
    const pages=stored.blob.type==='application/pdf'?await reportPdfFilePages(stored.blob,current):await reportImageFilePages(stored.blob);
    if(!current())throw new DOMException('Ansicht geändert','AbortError');if(!pages.length)throw new Error('Das Dokument enthält keine Seiten.');
    const size=pages.reduce((n,p)=>n+p.src.length,0);if(size<=24*1024*1024){documentCache.set(key,pages);let total=()=>[...documentCache.values()].reduce((n,ps)=>n+ps.reduce((m,p)=>m+p.src.length,0),0);while(documentCache.size>4||total()>24*1024*1024)documentCache.delete(documentCache.keys().next().value)}return pages;
  };const result=documentQueue.then(job,job);documentQueue=result.catch(()=>{});return result;
}
async function openDocument(pid,aid,kind,index){const p=person(pid),a=p?.apps.find(a=>C.text(a.id)===aid),file=C.array(a?.[kind])[index];if(!file)return;
  const token=modal(file.name||'Dokument',`<p class="caption">${E(p.name)} · ${E(a.company)}</p><div id="documentPreview"><p class="small"><span class="busy"></span>Alle Seiten werden geladen …</p></div>`);
  const current=()=>S.modalToken===token&&!!$('documentPreview');try{const pages=await coachDocumentPages(pid,file,current);if(current())$('documentPreview').innerHTML=`<div class="doc-pages">${pagesHtml({participant:p.name,company:a.company,file},pages)}</div>`}catch(e){if(current())$('documentPreview').innerHTML=`<p class="info error">${E(documentError(e))}</p>`}
}
function reportDecodeBase64(value){const raw=atob(value);return Uint8Array.from(raw,c=>c.charCodeAt(0))}
function reportEmbeddedScript(id){const node=document.getElementById(id);if(!node)throw new Error('Die PDF-Darstellung konnte nicht geladen werden.');return new TextDecoder().decode(reportDecodeBase64(node.textContent.trim()))}
function reportLoadPdfLibrary(){if(window.KickPdfJs?.getDocument)return Promise.resolve(window.KickPdfJs);if(!reportPdfLibraryPromise)reportPdfLibraryPromise=Promise.resolve().then(()=>{for(const id of ['kickPdfWorkerBundle','kickPdfApiBundle']){const script=document.createElement('script');script.textContent=reportEmbeddedScript(id);document.head.appendChild(script);script.remove()}if(!window.KickPdfJs?.getDocument)throw new Error('Die PDF-Darstellung konnte nicht geladen werden.');return window.KickPdfJs}).catch(e=>{reportPdfLibraryPromise=null;throw e});return reportPdfLibraryPromise}
class ReportBinaryDataFactory{async fetch({kind,filename}){if(!reportPdfAssets)reportPdfAssets=JSON.parse(document.getElementById('kickPdfAssets').textContent);const folder={cMapUrl:'cmaps',standardFontDataUrl:'standard_fonts',wasmUrl:'wasm'}[kind],data=reportPdfAssets[folder+'/'+filename];if(!data)throw new Error('Eine Schrift oder ein Bilddecoder fehlt: '+filename);return reportDecodeBase64(data)}}
function reportPause(){return new Promise(resolve=>setTimeout(resolve,0))}
async function reportBlobBytes(blob){if(blob.arrayBuffer)return new Uint8Array(await blob.arrayBuffer());return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(new Uint8Array(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsArrayBuffer(blob)})}
function reportCreateCanvas(width,height){const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(width));canvas.height=Math.max(1,Math.ceil(height));return canvas}
function reportLoadImage(src){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Das Bild ist beschädigt oder nicht lesbar.'));image.src=src})}
async function reportImageFilePages(blob){const src=await blobData(blob),img=await reportLoadImage(src);const width=img.naturalWidth||img.width,height=img.naturalHeight||img.height;if(!width||!height)throw new Error('Das Bild ist leer.');const scale=Math.min(1,1680/width,2376/height,Math.sqrt(4000000/(width*height))),canvas=reportCreateCanvas(width*scale,height*scale),ctx=canvas.getContext('2d');if(!ctx)throw new Error('Die Bilddarstellung wird von diesem Browser nicht unterstützt.');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);const page={src:canvas.toDataURL('image/jpeg',0.94),width:canvas.width,height:canvas.height,page:1,total:1};canvas.width=canvas.height=1;return [page]}
async function reportPdfFilePages(blob,isCurrent=()=>true){const lib=await reportLoadPdfLibrary();const loading=lib.getDocument({data:await reportBlobBytes(blob),BinaryDataFactory:ReportBinaryDataFactory,cMapUrl:'embedded/cmaps/',cMapPacked:true,standardFontDataUrl:'embedded/standard_fonts/',wasmUrl:'embedded/wasm/',useWorkerFetch:false,useSystemFonts:false,disableFontFace:true,isOffscreenCanvasSupported:false,isImageDecoderSupported:false,enableXfa:false,stopAtErrors:true,verbosity:0});let pdf;try{pdf=await loading.promise;const pages=[];for(let i=1;i<=pdf.numPages;i++){if(!isCurrent())throw new DOMException('Bericht gewechselt','AbortError');const page=await pdf.getPage(i),original=page.getViewport({scale:1}),scale=Math.min(2.2,1680/original.width,2376/original.height,Math.sqrt(4000000/(original.width*original.height))),viewport=page.getViewport({scale}),canvas=reportCreateCanvas(viewport.width,viewport.height),ctx=canvas.getContext('2d');if(!ctx)throw new Error('Die Bilddarstellung wird von diesem Browser nicht unterstützt.');await page.render({canvasContext:ctx,viewport,background:'#ffffff',annotationMode:lib.AnnotationMode.ENABLE}).promise;pages.push({src:canvas.toDataURL('image/png'),width:canvas.width,height:canvas.height,page:i,total:pdf.numPages});page.cleanup();canvas.width=canvas.height=1;await reportPause()}return pages}finally{await loading.destroy()}}


'use strict';
let reportPrepared=null,reportPreparing=null,reportExportJobs=new Map();
function currentDefinition(){return C.STANDARD[S.reportFilter]||S.filters.find(f=>f.id===S.reportFilter)||C.STANDARD.week}
function reportPeople(){return selectedPeople().filter(p=>S.person!=='all'||S.reportPeople===null||S.reportPeople.includes(p.id))}
function makeReports(){const def=currentDefinition();return reportPeople().map(p=>C.report(p,def,{documents:S.documents,generalTasks:S.general,mode:S.mode}))}
function reportKey(){return JSON.stringify([S.revision,S.person,S.mode,S.reportFilter,S.reportPeople,S.documents,S.general,currentDefinition(),C.today()])}
function reportOptionsHtml(){return `<div class="report-options"><label class="check"><input id="reportDocuments" type="checkbox" ${S.documents?'checked':''}>Dokumente als Bilder</label><label class="check"><input id="reportGeneral" type="checkbox" ${S.general?'checked':''}>Allgemeine Aufgaben</label></div>`}
function reportsHtml(){const def=currentDefinition();return heading('Berichte','Eine Person oder mehrere Teilnehmende gemeinsam auswerten.')+(!S.people.length?empty('Noch keine Backups geladen','Importiere zuerst mindestens ein Backup.',btn('import','Backups laden','primary')):`<section class="report-setup"><div class="report-select"><div class="field"><label for="reportFilter">Welcher Bericht?</label><select id="reportFilter"><optgroup label="Standardberichte">${options(Object.values(C.STANDARD).map(d=>[d.id,d.name]),def.id)}</optgroup>${S.filters.length?`<optgroup label="Eigene Filter">${options(S.filters.map(f=>[f.id,f.name]),def.id)}</optgroup>`:''}</select></div><div class="actions">${btn('filternew','+ Eigener Filter','secondary')}${!C.STANDARD[def.id]?btn('filteredit','Filter bearbeiten','textbutton')+btn('filterdelete','Filter löschen','textbutton'):''}</div></div><p class="small">${def.id==='week'?'Alle Aufgaben, die diese Woche von Montag bis Freitag fällig sind.':def.id==='done'?'Alle Aufgaben, die diese Woche von Montag bis Sonntag erledigt wurden.':def.id==='history'?'Alle Bewerbungen mit ihrem gesamten Verlauf, auch abgeschlossene.':'Gespeicherter eigener Filter · '+E(C.PERIODS.find(p=>p[0]===def.period)?.[1]||'')}</p>${S.person==='all'?`<details><summary id="reportPeopleSummary">Teilnehmende auswählen · ${reportPeople().length} von ${S.people.length}</summary><div class="detailbody"><label class="check"><input id="reportAllPeople" type="checkbox" ${S.reportPeople===null?'checked':''}>Alle Teilnehmenden</label><div class="report-people">${S.people.map(p=>`<label class="check"><input data-report-person="${E(p.id)}" type="checkbox" ${S.reportPeople===null||S.reportPeople.includes(p.id)?'checked':''}>${E(p.name)}</label>`).join('')}</div></div></details>`:''}${reportOptionsHtml()}<div class="actions">${btn('report',icon('reports')+' PDF speichern','primary')}${window.Android?.exportCoachReport?btn('shareReport','PDF teilen','secondary'):''}</div><p id="reportStatus" class="report-status" role="status"></p></section><div id="reportPreview" aria-label="Berichtsvorschau"></div>`)}
function bindReports(){if(!$('reportFilter'))return;
  $('reportFilter').onchange=e=>{S.reportFilter=e.target.value;const def=currentDefinition();if(!C.STANDARD[def.id]){S.documents=def.documents===true;S.general=def.generalTasks!==false}render()};
  $('reportDocuments').onchange=e=>{S.documents=e.target.checked;refreshReportPreview()};
  $('reportGeneral').onchange=e=>{S.general=e.target.checked;refreshReportPreview()};
  if($('reportAllPeople'))$('reportAllPeople').onchange=e=>{S.reportPeople=e.target.checked?null:[];document.querySelectorAll('[data-report-person]').forEach(x=>x.checked=e.target.checked);refreshReportPreview()};
  document.querySelectorAll('[data-report-person]').forEach(el=>el.onchange=()=>{S.reportPeople=[...document.querySelectorAll('[data-report-person]:checked')].map(x=>x.dataset.reportPerson);$('reportAllPeople').checked=S.reportPeople.length===S.people.length;if($('reportAllPeople').checked)S.reportPeople=null;refreshReportPreview()});
  refreshReportPreview();
}
function reportLine(t){return `<div class="report-line"><span class="check-box" aria-label="${t.done?'Erledigt':'Offen'}">${t.done?'✓':''}</span><div class="report-line-content"><strong>${E(t.title)}</strong><div class="small">${E([t.company,t.job].filter(Boolean).join(' · ')||'Allgemeine Aufgabe')}</div>${t.note?`<p class="pre" style="margin-top:5px">${E(t.note)}</p>`:''}</div><div class="report-line-date">${E(t.date?fmt(t.date):'Ohne Termin')}${t.time?'<br>'+E(t.time):''}</div></div>`}
function reportHistory(a){return `<section class="report-history"><h3>${E(a.company||'Betrieb')}</h3><p class="small">${E([a.job,a.status].filter(Boolean).join(' · '))}</p>${a.contact||a.contactInfo?`<p class="small">${E([a.contact,a.contactInfo].filter(Boolean).join(' · '))}</p>`:''}${a.sourceUrl?`<p class="small pre">Inserat: ${E(a.sourceUrl)}</p>`:''}<p class="small" style="margin-top:9px"><strong>Nächste Aufgabe:</strong> ${E(a.next||'Keine offene Aufgabe')}${a.nextDate?' · '+E(fmt(a.nextDate)):''}</p>${a.entries.length?a.entries.map(eventHtml).join(''):'<p class="small" style="margin-top:12px">Keine Einträge im gewählten Zeitraum.</p>'}${a.reflections.map(r=>`<div style="margin-top:18px"><h3>${E(r.title)}</h3><p class="small">${E(fmt(r.date))}</p>${r.answers.map(a=>`<div class="ref-item"><strong>${E(a.label)}</strong><p class="pre">${E(a.value)}</p></div>`).join('')}</div>`).join('')}</section>`}
function documentEntries(reports){const entries=[];for(const d of reports){const seen=new Set();for(const group of d.documentGroups)for(const f of group.documents){const key=d.participantId+'|'+group.id+'|'+f.id;if(seen.has(key))continue;seen.add(key);entries.push({key,pid:d.participantId,participant:d.participant,company:group.company,job:group.job,file:f})}}return entries}
function pagesHtml(entry,pages){return pages.map(p=>`<figure class="doc-page"><figcaption><strong>${E(entry.participant)} · ${E(entry.company)}</strong><br>${E(entry.file.name)} · Seite ${p.page} / ${p.total}</figcaption><img src="${E(p.src)}" width="${p.width}" height="${p.height}" alt="${E(entry.file.name+' · Seite '+p.page)}" decoding="async"></figure>`).join('')}
function reportSection(d,images={}){const entries=documentEntries([d]);return `<article class="report-sheet"><header class="report-person-head"><div class="eyebrow">SEMO HEKS KICK · Coach</div><h2>${E(d.participant)}</h2><h3 class="report-page-title">${E(d.title)}</h3><p class="small">${E(d.periodDescription)} · ${E(d.periodLabel)}</p><p class="small">${E(d.filterDescription)} · ${E(d.searchLabel)}</p><p class="small"><strong>Backup vom ${E(stamp(d.backupDate))}</strong> · Bericht erstellt am ${E(fmt(d.generated))}</p></header>${metricsHtml(d.metrics)}<p class="caption">${E(d.scopeLabel)}</p><p class="caption">${d.count} ${E(d.itemLabel)}</p>${d.key==='history'?d.histories.map(reportHistory).join('')||'<p class="small">Keine Bewerbungen für diese Auswahl.</p>':d.taskRows.map(reportLine).join('')||'<p class="small">Keine Aufgaben für diesen Zeitraum.</p>'}${d.key==='history'&&d.options.generalTasks?`<h3>Allgemeine Aufgaben</h3>${d.generalTaskRows.map(reportLine).join('')||'<p class="small">Keine allgemeinen Aufgaben für diesen Zeitraum.</p>'}`:''}${d.key==='week'&&d.unknownDue?`<p class="info">Bei ${d.unknownDue} erledigten Aufgaben ist im Backup kein ursprüngliches Fälligkeitsdatum gespeichert. Sie können diesem Wochenplan nicht sicher zugeordnet werden.</p>`:''}<footer class="report-footer">${E(d.optionSummary)}<br>${E(d.privacyNote)}<br>Quelldatei: ${E(d.sourceName)}</footer>${d.options.documents?`<section class="report-docs"><h3>Dokumente</h3>${entries.length?entries.map(e=>`<div data-document-key="${E(e.key)}">${images[e.key]?pagesHtml(e,images[e.key]):`<p class="small"><span class="busy"></span>${E(e.file.name)} wird vorbereitet …</p>`}</div>`).join(''):'<p class="small">Keine Dokumente zu den gezeigten Bewerbungen.</p>'}</section>`:''}</article>`}
function setReportStatus(message,error=false){const el=$('reportStatus');if(el){el.textContent=message;el.style.color=error?'var(--red)':''}}
function setReportButtons(disabled){document.querySelectorAll('[data-action="report"],[data-action="shareReport"]').forEach(b=>b.disabled=disabled)}
async function refreshReportPreview(){
  const host=$('reportPreview');if(!host)return;const reports=makeReports(),key=reportKey(),generation=++S.epoch;if($('reportPeopleSummary'))$('reportPeopleSummary').textContent='Teilnehmende auswählen · '+reports.length+' von '+S.people.length;
  reportPrepared=null;host.innerHTML=reports.length?reports.map(d=>reportSection(d)).join(''):empty('Keine Person ausgewählt','Wähle mindestens eine Person für den Bericht.');
  const current=()=>S.view==='reports'&&!S.detail&&host.isConnected&&S.epoch===generation&&reportKey()===key;
  setReportButtons(S.reportBusy||!reports.length);const entries=documentEntries(reports);setReportStatus(entries.length?'Dokumente werden als Bilder geladen …':'');
  const promise=(async()=>{const images={},errors=[];for(const entry of entries){if(!current())return null;try{const pages=await coachDocumentPages(entry.pid,entry.file,current);if(!current())return null;images[entry.key]=pages;const el=[...host.querySelectorAll('[data-document-key]')].find(x=>x.dataset.documentKey===entry.key);if(el)el.innerHTML=pagesHtml(entry,pages)}catch(e){if(e.name==='AbortError'||!current())return null;errors.push(entry.file.name);const el=[...host.querySelectorAll('[data-document-key]')].find(x=>x.dataset.documentKey===entry.key);if(el)el.innerHTML=`<p class="info error"><strong>${E(entry.file.name)}</strong><br>${E(documentError(e))}</p>`}}if(!current())return null;reportPrepared={reports,images,errors,key};setReportStatus(errors.length?'Ein Dokument fehlt oder ist nicht lesbar. Lade ein vollständiges Backup oder schalte «Dokumente als Bilder» aus.':'',errors.length>0);setReportButtons(S.reportBusy||!reports.length||errors.length>0);return reportPrepared})();
  reportPreparing={key,promise};return promise;
}
function filterEditor(id=''){if(C.STANDARD[id]){notify('Die drei Standardfilter sind unveränderbar.');return}const f=S.filters.find(f=>f.id===id)||{id:'',name:'',content:'history',period:'all',state:'all',scope:'all',documents:S.documents,generalTasks:S.general};
  modal(f.id?'Eigenen Filter bearbeiten':'Eigenen Filter einrichten',`<p class="caption">Dieser Filter verändert nur die Berichtsauswahl. Die Daten der Teilnehmenden bleiben unverändert.</p><input type="hidden" id="filterId" value="${E(f.id)}"><div class="field"><label for="filterName">Name des Filters</label><input id="filterName" maxlength="60" value="${E(f.name)}" placeholder="z. B. Offene Aufgaben dieser Woche"></div><div class="two"><div class="field"><label for="filterContent">Inhalt</label><select id="filterContent">${options([['due','Fällige Aufgaben'],['done','Erledigte Aufgaben'],['history','Bewerbungsverlauf']],f.content)}</select></div><div class="field"><label for="filterPeriod">Zeitraum</label><select id="filterPeriod">${options(C.PERIODS,f.period)}</select></div></div><div class="two" id="filterDates" ${f.period==='range'?'':'hidden'}><div class="field"><label for="filterFrom">Von</label><input type="date" id="filterFrom" value="${E(f.from)}"></div><div class="field"><label for="filterTo">Bis</label><input type="date" id="filterTo" value="${E(f.to)}"></div></div><div class="two"><div class="field"><label for="filterScope">Bewerbungen</label><select id="filterScope">${options([['all','Alle Bewerbungen'],['active','Aktive Bewerbungen'],['closed','Abgeschlossene Bewerbungen'],['offers','Mit Zusage'],['rejections','Mit Absage'],['selected','Einzelne Bewerbungen auswählen']],f.scope)}</select></div><div class="field" id="filterStateField" ${f.content==='due'?'':'hidden'}><label for="filterState">Aufgabenstatus</label><select id="filterState">${options([['all','Offen und erledigt'],['open','Nur offen'],['done','Nur erledigt']],f.state)}</select></div></div><div id="filterAppSelection" ${f.scope==='selected'?'':'hidden'}><p class="field-label">Bewerbungen für diesen Filter</p><div class="cards" style="max-height:260px;overflow:auto;padding:8px;background:#fff;border:1px solid var(--line);border-radius:10px">${S.people.flatMap(p=>p.apps.map(a=>`<label class="check"><input type="checkbox" data-filter-app="${E(p.id+'|'+a.id)}" ${C.array(f.appKeys).includes(p.id+'|'+a.id)?'checked':''}>${E(p.name)} · ${E(a.company)} · ${E(a.job)}</label>`)).join('')}</div><p class="caption">Die Personenauswahl und der Suchmodus oben grenzen den Bericht zusätzlich ein.</p></div><div class="report-options"><label class="check"><input id="filterDocs" type="checkbox" ${f.documents?'checked':''}>Dokumente als Bilder</label><label class="check"><input id="filterGeneral" type="checkbox" ${f.generalTasks?'checked':''}>Allgemeine Aufgaben</label></div><p id="filterError" class="info error" role="alert" hidden></p><div class="actions">${btn('filterSave','Filter speichern','primary')}${btn('closemodal','Abbrechen','secondary')}</div>`);
  $('filterScope').onchange=e=>$('filterAppSelection').hidden=e.target.value!=='selected';$('filterPeriod').onchange=e=>$('filterDates').hidden=e.target.value!=='range';$('filterContent').onchange=e=>$('filterStateField').hidden=e.target.value!=='due';
}
async function saveFilter(){const f={id:$('filterId').value||'custom_'+newId(),name:$('filterName').value.trim(),content:$('filterContent').value,period:$('filterPeriod').value,from:$('filterFrom').value,to:$('filterTo').value,state:$('filterState').value,scope:$('filterScope').value,appKeys:[...document.querySelectorAll('[data-filter-app]:checked')].map(x=>x.dataset.filterApp),documents:$('filterDocs').checked,generalTasks:$('filterGeneral').checked};try{if(C.STANDARD[f.id])throw new Error('Standardfilter sind unveränderbar.');C.validateFilter(f);if(S.filters.some(x=>x.id!==f.id&&x.name.toLocaleLowerCase('de')===f.name.toLocaleLowerCase('de')))throw new Error('Ein eigener Filter mit diesem Namen ist bereits vorhanden.');const rows=[...S.filters.filter(x=>x.id!==f.id),f].sort((a,b)=>a.name.localeCompare(b.name,'de'));await DB.setting('filters',rows);S.filters=rows;S.reportFilter=f.id;S.documents=f.documents;S.general=f.generalTasks;closeModal();render();notify('Filter gespeichert.')}catch(e){$('filterError').textContent=e.message;$('filterError').hidden=false}}
function deleteFilterAsk(){const f=currentDefinition();if(C.STANDARD[f.id])return;modal('Filter löschen?',`<p>Den eigenen Filter <strong>${E(f.name)}</strong> löschen?</p><div class="actions" style="margin-top:20px">${btn('filterdeleteconfirm','Löschen','danger',{id:f.id})}${btn('closemodal','Abbrechen','secondary')}</div>`)}
async function deleteFilter(id){if(C.STANDARD[id])return false;const rows=S.filters.filter(f=>f.id!==id);await DB.setting('filters',rows);S.filters=rows;if(S.reportFilter===id)S.reportFilter='week';closeModal();render();return true}
function printHtml(prepared){const title=currentDefinition().name;return '<!doctype html><html lang="de"><head><meta charset="utf-8"><title>'+E(title)+'</title><style>'+document.getElementById('coachStyles').textContent+'</style></head><body>'+prepared.reports.map(d=>reportSection(d,prepared.images)).join('')+'<div class="watermark">VERTRAULICH · Coach-Reporting</div></body></html>'}
async function browserPrint(prepared,current){document.querySelectorAll('iframe[data-coach-print]').forEach(f=>f.remove());const frame=document.createElement('iframe');frame.dataset.coachPrint='1';frame.title='Bericht drucken';frame.style.cssText='position:fixed;left:-10000px;top:0;width:800px;height:1px;border:0';document.body.appendChild(frame);const win=frame.contentWindow,doc=win.document;doc.open();doc.write(printHtml(prepared));doc.close();try{await Promise.all([...doc.images].map(img=>img.decode?img.decode():img.complete&&img.naturalWidth?Promise.resolve():new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Dokumentbild konnte nicht geladen werden.'))})));if(doc.fonts?.ready)await doc.fonts.ready;if(!current())throw new DOMException('Ansicht geändert','AbortError');win.addEventListener('afterprint',()=>frame.remove(),{once:true});win.focus();win.print()}catch(e){frame.remove();throw e}}
window.coachReportCurrent=id=>reportExportJobs.get(id)?.current()===true;
window.onCoachReportResult=function(id,success,message){const job=reportExportJobs.get(id);if(!job)return;reportExportJobs.delete(id);if(success)job.resolve();else{const e=message?new Error(message):new DOMException('Abgebrochen','AbortError');job.reject(e)}};
async function nativeReport(prepared,share,current){
  const job=newId(),data=JSON.parse(JSON.stringify(prepared.reports)).map(r=>({...r,backupLabel:stamp(r.backupDate)})),mapped=new Map();
  const promise=new Promise((resolve,reject)=>reportExportJobs.set(job,{resolve,reject,current}));promise.catch(()=>{});
  try{
    const start=Android.beginCoachReport(job);if(start!=='OK')throw new Error(start||'PDF konnte nicht vorbereitet werden.');let n=0;
    for(const d of data)for(const g of d.documentGroups)for(const f of g.documents){if(!current())throw new DOMException('Ansicht geändert','AbortError');const key=d.participantId+'|'+f.id;if(!mapped.has(key)){const stored=await DB.file(d.participantId,f.id);if(!stored?.blob)throw new Error('Ein Dokument fehlt im importierten Backup.');const ext=({'application/pdf':'.pdf','image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'})[stored.blob.type];if(!ext)throw new Error('Unbekanntes Dokumentformat.');const name='doc_'+(++n)+ext,base64=(await blobData(stored.blob)).split(',')[1],result=Android.stageCoachReportDocument(job,name,base64);if(result!=='OK')throw new Error(result||'Ein Dokument konnte nicht übernommen werden.');mapped.set(key,name)}f.id=mapped.get(key)}
    if(!current())throw new DOMException('Ansicht geändert','AbortError');Android.exportCoachReport(JSON.stringify({coachReports:data,title:currentDefinition().name,generated:C.today()}),share,job);await promise;
  }catch(e){reportExportJobs.delete(job);try{Android.cancelCoachReport(job)}catch{}throw e}
}
async function exportReport(share=false){if(S.reportBusy)return false;const key=reportKey(),host=$('reportPreview');const current=()=>S.view==='reports'&&!S.detail&&!!host?.isConnected&&reportKey()===key;
  if(!reportPeople().length){setReportStatus('Bitte mindestens eine Person auswählen.',true);return false}
  S.reportBusy=true;setReportButtons(true);setReportStatus('Bericht wird vorbereitet …');
  try{let prepared=reportPrepared?.key===key?reportPrepared:reportPreparing?.key===key?await reportPreparing.promise:await refreshReportPreview();if(!current()||!prepared)throw new DOMException('Ansicht geändert','AbortError');if(prepared.errors.length)throw new Error('Ein Dokument ist nicht lesbar. Bitte das Backup aktualisieren oder die Dokumentausgabe ausschalten.');if(window.Android?.exportCoachReport)await nativeReport(prepared,share,current);else await browserPrint(prepared,current);if(current())setReportStatus(window.Android?'Bericht bereit.':'Im Druckdialog «Als PDF speichern» auswählen.');return true}catch(e){if(e.name!=='AbortError'&&current()){setReportStatus(e.message||'Bericht konnte nicht erstellt werden.',true);notify(e.message||'Bericht konnte nicht erstellt werden.')}return false}finally{S.reportBusy=false;resumeImports();setReportButtons(!reportPeople().length||!!reportPrepared?.errors.length)}
}



