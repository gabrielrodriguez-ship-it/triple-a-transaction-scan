// Triple-A Scan: same-origin read-only lookup interface.
const $ = id => document.getElementById(id);

function esc(s){ return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function nowStamp(){ return new Date().toISOString().replace('T',' ').slice(0,19)+' UTC'; }
let _toastTimer;
function toast(msg){ const el=$('toast'); el.textContent=msg; el.style.display='block'; clearTimeout(_toastTimer); _toastTimer=setTimeout(()=>el.style.display='none',2000); }
function netDotClass(chain){ return 'net-'+(chain||'evm'); }
function safeUrl(value){ try { const u=new URL(value); return u.protocol==='https:' && ['etherscan.io','polygonscan.com','arbiscan.io','mempool.space','tronscan.org','solscan.io'].includes(u.hostname) && !u.username && !u.password && !u.port ? u.href : ''; } catch { return ''; } }
const storage = {
 getItem(key){try{return localStorage.getItem(key);}catch{return null;}},
 setItem(key,value){try{localStorage.setItem(key,value);}catch{}},
 removeItem(key){try{localStorage.removeItem(key);}catch{}}
};
function readHistory(key){try {const x=JSON.parse(storage.getItem(key)||'[]'); return Array.isArray(x)?x.filter(v=>v&&typeof v.input==='string').slice(0,30):[];}catch{return [];}}
function failedResult(raw,message){ return {resolvedInput:raw,outputs:[],onePage:{summaryState:'FETCH_FAILED',rawId:raw,fields:[],fetchError:message},agentHint:message}; }
async function buildLookupResult(rawInput,forced='auto'){
 const input=(rawInput||'').trim();
 if(!input)return {resolvedInput:'',outputs:[],onePage:{summaryState:'EMPTY',fields:[]}};
 try {
  const response=await fetch('/api/lookup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({input,network:forced}),signal:AbortSignal.timeout(25000)});
  if(response.status===429) return failedResult(input,'Too many lookups. Wait a minute and retry.');
  let data;try{data=await response.json();}catch{return failedResult(input,'Scanner backend unavailable. Retry shortly.');}
  if(!response.ok) return failedResult(input,data.error||'Scanner temporarily unavailable. Retry shortly.');
  if(!data.onePage || !Array.isArray(data.outputs)) return failedResult(input,'Scanner returned an invalid response. Retry shortly.');
  return data;
 }catch{return failedResult(input,'The lookup timed out or the scanner is unreachable. Retry shortly.');}
}
/* ─── SRCDOC RENDERER ───────────────────────────────────────── */
function previewTheme(){
  const dark = document.documentElement.getAttribute("data-theme")!=="light";
  return {
    bg:    dark?"#090d14":"#f3f5f9",
    fg:    dark?"#dde6f5":"#0f1724",
    muted: dark?"#8fa3be":"#4a5568",
    bdr:   dark?"#1e2d46":"#dde3ed",
    card:  dark?"#111827":"#ffffff",
    card2: dark?"#0f1520":"#f8fafd",
    ok:    dark?"#3ecf8e":"#059669",
    okBg:  dark?"rgba(62,207,142,.1)":"rgba(5,150,105,.08)",
    bad:   dark?"#f87171":"#dc2626",
    badBg: dark?"rgba(248,113,113,.1)":"rgba(220,38,38,.08)",
    warn:  dark?"#f59e0b":"#d97706",
    warnBg:dark?"rgba(245,158,11,.1)":"rgba(217,119,6,.08)",
    accent:"#ff6a00",
    info:  dark?"#60a5fa":"#3b82f6",
    infoBg:dark?"rgba(96,165,250,.1)":"rgba(59,130,246,.08)",
    mono:  "'JetBrains Mono',ui-monospace,monospace",
  };
}

// Build a polished fallback card when preview data is not available or embedding is blocked
function buildFallbackSrcdoc(item){
  const t = previewTheme();
  const networkColors = {tron:"#ef0027",ethereum:"#627eea",polygon:"#8247e5",arbitrum:"#28a0f0",bitcoin:"#f7931a",solana:"#9945ff",lightning:"#f89c27"};
  const netColor = networkColors[item.chainId] || t.info;
  const shortHash = item.rawId ? (item.rawId.length > 24 ? item.rawId.slice(0,12)+"…"+item.rawId.slice(-8) : item.rawId) : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'DM Sans',ui-sans-serif,sans-serif;font-size:13px;background:${t.bg};color:${t.fg};display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;}
    .card{background:${t.card};border:1px solid ${t.bdr};border-radius:12px;padding:28px 24px;max-width:440px;width:100%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.25);}
    .icon{font-size:32px;margin-bottom:14px;opacity:.8;}
    .title{font-size:15px;font-weight:700;margin-bottom:6px;}
    .sub{font-size:12.5px;color:${t.muted};margin-bottom:20px;line-height:1.55;}
    .netBadge{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;border:1px solid ${netColor}44;background:${netColor}18;color:${netColor};font-size:11.5px;font-weight:600;margin-bottom:16px;}
    .dot{width:7px;height:7px;border-radius:50%;background:${netColor};flex-shrink:0;}
    .meta{background:${t.card2};border:1px solid ${t.bdr};border-radius:8px;padding:12px 14px;margin-bottom:20px;text-align:left;}
    .metaRow{display:flex;gap:10px;align-items:flex-start;padding:4px 0;border-bottom:1px solid ${t.bdr};}
    .metaRow:last-child{border-bottom:none;}
    .metaKey{color:${t.muted};font-size:11.5px;font-weight:500;min-width:80px;flex-shrink:0;}
    .metaVal{font-family:${t.mono};font-size:11px;word-break:break-all;color:${t.fg};}
    .actions{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;}
    .btn{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:7px;border:1px solid ${t.bdr};background:${t.card};color:${t.fg};font-size:12.5px;font-weight:500;cursor:pointer;text-decoration:none;font-family:'DM Sans',ui-sans-serif,sans-serif;}
    .btn-primary{background:linear-gradient(90deg,#ff3b30,#ff6a00,#ff4fa3);border-color:transparent;color:#fff;}
    .verifiedBadge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:${t.okBg};border:1px solid ${t.ok}44;color:${t.ok};font-size:11px;font-weight:600;margin-top:10px;}
  </style></head><body>
  <div class="card">
    <div class="icon">🔍</div>
    <div class="netBadge"><span class="dot"></span>${esc(item.network||item.chainId||"")}</div>
    <div class="title">Open ${esc(item.shortLabel||"Explorer")} for full details</div>
    <div class="sub">Direct embedding of ${esc(item.shortLabel||"this explorer")} is restricted by its security policy. View the complete transaction page in a new tab.</div>
    <div class="meta">
      ${item.rawId ? `<div class="metaRow"><span class="metaKey">Hash / ID</span><span class="metaVal">${esc(item.rawId)}</span></div>` : ""}
      <div class="metaRow"><span class="metaKey">Explorer</span><span class="metaVal">${esc(item.shortLabel||"")}</span></div>
      <div class="metaRow"><span class="metaKey">Network</span><span class="metaVal">${esc(item.network||"")}</span></div>
    </div>
    <div class="actions">
      <a class="btn btn-primary" href="${esc(item.url)}" target="_blank" rel="noreferrer">↗ Open ${esc(item.shortLabel||"Explorer")}</a>
    </div>
    <div><span class="verifiedBadge">Explorer link</span></div>
  </div>
  </body></html>`;
}

function statusBadge(s,t){
  if (!s||s==="N/A") return `<span style="color:${t.warn}">Not available</span>`;
  if (s==="Confirmed"||s==="Unconfirmed"&&false) return `<span style="display:inline-block;padding:1px 10px;border-radius:999px;background:${t.okBg};color:${t.ok};border:1px solid ${t.ok}33;font-size:11px;font-weight:600;">✓ ${esc(s)}</span>`;
  if (s==="Confirmed") return `<span style="display:inline-block;padding:1px 10px;border-radius:999px;background:${t.okBg};color:${t.ok};border:1px solid ${t.ok}33;font-size:11px;font-weight:600;">✓ Confirmed</span>`;
  if (s==="Failed")    return `<span style="display:inline-block;padding:1px 10px;border-radius:999px;background:${t.badBg};color:${t.bad};border:1px solid ${t.bad}33;font-size:11px;font-weight:600;">✗ Failed</span>`;
  if (s==="Unconfirmed") return `<span style="display:inline-block;padding:1px 10px;border-radius:999px;background:${t.warnBg};color:${t.warn};border:1px solid ${t.warn}33;font-size:11px;font-weight:600;">⏳ Unconfirmed</span>`;
  return `<span style="display:inline-block;padding:1px 10px;border-radius:999px;background:${t.warnBg};color:${t.warn};border:1px solid ${t.warn}33;font-size:11px;font-weight:600;">${esc(s)}</span>`;
}

function renderFieldValue(f, t){
  switch(f.valueType){
    case "status":    return statusBadge(f.value,t);
    case "hash":      return `<span style="font-family:${t.mono};font-size:11.5px;word-break:break-all;">${esc(f.value)}</span>`;
    case "address":   return `<span style="font-family:${t.mono};font-size:11.5px;word-break:break-all;">${esc(f.value)}</span>`;
    case "amount":    return `<span style="font-weight:700;color:${t.fg};">${esc(f.value)}</span>`;
    case "timestamp": return `<span style="color:${t.muted};font-size:12px;">${esc(f.value)}</span>`;
    default:          return esc(f.value);
  }
}

function buildPreviewSrcdoc(title, fields, explorerUrl, note, networkLabel){
  const t = previewTheme();
  const rows = fields.map(f=>`<tr><td class="k">${esc(f.key)}</td><td class="v">${renderFieldValue(f,t)}</td></tr>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;} body{margin:0;padding:18px 20px 24px;font-family:'DM Sans',ui-sans-serif,sans-serif;font-size:13px;background:${t.bg};color:${t.fg};line-height:1.5;}
    .hdr{margin-bottom:14px;} h2{margin:0 0 3px;font-size:15px;font-weight:700;} .sub{font-size:11.5px;color:${t.muted};}
    .badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px;}
    .badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;border:1px solid;font-size:11px;font-weight:600;white-space:nowrap;}
    .badge-ok{background:${t.okBg};color:${t.ok};border-color:${t.ok}44;}
    .badge-info{background:${t.infoBg};color:${t.info};border-color:${t.info}44;}
    .badge-muted{background:transparent;color:${t.muted};border-color:${t.bdr};}
    table{width:100%;border-collapse:collapse;} td{padding:7px 6px;border-bottom:1px solid ${t.bdr};vertical-align:top;}
    .k{color:${t.muted};width:140px;font-size:11.5px;font-weight:500;white-space:nowrap;padding-right:10px;}
    .v{word-break:break-all;}
    .footer{margin-top:16px;padding-top:12px;border-top:1px solid ${t.bdr};font-size:11.5px;color:${t.muted};display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
    .footer a{color:${t.accent};word-break:break-all;} .footer-right{margin-left:auto;}
    .note{margin-top:10px;padding:8px 10px;border-radius:6px;background:${t.warnBg};color:${t.warn};font-size:12px;border:1px solid ${t.warn}33;}
    .verifiedBadge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:${t.okBg};border:1px solid ${t.ok}44;color:${t.ok};font-size:11px;font-weight:600;}
  </style></head><body>
  <div class="hdr">
    <h2>${esc(title)}</h2>
    <div class="sub">Transaction Preview · Triple-A Scan</div>
    <div class="badges">
      <span class="badge badge-info">◈ Transaction details</span>
      ${networkLabel?`<span class="badge badge-muted">${esc(networkLabel)}</span>`:""}
      <span class="badge badge-ok">Provider summary</span>
    </div>
  </div>
  <table>${rows}</table>
  ${note?`<div class="note">ℹ ${esc(note)}</div>`:""}
  <div class="footer">
    <span>🔗 <a href="${esc(explorerUrl)}" target="_blank" rel="noreferrer">${esc(explorerUrl)}</a></span>
    <span class="footer-right"><span class="verifiedBadge">Explorer link</span></span>
  </div>
  </body></html>`;
}

function loadingSrcdoc(){
  const t = previewTheme();
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:${t.bg};color:${t.muted};font-family:ui-sans-serif,sans-serif;font-size:13px;}
    .sp{width:22px;height:22px;border:2.5px solid ${t.bdr};border-top-color:${t.accent};border-radius:50%;animation:s .75s linear infinite;margin-right:10px;}
    @keyframes s{to{transform:rotate(360deg)}}
  </style></head><body><div class="sp"></div>Loading explorer preview…</body></html>`;
}

