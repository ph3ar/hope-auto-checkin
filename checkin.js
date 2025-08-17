/**
 * HOPE Auto-Checkin Script (Smart volunteer shift assistant)
 *
 * Feature toggles — enable/disable as desired:
 * features.autoSchedule  = periodic loop (every scheduleInterval minutes)
 * features.slashCommands = listen for /oncall /off commands in Matrix
 * features.logging       = CSV + Google Sheets logging of checkins
 * features.widget        = expose widgetHook() for Scriptable home-screen
 *
 * UNLICENSED — private use only
 */

const CONFIG = {
  baseUrl: "https://volunteers.hope.net",
  matrixServer: "https://matrix.hope.net",
  displayName: "Barbine / BigNerdLoLz / PH3AR",

  preferKeychain: true,   // true: Keychain → false: .env/ENV fallback
  scheduleInterval: 15,   // minutes

  features: {
    autoSchedule: true,
    slashCommands: true,
    logging: true,
    widget: true,
  },

  rooms: {
    speaker: "A/V",
    infodesk: "Info Desk Team",
    other: "General (Volunteers)"
  },

  mentionRegex: /@kusanagi/i,
  maxPages: 10,
};


/* ==============================================================
 * Secret Handling
 * ============================================================== */
function loadSecret(k) {
  if (CONFIG.preferKeychain && typeof Keychain !== 'undefined') {
    try { return Keychain.get(k) } catch {}
  }
  if (typeof process !== "undefined") {
    return process.env[k] || "";
  }
  return "";
}
const secrets = {
  username:   loadSecret("ENGELSYSTEM_USER"),
  password:   loadSecret("ENGELSYSTEM_PASS"),
  apiKey:     loadSecret("ENGELSYSTEM_APIKEY"),
  matrixUser: loadSecret("MATRIX_USER"),
  matrixPass: loadSecret("MATRIX_PASS"),
};

/* ==============================================================
 * Helpers & UX
 * ============================================================== */
function fmt(d) {return d.toLocaleString([], {month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});}
function vibrate(msg="") { try {let n=new Notification();n.title=msg;n.body=msg;n.sound="default";n.schedule();}catch{} }

/* ==============================================================
 * Engelsystem loader
 * ============================================================== */
async function engelsystemLogin(){
  const r=new Request(`${CONFIG.baseUrl}/login`);
  r.method="POST";
  r.headers={"Content-Type":"application/x-www-form-urlencoded"};
  r.body=`username=${encodeURIComponent(secrets.username)}&password=${encodeURIComponent(secrets.password)}`;
  await r.loadString();
  return r.response.headers["Set-Cookie"];
}
async function fetchPage(p,c){ const u=`${CONFIG.baseUrl}/shifts-json-export?page=${p}&key=${secrets.apiKey}`;
  const r=new Request(u); if(c)r.headers={Cookie:c}; return await r.loadJSON(); }
async function loadShifts(){
  try{return await fetchPage(1);}catch{
    const ck=await engelsystemLogin();let out=[];
    for(let p=1;p<=CONFIG.maxPages;p++){
      try{ const j=await fetchPage(p,ck); if(!j.length)break; out=out.concat(j); }catch{break;}
    }
    return out;
  }
}

/* ==============================================================
 * Matrix API
 * ============================================================== */
async function matrixLogin(){
  const cache="matrix_access_token_v2";
  if(CONFIG.preferKeychain && typeof Keychain!=="undefined"){
    try{const t=Keychain.get(cache); if(t)return t;} catch{}
  }
  const r=new Request(`${CONFIG.matrixServer}/_matrix/client/v3/login`);
  r.method="POST";r.headers={"Content-Type":"application/json"};
  r.body=JSON.stringify({type:"m.login.password",identifier:{type:"m.id.user",user:secrets.matrixUser},password:secrets.matrixPass});
  const res=await r.loadJSON();
  if(CONFIG.preferKeychain && typeof Keychain!=="undefined"){Keychain.set(cache,res.access_token);}
  return res.access_token;
}
async function findRoom(tok,nameExact){
  const s=await new Request(`${CONFIG.matrixServer}/_matrix/client/v3/sync?access_token=${encodeURIComponent(tok)}`).loadJSON();
  if(s.rooms?.join){
    for(const[rid]of Object.entries(s.rooms.join)){
      const nm=await new Request(`${CONFIG.matrixServer}/_matrix/client/v3/rooms/${encodeURIComponent(rid)}/state/m.room.name?access_token=${encodeURIComponent(tok)}`).loadJSON().catch(()=>null);
      if(nm?.name?.toLowerCase()===nameExact.toLowerCase())return rid;
    }
  }
  return null;
}
async function sendMatrix(room,msg){
  const t=await matrixLogin();const rid=await findRoom(t,room);
  if(!rid){console.error("No such room:",room);return;}
  const req=new Request(`${CONFIG.matrixServer}/_matrix/client/v3/rooms/${encodeURIComponent(rid)}/send/m.room.message/${Date.now()}?access_token=${encodeURIComponent(t)}`);
  req.method="PUT";req.headers={"Content-Type":"application/json"};req.body=JSON.stringify({msgtype:"m.text",body:msg});
  await req.loadJSON(); vibrate("Check-In Posted");
}

