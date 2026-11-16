// AROICON test registry. Only the Vercel server should call doPost.
// Never put REGISTRATION_SECRET in index.html or share it in chat.
const HEADERS = [
  'Received at', 'Registration ID', 'Name', 'Email', 'Phone',
  'Category', 'Institution', 'Designation', 'State', 'District',
  'Registration tier', 'Accommodation', 'Accompanying age 10+',
  'Accompanying under 10', 'Reported amount INR', 'Payment verification',
  'Reported payment method', 'Reported transaction reference', 'Record JSON'
];

function setup() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const book = SpreadsheetApp.getActiveSpreadsheet();
    if (!book) throw new Error('Open this script from your Google Sheet.');
    const sheet = book.getSheetByName('Registrations') || book.insertSheet('Registrations');
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    }
    checkHeaders(sheet);
    const props = PropertiesService.getScriptProperties();
    props.setProperty('SPREADSHEET_ID', book.getId());
    if (!props.getProperty('REGISTRATION_SECRET')) {
      props.setProperty('REGISTRATION_SECRET', Utilities.getUuid() + Utilities.getUuid());
    }
    console.log('Setup complete. Your Registrations tab is ready.');
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  if (e && e.parameter && e.parameter.view === 'dashboard') {
    try {
      requireOrganizer_();
      return HtmlService.createHtmlOutput(DASHBOARD_HTML_).setTitle('AROICON • Organizer Dashboard')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    } catch (_) { return HtmlService.createHtmlOutput('Organizer access only. Open this link signed in to the Google account that owns the AROICON registration sheet.'); }
  }
  return json({ service: 'AROICON registration receiver', recordsPublic: false });
}

function doPost(e) {
  let lock;
  try {
    const raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > 20000) return json({ ok: false, error: 'Invalid request' });
    const payload = JSON.parse(raw);
    const props = PropertiesService.getScriptProperties();
    const secret = props.getProperty('REGISTRATION_SECRET');
    if (!secret || payload.secret !== secret) return json({ ok: false, error: 'Unauthorized' });

    if (payload.action === 'rooms' || payload.action === 'pair') {
      lock = LockService.getScriptLock();
      lock.waitLock(10000);
      if (payload.action === 'pair') pair_(payload.regId, payload.partnerId, false);
      return json(roomData_(payload.regId));
    }
    const r = payload.record;
    const b = r && r.basicData;
    if (!r || !b || !/^AROI27-[A-Za-z0-9_-]{4,80}$/.test(r.regId || '') ||
        typeof b.fullName !== 'string' || !b.fullName.trim() ||
        typeof b.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email) ||
        !Number.isFinite(r.totalFee) || r.totalFee < 0) {
      return json({ ok: false, error: 'Invalid registration details' });
    }

    lock = LockService.getScriptLock();
    lock.waitLock(10000);
    const sheet = SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID'))
      .getSheetByName('Registrations');
    checkHeaders(sheet);
    if (sheet.getLastRow() > 1) {
      const ids = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues();
      const existing = ids.findIndex(row => row[0] === r.regId);
      if (existing >= 0) {
        const previous = sheet.getRange(existing + 2, HEADERS.length).getValue();
        if (previous !== JSON.stringify(r)) return json({ ok: false, error: 'Registration ID conflict' });
        return json({ ok: true, regId: r.regId, duplicate: true });
      }
    }
    const p = r.payment || {};
    const row = [new Date(), r.regId, b.fullName, b.email, b.phone,
      r.category, b.college, b.collegeRole, b.state, b.district,
      r.tier, r.accommodation, r.accompAbove10, r.accompBelow10,
      r.totalFee, 'UNVERIFIED - TEST INTEGRATION', p.method, p.txnId, JSON.stringify(r)];
    sheet.appendRow(row.map(safeCell));
    SpreadsheetApp.flush();
    return json({ ok: true, regId: r.regId });
  } catch (error) {
    return json({ ok: false, error: /^Choose another|^Both delegates|^One of these|^Partner selection/.test(error.message || '') ? error.message : 'Could not save registration. Check script setup and retry.' });
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}