// Build srcdoc from a pre-fetched onePage (SRCDOC_STATIC strategy)
function buildSrcdocFromOnePage(onePage, explorerUrl){
  if (!onePage || !onePage.fields || !onePage.fields.length) return buildFallbackSrcdoc({url:explorerUrl,rawId:onePage?.rawId||"",network:onePage?.network||"",chainId:onePage?.chainId||"",shortLabel:"Explorer"});
  const typeLabel = onePage.entityType==="address"?"Address":onePage.entityType==="invoice"?"Invoice":"Transaction";
  const title = `${onePage.network} ${typeLabel}`;
  return buildPreviewSrcdoc(title, onePage.fields, explorerUrl||onePage.explorerBest||"", onePage.agentNote, onePage.network);
}

/* ─── SHOW PREVIEW (strategy dispatch) ─────────────────────── */
let currentPreviewItem = null;

async function showPreview(item){
  if (!item||!item.supportsPreview) return;
  currentPreviewItem = item;

  $("viewerWrap").style.display = "block";
  if(!safeUrl(item.url))return;
  $("viewerUrl").textContent = item.url;

  const viewer = $("viewer");
  const badge = $("viewerBadge");

  switch(item.previewStrategy){
    case "SRCDOC_STATIC":
      // Data already fetched — instant render
      viewer.removeAttribute("src");
      if (item.summaryData) {
        badge.textContent = "◈ Transaction Preview";
        badge.className = "pill pill-info";
        viewer.srcdoc = buildSrcdocFromOnePage(item.summaryData, item.url);
      } else {
        badge.textContent = "◈ Transaction Preview";
        badge.className = "pill pill-warn";
        viewer.srcdoc = buildFallbackSrcdoc(item);
      }
      break;

    case "OPEN_ONLY":
      // No embed possible — show a polished fallback card
      viewer.removeAttribute("src");
      badge.textContent = "◈ Explorer only";
      badge.className = "pill pill-muted";
      viewer.srcdoc = buildFallbackSrcdoc(item);
      break;

    default:
      // Unknown strategy — safe fallback
      viewer.removeAttribute("src");
      badge.textContent = "◈ Transaction Preview";
      badge.className = "pill pill-muted";
      viewer.srcdoc = buildFallbackSrcdoc(item);
      break;
  }
}

