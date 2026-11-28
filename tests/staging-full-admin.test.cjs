const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const read=f=>fs.readFileSync(f,"utf8");
test("all admin pages remain present and receive shared staging styling",()=>{
 const pages=fs.readdirSync("admin").filter(x=>x.endsWith(".html"));
 assert.ok(pages.length>=27);
 for(const p of pages){const h=read("admin/"+p);assert.match(h,/<head[\s>]/i);assert.match(h,/<body[\s>]/i);}
 const build=read("tools/build-staging.cjs");assert.match(build,/fs\.readdirSync\(adminDir\)\.filter/);assert.match(build,/data-admin-redesign/);assert.match(build,/enterprise-unified\.css\?v=/);
});
test("field commands reuse existing handlers and show today separately from upcoming",()=>{
 const h=read("admin/felt.html"),j=read("admin/felt.js");
 for(const id of ["activeJobCard","todayQueue","upcomingQueue","fieldTodayCount","fieldPlusBtn","fieldForm","fieldSyncBadge"])assert.equal((h.match(new RegExp('id="'+id+'"',"g"))||[]).length,1);
 assert.match(h,/data-field-quick-register/);assert.match(h,/data-open="new-job"/);assert.match(h,/broyting\.html\?from=field#customers/);
 assert.match(j,/job\.jobDate===date/);assert.match(j,/job\.jobDate!==date/);assert.match(j,/bindDynamic\(root\);bindDynamic\(next\)/);assert.match(j,/flushOfflineQueue/);
 assert.doesNotMatch(h,/user-scalable=no/);
});
test("snow commands scroll to real controls and never start work themselves",()=>{
 const h=read("admin/broyting.html"),j=read("admin/broyting.js");
 for(const id of ["snowShowCustomers","snowShowRound","snowInbox","startRoundForm","activeRound","finishRoundBtn","snowModal"])assert.equal((h.match(new RegExp('id="'+id+'"',"g"))||[]).length,1);
 assert.match(j,/snowShowCustomers"\)\?\.addEventListener\("click",\(\)=>jumpSnow\("customers"\)/);
 assert.match(j,/snowShowRound"\)\?\.addEventListener\("click",\(\)=>jumpSnow\("round"\)/);
 assert.match(j,/scrollIntoView/);assert.match(j,/function renderInbox/);assert.match(j,/function render\(data/);
});
test("shared navigation links preserve legacy handlers and fullscreen exception",()=>{
 const shell=read("admin/admin-shell.js"),css=read("admin/enterprise-unified.css");
 for(const key of ["adminMoreButton","adminMoreDesktopButton","adminMoreMenu","adminMoreClose","adminMenuBackdrop","logoutBtn"])assert.ok(shell.includes('id="'+key+'"'));
 assert.match(shell,/enterprise-side/);assert.match(shell,/data-admin-context|dataset\.adminContext/);assert.match(css,/html:not\(\.portal-fullscreen\)/);assert.match(css,/min-width:1024px/);assert.match(css,/max-width:800px/);assert.match(css,/min-height:67px/);
});
test("no new network or billing logic in shared CSS and shell routes",()=>{
 const css=read("admin/enterprise-unified.css");
 assert.doesNotMatch(css,/@import|url\(https?:/);assert.match(css,/\[hidden\]/);
 assert.match(read("admin/login.html"),/matchMedia\("\(min-width:1024px\)"\)/);
});
test("active field timer has priority while command controls remain accessible",()=>{assert.match(read("admin/felt.js"),/\["active","paused"\]\.includes\(job\.status\)\) commands\.before\(card\)/);assert.match(read("tools/build-staging.cjs"),/fs\.copyFileSync\(path\.join\(adminDir,page\+"\.html"\)/);});
