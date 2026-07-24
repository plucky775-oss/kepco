(function(){
  'use strict';
  const app=document.getElementById('app');
  const title=document.getElementById('pageTitle');
  const sub=document.getElementById('pageSub');
  window.mount=function(node){ app.innerHTML=''; app.appendChild(node); window.scrollTo(0,0); };
  window.setTop=function(t,s){ title.textContent=t||'작업안전 체크리스트'; sub.textContent=s||'Paperless Safety'; };
  document.getElementById('homeBtn').onclick=()=>location.hash='#/checklists';
  document.getElementById('backBtn').onclick=()=>{ if(history.length>1) history.back(); else location.hash='#/checklists'; };
  function activeNav(key){ document.querySelectorAll('.bottom-nav a').forEach(a=>a.classList.toggle('active',a.dataset.route===key)); }
  async function route(){
    const hash=location.hash||'#/checklists';
    try{
      if(hash==='#/checklists'||hash==='#/'||hash==='#') { activeNav('home'); return window.renderChecklistMenuPage(); }
      if(hash.startsWith('#/checklists/picker')||hash.startsWith('#/checklists/new')) { activeNav('picker'); return window.renderChecklistPickerPage(); }
      if(hash.startsWith('#/checklists/write/')) { activeNav('picker'); const p=hash.split('?')[0].split('/'); return window.renderChecklistWritePage(decodeURIComponent(p[3]||''),decodeURIComponent(p[4]||'')); }
      if(hash.startsWith('#/checklists/drafts')) { activeNav('drafts'); return window.renderChecklistDraftsPage(); }
      if(hash.startsWith('#/checklists/calendar')) { activeNav('calendar'); return window.renderChecklistCalendarPage(); }
      if(hash.startsWith('#/checklists/view/')) { activeNav('calendar'); return window.renderChecklistViewPage(decodeURIComponent(hash.split('?')[0].split('/')[3]||'')); }
      location.hash='#/checklists';
    }catch(e){ app.innerHTML='<section style="padding:24px;background:#fff;border-radius:18px"><h2>화면을 열지 못했습니다</h2><p>'+String(e.message||e)+'</p><a href="#/checklists">홈으로 이동</a></section>'; }
  }
  window.addEventListener('hashchange',route);
  if('serviceWorker' in navigator){
    let refreshing=false;
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(refreshing || String(location.hash || '').startsWith('#/checklists/write')) return;
      refreshing=true;
      location.reload();
    });
    window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>reg.update()).catch(()=>{}));
  }
  route();
})();
