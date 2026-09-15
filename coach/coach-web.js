'use strict';
// Web edition 1.0.2. Uses the native CoachStore schema without changing TN data.
let sharedLibraries;
async function loadSharedLibraries() {
  if (!sharedLibraries) sharedLibraries = (async () => {
    const response = await fetch('../index.html');
    if (!response.ok) throw new Error('PDF-Bibliotheken konnten nicht geladen werden. Bitte mit Internet erneut öffnen.');
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    // Only library payloads are used; the Tracker application is never executed.
    for (const id of ['kickPdfWorkerBundle','kickPdfApiBundle','kickPdfAssets']) {
      const payload = doc.getElementById(id)?.textContent;
      if (!payload) throw new Error('Eine gemeinsame PDF-Bibliothek fehlt.');
      document.getElementById(id).textContent = payload;
    }
    for (const prefix of ['/*!\n * html2canvas ', '/** @license\n *\n * jsPDF -']) {
      const text = [...doc.scripts].map(s=>s.textContent).find(s=>s.startsWith(prefix));
      if (!text) throw new Error('Die PDF-Erstellung ist nicht verfügbar.');
      const script = document.createElement('script'); script.textContent=text;
      document.head.appendChild(script); script.remove();
    }
  })().catch(error => { sharedLibraries=null; throw error; });
  return sharedLibraries;
}
const nativeLoadPdfLibrary=reportLoadPdfLibrary;
reportLoadPdfLibrary=async function(){await loadSharedLibraries();return nativeLoadPdfLibrary();};

function coachState(message) { $('coachStorageStatus').textContent=message; }
async function coachSnapshot() {
  const db=await DB.open();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['people','files','settings'],'readonly'),out={};
    for(const name of ['people','files','settings']) {
      const request=tx.objectStore(name).getAll();request.onsuccess=()=>out[name]=request.result;
    }
    tx.oncomplete=()=>resolve(out);tx.onabort=tx.onerror=()=>reject(tx.error||new Error('Speicher konnte nicht gelesen werden.'));
  });
}
async function coachPortablePerson(person,files) {
  const ids=new Set(person.apps.flatMap(C.documents).map(f=>f.id));
  const nativeAttachments=[];
  for(const id of ids) {
    const row=files.find(f=>f.participantId===person.id&&f.id===id);
    if(!row?.blob)throw new Error('Bei '+person.name+' fehlt ein Dokument. Lade zuerst ein vollständiges Teilnehmenden-Backup.');
    nativeAttachments.push({id,data:(await blobData(row.blob)).split(',')[1]});
  }
  return {app:'Bewerbungs Tracker',format:'kick-backup',formatVersion:3,appVersion:person.appVersion,
    createdAt:person.createdAt||person.importedAt,data:{profile:JSON.stringify(person.profile),tracker:JSON.stringify(person.apps),generalTasksV1:JSON.stringify(person.generalTasks.filter(t=>!C.yes(t.private)))},nativeAttachments};
}
async function coachBuildBackup(participantId='') {
  const snapshot=await coachSnapshot();
  if(participantId) {
    const p=snapshot.people.find(p=>p.id===participantId);
    if(!p)throw new Error('Die Person ist nicht mehr vorhanden.');
    return coachPortablePerson(p,snapshot.files);
  }
  const people=[];
  for(const p of snapshot.people)people.push({id:p.id,name:p.name,sourceName:p.sourceName,sourceHash:p.sourceHash,importedAt:p.importedAt,backup:await coachPortablePerson(p,snapshot.files)});
  return {app:'Bewerbungs Coach',format:'kick-coach-backup',formatVersion:1,appVersion:'1.0.2-html',createdAt:new Date().toISOString(),people,settings:snapshot.settings.filter(s=>s.id==='filters')};
}
function coachValidateBackup(backup) {
  if(!C.record(backup)||backup.format!=='kick-coach-backup'||backup.formatVersion!==1||!Array.isArray(backup.people)||backup.people.length>2000||!Array.isArray(backup.settings))throw new Error('Kein gültiges Coach-Gesamtbackup. Teilnehmenden-Backups lädst du über «Backups laden».');
  const ids=new Set(),people=[],files=[];
  for(const entry of backup.people) {
    if(!C.record(entry)||typeof entry.id!=='string'||!entry.id||entry.id.length>200||ids.has(entry.id)||typeof entry.name!=='string'||!entry.name.trim())throw new Error('Die Personenzuordnung im Backup ist ungültig.');
    ids.add(entry.id);
    const parsed=C.parseBackup(JSON.stringify(entry.backup),C.text(entry.sourceName));
    if(parsed.missing.length)throw new Error('Das Backup enthält fehlende Dokumente.');
    const decoded=parsed.files.map(C.decodeFile);
    people.push({id:entry.id,name:entry.name,profile:parsed.profile,apps:parsed.apps,generalTasks:parsed.generalTasks,sourceName:parsed.sourceName,sourceHash:C.text(entry.sourceHash),createdAt:parsed.createdAt,importedAt:C.text(entry.importedAt)||new Date().toISOString(),appVersion:parsed.appVersion,missing:[],fileCount:decoded.length});
    for(const f of decoded)files.push({participantId:entry.id,...f});
  }
  if(backup.settings.some(s=>!C.record(s)||s.id!=='filters')||backup.settings.length>1)throw new Error('Ungültige Coach-Einstellungen.');
  const filters=backup.settings[0]?.value||[];
  if(!Array.isArray(filters)||filters.length>1000)throw new Error('Ungültige Berichtsfilter.');
  const filterIds=new Set();
  for(const f of filters){if(!C.record(f)||!/^custom_[a-f0-9-]+$/.test(f.id)||filterIds.has(f.id))throw new Error('Ungültige Filterkennung.');C.validateFilter(f);filterIds.add(f.id);}
  return {people,files,settings:[{id:'filters',value:filters}]};
}
async function coachRestoreBackup(backup) {
  const checked=coachValidateBackup(backup),db=await DB.open();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(['people','files','settings'],'readwrite');
    try{for(const name of ['people','files','settings']){const store=tx.objectStore(name);store.clear();for(const row of checked[name])store.put(row);}}
    catch(error){tx.abort();reject(error);return;}
    tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Wiederherstellung abgebrochen. Bisherige Daten bleiben erhalten.'));
  });
  S.filters=checked.settings[0].value;S.person='all';S.reportPeople=null;S.reportFilter='week';S.detail=null;
  await reloadPeople();render();coachState('Auf diesem Gerät gespeichert');
}

