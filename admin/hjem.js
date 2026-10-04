(() => {
  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY_STORAGE = "sorgulen_admin_key";
  const timeTools = window.SorgulenWorkOrderTime;
  const el = (id) => document.getElementById(id);
  const focusContent=el("focusContent"), taskList=el("taskList"), homeStatus=el("homeStatus"),ongoingProjects=el("ongoingProjects"),ongoingSection=el("ongoingSection");
  let home=null, activeProject=null, serverOffset=0, busy=false, quickType=null, confirmRun=null, tasksExpanded=false;

  const escapeHtml=(v)=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  const fmtDate=(value)=>{ if(!value)return ""; const d=new Date(`${value}T12:00:00`); return new Intl.DateTimeFormat("no-NO",{timeZone:"Europe/Oslo",weekday:"short",day:"numeric",month:"short"}).format(d); };
  const fmtTime=(value)=>value?new Intl.DateTimeFormat("no-NO",{timeZone:"Europe/Oslo",hour:"2-digit",minute:"2-digit"}).format(new Date(value)):"";
  const fmtDuration=(seconds)=>{const s=Math.max(0,Math.floor(Number(seconds)||0));return [Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(x=>String(x).padStart(2,"0")).join(":");};
  function key(){return (localStorage.getItem(KEY_STORAGE)||"").trim();}
  async function api(path,options={}){const res=await fetch(`${API_BASE}${path}`,{...options,headers:{"Content-Type":"application/json","x-admin-key":key(),...(options.headers||{})}});const data=await res.json().catch(()=>null);if(data?.serverTime)serverOffset=new Date(data.serverTime).getTime()-Date.now();if(res.status===401||res.status===403){localStorage.removeItem(KEY_STORAGE);location.href="login.html";throw new Error("Logg inn på nytt.");}if(!res.ok)throw new Error(data?.error||`API-feil ${res.status}`);return data;}
  function setStatus(text,type=""){homeStatus.textContent=text||"";homeStatus.className=`home-status ${type}`.trim();}
  function currentSeconds(order){return timeTools?timeTools.calculateWorkSeconds(order,Date.now()+serverOffset):Number(order.currentWorkSeconds||0);}
  function sessionSeconds(order){return timeTools?.calculateCurrentSessionSeconds?timeTools.calculateCurrentSessionSeconds(order,Date.now()+serverOffset):0;}
  function sessionStartedAt(order){const stopped=(order.events||[]).filter(event=>event?.type==="stopped"&&event?.at).reduce((latest,event)=>Math.max(latest,new Date(event.at).getTime()||0),0);return (order.workIntervals||[]).filter(interval=>interval?.source!=="manual"&&new Date(interval?.startedAt).getTime()>stopped).map(interval=>interval.startedAt).find(Boolean)||order.workIntervals?.at(-1)?.startedAt||order.startedAt;}
  function projectStats(order){const expenses=order.additionalCosts||[],equipment=order.equipment||[],materials=order.materials||[],notes=order.projectNotes||[];const expenseTotal=expenses.reduce((sum,item)=>sum+(Number(item.amount)||0),0);const equipmentTotal=equipment.reduce((sum,item)=>sum+(Number(item.amount)||0),0);const fmt=(value)=>new Intl.NumberFormat("no-NO",{style:"currency",currency:"NOK",maximumFractionDigits:0}).format(value);return `<div class="project-stats"><span>${order.workIntervals?.length||0} økter</span><span>${fmt(expenseTotal)} utgifter</span><span>${fmt(equipmentTotal)} utstyr</span><span>${materials.length} materialer</span><span>${notes.length} notater</span></div>`;}
  function quickButtons(order){return `<div class="quick-actions"><button class="quick-action" data-quick="time" data-id="${escapeHtml(order._id)}">+ Tid</button><button class="quick-action" data-quick="expense" data-id="${escapeHtml(order._id)}">+ Utgift</button><button class="quick-action" data-quick="equipment" data-id="${escapeHtml(order._id)}">+ Utstyr</button><button class="quick-action" data-quick="material" data-id="${escapeHtml(order._id)}">+ Materiale</button><button class="quick-action" data-quick="note" data-id="${escapeHtml(order._id)}">+ Notat</button></div>`;}
  function renderFocus(){
    const active=home.activeWorkOrder;
    if(active){activeProject=active;const isPaused=active.status==="paused";focusContent.className="home-card focus-card is-active";focusContent.innerHTML=`<div class="focus-top"><div><p class="eyebrow">Pågår nå</p><h2 id="focusTitle" class="focus-name">${escapeHtml(active.customerSnapshot?.name||"Ukjent kunde")}</h2><p class="focus-service">${escapeHtml(active.serviceName)}</p></div><span class="status-pill ${isPaused?"paused":"active"}">${isPaused?"Pauset":"Aktiv"}</span></div><div class="timer" data-live-timer>${fmtDuration(sessionSeconds(active))}</div><p class="focus-meta">${isPaused?"Pausen regnes ikke som arbeidstid":`Dagens økt startet ${fmtTime(sessionStartedAt(active))}`}</p>${projectStats(active)}<div class="main-actions"><button class="primary-action" data-action="${isPaused?"resume":"pause"}" data-id="${escapeHtml(active._id)}">${isPaused?"Fortsett":"Pause"}</button><button class="secondary-action" data-confirm="stop" data-id="${escapeHtml(active._id)}">Avslutt økt</button></div>${quickButtons(active)}`;return;}
    const ongoing=home.ongoingProject;
    if(ongoing){activeProject=ongoing;focusContent.className="home-card focus-card";focusContent.innerHTML=`<div class="focus-top"><div><p class="eyebrow">Pågående prosjekt</p><h2 id="focusTitle" class="focus-name">${escapeHtml(ongoing.customerSnapshot?.name||"Ukjent kunde")}</h2><p class="focus-service">${escapeHtml(ongoing.serviceName)}</p></div><span class="status-pill">Mellom økter</span></div><p class="focus-meta" style="margin:20px 0 10px">Registrert tid: <strong>${fmtDuration(currentSeconds(ongoing))}</strong></p>${projectStats(ongoing)}<div class="main-actions"><button class="primary-action" data-action="resume" data-session="work" data-id="${escapeHtml(ongoing._id)}">Fortsett arbeid</button><button class="secondary-action" data-action="resume" data-session="purchase" data-id="${escapeHtml(ongoing._id)}">Start innkjøpstid</button><button class="secondary-action" data-action="resume" data-session="transport" data-id="${escapeHtml(ongoing._id)}">Start transporttid</button><button class="secondary-action danger-action" data-confirm="complete" data-id="${escapeHtml(ongoing._id)}">Fullfør prosjekt</button></div>${quickButtons(ongoing)}`;return;}
    activeProject=null;const planned=home.nextWorkOrder;
    if(planned){focusContent.className="home-card focus-card";focusContent.innerHTML=`<div class="focus-top"><div><p class="eyebrow">Neste oppdrag</p><h2 id="focusTitle" class="focus-name">${escapeHtml(planned.customerSnapshot?.name||"Ukjent kunde")}</h2><p class="focus-service">${escapeHtml(planned.serviceName)}</p></div><span class="status-pill">Planlagt</span></div><p class="focus-meta" style="margin:20px 0">${escapeHtml(fmtDate(planned.jobDate))}${planned.customerSnapshot?.address?`<br>${escapeHtml(planned.customerSnapshot.address)}`:""}</p><button class="primary-action" data-action="start" data-session="work" data-id="${escapeHtml(planned._id)}">Start oppdrag</button>`;return;}
    const b=home.nextBooking;
    if(b){focusContent.className="home-card focus-card";focusContent.innerHTML=`<div class="focus-top"><div><p class="eyebrow">Neste oppdrag</p><h2 id="focusTitle" class="focus-name">${escapeHtml(b.customerName)}</h2><p class="focus-service">${escapeHtml(b.serviceName)}</p></div><span class="status-pill">${escapeHtml(b.status==="pending"?"Venter":"Planlagt")}</span></div><p class="focus-meta" style="margin:20px 0">${escapeHtml(fmtDate(b.date))} kl. ${escapeHtml(b.time||"")}${b.customerAddress?`<br>${escapeHtml(b.customerAddress)}`:""}</p><a class="primary-action" style="display:inline-grid;place-items:center;text-decoration:none" href="oppdrag.html?bookingId=${encodeURIComponent(b._id)}">Klargjør oppdrag</a>`;return;}
    focusContent.className="home-card focus-card";focusContent.innerHTML=`<p class="eyebrow">Oppdrag</p><h2 id="focusTitle">Ingen aktive eller kommende oppdrag</h2><p class="focus-meta" style="margin:12px 0 18px">Du kan opprette et nytt oppdrag når du trenger det.</p><a class="primary-action" style="display:inline-grid;place-items:center;text-decoration:none" href="oppdrag.html">Opprett oppdrag</a>`;
  }
  function actionTasks(){
    const activeId=home?.activeWorkOrder?._id?String(home.activeWorkOrder._id):"";
    const seen=new Set();
    return (home?.overview?.tasks||[]).filter((task)=>{
      if(!task?.actionLabel||(!task?.href&&!task?.assistantAction))return false;
      if(activeId&&task.priority!=="critical"&&String(task.href||"").includes(activeId))return false;
      const key=[task.href||"",task.actionLabel||"",task.title||""].join("|");
      if(seen.has(key))return false;
      seen.add(key);
      return true;
    });
  }

  function taskMarkup(task){
    const priority=["critical","high","medium","low"].includes(task.priority)?task.priority:"medium";
    const status=task.statusLabel||(priority==="critical"?"MÅ GJØRES NÅ":"KREVER HANDLING");
    const content=`<span class="priority-dot ${escapeHtml(priority)}"></span><div><span class="task-status">${escapeHtml(status)}</span><h3>${escapeHtml(task.title||"Krever handling")}</h3><p>${escapeHtml(task.detail||"")}${task.ageDays?` · ${task.ageDays} dager`:""}</p></div><span class="task-go">${escapeHtml(task.actionLabel||"Åpne")} ›</span>`;
    const action=task.assistantAction;
    if(action?.kind==="publish_next_work"&&action.workOrderId){
      return `<button type="button" class="task-item task-item-button" data-assistant-action="publish_next_work" data-work-order-id="${escapeHtml(action.workOrderId)}" data-start="${escapeHtml(action.start||"")}" data-end="${escapeHtml(action.end||action.start||"")}" data-customer="${escapeHtml(action.customerName||"kunden")}" data-message="${escapeHtml(action.customerMessage||"")}">${content}</button>`;
    }
    return `<a class="task-item" href="${escapeHtml(task.href||"hjem.html")}">${content}</a>`;
  }

  function renderTasks(){
    const tasks=actionTasks();
    const title=el("tasksTitle");
    if(title)title.textContent=tasks.length?tasks.length+" ting å ordne":"Alt er under kontroll";
    if(!tasks.length){taskList.innerHTML='<div class="empty-home">Ingenting krever handling akkurat nå.</div>';return;}
    const visible=tasksExpanded?tasks:tasks.slice(0,3);
    taskList.innerHTML=visible.map(taskMarkup).join("")+(tasks.length>3?`<button type="button" class="task-more" data-task-more>${tasksExpanded?"Vis færre":"Vis alle ("+tasks.length+")"}</button>`:"");
  }
  function renderOngoing(){const list=(home.ongoingProjects||[]).filter(item=>item._id!==home.activeWorkOrder?._id);ongoingSection.classList.toggle("hidden",!list.length);ongoingProjects.innerHTML=list.map(item=>{const stopped=item.status==="stopped";const hasTime=currentSeconds(item)>0;const action=stopped?"resume":"start";const actionLabel=stopped?"Fortsett / ny økt":hasTime?"Start ny økt":"Start takstameter";const stateLabel=stopped?"Mellom økter":"Planlagt";return `<article class="booking-item home-active-project"><a class="home-active-project-main" href="oppdrag.html?open=${encodeURIComponent(item._id)}"><div><h3>${escapeHtml(item.customerSnapshot?.name||"Ukjent kunde")}</h3><p>${escapeHtml(item.serviceName)} · ${fmtDuration(currentSeconds(item))} · ${stateLabel}</p></div></a><div class="home-active-project-actions"><button class="primary-action home-active-start" type="button" data-action="${action}" data-session="work" data-id="${escapeHtml(item._id)}">${actionLabel}</button><a class="secondary-action home-active-open" href="oppdrag.html?open=${encodeURIComponent(item._id)}">Åpne</a></div></article>`;}).join("");}
  async function load(show=true){if(show)setStatus("Henter dagens oversikt…");home=await api("/admin/assistant/home");renderFocus();renderTasks();renderOngoing();setStatus("");}

  async function publishNextWork(button){
    if(busy||button.disabled)return;
    const workOrderId=button.dataset.workOrderId||"";
    const start=button.dataset.start||"";
    const end=button.dataset.end||start;
    const customer=button.dataset.customer||"kunden";
    const message=button.dataset.message||"";
    if(!workOrderId||!start)return;
    const preview=message?"\n\nKundemelding:\n«"+message+"»":"";
    if(!confirm("Publisere foreslått neste arbeidsøkt for "+customer+"?"+preview+"\n\nDette oppdaterer kundesiden. Ingen SMS eller e-post sendes."))return;
    busy=true;button.disabled=true;
    try{
      await api("/admin/assistant/actions/next-work/"+encodeURIComponent(workOrderId),{method:"POST",body:JSON.stringify({expectedStart:start,expectedEnd:end})});
      await load(false);
    }catch(err){setStatus(err.message,"error");}
    finally{busy=false;button.disabled=false;}
  }
  async function action(id,action,sessionType){if(busy)return;busy=true;setStatus(action==="pause"?"Pauser…":action==="stop"?"Avslutter økten…":action==="complete"?"Fullfører prosjektet…":"Starter økten…");try{await api(`/admin/work-orders/${encodeURIComponent(id)}/action`,{method:"POST",body:JSON.stringify({action,sessionType,confirmWarnings:action==="complete"})});await load(false);}catch(err){setStatus(err.message,"error");}finally{busy=false;}}
  function localValue(date=new Date()){const d=new Date(date.getTime()-date.getTimezoneOffset()*60000);return d.toISOString().slice(0,16);}
  function openQuick(type,id){quickType={type,id};el("quickError").textContent="";const billable='<label class="check-field"><input name="billable" type="checkbox" checked> Skal med på kundens fakturagrunnlag</label>';const fields={time:`<div class="quick-field"><label>Kategori</label><select name="category"><option value="work">Arbeid</option><option value="purchase">Innkjøp</option><option value="transport">Transport</option></select></div><div class="quick-field"><label>Fra</label><input name="startedAt" type="datetime-local" value="${localValue()}" required></div><div class="quick-field"><label>Til</label><input name="endedAt" type="datetime-local" value="${localValue(new Date(Date.now()+3600000))}" required></div><div class="quick-field"><label>Kommentar</label><input name="comment" maxlength="1000"></div>${billable}`,expense:`<div class="quick-field"><label for="qAmount">Beløp</label><input id="qAmount" name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required autofocus></div><div class="quick-field"><label for="qDescription">Hva gjelder kjøpet?</label><input id="qDescription" name="description" maxlength="500" required></div><div class="quick-field"><label>Leverandør</label><input name="supplier" maxlength="160"></div>${billable}<div class="quick-field"><label for="qReceipt">Kvittering (valgfritt)</label><input id="qReceipt" name="receipt" type="file" accept="image/jpeg,image/png,image/webp,image/heic" capture="environment"></div>`,material:`<div class="quick-field"><label for="qItem">Materiale</label><input id="qItem" name="item" maxlength="300" required autofocus></div><div class="quick-field"><label for="qQuantity">Antall</label><input id="qQuantity" name="quantity" type="number" min="0.01" step="0.01" inputmode="decimal" value="1" required></div><div class="quick-field"><label>Enhet</label><input name="unit" value="stk"></div><div class="quick-field"><label>Innkjøpspris per enhet</label><input name="purchaseUnitPrice" type="number" min="0.01" step="0.01"></div><div class="quick-field"><label for="qPrice">Kundepris per enhet</label><input id="qPrice" name="unitPrice" type="number" min="0.01" step="0.01" inputmode="decimal"></div><div class="quick-field"><label for="qComment">Kommentar</label><input id="qComment" name="comment" maxlength="500"></div>${billable}`,note:`<div class="quick-field"><label for="qText">Notat</label><textarea id="qText" name="text" maxlength="2000" required autofocus></textarea></div>`};el("quickTitle").textContent=type==="time"?"Legg til tid":type==="expense"?"Ny utgift":type==="material"?"Nytt materiale":"Nytt notat";el("quickFields").innerHTML=fields[type];el("quickModal").classList.remove("hidden");}
  const fileData=(file)=>new Promise((resolve,reject)=>{if(!file)return resolve(null);const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error("Kunne ikke lese bildet"));reader.readAsDataURL(file);});
  document.addEventListener("click",(e)=>{if(e.target.closest("[data-quick]"))el("quickOperationId").value=globalThis.crypto?.randomUUID?.()||`entry-${Date.now()}-${Math.random().toString(36).slice(2)}`;},true);
  el("quickForm").addEventListener("submit",async(e)=>{e.preventDefault();if(busy||!quickType)return;const form=new FormData(e.currentTarget),type=quickType.type;let payload=Object.fromEntries(form.entries());delete payload.receipt;if(type!=="note")payload.billable=form.has("billable");if(type==="time"){payload.startedAt=new Date(payload.startedAt).toISOString();payload.endedAt=new Date(payload.endedAt).toISOString();}try{busy=true;el("quickSave").disabled=true;el("quickError").textContent="";if(type==="expense"){const file=el("qReceipt")?.files?.[0];if(file&&file.size>12*1024*1024)throw new Error("Kvitteringsbildet er for stort (maks 12 MB).");payload.receiptImage=await fileData(file);}const endpoint=type==="time"?"time-entries":type==="expense"?"expenses":type==="material"?"materials":"notes";const saved=await api(`/admin/work-orders/${encodeURIComponent(quickType.id)}/${endpoint}`,{method:"POST",body:JSON.stringify(payload)});el("quickModal").classList.add("hidden");e.currentTarget.reset();await load(false);if(saved.overlapWarning)setStatus(saved.overlapWarning,"error");}catch(err){el("quickError").textContent=err.message;}finally{busy=false;el("quickSave").disabled=false;}});
  document.addEventListener("click",async(e)=>{const complete=e.target.closest('[data-confirm="complete"]');if(!complete)return;e.stopImmediatePropagation();try{setStatus("Kontrollerer prosjektet…");const data=await api(`/admin/work-orders/${encodeURIComponent(complete.dataset.id)}/completion-check`);const check=data.completionCheck||{blocking:[],warnings:[]};if(check.blocking.length){setStatus(check.blocking.join(" "),"error");return;}const project=data.workOrder||{},basis=data.invoiceBasis||{};const summary=`Registrert tid: ${fmtDuration(currentSeconds(project))}. Utgifter: ${(project.additionalCosts||[]).length}. Materialer: ${(project.materials||[]).length}. Notater: ${(project.projectNotes||[]).length}. Fakturagrunnlag: ${(basis.lines||[]).length} linjer.`;const warnings=check.warnings.length?` Kontroller: ${check.warnings.join(" ")}`:"";confirmRun=()=>action(complete.dataset.id,"complete");el("confirmTitle").textContent="Fullføre prosjektet?";el("confirmText").textContent=`${summary}${warnings} All historikk bevares.`;el("confirmModal").classList.remove("hidden");setStatus("");}catch(error){setStatus(error.message,"error");}},true);
  document.addEventListener("click",(e)=>{
    const more=e.target.closest("[data-task-more]");
    if(more){tasksExpanded=!tasksExpanded;renderTasks();return;}
    const assistant=e.target.closest('[data-assistant-action="publish_next_work"]');
    if(assistant){publishNextWork(assistant);return;}
    const q=e.target.closest("[data-quick]");
    if(q){openQuick(q.dataset.quick,q.dataset.id);return;}
    const a=e.target.closest("[data-action]");
    if(a){action(a.dataset.id,a.dataset.action,a.dataset.session);return;}
    const c=e.target.closest("[data-confirm]");
    if(c){const operation=c.dataset.confirm;confirmRun=()=>action(c.dataset.id,operation);el("confirmTitle").textContent=operation==="stop"?"Avslutte arbeidsøkten?":"Fullføre prosjektet?";el("confirmText").textContent=operation==="stop"?"Tiden lagres. Prosjektet beholdes og kan fortsettes senere.":"All tid, utgifter, materialer og notater bevares. Prosjektet blir klart til fakturering.";el("confirmModal").classList.remove("hidden");}
  });
  el("closeQuick").addEventListener("click",()=>el("quickModal").classList.add("hidden"));el("confirmCancel").addEventListener("click",()=>el("confirmModal").classList.add("hidden"));el("confirmOk").addEventListener("click",()=>{el("confirmModal").classList.add("hidden");confirmRun?.();});el("refreshBtn").addEventListener("click",()=>load().catch(err=>setStatus(err.message,"error")));el("logoutBtn").addEventListener("click",()=>localStorage.removeItem(KEY_STORAGE));
  setInterval(()=>{const timer=document.querySelector("[data-live-timer]");if(timer&&home?.activeWorkOrder)timer.textContent=fmtDuration(sessionSeconds(home.activeWorkOrder));},1000);
  load().catch(err=>{focusContent.innerHTML='<div class="empty-home">Kunne ikke hente oppdrag.</div>';taskList.innerHTML='<div class="empty-home">Kunne ikke hente gjøremål.</div>';setStatus(err.message,"error");});
})();