function checkHeaders(sheet) {
  if (!sheet || JSON.stringify(sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0]) !== JSON.stringify(HEADERS)) {
    throw new Error('Registrations column headings do not match. Do not overwrite existing data.');
  }
}

function safeCell(value) {
  if (value === undefined || value === null) return '';
  // Preserve phone numbers and stop submitted text from becoming formulas.
  if (typeof value === 'string' && /^[\s]*[=+@\-\d]/.test(value)) return "'" + value;
  return value;
}

function json(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}


// Helpers ending in underscore cannot be invoked through google.script.run.
function requireOrganizer_() {
  const active = Session.getActiveUser().getEmail().toLowerCase();
  const owner = Session.getEffectiveUser().getEmail().toLowerCase();
  if (!active || !owner || active !== owner) throw new Error('Organizer sign-in required.');
}
function book_() { return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')); }
function records_() {
  const sheet = book_().getSheetByName('Registrations'); checkHeaders(sheet);
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2,1,sheet.getLastRow()-1,19).getValues().map(row => {
    const r = JSON.parse(row[18]);
    r.receivedAt = new Date(row[0]).toISOString();
    return r;
  });
}
function pairs_() {
  const sheet = book_().getSheetByName('RoomPairs');
  if (!sheet || sheet.getLastRow()<2) return [];
  return sheet.getRange(2,1,sheet.getLastRow()-1,4).getValues().map(r=>({at:new Date(r[0]).toISOString(),a:r[1],b:r[2],source:r[3]}));
}
function partner_(id,pairs) { const p=pairs.find(p=>p.a===id || p.b===id); return p ? (p.a===id ? p.b : p.a) : ''; }
function roomData_(id) {
  const records=records_(), pairs=pairs_(), own=records.find(r=>r.regId===id);
  if(!own) return {ok:false,error:'Registration not found.'};
  return {ok:true,record:own,closed:Date.now()>Date.parse('2026-12-31T23:59:59+05:30'),partnerId:partner_(id,pairs),
    candidates:records.filter(r=>['sat_only','fri_and_sat'].indexOf(r.accommodation)>=0).map(r=>({regId:r.regId,
      basicData:{fullName:r.basicData.fullName,salutation:r.basicData.salutation,college:r.basicData.college},
      accommodation:r.accommodation,partnerId:partner_(r.regId,pairs)}))};
}
function pair_(a,b,organizer) {
  if(!organizer && Date.now()>Date.parse('2026-12-31T23:59:59+05:30')) throw new Error('Partner selection closed on 31 December 2026. Contact the organizers.');
  if(!a || !b || a===b) throw new Error('Choose another registered delegate.');
  const records=records_(), pairs=pairs_(), x=records.find(r=>r.regId===a), y=records.find(r=>r.regId===b);
  if(!x || !y || !['sat_only','fri_and_sat'].includes(x.accommodation) || x.accommodation!==y.accommodation) throw new Error('Both delegates must have the same accommodation dates.');
  const ax=partner_(a,pairs), by=partner_(b,pairs);
  if(ax===b && by===a) return; // Idempotent retry after an uncertain response.
  if(ax || by) throw new Error('One of these delegates has already been paired. Refresh the list.');
  let sheet=book_().getSheetByName('RoomPairs');
  if(!sheet) { sheet=book_().insertSheet('RoomPairs'); sheet.appendRow(['Paired at','Delegate A','Delegate B','Assigned by']); sheet.setFrozenRows(1); }
  sheet.appendRow([new Date(),a,b,organizer?'Organizer':'Delegate']);
  SpreadsheetApp.flush();
}
function getDashboardData() {
  requireOrganizer_();
  return {records:records_(),pairs:pairs_(),updatedAt:new Date().toISOString()};
}
function assignDashboardRoom(a,b) {
  requireOrganizer_();
  const lock=LockService.getScriptLock(); lock.waitLock(10000);
  try { pair_(a,b,true); return getDashboardData(); } finally { lock.releaseLock(); }
}