function clearPreview(){
  currentPreviewItem = null;
  const viewer = $("viewer");
  viewer.removeAttribute("srcdoc");
  viewer.src = "about:blank";
  $("viewerWrap").style.display = "none";
}

/* ─── RENDER OUTPUTS ─────────────────────────────────────────── */
function renderOutputs(outputs){
  const container = $("outputList");
  const emptyState = $("outputListEmpty");
  const note = $("explorerNote");
  container.innerHTML = "";

  const valid = outputs.filter(o=>o!=null);

  if (!valid.length){
    emptyState.style.display = "flex";
    note.style.display = "none";
    return;
  }
  emptyState.style.display = "none";
  note.style.display = "block";

  // Sort: recommended first, then by priority
  const primary   = valid.filter(o=>!o.isSecondary);
  const secondary = valid.filter(o=>o.isSecondary);
  const sorted = [
    ...[...primary].sort((a,b)=>(a.isRecommended?-1:1)-(b.isRecommended?-1:1)||a.priority-b.priority),
    ...[...secondary].sort((a,b)=>a.priority-b.priority),
  ];

  function buildChip(item, isSecondaryChip){
    if (!item.summaryData || !safeUrl(item.url)) return null;

    const chip = document.createElement("div");
    chip.className = "outputChip"
      + (item.isRecommended?" is-recommended":"")
      + ((item.reasonDisabled&&!item.isRecommended)||isSecondaryChip?" is-disabled":"");

    const left = document.createElement("div");
    left.className = "chipLeft";

    const topRow = document.createElement("div");
    topRow.className = "chipTopRow";

    const dot = document.createElement("span");
    dot.className = `chipNetDot ${netDotClass(item.chainId)}`;
    topRow.appendChild(dot);

    const name = document.createElement("span");
    name.className = "chipName";
    name.textContent = item.label;
    topRow.appendChild(name);

    const badges = document.createElement("div");
    badges.className = "chipBadges";

    if (item.isRecommended){
      const b = document.createElement("span");
      b.className = "pill badge-rec";
      b.textContent = "★ Recommended";
      badges.appendChild(b);
    }
    const isDataVerified = item.resolvedChain && !item.reasonDisabled && item.summaryData?.summaryState === "RICH";
    if (isDataVerified){
      const b = document.createElement("span");
      b.className = "pill badge-verified";
      b.textContent = "Explorer link";
      badges.appendChild(b);
    }
    if (item.reasonDisabled && !isSecondaryChip){
      const b = document.createElement("span");
      b.className = "pill badge-unresolved";
      b.textContent = item.reasonDisabled==="chain_not_confirmed"?"Not on this chain":"Unavailable";
      badges.appendChild(b);
    }

    // Strategy label (no NATIVE_IFRAME)
    if (!item.reasonDisabled && !isSecondaryChip){
      let stratLabel, stratClass;
      if (item.previewStrategy==="SRCDOC_STATIC"||item.previewStrategy==="SRCDOC_LIVE"){
        stratLabel = "◈ Transaction preview"; stratClass = "badge-preview";
      } else if (item.previewStrategy==="OPEN_ONLY"){
        stratLabel = "↗ View in explorer"; stratClass = "badge-link";
      } else {
        stratLabel = "◈ Transaction preview"; stratClass = "badge-preview";
      }
      const b = document.createElement("span");
      b.className = `pill ${stratClass}`;
      b.textContent = stratLabel;
      badges.appendChild(b);
    }

    left.appendChild(topRow);
    if (badges.children.length) left.appendChild(badges);

    const sub = document.createElement("div");
    sub.className = "chipSubtext";
    sub.textContent = item.url;
    left.appendChild(sub);

    chip.appendChild(left);

    const actions = document.createElement("div");
    actions.className = "chipActions";

    if (item.supportsPreview && !item.reasonDisabled && !isSecondaryChip){
      const previewBtn = document.createElement("button");
      previewBtn.className = "btn btn-sm" + (item.isRecommended?" btn-primary":"");
      previewBtn.textContent = (item.previewStrategy==="SRCDOC_STATIC"||item.previewStrategy==="SRCDOC_LIVE") ? "Transaction preview" : "Preview";
      previewBtn.addEventListener("click", () => showPreview(item));
      actions.appendChild(previewBtn);
    }

    const copyBtn = document.createElement("button");
    copyBtn.className = "btn btn-sm";
    copyBtn.textContent = "Copy URL";
    copyBtn.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(item.url); toast("URL copied"); } catch { alert("Clipboard copy failed."); }
    });
    actions.appendChild(copyBtn);

    const tabBtn = document.createElement("button");
    tabBtn.className = "btn btn-sm";
    tabBtn.textContent = "↗";
    tabBtn.title = "Open in new tab";
    tabBtn.addEventListener("click", () => window.open(item.url,"_blank","noreferrer"));
    actions.appendChild(tabBtn);

    chip.appendChild(actions);
    return chip;
  }

  // Render primary chips
  for (const item of primary.sort((a,b)=>(a.isRecommended?-1:1)-(b.isRecommended?-1:1)||a.priority-b.priority)){
    const chip = buildChip(item, false);
    if (chip) container.appendChild(chip);
  }

  // Render secondary chains (collapsed by default)
  if (secondary.length > 0){
    const toggleEl = document.createElement("div");
    toggleEl.className = "secondaryChainToggle";
    toggleEl.innerHTML = `<span>▸</span><span>Other EVM chains (${secondary.length}) — not confirmed</span>`;
    container.appendChild(toggleEl);

    const secList = document.createElement("div");
    secList.className = "secondaryChains hidden";
    for (const item of secondary){
      const chip = buildChip(item, true);
      if (chip) secList.appendChild(chip);
    }
    container.appendChild(secList);

    toggleEl.addEventListener("click", () => {
      const hidden = secList.classList.toggle("hidden");
      toggleEl.querySelector("span").textContent = hidden ? "▸" : "▾";
    });
  }
}