let coachReadyFile=null,coachFileUrl=null,coachWebBusy=false;
function coachCanShare(file){try{return !!navigator.share&&!!navigator.canShare?.({files:[file]});}catch{return false;}}
function coachOfferFile(file) {
  if(coachFileUrl)URL.revokeObjectURL(coachFileUrl);
  coachReadyFile=file;coachFileUrl=URL.createObjectURL(file);
  modal('Datei bereit',`<p>${E(file.name)}</p><p class="small" style="margin:12px 0">${coachCanShare(file)?'Tippe auf «Jetzt teilen», um die Dateien-App oder eine andere App zu wählen.':'Lade die Datei herunter. Anschliessend kannst du sie über deine Dateien-App teilen.'}</p><div class="actions">${coachCanShare(file)?'<button class="primary" id="coachShareNow">Jetzt teilen</button>':''}<a class="secondary" href="${coachFileUrl}" download="${E(file.name)}">Herunterladen</a></div><p id="coachShareFeedback" role="status" class="small"></p>`);
  if($('coachShareNow'))$('coachShareNow').onclick=async()=>{
    const button=$('coachShareNow');button.disabled=true;
    try{await navigator.share({files:[file],title:'Bewerbungs Coach'});$('coachShareFeedback').textContent='Teilen abgeschlossen.';}
    catch(error){$('coachShareFeedback').textContent=error.name==='AbortError'?'Teilen abgebrochen.':'Teilen ist hier nicht möglich. Nutze «Herunterladen».';}
    finally{button.disabled=false;}
  };
}
async function coachExport(participantId='') {
  if(coachWebBusy||S.importBusy||importQueue.length||S.reportBusy)return notify('Bitte den laufenden Vorgang zuerst abschliessen.');
  coachWebBusy=true;$('coachBackupButton').disabled=true;
  try{
    const backup=await coachBuildBackup(participantId),json=JSON.stringify(backup);
    const p=participantId?person(participantId):null;
    const name=(p?'BewT_'+p.name.replace(/[^\p{L}\p{N}_-]/gu,'_'):'Bewerbungs_Coach_Gesamtbackup')+'_'+C.today()+'.json';
    const file=new File([json],name,{type:'application/json'});
    if(file.size>180*1024*1024)throw new Error('Das Gesamtbackup ist grösser als 180 MB. Sichere die Personen einzeln.');
    coachOfferFile(file);
  }catch(error){notify(error.message||'Backup fehlgeschlagen.');}
  finally{coachWebBusy=false;$('coachBackupButton').disabled=false;}
}
function coachBackupMenu() {
  if(coachWebBusy||S.importBusy||importQueue.length||S.reportBusy)return notify('Bitte den laufenden Vorgang zuerst abschliessen.');
  modal('Speichern & Backups',`<p>Importe und eigene Berichtsfilter werden automatisch auf diesem Gerät gespeichert.</p><p class="info" style="margin:14px 0">Verwende immer denselben Browser und Zugang. Gelöschte Browserdaten, privates Surfen und ein Gerätewechsel können lokale Daten entfernen. Sichere regelmässig ein Backup ausserhalb des Browsers.</p><h3>Alle Coach-Daten sichern</h3><p class="small">Alle Personen, Dokumente und Berichtsfilter. Dieses Gesamtbackup kannst du in dieser HTML-Coach-App auf Android, iPhone und PC wiederherstellen.</p><div class="actions" style="margin:12px 0"><button class="primary" id="coachExportAll">Gesamtbackup erstellen</button><button class="secondary" id="coachRestoreChoose">Gesamtbackup wiederherstellen</button></div><input id="coachRestoreInput" type="file" accept=".json,application/json" hidden><h3>In die installierte Coach-App übernehmen</h3><p class="small">Sichere eine Person als Teilnehmenden-Backup. In der bestehenden Android-/iPhone-Coach-App kannst du diese JSON-Datei über «Backups laden» einlesen. Wiederhole dies für weitere Personen. Eigene Coach-Filter werden dabei nicht übertragen.</p><select id="coachExportPerson" aria-label="Person für das Backup">${S.people.map(p=>`<option value="${E(p.id)}">${E(p.name)}</option>`).join('')}</select><button class="secondary" id="coachExportOne" ${S.people.length?'':'disabled'}>Personen-Backup erstellen</button><p class="small" style="margin-top:18px">iPhone: Safari → Teilen → Zum Home-Bildschirm. Android: Chrome → Menü → Zum Startbildschirm hinzufügen. Danach immer diesen Zugang verwenden.</p><button class="textbutton" id="coachProtect">Gerätespeicher schützen</button><p id="coachProtectNote" role="status" class="small"></p><p class="small">HTML-Version 1.0.2 · 15.09.2026</p>`);
  $('coachExportAll').onclick=()=>coachExport();$('coachExportOne').onclick=()=>coachExport($('coachExportPerson').value);
  $('coachRestoreChoose').onclick=()=>$('coachRestoreInput').click();
  $('coachRestoreInput').onchange=async event=>{
    const file=event.target.files?.[0];if(!file)return;
    try{
      if(file.size>180*1024*1024)throw new Error('Das Backup ist grösser als 180 MB.');
      const backup=JSON.parse(await file.text());const checked=coachValidateBackup(backup);
      modal('Gesamtbackup wiederherstellen?',`<p><strong>${checked.people.length} Personen · ${checked.files.length} Dokumente</strong></p><p style="margin:12px 0">Die bisherigen Coach-Daten auf diesem Gerät werden ersetzt. Erstelle vorher ein Gesamtbackup.</p><div class="actions"><button class="primary" id="coachRestoreConfirm">Wiederherstellen</button>${btn('closemodal','Abbrechen','secondary')}</div>`);
      $('coachRestoreConfirm').onclick=async()=>{if(coachWebBusy)return;coachWebBusy=true;$('coachRestoreConfirm').disabled=true;try{await coachRestoreBackup(backup);closeModal();notify('Gesamtbackup wiederhergestellt.');}catch(error){notify(error.message);if($('coachRestoreConfirm'))$('coachRestoreConfirm').disabled=false;}finally{coachWebBusy=false;}};
    }catch(error){notify(error.message||'Backup konnte nicht gelesen werden.');}
  };
  $('coachProtect').onclick=async()=>{try{$('coachProtectNote').textContent=await navigator.storage?.persist?.()?'Speicher geschützt. Sichere trotzdem regelmässig ein Backup.':'Der Browser entscheidet über den Speicherschutz. Ein Backup bleibt nötig.';}catch{$('coachProtectNote').textContent='Speicherschutz ist hier nicht verfügbar.';}};
}
$('coachBackupButton').onclick=coachBackupMenu;