const DASHBOARD_HTML_ = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>AROICON • Organizer Dashboard</title>\n<style>\n:root{--ink:#183138;--muted:#6d7c7c;--line:#e0e6df;--green:#54766a;--gold:#c29c58;--blue:#7799b3;--rose:#b77d70;--bg:#f4f6f3}*{box-sizing:border-box}body{margin:0;background:var(--bg);font:14px/1.5 Inter,system-ui,sans-serif;color:var(--ink)}main{max-width:1480px;margin:auto;padding:30px}header{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:22px}.eyebrow{font-size:11px;letter-spacing:2px;font-weight:800;color:var(--green)}h1{font-size:29px;letter-spacing:-1px;margin:5px 0}h2{font-size:17px;margin:0 0 4px}h3{font-size:13px;margin:0}p{margin:4px 0;color:var(--muted)}button,select,input{font:inherit;border:1px solid var(--line);border-radius:9px;padding:10px 13px;background:white;color:var(--ink)}button{cursor:pointer;font-weight:650}button:hover{border-color:var(--green);background:#eef3ee}button:disabled{opacity:.5;cursor:wait}.primary{background:var(--ink);color:white;border-color:var(--ink)}.primary:hover{background:var(--green);color:white}.actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.notice{display:flex;gap:10px;border:1px solid #e7d7b5;background:#fbf6eb;border-radius:10px;padding:11px 15px;margin-bottom:20px;color:#80652f;font-size:12px}.metrics{display:grid;grid-template-columns:repeat(5,1fr);gap:14px}.card{background:white;border:1px solid var(--line);border-radius:14px;padding:21px;box-shadow:0 3px 12px #23372c03}.metric{position:relative;overflow:hidden}.metric:before{content:'';position:absolute;left:0;top:22px;bottom:22px;width:3px;background:var(--green)}.metric strong{display:block;font-size:31px;letter-spacing:-1px;margin:7px 0 1px}.metric span{font-size:11px;color:var(--muted)}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:18px}.chart{display:flex;align-items:center;gap:22px;margin-top:22px;min-height:160px}.ring{width:146px;height:146px;border-radius:50%;background:#eef1ed;flex-shrink:0;display:grid;place-items:center}.ring>div{width:108px;height:108px;border-radius:50%;background:white;display:flex;flex-direction:column;align-items:center;justify-content:center}.ring strong{font-size:29px}.ring small{color:var(--muted);font-size:10px}.legend{flex:1;min-width:0}.legend button{border:0;background:transparent;padding:7px 0;width:100%;display:flex;align-items:center;text-align:left;font-size:12px;gap:8px;font-weight:500}.legend button:hover{text-decoration:underline}.dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}.legend b{margin-left:auto;font-size:13px}.legend small{color:var(--muted)}.section-head{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:17px}.wide{margin-top:18px}.hotel{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:20px 0}.hotel button{text-align:left;padding:15px;background:#f7f9f6}.hotel strong{display:block;font-size:25px}.hotel span{font-size:12px;color:var(--muted)}.badge{display:inline-block;padding:3px 8px;border-radius:20px;background:#f4ecd9;color:#836533;font-size:10px;font-weight:700}.followup{border-left:3px solid var(--gold)}.toolbar{display:flex;gap:10px;flex-wrap:wrap;padding-bottom:15px}input[type=search]{flex:1;min-width:210px}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;text-align:left;white-space:nowrap}th{font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);background:#f7f9f6;padding:11px 12px;border-bottom:1px solid var(--line)}td{padding:13px 12px;border-bottom:1px solid #edf0eb;font-size:12px}td small{display:block;color:var(--muted);max-width:230px;overflow:hidden;text-overflow:ellipsis}.empty{padding:32px;color:var(--muted);text-align:center}.count{font-size:12px;color:var(--muted)}.bottom{display:grid;grid-template-columns:1.2fr 1fr;gap:18px;margin-top:18px}.bar{display:flex;align-items:center;gap:10px;margin:12px 0;font-size:12px}.bar span{width:85px;flex-shrink:0}.bar i{display:block;height:9px;background:var(--green);border-radius:3px;min-width:2px}.bar b{font-size:11px}a{color:var(--green)}dialog{border:1px solid var(--line);border-radius:16px;width:min(600px,92vw);padding:25px;color:var(--ink)}dialog::backdrop{background:#18313866}dialog label{display:block;margin:15px 0 6px}dialog select{width:100%}dl{display:grid;grid-template-columns:130px 1fr;gap:8px}dt{color:var(--muted)}dd{margin:0;overflow-wrap:anywhere}.error{color:#8e3f31;background:#fff1ec;border:1px solid #e9c6bb;padding:12px;border-radius:8px;margin-bottom:15px}.hidden{display:none}footer{display:flex;justify-content:space-between;font-size:11px;color:var(--muted);padding:22px 0}.tab-active{background:#e8eee6;border-color:var(--green)}@media(max-width:1100px){.grid{grid-template-columns:1fr}.chart{justify-content:space-around}.legend{max-width:350px}.metrics{grid-template-columns:repeat(3,1fr)}}@media(max-width:650px){main{padding:16px}header{align-items:flex-start;flex-direction:column}h1{font-size:26px}.metrics,.hotel{grid-template-columns:repeat(2,1fr)}.bottom{grid-template-columns:1fr}.section-head{align-items:flex-start;flex-direction:column}.card{padding:16px}.chart{gap:16px}.ring{width:130px;height:130px}.ring>div{width:94px;height:94px}.metric strong{font-size:26px}}\n</style></head><body><main>\n<header><div><div class=\"eyebrow\">CAN KERALA AROICON 2027 · ORGANIZER SPACE</div><h1>Conference at a glance</h1><p>Registrations, hospitality & room-sharing coordination</p></div><div class=\"actions\"><button id=\"refresh\">↻ Refresh</button><button class=\"primary\" id=\"exportAll\">↓ Export registrations</button></div></header>\n<div class=\"notice\"><strong>TEST REGISTRATIONS</strong><span>Payment collection is paused. Reported fees are estimates, not verified revenue.</span></div>\n<div id=\"error\" role=\"alert\" class=\"error hidden\"></div><p id=\"loading\" role=\"status\">Connecting to the private registration sheet…</p>\n<section class=\"metrics\" aria-label=\"Registration summary\">\n<div class=\"card metric\"><h3>Total registrations</h3><strong id=\"total\">—</strong><span>Registered delegates</span></div>\n<div class=\"card metric\"><h3>Saturday included</h3><strong id=\"saturday\">—</strong><span>Delegates staying Saturday night</span></div>\n<div class=\"card metric\"><h3>Friday + Saturday</h3><strong id=\"friday\">—</strong><span>Friday added · ₹1,750 / person</span></div>\n<div class=\"card metric\"><h3>Friday partner pending</h3><strong id=\"pending\">—</strong><span>Delegates needing a follow-up</span></div>\n<div class=\"card metric\"><h3>Reported fees</h3><strong id=\"fees\">—</strong><span>Payments collected: ₹0 · Test mode</span></div></section>\n<section class=\"grid\"><div class=\"card\"><h2>Food preferences</h2><p>Lunch & banquet · registered delegates</p><div id=\"foodChart\" class=\"chart\"></div></div><div class=\"card\"><h2>Accommodation</h2><p>Click a category to open its delegate list</p><div id=\"stayChart\" class=\"chart\"></div></div><div class=\"card\"><h2>Registration categories</h2><p>Delegate mix across the conference</p><div id=\"categoryChart\" class=\"chart\"></div></div></section>\n<section class=\"card wide followup\"><div class=\"section-head\"><div><h2>Friday room coordination <span class=\"badge\">ACTION LIST</span></h2><p>Friday + Saturday delegates without a partner. Contact them or assign a compatible available partner.</p></div><button id=\"exportPending\">↓ Export follow-up list</button></div>\n<div class=\"hotel\"><button data-filter=\"stay:fri_and_sat\"><strong id=\"friPeople\">—</strong><span>Friday guests age 10+*</span></button><button data-filter=\"stay:sat_only\"><strong id=\"satOnly\">—</strong><span>Saturday-only delegates</span></button><button data-filter=\"paired\"><strong id=\"pairCount\">—</strong><span>Confirmed delegate pairs</span></button><button data-filter=\"pending\"><strong id=\"pendingCount\">—</strong><span>Friday partners not selected</span></button></div>\n<p class=\"count\">*Includes accompanying guests age 10+. Under-10 guests are counted separately; pairings are between registered delegates.</p>\n<div class=\"scroll\"><table><thead><tr><th>Delegate / institution</th><th>Contact directly</th><th>Accompanying guests</th><th>Partner assignment</th></tr></thead><tbody id=\"pendingRows\"></tbody></table></div></section>\n<section class=\"card wide\" id=\"lists\"><div class=\"section-head\"><div><h2 id=\"listTitle\">All registrations</h2><p>Open any list below, search by name or institution, then export the filtered result.</p></div><button id=\"exportFiltered\">↓ Export this list</button></div>\n<div class=\"toolbar\"><button data-filter=\"all\">All</button><button data-filter=\"stay:none\">No accommodation</button><button data-filter=\"stay:fri_and_sat\">Friday + Saturday</button><button data-filter=\"stay:sat_only\">Saturday only</button><button data-filter=\"food:Vegetarian\">Vegetarian</button><button data-filter=\"food:Non-Vegetarian\">Non-vegetarian</button><button data-filter=\"paired\">Room pairings</button></div>\n<div class=\"toolbar\"><input id=\"search\" type=\"search\" aria-label=\"Search registrations\" placeholder=\"Search name, institution, email or registration ID…\"><span class=\"count\" id=\"resultCount\"></span></div>\n<div class=\"scroll\"><table><thead><tr><th>Delegate</th><th>Category</th><th>Food</th><th>Accommodation</th><th>Room partner</th><th>Reported fee</th><th>Details</th></tr></thead><tbody id=\"rows\"></tbody></table></div></section>\n<section class=\"bottom\"><div class=\"card\"><h2>Registration activity</h2><p>Most recent 7 days · India time</p><div id=\"trend\"></div></div><div class=\"card\"><h2>Hospitality planning</h2><p>Accompanying people & follow-ups</p><dl id=\"hospitality\"></dl><p class=\"count\">Food charts cover delegates only. Individual meal choices for accompanying guests are not collected by the registration form.</p></div></section>\n<footer><span>CAN Kerala AROICON 2027 · Private organizer dashboard</span><span id=\"updated\">Awaiting data</span></footer>\n</main><dialog id=\"detail\"><div class=\"section-head\"><h2>Registration details</h2><button data-close=\"detail\">Close</button></div><dl id=\"detailFields\"></dl></dialog>\n<dialog id=\"assign\"><h2>Assign room-sharing partner</h2><p id=\"assignName\"></p><label for=\"partner\">Available delegates with matching stay dates</label><select id=\"partner\"></select><p>Assignment reserves both delegates together. Contact them to confirm suitability before saving.</p><p id=\"assignError\" role=\"alert\"></p><div class=\"actions\" style=\"margin-top:20px\"><button class=\"primary\" id=\"saveAssignment\">Confirm assignment</button><button data-close=\"assign\">Cancel</button></div></dialog>\n<dialog id=\"exportDialog\"><div class=\"section-head\"><h2>CSV export ready</h2><button data-close=\"exportDialog\">Close</button></div><p>Your selected list is ready. If the download does not start, use the link below or copy the CSV text.</p><p><a id=\"csvLink\" target=\"_blank\" rel=\"noopener\">Download CSV</a></p><textarea id=\"csvText\" readonly aria-label=\"CSV export text\" style=\"width:100%;min-height:180px;margin-top:15px;font:12px monospace\"></textarea></dialog>\n<script>\nconst $=id=>document.getElementById(id), esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));\nconst colors=['#54766a','#c29c58','#7799b3','#b77d70','#a59bba'];\nconst stays={none:'No accommodation',sat_only:'Saturday only',fri_and_sat:'Friday + Saturday'};\nconst categories={pg_resident:'PG / Senior Resident',delegate:'Delegate / Faculty',accompanying:'Accompanying Guest',trade:'Trade Delegate'};\nconst money=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n||0);\nlet records=[],pairs=[],currentFilter='all',assignId='',loaded=false,inflight=false;\nconst partnerId=id=>{const p=pairs.find(p=>p.a===id||p.b===id);return p?(p.a===id?p.b:p.a):''};\nconst partnerOf=r=>records.find(x=>x.regId===partnerId(r.regId));\nconst food=r=>r.tailoredData?.mealPref||'Not specified';\nconst pending=()=>records.filter(r=>r.accommodation==='fri_and_sat'&&!partnerId(r.regId));\nconst num=n=>Number(n)||0;\nfunction chart(id,items){const total=items.reduce((n,x)=>n+x.count,0);let at=0;\n const gradient=items.map((x,i)=>{const start=at;at+=total?x.count/total*100:0;return `${colors[i%colors.length]} ${start}% ${at}%`}).join(',');\n $(id).innerHTML=`<div class=\"ring\" role=\"img\" aria-label=\"${esc(items.map(x=>x.label+': '+x.count).join(', '))}\" style=\"background:${total?'conic-gradient('+gradient+')':'#edf0eb'}\"><div><strong>${total}</strong><small>${total?'DELEGATES':'NO DATA YET'}</small></div></div><div class=\"legend\">${items.map((x,i)=>`<button data-filter=\"${esc(x.filter)}\"><i class=\"dot\" style=\"background:${colors[i%colors.length]}\"></i><span>${esc(x.label)}<br><small>${total?Math.round(x.count/total*100):0}%</small></span><b>${x.count}</b></button>`).join('')}</div>`;\n}\nfunction contact(r){const b=r.basicData||{},phone=String(b.phone||'');return `${phone?`<a href=\"tel:${esc(phone.replace(/[^+\\d]/g,''))}\">${esc(phone)}</a>`:'No phone provided'}<br>${b.email?`<a href=\"mailto:${esc(b.email)}\">${esc(b.email)}</a>`:''}`;}\nfunction render(data){records=data.records||[];pairs=data.pairs||[];loaded=true;\n $('total').textContent=records.length;const sat=records.filter(r=>['sat_only','fri_and_sat'].includes(r.accommodation)),fri=records.filter(r=>r.accommodation==='fri_and_sat');\n $('saturday').textContent=sat.length;$('friday').textContent=fri.length;$('pending').textContent=pending().length;$('fees').textContent=money(records.reduce((n,r)=>n+num(r.totalFee),0));\n $('friPeople').textContent=fri.reduce((n,r)=>n+1+num(r.accompAbove10),0);$('satOnly').textContent=records.filter(r=>r.accommodation==='sat_only').length;$('pairCount').textContent=pairs.length;$('pendingCount').textContent=pending().length;\n chart('foodChart',['Vegetarian','Non-Vegetarian','Not specified'].map(label=>({label,count:records.filter(r=>food(r)===label).length,filter:'food:'+label})));\n chart('stayChart',Object.entries(stays).map(([key,label])=>({label,count:records.filter(r=>r.accommodation===key).length,filter:'stay:'+key})));\n const catKeys=[...new Set([...Object.keys(categories),...records.map(r=>r.category)])];chart('categoryChart',catKeys.map(key=>({label:categories[key]||key||'Not specified',count:records.filter(r=>r.category===key).length,filter:'category:'+key})));\n $('pendingRows').innerHTML=pending().map(r=>`<tr><td><b>${esc(r.basicData.fullName)}</b><small>${esc(r.basicData.college||'Institution not specified')}</small></td><td>${contact(r)}</td><td>${num(r.accompAbove10)} age 10+ · ${num(r.accompBelow10)} under 10</td><td><button data-assign=\"${esc(r.regId)}\">Assign partner</button></td></tr>`).join('')||'<tr><td colspan=\"4\" class=\"empty\">No Friday delegates awaiting partner selection.</td></tr>';\n $('hospitality').innerHTML=[['Accompanying age 10+',records.reduce((n,r)=>n+num(r.accompAbove10),0)],['Children under 10',records.reduce((n,r)=>n+num(r.accompBelow10),0)],['Saturday guests age 10+',sat.reduce((n,r)=>n+1+num(r.accompAbove10),0)],['Friday children under 10',fri.reduce((n,r)=>n+num(r.accompBelow10),0)],['Saturday-only unpaired',records.filter(r=>r.accommodation==='sat_only'&&!partnerId(r.regId)).length],['Travel assistance requested',records.filter(r=>r.tailoredData?.travelMode&&r.tailoredData.travelMode!=='None').length]].map(([k,v])=>`<dt>${k}</dt><dd><b>${v}</b></dd>`).join('');\n const days=[];for(let i=6;i>=0;i--){const date=new Date(Date.now()-i*86400000).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});days.push({date,count:records.filter(r=>new Date(r.receivedAt).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'})===date).length});}const max=Math.max(1,...days.map(d=>d.count));$('trend').innerHTML=days.map(d=>`<div class=\"bar\"><span>${esc(d.date)}</span><i style=\"width:${d.count/max*65}%\"></i><b>${d.count}</b></div>`).join('');\n $('updated').textContent='Updated '+new Date(data.updatedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})+' IST · refreshes every minute';$('loading').classList.add('hidden');renderList();\n}\nfunction filtered(){const q=$('search').value.trim().toLowerCase();return records.filter(r=>{const [kind,...v]=currentFilter.split(':'),val=v.join(':');return (kind==='all'||kind==='pending'&&pending().some(x=>x.regId===r.regId)||kind==='paired'&&!!partnerId(r.regId)||kind==='stay'&&r.accommodation===val||kind==='food'&&food(r)===val||kind==='category'&&r.category===val)&&(!q||[r.regId,r.basicData.fullName,r.basicData.email,r.basicData.college].join(' ').toLowerCase().includes(q));});}\nfunction renderList(){const rows=filtered(),[kind,...v]=currentFilter.split(':'),val=v.join(':');$('listTitle').textContent=kind==='all'?'All registrations':kind==='pending'?'Friday partner follow-up':kind==='paired'?'Room pairings':kind==='stay'?stays[val]:kind==='category'?categories[val]||val:val;\n $('resultCount').textContent=rows.length+' delegates';document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('tab-active',b.dataset.filter===currentFilter));\n $('rows').innerHTML=rows.map(r=>`<tr><td><b>${esc(r.basicData.fullName)}</b><small>${esc(r.basicData.college||'Institution not specified')}</small></td><td>${esc(categories[r.category]||r.category)}</td><td>${esc(food(r))}</td><td>${esc(stays[r.accommodation]||'Not specified')}</td><td>${esc(partnerOf(r)?.basicData.fullName || (r.accommodation==='none'?'Not applicable':'Not selected'))}</td><td>${money(r.totalFee)}</td><td><button data-detail=\"${esc(r.regId)}\">View</button></td></tr>`).join('')||'<tr><td colspan=\"7\" class=\"empty\">No registrations match this list.</td></tr>';\n}\nfunction fail(error){$('error').textContent=error?.message||'Could not load the registration sheet. Please refresh.';$('error').classList.remove('hidden');$('loading').classList.add('hidden');inflight=false;$('refresh').disabled=false;}\nfunction refresh(){if(inflight||$('assign').open)return;inflight=true;$('refresh').disabled=true;$('error').classList.add('hidden');google.script.run.withSuccessHandler(data=>{inflight=false;$('refresh').disabled=false;render(data)}).withFailureHandler(fail).getDashboardData();}\nfunction csv(rows,name){if(!loaded)return;const headers=['Registration ID','Name','Email','Phone','Institution','Category','Meal preference','Accommodation','Partner','Accompanying 10+','Accompanying under 10','Reported fee INR','Payment status'];const cell=v=>'\"'+String(v??'').replace(/^[\\s]*[=+@-]/,\"'$&\").replace(/\"/g,'\"\"')+'\"';const out=[headers,...rows.map(r=>[r.regId,r.basicData.fullName,r.basicData.email,r.basicData.phone,r.basicData.college,categories[r.category]||r.category,food(r),stays[r.accommodation],partnerOf(r)?.basicData.fullName||'',num(r.accompAbove10),num(r.accompBelow10),r.totalFee,'TEST - UNVERIFIED'])].map(row=>row.map(cell).join(',')).join('\\r\\n');const url=URL.createObjectURL(new Blob(['\\ufeff'+out],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');const link=$('csvLink');if(link.href.startsWith('blob:'))URL.revokeObjectURL(link.href);link.href=url;link.download=name+'.csv';$('csvText').value=out;$('exportDialog').showModal();link.click();}\ndocument.addEventListener('click',e=>{const filter=e.target.closest('[data-filter]');if(filter){currentFilter=filter.dataset.filter;$('search').value='';renderList();$('lists').scrollIntoView({behavior:'smooth'});}const close=e.target.closest('[data-close]');if(close)$(close.dataset.close).close();const d=e.target.closest('[data-detail]');if(d){const r=records.find(r=>r.regId===d.dataset.detail),b=r.basicData,t=r.tailoredData||{};$('detailFields').innerHTML=[['Name',b.fullName],['Registration ID',r.regId],['Email',b.email],['Phone',b.phone],['Institution',b.college],['Designation',b.collegeRole],['State / District',[b.state,b.district].filter(Boolean).join(' / ')],['Accommodation',stays[r.accommodation]],['Food',food(r)],['Partner',partnerOf(r)?.basicData.fullName||'Not selected'],['Travel',t.travelMode||'None'],['Travel notes',t.travelNotes||'—'],['Reported fee',money(r.totalFee)],['Payment','TEST · No payment collected']].map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v||'—')}</dd>`).join('');$('detail').showModal();}const a=e.target.closest('[data-assign]');if(a){assignId=a.dataset.assign;const r=records.find(r=>r.regId===assignId),available=records.filter(x=>x.regId!==assignId&&x.accommodation===r.accommodation&&!partnerId(x.regId));$('assignName').textContent='For '+r.basicData.fullName;$('partner').innerHTML='<option value=\"\">Select a partner…</option>'+available.map(x=>`<option value=\"${esc(x.regId)}\">${esc(x.basicData.fullName)} — ${esc(x.basicData.college||'')}</option>`).join('');$('assignError').textContent=available.length?'':'No matching unpaired delegates are available yet.';$('saveAssignment').disabled=!available.length;$('assign').showModal();}});\n$('saveAssignment').onclick=()=>{const b=$('partner').value;if(!b){$('assignError').textContent='Choose a partner first.';return;}$('saveAssignment').disabled=true;google.script.run.withSuccessHandler(data=>{$('assign').close();$('saveAssignment').disabled=false;render(data)}).withFailureHandler(e=>{$('assignError').textContent=e.message;$('saveAssignment').disabled=false}).assignDashboardRoom(assignId,b);};\n$('search').oninput=renderList;$('refresh').onclick=refresh;$('exportAll').onclick=()=>csv(records,'aroicon-registrations');$('exportFiltered').onclick=()=>csv(filtered(),'aroicon-filtered-list');$('exportPending').onclick=()=>csv(pending(),'aroicon-friday-partner-followup');\nrefresh();setInterval(refresh,60000);\n</script></body></html>\n";