/* ─── RENDER SUMMARY PANEL ──────────────────────────────────── */
function renderSummaryPanel(onePage){
  const body = $("summaryBody");
  body.innerHTML = "";

  if (!onePage || onePage.summaryState==="EMPTY"){
    body.innerHTML = `<div class="emptyState"><div class="emptyStateIcon">⬡</div><div class="emptyStateText">No lookup yet</div><div class="emptyStateSub">Paste a value above and click View transaction</div></div>`;
    return;
  }

  // State bar with quality badge
  const stateBar = document.createElement("div");
  const stateConfig = {
    RICH:            {cls:"state-rich",      icon:"✓", label:"Transaction details",        pillCls:"pill-ok"},
    LIMITED:         {cls:"state-limited",   icon:"ℹ", label:"Limited summary",     pillCls:"pill-warn"},
    FETCH_FAILED:    {cls:"state-failed",    icon:"✕", label:"Unable to load",      pillCls:"pill-danger"},
    NOT_FOUND:      {cls:"state-unresolved",icon:"?",label:"Not found",pillCls:"pill-warn"},
    CHAIN_UNRESOLVED:{cls:"state-unresolved",icon:"?", label:"Network not found",   pillCls:"pill-warn"},
    UNSUPPORTED:     {cls:"",               icon:"—", label:"Explorer only",        pillCls:"pill-muted"},
    EMPTY:           {cls:"",               icon:"—", label:"Empty",               pillCls:"pill-muted"},
  };
  const sc = stateConfig[onePage.summaryState]||stateConfig.UNSUPPORTED;
  stateBar.className = `summaryStateBar ${sc.cls}`;

  const qualityPill = document.createElement("span");
  qualityPill.className = `pill ${sc.pillCls}`;
  qualityPill.textContent = `${sc.icon} ${sc.label}`;
  stateBar.appendChild(qualityPill);

  // Verified chain badge
  if (onePage.resolvedChain && onePage.summaryState==="RICH"){
    const verifiedPill = document.createElement("span");
    verifiedPill.className = "pill pill-ok";
    verifiedPill.style.cssText = "margin-left:4px;";
    verifiedPill.textContent = `✓ ${onePage.resolvedChain}`;
    stateBar.appendChild(verifiedPill);
  }

  if (onePage.fetchedAt){
    const at = document.createElement("span");
    at.style.cssText = "font-size:11px;color:var(--fg3);margin-left:auto;";
    at.textContent = "Fetched " + (onePage.fetchedAt.slice(0,19).replace("T"," ")) + " UTC";
    stateBar.appendChild(at);
  }
  body.appendChild(stateBar);

  // Fetch error banner
  if (onePage.summaryState==="FETCH_FAILED" && onePage.fetchError){
    const errEl = document.createElement("div");
    errEl.className = "pill pill-danger";
    errEl.style.cssText = "display:block;margin-bottom:10px;border-radius:6px;padding:8px 10px;";
    errEl.textContent = onePage.fetchError;
    body.appendChild(errEl);
  }

  // KV table with copyable hashes
  if (onePage.fields && onePage.fields.length){
    const kv = document.createElement("div");
    kv.className = "kvTable";
    for (const f of onePage.fields){
      const k = document.createElement("div");
      k.className = "kvKey";
      k.textContent = f.key;
      const v = document.createElement("div");
      v.className = "kvVal";
      switch(f.valueType){
        case "hash":
        case "address": {
          // Copyable hash/address
          const wrapper = document.createElement("span");
          wrapper.className = "copyableHash mono";
          wrapper.title = "Click to copy";
          wrapper.innerHTML = `${esc(f.value)}<span class="copyIcon">⎘</span>`;
          wrapper.addEventListener("click", async () => {
            try { await navigator.clipboard.writeText(f.value); toast("Copied"); } catch {}
          });
          v.appendChild(wrapper);
          break;
        }
        case "status":  v.innerHTML = summaryStatusBadge(f.value); break;
        case "amount":  v.innerHTML = `<strong style="color:var(--fg);font-size:13.5px;">${esc(f.value)}</strong>`; break;
        default:        v.textContent = f.value; break;
      }
      kv.appendChild(k);
      kv.appendChild(v);
    }
    body.appendChild(kv);
  }

  // Agent note
  if (onePage.agentNote){
    const note = document.createElement("div");
    note.style.cssText = "margin-top:10px;padding:8px 10px;border-radius:6px;background:var(--warnBg);color:var(--warn);font-size:12px;border:1px solid var(--warnBorder);";
    note.textContent = "ℹ " + onePage.agentNote;
    body.appendChild(note);
  }

  // Verified explorer link
  if (onePage.explorerBest){
    const link = document.createElement("div");
    link.style.cssText = "margin-top:12px;padding:10px 12px;border-radius:8px;background:var(--card2);border:1px solid var(--border2);display:flex;align-items:center;gap:8px;flex-wrap:wrap;";
    link.innerHTML = `<span class="pill pill-ok" style="flex-shrink:0;">Explorer link</span><a href="${esc(onePage.explorerBest)}" target="_blank" rel="noreferrer" style="font-size:12px;word-break:break-all;flex:1;">${esc(onePage.explorerBest)}</a>`;
    body.appendChild(link);
  }
}

