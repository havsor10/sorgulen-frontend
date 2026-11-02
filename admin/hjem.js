(() => {
  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY_STORAGE = "sorgulen_admin_key";
  const timeTools = window.SorgulenWorkOrderTime;
  const el = (id) => document.getElementById(id);
  const taskList=el("taskList"), homeStatus=el("homeStatus"),ongoingProjects=el("ongoingProjects"),ongoingSection=el("ongoingSection");
  let home=null, selectedWorkId=null, serverOffset=0, busy=false, quickType=null, confirmRun=null, tasksExpanded=false;

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
  const WORKING_STATUSES = new Set(["active", "paused", "stopped"]);
  const workStateText = { active: "Arbeid pågår", paused: "Pausa", stopped: "Mellom økter" };

  function workingOrders() {
    if (!home) return [];
    // Backend leverer eiga arbeidsliste. Fallback held eldre versjonar
    // funksjonelle fram til backend er publisert.
    const serverList = Array.isArray(home.workingOrders)
      ? home.workingOrders
      : [home.activeWorkOrder, ...(home.ongoingProjects || [])];
    const byId = new Map();
    for (const order of serverList) {
      if (!order?._id || !WORKING_STATUSES.has(order.status) || order.isTest || order.trashedAt) continue;
      byId.set(String(order._id), order);
    }
    return [...byId.values()].sort((a, b) => {
      const rank = { active: 0, paused: 1, stopped: 2 };
      return (rank[a.status] ?? 3) - (rank[b.status] ?? 3) ||
        String(a.customerSnapshot?.name || "").localeCompare(String(b.customerSnapshot?.name || ""), "no") ||
        String(a._id).localeCompare(String(b._id));
    });
  }

  function workActionMarkup(order, conflictingOpen) {
    const id = escapeHtml(order._id);
    const isActive = order.status === "active";
    const isPaused = order.status === "paused";
    const action = isActive ? "pause" : "resume";
    const label = isActive ? "Pause arbeidsøkta" : isPaused ? "Fortsett arbeidsøkta" : "Start ny arbeidsøkt";
    const blocked = !isActive && conflictingOpen && String(conflictingOpen._id) !== String(order._id);
    const blocker = blocked ? `<p class="home-work-blocker">Du har allereie ei open økt på ${escapeHtml(conflictingOpen.customerSnapshot?.name || "eit anna oppdrag")}. Stopp eller avslutt den først.</p>` : "";
    const primary = `<button type="button" class="home-work-action primary-action" data-action="${action}" data-session="work" data-id="${id}" ${blocked ? 'disabled title="Avslutt anna økt først"' : ""}>${label}</button>`;
    const stop = isActive || isPaused
      ? `<button type="button" class="home-work-action home-work-stop" data-confirm="stop" data-id="${id}">Avslutt økta</button>` : "";
    return `<div class="home-work-actions" id="homeWorkActions-${id}">
      ${blocker}
      <div class="home-work-action-row">${primary}${stop}</div>
      <a class="home-work-more" href="oppdrag.html?open=${encodeURIComponent(order._id)}">Mer – full oversikt, redigering og utgifter <span aria-hidden="true">›</span></a>
    </div>`;
  }

  function renderWorking() {
    const list = workingOrders();
    const counter = el("workingCount");
    if (counter) counter.textContent = String(list.length);
    ongoingSection.classList.remove("hidden");

    if (selectedWorkId && !list.some((order) => String(order._id) === selectedWorkId)) selectedWorkId = null;
    if (!list.length) {
      ongoingProjects.innerHTML = '<div class="home-work-empty"><strong>Ingen aktive kundeoppdrag akkurat no.</strong><p>Planlagde og ferdige oppdrag ligg under Oppdrag – ikkje her på framsida.</p><a href="oppdrag.html">Gå til alle oppdrag</a></div>';
      return;
    }
    const lockedBy = list.find((order) => ["active", "paused"].includes(order.status))
      || home?.activeWorkOrder;
    ongoingProjects.innerHTML = list.map((order) => {
      const id = escapeHtml(order._id);
      const selected = String(order._id) === selectedWorkId;
      const status = order.status;
      const active = status === "active";
      const name = escapeHtml(order.customerSnapshot?.name || "Ukjend kunde");
      const service = escapeHtml(order.serviceName || "Oppdrag");
      const total = fmtDuration(currentSeconds(order));
      const clock = active
        ? `<span class="home-work-current"><span class="home-work-current-label">Økta no</span><strong data-live-timer data-order-id="${id}">${fmtDuration(sessionSeconds(order))}</strong></span>`
        : `<span class="home-work-total">Registrert tid <strong>${total}</strong></span>`;
      return `<article class="home-working-card state-${status}${selected ? " is-selected" : ""}" data-work-card="${id}">
        <button type="button" class="home-work-select" data-select-work="${id}" aria-expanded="${selected ? "true" : "false"}" ${selected ? 'aria-controls="homeWorkActions-' + id + '"' : ''}>
          <span class="home-work-card-top">
            <span class="home-work-name">${name}</span>
            <span class="home-work-state state-${status}"><span class="home-work-dot" aria-hidden="true"></span>${workStateText[status]}</span>
          </span>
          <span class="home-work-service">${service}</span>
          <span class="home-work-card-bottom">${clock}
            <span class="home-work-chevron" aria-hidden="true">${selected ? "⌃" : "⌄"}</span>
          </span>
        </button>
        ${selected ? workActionMarkup(order, lockedBy) : ""}
      </article>`;
    }).join("");
  }

  function actionTasks(){
    const activeId=home?.activeWorkOrder?._id?String(home.activeWorkOrder._id):"";
    const seen=new Set();
    return (home?.overview?.tasks||[]).filter((task)=>{
      if(!task?.actionLabel||(!task?.href&&!task?.assistantAction))return false;
      if(activeId&&task.priority!=="critical"&&String(task.href||"").includes(activeId))return false;
      // Same customer and same action can still represent different real bookings.
      // Use backend identity so no actionable item disappears from the list.
      const key=task.id ? "id:"+task.id : [task.href||"",task.actionLabel||"",task.title||""].join("|");
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
    const main=action?.kind==="publish_next_work"&&action.workOrderId
      ? `<button type="button" class="task-item task-item-button" data-assistant-action="publish_next_work" data-work-order-id="${escapeHtml(action.workOrderId)}" data-start="${escapeHtml(action.start||"")}" data-end="${escapeHtml(action.end||action.start||"")}" data-customer="${escapeHtml(action.customerName||"kunden")}" data-message="${escapeHtml(action.customerMessage||"")}">${content}</button>`
      : `<a class="task-item" href="${escapeHtml(task.href||"hjem.html")}">${content}</a>`;
    // Separate kontroller: ingen knapper inni lenker, og ingen utilsiktet navigering.
    const controls=task.id
      ? `<div class="task-row-actions"><button type="button" data-resolve-task="${escapeHtml(task.id)}" data-disposition="handled">✓ Ordnet</button><button type="button" data-resolve-task="${escapeHtml(task.id)}" data-disposition="dismissed">× Fjern varsel</button></div>`
      : "";
    return `<article class="task-row ${escapeHtml(priority)}">${main}${controls}</article>`;
  }

  function renderTasks(){
    const tasks=actionTasks();
    const title=el("tasksTitle");
    if(title)title.textContent=tasks.length?tasks.length+" ting å ordne":"Alt er under kontroll";
    if(!tasks.length){taskList.innerHTML='<div class="empty-home">Ingenting krever handling akkurat nå.</div>';return;}
    const visible=tasksExpanded?tasks:tasks.slice(0,3);
    taskList.innerHTML=visible.map(taskMarkup).join("")+(tasks.length>3?`<button type="button" class="task-more" data-task-more>${tasksExpanded?"Vis færre":"Vis alle ("+tasks.length+")"}</button>`:"");
  }
  async function loadResolvedTasks(){
    const container=el("resolvedTaskList"),count=el("resolvedTaskCount");
    if(!container||!count)return;
    try{
      const result=await api("/admin/assistant/tasks/resolved");
      const rows=result.tasks||[];
      count.textContent=String(rows.length);
      container.innerHTML=rows.length?rows.map(item=>`<div class="resolved-task">
        <div><strong>${escapeHtml(item.title||"Varsel")}</strong><small>${item.disposition==="handled"?"Markert ordnet":"Fjernet"} ${item.resolvedAt?escapeHtml(new Date(item.resolvedAt).toLocaleDateString("no-NO")):""}</small></div>
        <button type="button" data-restore-task="${escapeHtml(item.taskId)}">Angre</button>
      </div>`).join(""):'<p class="empty-home">Ingen varsler er fjernet.</p>';
    }catch(error){container.textContent="Kunne ikke hente skjulte varsler: "+error.message;}
  }
  async function resolveTask(button){
    if(busy||button.disabled)return;
    const taskId=button.dataset.resolveTask,disposition=button.dataset.disposition;
    const task=home?.overview?.tasks?.find(item=>item.id===taskId);
    if(!task||!["handled","dismissed"].includes(disposition))return;
    if(disposition==="handled"&&task.type==="email"&&!confirm("Markere e-posten som behandlet i innboksen?"))return;
    if(disposition==="handled"&&task.statusLabel==="KLAR FOR FAKTURA"&&!confirm("Dette markerer bare varselet som håndtert. Det opprettes INGEN faktura. Vil du fortsette?"))return;
    busy=true;button.disabled=true;
    try{
      await api("/admin/assistant/tasks/"+encodeURIComponent(taskId)+"/resolve",{method:"POST",body:JSON.stringify({disposition})});
      await load(false);
      setStatus(disposition==="handled"?"Varsel markert ordnet.":"Varsel fjernet. Du kan angre under Skjulte varsler.");
    }catch(error){setStatus(error.message,"error");}
    finally{busy=false;button.disabled=false;}
  }
  async function restoreTask(button){
    if(busy||button.disabled)return;
    busy=true;button.disabled=true;
    try{
      await api("/admin/assistant/tasks/resolved/"+encodeURIComponent(button.dataset.restoreTask),{method:"DELETE"});
      await load(false);
      setStatus("Varslet er gjenåpnet hvis det fortsatt er aktuelt.");
    }catch(error){setStatus(error.message,"error");}
    finally{busy=false;button.disabled=false;}
  }
  async function load(show=true){
    if(show)setStatus("Hentar aktive oppdrag…");
    home=await api("/admin/assistant/home");
    renderWorking();
    renderTasks();
    if(home.workingOrdersTruncated) setStatus("Det finst over 500 opne oppdrag. Bruk Oppdrag for å sjå resten.", "error");
    else if(!Array.isArray(home.workingOrders)) setStatus("Arbeidslista er mellombels henta frå den eldre oversikta. Fleire oppdrag kan mangle.", "error");
    else setStatus("");
    await loadResolvedTasks();
  }

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
    const chosen=e.target.closest("[data-select-work]");
    if(chosen){
      const id=chosen.dataset.selectWork;
      selectedWorkId=selectedWorkId===id?null:id;
      renderWorking();
      return;
    }
    const resolver=e.target.closest("[data-resolve-task]");
    if(resolver){e.preventDefault();resolveTask(resolver);return;}
    const restore=e.target.closest("[data-restore-task]");
    if(restore){e.preventDefault();restoreTask(restore);return;}
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
  setInterval(()=>{
    if(!home)return;
    const list=workingOrders();
    document.querySelectorAll("[data-live-timer][data-order-id]").forEach((timer)=>{
      const order=list.find((item)=>String(item._id)===timer.dataset.orderId);
      if(order?.status==="active")timer.textContent=fmtDuration(sessionSeconds(order));
    });
  },1000);
  load().catch(err=>{ongoingProjects.innerHTML='<div class="home-work-empty"><strong>Kunne ikkje hente aktive oppdrag.</strong><p>Prøv å oppdatere sida. Ingen arbeidsstatus er endra.</p></div>';taskList.innerHTML='<div class="empty-home">Kunne ikkje hente gjøremål.</div>';setStatus(err.message,"error");});
})();