/* ==============================================================
 * Logging
 * ============================================================== */
async function logCheckin(row){
  if(!CONFIG.features.logging) return;
  // 1. local CSV
  try{
    const path="checkins.csv";
    const f=FileManager.iCloud(); let csv="";
    if(f.fileExists(path)){ csv = f.readString(path); }
    csv += `${row.ts},${row.room},${row.msg}\n`;
    f.writeString(path,csv);
  }catch(e){ console.error("CSV log error:",e); }
  // 2. Google Sheets (stubbed):
  try{
    // TODO implement if you want OAuth and sheetID
  }catch{}
}

/* ==============================================================
 * Slash Commands Monitor
 * ============================================================== */
async function slashCommandPoll(){
  const tok=await matrixLogin();
  const filter={room:{timeline:{limit:20,types:["m.room.message"]}}};
  const s=await new Request(`${CONFIG.matrixServer}/_matrix/client/v3/sync?access_token=${encodeURIComponent(tok)}&filter=${encodeURIComponent(JSON.stringify(filter))}`).loadJSON();
  if(s.rooms?.join){
    for(const[,d]of Object.entries(s.rooms.join)){
      for(const e of d.timeline?.events||[]){
        const b=e.content?.body||"";
        if(b.match(/^\/oncall\b/i)){ CONFIG.displayName+=" (On-Call)"; }
        if(b.match(/^\/off\b/i)){ CONFIG.displayName=CONFIG.displayName.replace(/\s*\(On-Call\)$/,""); }
      }
    }
  }
}

/* ==============================================================
 * WIDGET HOOK
 * ============================================================== */
async function widgetHook(){
  if(!CONFIG.features.widget) return;
  const w=new ListWidget();
  const shifts=(await loadShifts()).map(x=>({start:new Date(x.start_date),type:x.shifttype_name,loc:x.Name}));
  if(shifts.length){
    const n=new Date();const nxt=shifts.find(s=>s.start>n);
    w.addText("Next Shift:");
    w.addText(`${fmt(nxt.start)} — ${nxt.type}`).font=Font.boldSystemFont(14);
    w.addText(nxt.loc).textColor=new Color("#888");
  }else{ w.addText("No shifts upcoming"); }
  Script.setWidget(w);
  Script.complete();
}

/* ==============================================================
 * MAIN
 * ============================================================== */
async function runOnce(){
  const raw=await loadShifts();
  const now=new Date();
  const shifts=raw.map(x=>({id:x.SID,type:x.shifttype_name,loc:x.Name,start:new Date(x.start_date),end:new Date(x.end_date)}))
        .filter(x=>x.end>now).sort((a,b)=>a.start-b.start);

  // Slash command monitor
  if(CONFIG.features.slashCommands){ await slashCommandPoll(); }

  // Auto-prompt <5min
  const soon=shifts.find(s=>((s.start-now)/60000)<5 && ((s.start-now)/60000)>-2);
  if(soon){
    const room=(soon.type.toLowerCase().includes("speaker"))?CONFIG.rooms.speaker:
               (soon.type.toLowerCase().includes("infodesk"))?CONFIG.rooms.infodesk:CONFIG.rooms.other;
    const msg=`FYI @kusanagi - checked in to ${soon.type} at ${fmt(soon.start)} in ${soon.loc} - ${CONFIG.displayName}`;
    let ok=true;
    try{
      const a=new Alert();a.title="Auto Check-in?";a.message=msg;a.addAction("Send");a.addCancelAction("Skip");
      ok=(await a.presentAlert()===0);
    }catch{}
    if(ok){
      await sendMatrix(room,msg);
      await logCheckin({ts:now.toISOString(),room,msg});
    }
  }

  // allow Scriptable flow w/ widget
  if(CONFIG.features.widget && typeof Scriptable !== "undefined"){
    await widgetHook();
  }
}

async function main(){
  await runOnce();
  if(CONFIG.features.autoSchedule){
    console.log(`Auto schedule active — rerunning in ${CONFIG.scheduleInterval} mins`);
    setTimeout(main, CONFIG.scheduleInterval*60*1000);
  }
}

(async()=>{try{ await main(); }catch(e){console.error(e);}})();