function summaryStatusBadge(s){
  if (!s||s==="N/A") return `<span class="pill pill-muted">N/A</span>`;
  if (s==="Confirmed")   return `<span class="pill pill-ok">✓ Confirmed</span>`;
  if (s==="Failed")      return `<span class="pill pill-danger">✕ Failed</span>`;
  if (s==="Unconfirmed") return `<span class="pill pill-warn">⏳ Unconfirmed</span>`;
  if (s==="Pending")     return `<span class="pill pill-warn">⏳ Pending</span>`;
  return `<span class="pill pill-warn">${esc(s)}</span>`;
}

/* ─── CLASSIFICATION BADGES ─────────────────────────────────── */
function renderClassificationBadges(result){
  const el = $("classificationBadges");
  el.innerHTML = "";
  if (!result.resolvedInput) return;

  const netBadge = document.createElement("span");
  netBadge.className = "pill pill-accent";
  netBadge.textContent = result.onePage.network || result.detectedNetwork || "Unknown";
  el.appendChild(netBadge);

  if (result.resolvedChain && ["RICH","LIMITED"].includes(result.onePage?.summaryState)){
    const cb = document.createElement("span");
    cb.className = "pill pill-ok";
    cb.textContent = "✓ " + result.resolvedChain;
    el.appendChild(cb);
  }

  const stateBadge = document.createElement("span");
  const sm = {NOT_FOUND:"pill-warn",RICH:"pill-ok",LIMITED:"pill-warn",FETCH_FAILED:"pill-danger",CHAIN_UNRESOLVED:"pill-warn",UNSUPPORTED:"pill-muted"};
  const sl = {RICH:"Transaction details",LIMITED:"Limited summary",FETCH_FAILED:"Unable to load",NOT_FOUND:"Not found",CHAIN_UNRESOLVED:"Check network",UNSUPPORTED:"Explorer only",EMPTY:""};
  stateBadge.className = "pill " + (sm[result.onePage.summaryState]||"pill-muted");
  stateBadge.textContent = sl[result.onePage.summaryState]||"";
  if (stateBadge.textContent) el.appendChild(stateBadge);

  $("agentHint").textContent = result.agentHint||"";
}

/* ─── SUPPORT SUMMARY TEXT ──────────────────────────────────── */
function makeSupportSummary(result){
  const op = result.onePage;
  if (!op || op.summaryState==="EMPTY") return "Transaction Summary\n\n(No data)";
  const lines = ["Transaction Summary",""];
  if (op.network) lines.push(`Network: ${op.network}`);
  if (op.resolvedChain) lines.push(`Resolved chain: ${op.resolvedChain}`);
  if (op.summaryState!=="RICH") lines.push(`Data: ${({LIMITED:"Partial summary",FETCH_FAILED:"Unable to load",CHAIN_UNRESOLVED:"Network not identified",UNSUPPORTED:"No summary",EMPTY:"No data"}[op.summaryState]||op.summaryState)}`);
  for (const f of (op.fields||[])){
    if (f.value) lines.push(`${f.key}: ${f.value}`);
  }
  if (op.agentNote) lines.push(`Note: ${op.agentNote}`);
  if (op.fetchError) lines.push(`Error: ${op.fetchError}`);
  lines.push(`Input: ${op.rawId||result.resolvedInput}`);
  if (op.explorerBest) lines.push(`\nOpen full page: ${op.explorerBest}`);
  const outs = (result.outputs||[]).filter(o=>!o.isSecondary && !o.reasonDisabled);
  if (outs.length){ lines.push(""); lines.push("Links:"); for(const o of outs) lines.push(`- ${o.label}: ${o.url}`); }
  return lines.join("\n");
}

/* ─── HISTORY ────────────────────────────────────────────────── */
const HIST_KEY = "ta_lookup_history_v8";
const HIST_LEGACY_KEY = "ta_lookup_history_v7";

