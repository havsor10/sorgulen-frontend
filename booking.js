(() => {
  "use strict";
  const API = window.CONFIG?.API_BASE_URL || "";
  const $ = (id) => document.getElementById(id);
  const serviceSelect = $("serviceSelect"), bookingDate = $("bookingDate");
  const slotsWrap = $("slotsWrap"), slots = $("slots"), formWrap = $("formWrap");
  const addressInput = $("customerAddress"), addressList = $("addressSuggestions");
  const addressHelp = $("addressHelp"), mapPanel = $("addressMapPanel");
  const submitBtn = $("submitBooking");
  const message = $("message");
  const requested = new URLSearchParams(location.search).get("service")?.toLowerCase() || "";
  let services = [], selectedService = null, selectedTime = "", availableDay = false;
  let pin = null, map = null, marker = null, debounce = null, currentSearch = 0, saving = false;

  const isSnow = () => /(brøy|broy|snø|sno|plog)/i.test(String(selectedService?.name || selectedService?.key || ""));
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone:"Europe/Oslo",year:"numeric",month:"2-digit",day:"2-digit" }).format(new Date());
  const maxDate = (days) => new Intl.DateTimeFormat("en-CA", { timeZone:"Europe/Oslo",year:"numeric",month:"2-digit",day:"2-digit" }).format(new Date(Date.now() + days*86400000));

  function notify(text, type="") {
    message.textContent = text; message.className = "notice " + type;
    message.classList.remove("hidden");
  }
  function clearNotice() { message.classList.add("hidden"); }
  function hideSuggestions() {
    addressList.replaceChildren();
    addressList.classList.add("hidden");
    addressInput.setAttribute("aria-expanded","false");
  }
  function setPin(lat, lng, source="manual", label="") {
    pin = { lat: Number(lat), lng: Number(lng), source, label };
    if (map && window.L) {
      if (!marker) marker = window.L.marker([pin.lat,pin.lng],{draggable:true}).addTo(map);
      else marker.setLatLng([pin.lat,pin.lng]);
      map.setView([pin.lat,pin.lng],17);
    }
    addressHelp.textContent = source === "kartverket"
      ? "Adresse vald frå Kartverket. Kontroller at kartmarkøren står ved rett innkøyrsel."
      : "Innkøyrselen er markert på kartet. Du kan no sende bestillinga.";
    addressHelp.classList.add("ok");
  }
  function showMap() {
    mapPanel.classList.remove("hidden");
    if (!window.L) {
      addressHelp.textContent = "Kartet kunne ikkje lastast. Prøv å oppdatere sida.";
      addressHelp.classList.remove("ok");
      return;
    }
    if (!map) {
      map = window.L.map("drivewayMap",{scrollWheelZoom:false}).setView([61.5997,5.0314],13);
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
        maxZoom:19,attribution:"© OpenStreetMap-bidragsytarar"
      }).addTo(map);
      map.on("click",(event)=>setPin(event.latlng.lat,event.latlng.lng,"manual",addressInput.value.trim()));
    }
    setTimeout(()=>map.invalidateSize(),40);
    if(pin) setPin(pin.lat,pin.lng,pin.source,pin.label);
  }
  async function searchAddress(value, searchId) {
    const q = value.trim();
    if (q.length < 3) { hideSuggestions(); return; }
    try {
      const response = await fetch(API + "/addresses?q=" + encodeURIComponent(q), {cache:"no-store"});
      const data = await response.json();
      if (searchId !== currentSearch || addressInput.value.trim() !== q) return;
      hideSuggestions();
      const items = Array.isArray(data.suggestions)?data.suggestions:[];
      if (!response.ok || !items.length) {
        addressHelp.textContent = "Fann ikkje adressa? Skriv heile adressa og vel innkøyrsel på kartet.";
        return;
      }
      for (const a of items) {
        if (!Number.isFinite(Number(a.lat)) || !Number.isFinite(Number(a.lng))) continue;
        const btn = document.createElement("button");
        btn.type = "button"; btn.setAttribute("role","option"); btn.textContent = a.address;
        btn.addEventListener("click",()=>{
          addressInput.value = a.address;
          hideSuggestions();
          ++currentSearch; clearTimeout(debounce);
          setPin(a.lat,a.lng,"kartverket",a.address);
          showMap();
        });
        addressList.appendChild(btn);
      }
      addressList.classList.toggle("hidden",!addressList.children.length);
      addressInput.setAttribute("aria-expanded",addressList.children.length?"true":"false");
      addressHelp.textContent = "Vel adressa frå lista. Manglar husbokstaven? Skriv rett adresse sjølv og marker innkøyrselen på kartet.";
    } catch (_) {
      if (searchId === currentSearch) {
        hideSuggestions();
        addressHelp.textContent = "Adressesøket svarar ikkje. Bruk kartet for å markere innkøyrselen.";
      }
    }
  }
  addressInput.addEventListener("input",()=>{
    pin = null;
    addressHelp.classList.remove("ok");
    addressHelp.textContent = "Vel adresse frå lista, eller marker innkøyrselen på kartet.";
    if (marker && map) { map.removeLayer(marker);marker = null; }
    clearTimeout(debounce);
    const searchId = ++currentSearch;
    debounce = setTimeout(()=>searchAddress(addressInput.value,searchId),280);
  });
  addressInput.addEventListener("keydown",(e)=>{if(e.key==="Escape")hideSuggestions();});
  document.addEventListener("click",(event)=>{if(!event.target.closest(".address-picker")) hideSuggestions();});
  $("showDrivewayMap").addEventListener("click",showMap);

  function applyServiceUI() {
    const snow = isSnow();
    selectedTime = ""; availableDay = false;
    $("bookingTitle").textContent = selectedService ? "Bestill " + selectedService.name : "Bestill teneste";
    $("bookingLead").textContent = snow
      ? "Vel dag og adresse. Brøyting blir utført etter kapasitet i løpet av vald dag. Du kan følgje køen på «Min jobb»."
      : "Vel teneste, dato og eit ledig klokkeslett.";
    $("bookingFact").textContent = snow ? "Brøyting i løpet av vald dag – ingen fast time" : "Timebestilling etter ledige tider";
    $("secondStepLabel").textContent = snow ? "Vel dag" : "Vel tid";
    $("dayBookingInfo").classList.toggle("hidden",!snow);
    slotsWrap.classList.add("hidden");
    formWrap.classList.add("hidden");
    if (bookingDate.value) loadAvailability();
  }
  function isPastSlot(date,time) {
    const osloNow = new Date(new Date().toLocaleString("en-US",{timeZone:"Europe/Oslo"}));
    const [y,m,d] = date.split("-").map(Number), [h,mi] = time.split(":").map(Number);
    return new Date(y,m-1,d,h,mi) <= osloNow;
  }
  function renderSlots(data) {
    slots.replaceChildren(); selectedTime = ""; formWrap.classList.add("hidden");
    slotsWrap.classList.remove("hidden");
    const booked = new Set(data.bookedTimes || []);
    const available = (data.allSlots || []).filter(t=>!isPastSlot(bookingDate.value,t));
    if (!available.length) {notify("Ingen ledige tider. Vel ein annan dato.","error");return;}
    clearNotice();
    for(const t of available){
      const btn = document.createElement("button");
      btn.type = "button"; btn.textContent = t;
      btn.className = "slot-btn" + (booked.has(t)?" disabled":"");
      btn.disabled = booked.has(t);
      btn.addEventListener("click",()=>{
        slots.querySelectorAll(".slot-btn").forEach(b=>b.classList.remove("active"));
        btn.classList.add("active"); selectedTime = t;formWrap.classList.remove("hidden");
      });
      slots.appendChild(btn);
    }
  }
  async function loadAvailability() {
    slotsWrap.classList.add("hidden");formWrap.classList.add("hidden");
    availableDay = false;selectedTime = "";
    if(!selectedService || !bookingDate.value)return;
    const expected = selectedService._id+"|"+bookingDate.value;
    notify("Sjekkar ledig kapasitet …");
    try {
      const response = await fetch(API+"/availability?serviceId="+encodeURIComponent(selectedService._id)+"&date="+encodeURIComponent(bookingDate.value),{cache:"no-store"});
      const data = await response.json();
      if(expected!==selectedService._id+"|"+bookingDate.value)return;
      if(!response.ok)throw new Error(data.error||"Kunne ikkje sjekke datoen.");
      if(isSnow()){
        if(data.mode!=="day" || !data.available){notify(data.message||"Denne dagen er full. Vel ein annan dag.","error");return;}
        availableDay=true; formWrap.classList.remove("hidden"); clearNotice();return;
      }
      renderSlots(data);
    }catch(error){notify(error.message||"Klarte ikkje å hente ledige dagar.","error");}
  }
  async function loadServices() {
    const response = await fetch(API+"/services");
    if(!response.ok)throw new Error("Tenestene er mellombels utilgjengelege.");
    const data = await response.json();
    services = (data.services||[]).filter(s=>s.active!==false&&(s.bookable===true||["broyting","dekkskift"].includes(s.key)));
    if(!services.length)throw new Error("Ingen bookbare tenester.");
    serviceSelect.replaceChildren();
    for(const service of services) serviceSelect.add(new Option(service.name+(service.priceText?" – "+service.priceText:""),service._id));
    selectedService = services.find(s=>/^(brøyting|broyting)$/.test(requested)&&/(brøy|broy)/i.test(s.name))
      || services.find(s=>String(s.name||"").toLowerCase()===requested)
      || services[0];
    serviceSelect.value=selectedService._id;
    applyServiceUI();
  }
  async function submitBooking() {
    if(saving)return;
    if(!selectedService)return notify("Vel teneste.","error");
    const snow = isSnow();
    const payload = {
      serviceId:selectedService._id,serviceName:selectedService.name,date:bookingDate.value,
      time:snow?"":selectedTime,
      customerName:$("customerName").value.trim(),
      customerPhone:$("customerPhone").value.trim(),
      customerEmail:$("customerEmail").value.trim(),
      customerAddress:addressInput.value.trim(),
      comment:$("comment").value.trim(),
      ...(snow?{addressGeo:pin}:{}),
    };
    if(!payload.date||!payload.customerName||!payload.customerEmail||!payload.customerPhone||!payload.customerAddress){
      return notify("Fyll inn namn, telefon, e-post, adresse og dato.","error");
    }
    if(snow && (!availableDay||!pin))return notify("Stadfest innkøyrselen: vel adresse frå lista eller marker på kartet.","error");
    if(!snow&&!selectedTime)return notify("Vel eit klokkeslett.","error");
    saving=true;submitBtn.disabled=true;submitBtn.textContent="Registrerer …";
    try{
      const response=await fetch(API+"/bookings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok){
        if(response.status===409)loadAvailability();
        throw new Error(data.error||"Bestillinga kunne ikkje registrerast.");
      }
      const summary={serviceName:payload.serviceName,date:payload.date,time:payload.time,
        bookingMode:snow?"day":"scheduled",customerName:payload.customerName,
        customerPhone:payload.customerPhone,customerEmail:payload.customerEmail,
        customerAddress:payload.customerAddress,comment:payload.comment,portalUrl:data.portalUrl||""};
      sessionStorage.setItem("lastBookingSummary",JSON.stringify(summary));
      location.href="booking-bekreftelse.html";
    }catch(error){notify(error.message||"Ukjend feil. Prøv igjen.","error");}
    finally{saving=false;submitBtn.disabled=false;submitBtn.textContent="Send bestilling";}
  }
  serviceSelect.addEventListener("change",()=>{
    selectedService=services.find(s=>s._id===serviceSelect.value)||null;
    applyServiceUI();
  });
  bookingDate.addEventListener("change",loadAvailability);
  submitBtn.addEventListener("click",submitBooking);
  bookingDate.min=today();bookingDate.max=maxDate(30);
  loadServices().catch(e=>notify(e.message,"error"));
})();