async function coachMakePdf(prepared,current) {
  await loadSharedLibraries();
  const frame=document.createElement('iframe');frame.style.cssText='position:fixed;left:-10000px;width:794px;height:1123px;border:0';document.body.appendChild(frame);
  try{
    const doc=frame.contentDocument;doc.open();doc.write(printHtml(prepared));doc.close();
    const style=doc.createElement('style');style.textContent='body{box-sizing:border-box;margin:0;padding:20px;width:794px}.report-sheet{max-width:754px}.doc-page img{max-width:100%;height:auto}';doc.head.appendChild(style);
    if(doc.fonts?.ready)await doc.fonts.ready;await Promise.all([...doc.images].map(img=>img.decode()));
    const pdf=new jspdf.jsPDF({unit:'pt',format:'a4',compress:true}),height=1100,total=doc.body.scrollHeight;
    const blocks=[...doc.querySelectorAll('p,h2,h3,li,tr,.doc-page')].map(el=>{const r=el.getBoundingClientRect();return {top:Math.floor(r.top),bottom:Math.ceil(r.bottom)};});
    for(let y=0,page=0;y<total;){
      if(!current())throw new DOMException('Ansicht geändert','AbortError');
      let end=Math.min(y+height,total);
      for(const block of blocks)if(block.top>y+80&&block.top<end&&block.bottom>end&&block.bottom-block.top<=height)end=block.top;
      const canvas=await html2canvas(doc.body,{x:0,y,width:794,height:end-y,scale:1.5,backgroundColor:'#fff',logging:false,windowWidth:794,windowHeight:1123});
      if(page++)pdf.addPage();pdf.addImage(canvas.toDataURL('image/jpeg',.93),'JPEG',28,28,539,canvas.height/1.5*539/794);canvas.width=canvas.height=0;
      y=end;
    }
    return new File([pdf.output('blob')],'Coach_Bericht_'+C.today()+'.pdf',{type:'application/pdf'});
  }finally{frame.remove();}
}
// Both PDF actions produce a real file; sharing is invoked by a fresh user tap.
const previousExportReport=exportReport;
exportReport=async function(share=false){
  if(window.Android?.exportCoachReport)return previousExportReport(share);
  if(S.reportBusy||coachWebBusy)return false;
  const key=reportKey(),current=()=>S.view==='reports'&&!S.detail&&reportKey()===key;
  if(!reportPeople().length)return false;
  S.reportBusy=true;setReportButtons(true);setReportStatus('PDF wird vorbereitet …');
  try{
    const prepared=reportPrepared?.key===key?reportPrepared:await refreshReportPreview();
    if(!prepared||!current())throw new DOMException('Ansicht geändert','AbortError');
    if(prepared.errors.length)throw new Error('Ein Dokument fehlt oder ist nicht lesbar.');
    const file=await coachMakePdf(prepared,current);if(!current())return false;
    coachOfferFile(file);setReportStatus('PDF bereit.');return true;
  }catch(error){if(error.name!=='AbortError')setReportStatus(error.message||'PDF fehlgeschlagen.',true);return false;}
  finally{S.reportBusy=false;setReportButtons(false);resumeImports();}
};

bootCoach().then(()=>{if(coachBootReady)coachState('Lokal gespeichert · keine Cloud-Synchronisation');});
if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol))navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(()=>navigator.serviceWorker.ready).then(()=>{if(coachBootReady)coachState('Lokal gespeichert · Offline-Start bereit');}).catch(()=>{if(coachBootReady)coachState('Lokal gespeichert · Offline-Start noch nicht bereit');});