function migrateHistory(){
  const legacy = readHistory(HIST_LEGACY_KEY);
  if (!legacy.length) return;
  const migrated = legacy.map(old=>({
    schemaVersion:2,
    when:old.when, whenDisplay:old.when,
    input:old.input||"",
    network:"", chainId:"", entityType:"tx", resolvedChain:null,
    displayLabel:old.summaryText||old.input||"",
    onePage:null, outputs:[], recommendedOutput: old.bestUrl?{typeId:"legacy_unknown",label:"History link",url:old.bestUrl,supportsPreview:false,supportsOpenInNewTab:true,previewStrategy:"OPEN_ONLY",isRecommended:true,rawId:""}:null,
  }));
  const existing = readHistory(HIST_KEY);
  storage.setItem(HIST_KEY, JSON.stringify([...migrated,...existing].slice(0,30)));
}

function saveHistory(result){
  if(result.onePage?.entityType==="invoice")return;
  if (!result.resolvedInput) return;
  const recommended = result.outputs.find(o=>o.isRecommended) || result.outputs[0] || null;
  const entry = {
    schemaVersion:2,
    when: new Date().toISOString(),
    whenDisplay: nowStamp(),
    input: result.resolvedInput,
    network: result.onePage?.network||"",
    chainId: result.onePage?.chainId||"",
    entityType: result.onePage?.entityType||"tx",
    resolvedChain: result.resolvedChain,
    displayLabel: result.summaryText||result.resolvedInput,
    onePage: result.onePage,
    outputs: result.outputs,
    recommendedOutput: recommended,
  };
  const existing = readHistory(HIST_KEY);
  storage.setItem(HIST_KEY, JSON.stringify([entry,...existing].slice(0,30)));
  renderHistory();
}

function renderHistory(){
  const items = readHistory(HIST_KEY);
  const body = $("historyBody");
  body.innerHTML = "";

  if (!items.length){
    body.innerHTML = `<div class="historyEmpty">No history yet — lookups will appear here</div>`;
    return;
  }

  items.forEach(it => {
    const entry = document.createElement("div");
    entry.className = "historyEntry";
    entry.title = it.input;

    const dot = document.createElement("span");
    dot.className = `historyNetDot ${netDotClass(it.chainId||"")}`;
    entry.appendChild(dot);

    const main = document.createElement("div");
    main.className = "historyEntryMain";

    const label = document.createElement("div");
    label.className = "historyEntryLabel";
    label.textContent = it.displayLabel || it.input;
    main.appendChild(label);

    const meta = document.createElement("div");
    meta.className = "historyEntryMeta";
    meta.textContent = it.input;
    main.appendChild(meta);

    entry.appendChild(main);

    const timeEl = document.createElement("div");
    timeEl.className = "historyEntryTime";
    // Relative-ish time
    const ago = it.when ? relTime(it.when) : (it.whenDisplay||"");
    timeEl.textContent = ago;
    entry.appendChild(timeEl);

    entry.addEventListener("click", () => restoreFromHistory(it));
    body.appendChild(entry);
  });
}

function relTime(iso){
  try{
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff/60000);
    if (m<1) return "just now";
    if (m<60) return `${m}m ago`;
    const h = Math.floor(m/60);
    if (h<24) return `${h}h ago`;
    return `${Math.floor(h/24)}d ago`;
  } catch{ return ""; }
}

function restoreFromHistory(entry){
  if($("gen").disabled)return;
  $("network").value = entry.resolvedChain || "auto";
  $("q").value = entry.input;
  generateSingle();
  return;
}

