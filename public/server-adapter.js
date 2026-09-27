/* Connects the Baraka Import System to its own server.
   Provides window.claude.use("db") and window.claude.use("downloads") with the same API the app uses on claude.ai,
   plus sign-in (password + emailed code), live updates, and user management for administrators. */
(function(){
  "use strict";
  var H={"Content-Type":"application/json","x-baraka":"1"};
  function api(method,url,body){
    return fetch(url,{method:method,headers:H,credentials:"same-origin",body:body===undefined?undefined:JSON.stringify(body)}).then(function(r){
      return r.text().then(function(t){var j=null;try{j=t?JSON.parse(t):null}catch(e){}
        if(r.status===401&&url!=="/api/login"&&url!=="/api/verify"&&url!=="/api/me"){showLogin()}
        if(!r.ok){var err=new Error(j&&j.error||("Error "+r.status));err.status=r.status;err.code=r.status===401?"invalid_argument":"unavailable";throw err}
        return j})});
  }
  function clean(o){return JSON.parse(JSON.stringify(o))}
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}

  /* ---------- live data ---------- */
  var colSubs={},docSubs={},pend={},meUser=null;
  function docSnap(id,exists,data){return {id:id,exists:!!exists,data:function(){return exists?clean(data):undefined},metadata:{fromCache:false,hasPendingWrites:false}}}
  function colSnap(rows,opts){
    var list=rows.slice();
    if(opts.order){var f=opts.order[0],d=opts.order[1]==="desc"?-1:1;list.sort(function(a,b){var x=a.data[f],y=b.data[f];return (x>y?1:x<y?-1:0)*d})}
    (opts.where||[]).forEach(function(w){list=list.filter(function(r){var v=r.data[w[0]];switch(w[1]){case "==":return v===w[2];case "!=":return v!==w[2];case "<":return v<w[2];case "<=":return v<=w[2];case ">":return v>w[2];case ">=":return v>=w[2];case "in":return (w[2]||[]).indexOf(v)>=0;case "array-contains":return Array.isArray(v)&&v.indexOf(w[2])>=0;default:return true}})});
    if(opts.limit)list=list.slice(0,opts.limit);
    var docs=list.map(function(r){return docSnap(r.id,true,r.data)});
    return {docs:docs,size:docs.length,empty:!docs.length,docChanges:function(){return []},metadata:{fromCache:false,hasPendingWrites:false}};
  }
  function refreshCol(col){(colSubs[col]||[]).forEach(function(s){api("GET","/api/col/"+col).then(function(rows){s.next(colSnap(rows,s.opts))},function(e){if(s.err)s.err(e)})})}
  function refreshDoc(key){(docSubs[key]||[]).forEach(function(s){var p=key.split("/");api("GET","/api/doc/"+p[0]+"/"+encodeURIComponent(p[1])).then(function(r){s.next(docSnap(p[1],r.exists,r.data))},function(e){if(s.err)s.err(e)})})}
  function changed(col,id){
    var key=col+"/"+id;
    if(!pend[col])pend[col]=setTimeout(function(){delete pend[col];refreshCol(col)},150);
    if(docSubs[key]&&!pend[key])pend[key]=setTimeout(function(){delete pend[key];refreshDoc(key)},150);
  }
  function refreshAll(){Object.keys(colSubs).forEach(refreshCol);Object.keys(docSubs).forEach(refreshDoc)}
  var es=null;
  function openEvents(){
    if(es||!window.EventSource)return;
    es=new EventSource("/api/events");
    var first=true;
    es.onopen=function(){if(!first)refreshAll();first=false};
    es.onmessage=function(ev){try{var m=JSON.parse(ev.data);changed(m.col,m.id)}catch(e){}};
  }
  setInterval(function(){if(meUser)refreshAll()},60000);

  function query(col,opts){
    var q={
      where:function(f,op,v){return query(col,Object.assign({},opts,{where:(opts.where||[]).concat([[f,op,v]])}))},
      orderBy:function(f,d){return query(col,Object.assign({},opts,{order:[f,d||"asc"]}))},
      limit:function(n){return query(col,Object.assign({},opts,{limit:n}))},
      get:function(){return api("GET","/api/col/"+col).then(function(rows){return colSnap(rows,opts)})},
      onSnapshot:function(next,err){var s={next:next,err:err,opts:opts};(colSubs[col]=colSubs[col]||[]).push(s);
        api("GET","/api/col/"+col).then(function(rows){next(colSnap(rows,opts))},function(e){if(err)err(e)});
        return function(){colSubs[col]=(colSubs[col]||[]).filter(function(x){return x!==s})}},
      add:function(o){return api("POST","/api/col/"+col,clean(o)).then(function(r){return docRef(col,r.id)})},
      doc:function(id){return docRef(col,id||Math.random().toString(36).slice(2,12))},
      path:col
    };
    return q;
  }
  function docRef(col,id){
    var key=col+"/"+id,url="/api/doc/"+col+"/"+encodeURIComponent(id);
    return {id:id,path:key,
      get:function(){return api("GET",url).then(function(r){return docSnap(id,r.exists,r.data)})},
      set:function(o){return api("PUT",url,clean(o))},
      update:function(o){return api("PATCH",url,clean(o))},
      delete:function(){return api("DELETE",url)},
      onSnapshot:function(next,err){var s={next:next,err:err};(docSubs[key]=docSubs[key]||[]).push(s);
        api("GET",url).then(function(r){next(docSnap(id,r.exists,r.data))},function(e){if(err)err(e)});
        return function(){docSubs[key]=(docSubs[key]||[]).filter(function(x){return x!==s})}}};
  }
  var db={collection:function(p){return query(p,{})},doc:function(p){var i=p.indexOf("/");return docRef(p.slice(0,i),p.slice(i+1))}};
  var downloads={save:function(req){
    try{var data=req.data,blob=data instanceof Blob?data:new Blob([data]);
      var a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=req.filename||"download";document.body.appendChild(a);a.click();a.remove();
      setTimeout(function(){URL.revokeObjectURL(a.href)},2000);return Promise.resolve({status:"saved"})}
    catch(e){return Promise.reject({code:"unavailable",message:String(e)})}}};

  var readyResolve;var ready=new Promise(function(r){readyResolve=r});
  window.claude={use:function(name){
    if(name==="db")return ready.then(function(){return db});
    if(name==="downloads")return Promise.resolve(downloads);
    return Promise.resolve(null);
  }};

  /* ---------- styles ---------- */
  var css='.sv-ov{position:fixed;inset:0;z-index:9999;background:#EEF1F4;display:grid;place-items:center;font-family:"IBM Plex Sans",Arial,sans-serif;padding:20px}'+
  '.sv-card{background:#fff;border:1px solid #D5DBE3;border-radius:12px;padding:26px;width:min(390px,100%);box-sizing:border-box;color:#16202E}'+
  '.sv-card h1{font-size:19px;margin:0 0 4px}.sv-card p{margin:0 0 16px;color:#5B6676;font-size:14px;line-height:1.5}'+
  '.sv-card label{display:block;font-size:13px;color:#5B6676;margin-bottom:12px}.sv-card input{display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:9px;border:1px solid #D5DBE3;border-radius:6px;font-size:15px}'+
  '.sv-card input.code{font-size:24px;letter-spacing:8px;text-align:center}'+
  '.sv-go{width:100%;padding:10px;border:0;border-radius:6px;background:#1E5F83;color:#fff;font-size:15px;font-weight:600;cursor:pointer}.sv-go:disabled{opacity:.6}'+
  '.sv-link{border:0;background:none;color:#1E5F83;font-size:13px;cursor:pointer;padding:0;margin-top:10px}'+
  '.sv-err{color:#A32D2D;font-size:13px;min-height:18px;margin:10px 0 0}.sv-mark{width:36px;height:36px;border-radius:8px;background:#F2A516;color:#12324A;font-weight:700;display:grid;place-items:center;font-size:19px;margin-bottom:12px}'+
  '#svUser{display:flex;gap:8px;align-items:center;font-size:13px;color:#C9D8E2}#svUser button{border:1px solid rgba(255,255,255,.35);background:transparent;color:#fff;border-radius:6px;padding:6px 12px;font-size:13px;cursor:pointer}'+
  '#svDlg{border:0;border-radius:12px;padding:0;width:min(720px,95vw);max-height:90vh;background:var(--panel,#fff);color:var(--ink,#16202E);box-shadow:0 20px 60px rgba(0,0,0,.3);font-family:"IBM Plex Sans",Arial,sans-serif}#svDlg::backdrop{background:rgba(10,15,25,.45)}'+
  '.sv-h{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--line,#D5DBE3)}.sv-h h2{font-size:16px;margin:0}'+
  '.sv-b{padding:14px 18px;max-height:70vh;overflow:auto;font-size:14px}.sv-b table{width:100%;border-collapse:collapse;font-size:13.5px}.sv-b th{text-align:left;font-size:12px;color:var(--muted,#5B6676);padding:6px;border-bottom:1px solid var(--line,#D5DBE3)}.sv-b td{padding:8px 6px;border-bottom:1px solid var(--line,#D5DBE3)}'+
  '.sv-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 10px;margin:12px 0}.sv-grid label{font-size:12.5px;color:var(--muted,#5B6676);display:flex;flex-direction:column;gap:3px}.sv-grid input,.sv-grid select{padding:7px 8px;border:1px solid var(--line,#D5DBE3);border-radius:6px;font-size:14px;background:var(--bg,#EEF1F4);color:inherit}'+
  '.sv-btn{border:1px solid var(--line,#D5DBE3);background:var(--panel,#fff);color:inherit;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px}.sv-btn.primary{background:#1E5F83;border-color:#1E5F83;color:#fff}.sv-btn.warn{color:#A32D2D;border-color:#A32D2D}'+
  '.sv-msg{font-size:13px;min-height:18px;margin-top:8px}.sv-msg.err{color:#A32D2D}.sv-msg.ok{color:#27500A}.sv-chip{font-size:11.5px;padding:1px 8px;border-radius:999px;background:#E6F1FB;color:#0C447C}';
  var HIDE_NONADMIN="#backupBtn,#bkDlg";
  var HIDE_VIEWER=["#addOrder","#addExtra","#addProd","#addPermit","#addDecl","#saveSet","#opApp [data-act=del]","#saveOrder","#delOrder","#saveP","#delProd","#saveQ","#delQ","#addLine","[data-dell]","#mkPi","#doMk","#newPermit","#newDecl","#bulkPGo","#bulkDGo","#bulkSGo","#bulkP","#bulkD","#bulkS",
    "#saveBtn","#delShip","#newBtn","#dupBtn","#saveCompany","#saveBank","#addItem","#addCont","#docApp [data-del]","#docApp [data-logo]","#docApp [data-clearlogo]",
    "#fcyApp [data-fact=reset]","#fcySave","#fcyDel","#fcyApp [data-today]",
    "#declAdd","#batchSub","#declApp [data-sel]","#selAll","#dRule","#dSave","#dDel","#dSaveCfg","#opApp .pc-x"].join(",");
  css+="body.sv-noadmin :is("+HIDE_NONADMIN+"){display:none!important}body.sv-ro :is("+HIDE_VIEWER+"){display:none!important}"+
    ".sv-role{font-size:11.5px;padding:2px 8px;border-radius:999px;background:rgba(242,165,22,.18);color:#F2C86B;font-weight:600;white-space:nowrap}"+
    ".sv-robar{background:#FAEEDA;color:#854F0B;font-size:13px;padding:7px 20px;text-align:center;font-family:'IBM Plex Sans',Arial,sans-serif}";
  function addCss(){var st=document.createElement("style");st.textContent=css;document.head.appendChild(st)}
  if(document.head)addCss();else document.addEventListener("DOMContentLoaded",addCss);

  /* ---------- sign-in ---------- */
  var box=null,loginEmail="";
  function onBody(fn){if(document.body)fn();else document.addEventListener("DOMContentLoaded",fn)}
  function showLogin(){
    if(box)return;meUser=null;
    onBody(function(){
      if(box)return;box=document.createElement("div");box.className="sv-ov";document.body.appendChild(box);step1();
    });
  }
  function step1(msg){
    box.innerHTML='<form class="sv-card" id="svF1" aria-label="Sign in"><div class="sv-mark" aria-hidden="true">B</div><h1>Baraka Import System</h1><p>Sign in with your staff account.</p>'+
      '<label>Email<input id="svEmail" type="email" autocomplete="username" required value="'+esc(loginEmail)+'"></label>'+
      '<label>Password<input id="svPass" type="password" autocomplete="current-password" required></label>'+
      '<button class="sv-go" id="svGo1" type="submit">Continue</button><p class="sv-err" id="svErr" role="alert">'+esc(msg||"")+'</p>'+
      '<p style="font-size:12.5px;margin:6px 0 0">Forgot your password? Ask your administrator to set a new one.</p></form>';
    var f=document.getElementById("svF1");(loginEmail?document.getElementById("svPass"):document.getElementById("svEmail")).focus();
    f.onsubmit=function(ev){ev.preventDefault();var b=document.getElementById("svGo1"),e=document.getElementById("svErr");b.disabled=true;b.textContent="Sending code…";e.textContent="";
      loginEmail=document.getElementById("svEmail").value.trim();
      api("POST","/api/login",{email:loginEmail,password:document.getElementById("svPass").value}).then(function(){step2()},function(x){e.textContent=x.message;b.disabled=false;b.textContent="Continue"})};
  }
  function step2(msg){
    box.innerHTML='<form class="sv-card" id="svF2" aria-label="Enter code"><div class="sv-mark" aria-hidden="true">B</div><h1>Check your email</h1><p>We sent a 6-digit code to <b>'+esc(loginEmail)+'</b>. It expires in 10 minutes.</p>'+
      '<label>Sign-in code<input id="svCode" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required></label>'+
      '<button class="sv-go" id="svGo2" type="submit">Sign in</button><p class="sv-err" id="svErr" role="alert">'+esc(msg||"")+'</p>'+
      '<button type="button" class="sv-link" id="svBack">Use a different account or send a new code</button></form>';
    document.getElementById("svCode").focus();
    document.getElementById("svBack").onclick=function(){step1()};
    document.getElementById("svF2").onsubmit=function(ev){ev.preventDefault();var b=document.getElementById("svGo2"),e=document.getElementById("svErr");b.disabled=true;b.textContent="Checking…";e.textContent="";
      api("POST","/api/verify",{email:loginEmail,code:document.getElementById("svCode").value}).then(function(u){signedIn(u)},function(x){e.textContent=x.message;b.disabled=false;b.textContent="Sign in"})};
  }
  var ROLE_NAMES={admin:"Administrator",entry:"Data entry",viewer:"Follow-up (view only)"};
  function lockForms(){
    if(!document.body.classList.contains("sv-ro"))return;
    document.querySelectorAll("#opApp dialog :is(input,select,textarea),#fcyDlg :is(input,select,textarea),#declDlg :is(input,select,textarea),#form :is(input,select,textarea),#opMain :is(#sDjb,#sEth,#sCoc,#sBook)").forEach(function(el){if(!el.disabled)el.disabled=true});
    document.querySelectorAll("[data-act=edit],[data-dact=edit],[data-fact=edit]").forEach(function(b){if(b.textContent!=="View")b.textContent="View"});
  }
  function applyRole(){
    onBody(function(){
      var r=meUser.role;
      document.body.classList.toggle("sv-noadmin",r!=="admin");
      document.body.classList.toggle("sv-ro",r==="viewer");
      if(r==="viewer"&&!document.querySelector(".sv-robar")){var bar=document.createElement("div");bar.className="sv-robar";bar.setAttribute("role","status");bar.textContent="You are signed in as Follow-up: you can view everything, but not add, change or delete records.";var hdr=document.querySelector(".appsw");if(hdr&&hdr.parentNode)hdr.parentNode.insertBefore(bar,hdr.nextSibling);else document.body.prepend(bar)}
      if(r==="viewer"){lockForms();new MutationObserver(function(){lockForms()}).observe(document.body,{childList:true,subtree:true})}
    });
  }
  function signedIn(u){
    meUser=u;if(box){box.remove();box=null}
    applyRole();
    openEvents();addUserBar();readyResolve(true);refreshAll();
  }
  api("GET","/api/me").then(signedIn,function(){showLogin()});

  /* ---------- header: user, users admin, password ---------- */
  function addUserBar(){
    onBody(function(){
      var right=document.querySelector(".appright")||document.querySelector(".appsw");if(!right||document.getElementById("svUser"))return;
      var s=document.createElement("span");s.id="svUser";
      s.innerHTML='<span class="nm"></span><span class="sv-role">'+esc(ROLE_NAMES[meUser.role]||meUser.role)+'</span>'+(meUser.role==="admin"?'<button type="button" id="svUsersBtn">Users</button>':'')+'<button type="button" id="svPwBtn">Password</button><button type="button" id="svOut">Sign out</button>';
      s.querySelector(".nm").textContent=meUser.name||meUser.email;right.appendChild(s);
      document.getElementById("svOut").onclick=function(){api("POST","/api/logout",{}).then(function(){location.reload()},function(){location.reload()})};
      document.getElementById("svPwBtn").onclick=openPassword;
      var ub=document.getElementById("svUsersBtn");if(ub)ub.onclick=openUsers;
    });
  }
  function dlg(){var d=document.getElementById("svDlg");if(!d){d=document.createElement("dialog");d.id="svDlg";document.body.appendChild(d)}return d}
  function openPassword(){
    var d=dlg();d.innerHTML='<div class="sv-h"><h2>Change your password</h2><button type="button" class="sv-btn" id="svX">Close</button></div><div class="sv-b"><div class="sv-grid"><label>Current password<input type="password" id="svCur" autocomplete="current-password"></label><label>New password (8+ characters)<input type="password" id="svNew" autocomplete="new-password"></label></div><button type="button" class="sv-btn primary" id="svPwSave">Change password</button><p class="sv-msg" id="svMsg" role="status"></p></div>';
    document.getElementById("svX").onclick=function(){d.close()};
    document.getElementById("svPwSave").onclick=function(){var m=document.getElementById("svMsg");
      api("POST","/api/password",{current:document.getElementById("svCur").value,next:document.getElementById("svNew").value}).then(function(){m.className="sv-msg ok";m.textContent="Password changed."},function(x){m.className="sv-msg err";m.textContent=x.message})};
    if(!d.open)d.showModal();
  }
  function openUsers(){
    var d=dlg();
    function draw(list,msg,cls){
      d.innerHTML='<div class="sv-h"><h2>Users</h2><button type="button" class="sv-btn" id="svX">Close</button></div><div class="sv-b">'+
      '<table><thead><tr><th>Name</th><th>Email</th><th>Category</th><th></th></tr></thead><tbody>'+list.map(function(u){return '<tr><td>'+esc(u.name||"")+'</td><td>'+esc(u.email)+'</td><td><span class="sv-chip">'+esc(ROLE_NAMES[u.role]||u.role)+'</span>'+(u.active?'':' <span class="sv-chip" style="background:#FCEBEB;color:#A32D2D">Disabled</span>')+'</td><td style="white-space:nowrap;text-align:right"><button type="button" class="sv-btn" data-ed="'+esc(u.email)+'">Edit</button> '+(u.email===meUser.email?'':'<button type="button" class="sv-btn warn" data-rm="'+esc(u.email)+'">Remove</button>')+'</td></tr>'}).join("")+'</tbody></table>'+
      '<h3 style="font-size:14px;margin:18px 0 0" id="svFormT">Add a user</h3><div class="sv-grid"><label>Full name<input id="svUN"></label><label>Email<input id="svUE" type="email"></label><label>Category<select id="svUR"><option value="entry">Data entry</option><option value="viewer">Follow-up (view only)</option><option value="admin">Administrator</option></select></label><label>Temporary password (8+ characters)<input id="svUP" type="text" autocomplete="off"></label></div>'+
      '<button type="button" class="sv-btn primary" id="svUSave">Save user</button><p class="sv-msg '+(cls||"")+'" id="svMsg" role="status">'+esc(msg||"")+'</p>'+
      '<p style="font-size:12.5px;color:var(--muted,#5B6676);line-height:1.5"><b>Administrator:</b> everything. <b>Data entry:</b> add, edit and delete records; no Backup/Restore or users. <b>Follow-up:</b> view only.</p><p style="font-size:12.5px;color:var(--muted,#5B6676)">Give the person their email and temporary password. At sign-in they receive a code by email, and can then change their password with the Password button.</p></div>';
      document.getElementById("svX").onclick=function(){d.close()};
      d.querySelectorAll("[data-ed]").forEach(function(b){b.onclick=function(){var u=list.filter(function(x){return x.email===b.dataset.ed})[0];document.getElementById("svFormT").textContent="Edit "+u.email;document.getElementById("svUN").value=u.name||"";document.getElementById("svUE").value=u.email;document.getElementById("svUE").readOnly=true;document.getElementById("svUR").value=u.role;document.getElementById("svUP").placeholder="Leave empty to keep the current password";document.getElementById("svUN").focus()}});
      d.querySelectorAll("[data-rm]").forEach(function(b){b.onclick=function(){if(b.dataset.armed!=="1"){b.dataset.armed="1";b.textContent="Click again to remove";setTimeout(function(){b.dataset.armed="";b.textContent="Remove"},4000);return}
        api("DELETE","/api/users/"+encodeURIComponent(b.dataset.rm)).then(function(){load("User removed.","ok")},function(x){load(x.message,"err")})}});
      document.getElementById("svUSave").onclick=function(){
        var body={name:document.getElementById("svUN").value.trim(),email:document.getElementById("svUE").value.trim(),role:document.getElementById("svUR").value};
        var pw=document.getElementById("svUP").value;if(pw)body.password=pw;
        api("POST","/api/users",body).then(function(){load("Saved "+body.email+".","ok")},function(x){var m=document.getElementById("svMsg");m.className="sv-msg err";m.textContent=x.message})};
    }
    function load(msg,cls){api("GET","/api/users").then(function(list){draw(list,msg,cls)},function(x){draw([],x.message,"err")})}
    if(!d.open)d.showModal();load();
  }
})();