/* ─── PERMALINKS ─────────────────────────────────────────────── */
function updatePermalink(v){ history.replaceState(null,"",v?`#q=${encodeURIComponent(v)}`:"#"); }
function readPermalink(){ const m=(window.location.hash||"").match(/#q=([^&]+)/); if(m){ try{return decodeURIComponent(m[1]);}catch{} } return ""; }

/* ─── COPY ───────────────────────────────────────────────────── */
async function copyText(t){ try{ await navigator.clipboard.writeText(t); toast("Copied"); } catch{ alert("Clipboard copy failed."); } }

/* ─── SINGLE MODE ────────────────────────────────────────────── */
let lastResult = null;

function setLookupBusy(busy, title = 'Finding your transaction', detail = 'Checking the selected network for transaction details.'){
  $('lookupStatus').hidden = !busy;
  $('lookupTitle').textContent = title;
  $('lookupDetail').textContent = detail;
  document.documentElement.setAttribute('data-scanning', String(busy));
  $('mainGrid').setAttribute('aria-busy', String(busy));
  $('bulkResults').setAttribute('aria-busy', String(busy));
  $('mainGrid').style.display = busy || isBulk ? 'none' : 'grid';
  $('bulkResults').style.display = !busy && isBulk ? 'block' : 'none';
  for(const id of ['copySummary','copyAll','openAll','openSameTab','previewBest']) $(id).disabled = busy;
}

let lookupEpoch=0;
async function generateSingle(){
  if($("gen").disabled)return;
  const epoch=++lookupEpoch;
  const raw = $("q").value;
  const forced = $("network").value;
  invalidateResult();
  setLookupBusy(true);
  $("gen").textContent = "Searching…";
  $("gen").disabled = true;

  // Important: clear the previous preview before starting a new lookup.
  // Without this, a slow previous EVM preview can remain visible after a Lightning or Solana lookup.
  clearPreview();

  try{
    const result = await buildLookupResult(raw, forced);
    if(epoch!==lookupEpoch)return;
    lastResult = result;

    renderClassificationBadges(result);
    renderOutputs(result.outputs);
    renderSummaryPanel(result.onePage);
    $("summaryMeta").textContent = result.resolvedInput ? `${nowStamp()} · 1 item` : "";
    updatePermalink(result.schemaVersion===2 && result.onePage?.entityType!=="invoice" ? result.resolvedInput : "");

    if (result.outputs.length && result.onePage?.entityType!=="invoice") saveHistory(result);

    // Show the internal preview automatically after each single lookup.
    // This keeps Lightning and Solana from looking incomplete when their details are limited.
    const best = result.outputs.find(o=>o.isRecommended&&o.supportsPreview) || result.outputs.find(o=>o.supportsPreview);
    if (best) await showPreview(best);
  } finally {
    setLookupBusy(false);
    $("gen").textContent = "View transaction";
    $("gen").disabled = false;
  }
}

/* ─── BULK MODE ──────────────────────────────────────────────── */
async function generateBulk(){
  if($("gen").disabled)return;
  const epoch=++lookupEpoch;
  const raw = $("bulk").value||"";
  const forced = $("network").value;
  const lines = raw.split("\n").map(s=>s.trim()).filter(Boolean);

  if (!lines.length){
    $("classificationBadges").innerHTML = `<span class="pill pill-danger">Paste at least one item</span>`;
    return;
  }

  invalidateResult();
  $("bulkResults").innerHTML = "";
  setLookupBusy(true, "Checking your transactions", `0 of ${Math.min(lines.length,20)} checked`);
  $("gen").textContent = "Searching…";
  $("gen").disabled = true;

  try{
    const rows = [];
    if(lines.length>20)toast("Scanning the first 20 items. Split larger batches.");
    for (const line of lines.slice(0,20)){
      if(epoch!==lookupEpoch)return;
      const r = await buildLookupResult(line, forced);
      if(epoch!==lookupEpoch)return;
      rows.push(r);
      $("gen").textContent = `Checked ${rows.length}/${Math.min(lines.length,20)}`;
      $("lookupDetail").textContent = `${rows.length} of ${Math.min(lines.length,20)} checked`;
    }

    // Render bulk table
    const container = $("bulkResults");
    container.innerHTML = "";

    const counter = document.createElement("div");
    counter.className = "bulkCounter";
    counter.textContent = `${rows.length} item${rows.length!==1?"s":""} — click Preview or ↗ to open`;
    container.appendChild(counter);

    const tableWrap = document.createElement("div");
    tableWrap.style.overflowX = "auto";

    const table = document.createElement("table");
    table.className = "bulkTable";
    table.innerHTML = `<thead><tr><th>Input</th><th>Network</th><th>Chain</th><th>Status</th><th style="text-align:right;">Actions</th></tr></thead>`;
    const tbody = document.createElement("tbody");

    for (const r of rows){
      const op = r.onePage;
      const recommended = r.outputs.find(o=>o.isRecommended)||r.outputs[0]||null;

      const stateClass = {RICH:"pill-ok",LIMITED:"pill-warn",FETCH_FAILED:"pill-danger",CHAIN_UNRESOLVED:"pill-warn",UNSUPPORTED:"pill-muted",EMPTY:"pill-muted"}[op?.summaryState||"EMPTY"]||"pill-muted";
      const stateLabel = {RICH:"Loaded",LIMITED:"Partial",FETCH_FAILED:"Unable to load",NOT_FOUND:"Not found",CHAIN_UNRESOLVED:"Check network",UNSUPPORTED:"—",EMPTY:"—"}[op?.summaryState||"EMPTY"]||"—";
      // Override label with actual tx status if RICH
      const txStatus = op?.fields?.find(f=>f.key==="Status")?.value||stateLabel;

      const tr = document.createElement("tr");

      const tdInput = document.createElement("td");
      tdInput.innerHTML = `<div class="bulkInputCell mono">${esc(r.resolvedInput)}</div>`;
      tr.appendChild(tdInput);

      const tdNet = document.createElement("td");
      tdNet.innerHTML = op?.network ? `<span class="pill" style="font-size:11px;">${esc(op.network)}</span>` : "—";
      tr.appendChild(tdNet);

      const tdChain = document.createElement("td");
      tdChain.innerHTML = r.resolvedChain ? `<span class="pill pill-ok" style="font-size:11px;">✓ ${esc(r.resolvedChain)}</span>` : `<span class="pill pill-muted" style="font-size:11px;">Not available</span>`;
      tr.appendChild(tdChain);

      const tdStatus = document.createElement("td");
      tdStatus.innerHTML = `<span class="pill ${stateClass}" style="font-size:11px;">${esc(txStatus)}</span>`;
      tr.appendChild(tdStatus);

      const tdAct = document.createElement("td");
      tdAct.className = "bulkActionsCell";

      if (recommended?.supportsPreview){
        const previewBtn = document.createElement("button");
        previewBtn.className = "btn btn-sm";
        previewBtn.textContent = "Preview";
        previewBtn.addEventListener("click", () => showPreview(recommended));
        tdAct.appendChild(previewBtn);
      }

      const copyBtn = document.createElement("button");
      copyBtn.className = "btn btn-sm";
      copyBtn.textContent = "Summary";
      copyBtn.addEventListener("click", async () => { await copyText(makeSupportSummary(r)); });
      tdAct.appendChild(copyBtn);

      if (recommended?.url){
        const tabBtn = document.createElement("button");
        tabBtn.className = "btn btn-sm";
        tabBtn.textContent = "↗";
        tabBtn.title = "Open details in a new tab";
        tabBtn.addEventListener("click", () => window.open(recommended.url,"_blank","noreferrer"));
        tdAct.appendChild(tabBtn);
      }

      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    tableWrap.appendChild(table);
    container.appendChild(tableWrap);

    $("summaryMeta").textContent = `${rows.length} item${rows.length!==1?"s":""} · ${nowStamp()}`;

    // Save first item to history
    if (rows[0]) saveHistory({...rows[0], summaryText:`BULK (${rows.length})`});

  } finally {
    setLookupBusy(false);
    $("gen").textContent = "View transaction";
    $("gen").disabled = false;
  }
}

/* ─── MODE ───────────────────────────────────────────────────── */
let isBulk = false;
function setMode(bulk){
  if($("gen").disabled)return;
  lookupEpoch++;
  isBulk = bulk;
  $("bulk").style.display        = bulk?"block":"none";
  $("q").style.display           = bulk?"none":"block";
  $("network").parentElement?.style; // no-op
  $("modeBtn").textContent       = bulk?"Single mode":"Bulk mode";
  $("bulkResults").style.display = bulk?"block":"none";
  $("mainGrid").style.display    = bulk?"none":"grid";

  // Clear state
  clearPreview();
  $("outputList").innerHTML = "";
  $("summaryBody").innerHTML = `<div class="emptyState"><div class="emptyStateIcon">⬡</div><div class="emptyStateText">No lookup yet</div><div class="emptyStateSub">Paste a value above and click View transaction</div></div>`;
  $("classificationBadges").innerHTML = "";
  $("agentHint").textContent = "";
  $("summaryMeta").textContent = "";
  $("bulkResults").innerHTML = "";
  lastResult = null;

  $("classificationBadges").innerHTML = bulk ? `<span class="pill pill-info">Bulk mode · up to 20 items</span>` : "";
}

/* ─── THEME ──────────────────────────────────────────────────── */
function applyTheme(theme){
  document.documentElement.setAttribute("data-theme",theme);
  storage.setItem("ta_theme_v7",theme);
}

/* ─── GENERATE ENTRY POINT ───────────────────────────────────── */
async function generate(){
 try { if(isBulk) await generateBulk(); else await generateSingle(); }
 catch { renderSummaryPanel(failedResult($('q').value,'Unable to complete lookup. Retry shortly.').onePage); }
}

/* ─── BUTTONS ────────────────────────────────────────────────── */
$("gen").addEventListener("click", generate);

$("previewBest").addEventListener("click", async () => {
  if (isBulk){ toast("Transaction preview is only available in single mode"); return; }
  if (!lastResult) await generateSingle();
  const best = lastResult?.outputs?.find(o=>o.isRecommended&&o.supportsPreview)||lastResult?.outputs?.find(o=>o.supportsPreview);
  if (best) showPreview(best);
  else toast("No previewable output found");
});

$("copyAll").addEventListener("click", async () => {
  if (isBulk){ toast("Copy links is for single mode"); return; }
  if (!lastResult) await generateSingle();
  if (!lastResult?.outputs?.length) return;
  const safeOutputs = lastResult.outputs.filter(o=>!o.isSecondary && !o.reasonDisabled);
  const text = safeOutputs.map(o=>`${o.label}: ${o.url}`).join("\n");
  await copyText(text);
});

$("copySummary").addEventListener("click", async () => {
  if (isBulk){ toast("Use 'Summary' per row in bulk mode"); return; }
  if (!lastResult && !$("q").value.trim()){ toast("Nothing to copy"); return; }
  if (!lastResult) await generateSingle();
  await copyText(makeSupportSummary(lastResult));
});

$("openAll").addEventListener("click", async () => {
  if (isBulk){ toast("Open all is for single mode"); return; }
  if (!lastResult) await generateSingle();
  if (!lastResult?.outputs?.length) return;
  const safeOutputs = lastResult.outputs.filter(o=>!o.isSecondary && !o.reasonDisabled);
  const max = Math.min(4, safeOutputs.length);
  for (let i=0;i<max;i++) window.open(safeOutputs[i].url,"_blank","noreferrer");
  toast(`Opened ${max} tab${max!==1?"s":""}`);
});

$("openSameTab").addEventListener("click", async () => {
  if (isBulk){ toast("Open details is only available in single mode"); return; }
  if (!lastResult) await generateSingle();
  const best = lastResult?.outputs?.find(o=>o.isRecommended)||lastResult?.outputs?.[0];
  if (best) window.location.href = best.url;
});

$("openNewTab").addEventListener("click", () => { if(currentPreviewItem) window.open(currentPreviewItem.url,"_blank","noreferrer"); });
$("copyUrl").addEventListener("click", async () => { if(currentPreviewItem) await copyText(currentPreviewItem.url); });
$("clearPreview").addEventListener("click", clearPreview);

$("clearHistory").addEventListener("click", () => {
  storage.removeItem(HIST_KEY);
  renderHistory();
  toast("History cleared");
});

$("themeBtn").addEventListener("click", () => {
  const cur = storage.getItem("ta_theme_v7")||"dark";
  applyTheme(cur==="dark"?"light":"dark");
});

$("modeBtn").addEventListener("click", () => setMode(!isBulk));

/* ─── KEYBOARD SHORTCUTS ─────────────────────────────────────── */
document.addEventListener("keydown", async e => {
  const mac = /mac/i.test(navigator.platform);
  const cmd = mac?e.metaKey:e.ctrlKey;

  if (e.key==="Enter" && !e.shiftKey && !cmd){
    if (document.activeElement === $("q")){ e.preventDefault(); await generate(); }
    return;
  }
  if (e.key==="Enter" && cmd){
    if (!isBulk){
      e.preventDefault();
      if (!lastResult) await generateSingle();
      const best = lastResult?.outputs?.find(o=>o.isRecommended&&o.supportsPreview)||lastResult?.outputs?.find(o=>o.supportsPreview);
      if (best) showPreview(best);
    }
    return;
  }
  if ((e.key==="C"||e.key==="c") && cmd && e.shiftKey){
    if (!isBulk){ e.preventDefault(); if (!lastResult) await generateSingle(); await copyText(makeSupportSummary(lastResult)); }
    return;
  }
  if (e.key==="Escape") clearPreview();
});

function invalidateResult(){ setLookupBusy(false); lastResult=null; clearPreview(); renderOutputs([]); renderSummaryPanel(null); $('classificationBadges').innerHTML=''; $('agentHint').textContent=''; }
$('q').addEventListener('input',()=>{lookupEpoch++;invalidateResult();updatePermalink('');});
$('network').addEventListener('change',()=>{lookupEpoch++;invalidateResult();});

/* ─── INIT ───────────────────────────────────────────────────── */
(function init(){
  applyTheme(storage.getItem("ta_theme_v7")||"dark");
  // Old stored summaries can be stale; restored entries are fetched again.
  renderHistory();


  const q = readPermalink();
  if (q){ $("q").value = q; generateSingle(); }
})();
