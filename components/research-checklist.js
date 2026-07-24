/* 독립형 작업안전 체크리스트 96종
   - 96종 원본 PDF 구조화 데이터 기반
   - 기본정보 직접 입력
   - 오프라인 초안/완료문서(IndexedDB)
   - 전자서명, 이상조치·사진, PDF 저장
*/
(function(){
  'use strict';

  const DATA = Array.isArray(window.RESEARCH_SAFETY_CHECKLISTS) ? window.RESEARCH_SAFETY_CHECKLISTS : [];
  const DATA_BY_CODE = new Map(DATA.map(item=>[String(item.code), item]));
  const DB_NAME = 'POWER_TBM_RESEARCH_CHECKLIST_V1';
  const DB_VERSION = 1;
  const STORE = 'documents';
  const FALLBACK_KEY = 'POWER_TBM_RESEARCH_CHECKLIST_FALLBACK_V1';
  const ACTIVE_DRAFT_KEY = 'POWER_TBM_RESEARCH_CHECKLIST_ACTIVE_DRAFT_V1';
  const PDF_VERSION = 'R&D 체크리스트 Version 1.0 / 2026.05';
  const PDF_RENDER_VERSION = 'standalone-pdf-r2-20260724';
  let dbPromise = null;
  let writerCleanup = null;

  function esc(v){
    return String(v == null ? '' : v)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function pad(n){ return String(n).padStart(2,'0'); }
  function localDate(d){
    const x = d instanceof Date ? d : new Date(d || Date.now());
    if(Number.isNaN(x.getTime())) return '';
    return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`;
  }
  function localDateTimeInput(d){
    const x = d instanceof Date ? d : new Date(d || Date.now());
    if(Number.isNaN(x.getTime())) return '';
    return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
  }
  function displayDateTime(v){
    const d = new Date(v);
    if(Number.isNaN(d.getTime())) return String(v || '-').replace('T',' ');
    return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function isIOSLike(){
    const ua=String(navigator.userAgent || '');
    return /iPad|iPhone|iPod/i.test(ua) || (navigator.platform==='MacIntel' && Number(navigator.maxTouchPoints || 0)>1);
  }
  function waitForPaint(){
    return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  }
  function preparePdfTarget(){
    if(!isIOSLike()) return null;
    try{
      const win=window.open('about:blank','_blank');
      if(!win) return null;
      win.document.open();
      win.document.write('<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PDF 준비 중</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif;background:#f4f7fa;color:#173c56}div{text-align:center;padding:28px}b{display:block;font-size:18px;margin-bottom:8px}small{color:#66788a;line-height:1.6}</style></head><body><div><b>문서를 준비하고 있습니다.</b><small>잠시 후 PDF 저장·공유 화면이 열립니다.</small></div></body></html>');
      win.document.close();
      return win;
    }catch(e){ return null; }
  }
  function closePdfTarget(win){
    try{ if(win && !win.closed) win.close(); }catch(e){}
  }
  function keepChecklistCardVisible(card){
    if(!card) return;
    requestAnimationFrame(()=>{
      const rootStyle=getComputedStyle(document.documentElement);
      const topBar=parseFloat(rootStyle.getPropertyValue('--top')) || 68;
      const bottomNav=parseFloat(rootStyle.getPropertyValue('--bottom')) || 72;
      const rect=card.getBoundingClientRect();
      const topLimit=topBar+12;
      const bottomLimit=Math.max(topLimit+80,window.innerHeight-bottomNav-14);
      let delta=0;
      if(rect.top<topLimit) delta=rect.top-topLimit;
      else if(rect.bottom>bottomLimit) delta=rect.bottom-bottomLimit;
      if(Math.abs(delta)>2) window.scrollBy({top:delta,behavior:'smooth'});
    });
  }
  function uid(prefix){
    let rand='';
    try{
      const a=new Uint8Array(8); crypto.getRandomValues(a);
      rand=Array.from(a).map(v=>v.toString(16).padStart(2,'0')).join('');
    }catch(e){ rand=Math.random().toString(36).slice(2,12); }
    return `${prefix || 'id'}-${Date.now().toString(36)}-${rand}`;
  }
  function cloneJson(value){
    return JSON.parse(JSON.stringify(value));
  }
  function safeJson(raw, fallback){
    try{ const v=JSON.parse(raw); return v == null ? fallback : v; }catch(e){ return fallback; }
  }
  function setBusy(button, on, label){
    if(!button) return;
    if(on){
      button.dataset.oldText=button.textContent;
      button.disabled=true;
      if(label) button.textContent=label;
    }else{
      button.disabled=false;
      if(button.dataset.oldText) button.textContent=button.dataset.oldText;
      delete button.dataset.oldText;
    }
  }
  function flash(message, type){
    let box=document.getElementById('checklistGlobalToast');
    if(!box){
      box=document.createElement('div');
      box.id='checklistGlobalToast';
      box.className='checklist-toast';
      document.body.appendChild(box);
    }
    box.className=`checklist-toast show ${type || ''}`.trim();
    box.textContent=message;
    clearTimeout(box._timer);
    box._timer=setTimeout(()=>box.classList.remove('show'),2600);
  }
  function mountNode(node){
    if(typeof window.mount === 'function') window.mount(node);
    else{
      const app=document.getElementById('app');
      if(app){ app.innerHTML=''; app.appendChild(node); }
    }
  }
  function setPageTop(title, sub){
    if(typeof window.setTop === 'function') window.setTop(title, sub || '', {back:true,home:true});
  }
  function section(html, className){
    const el=document.createElement('section');
    el.className=className || 'panel checklist-page';
    el.innerHTML=html;
    return el;
  }
  function normalizeCode(raw){
    try{ return decodeURIComponent(String(raw || '')).trim(); }catch(e){ return String(raw || '').trim(); }
  }
  function parseWriterHash(){
    const clean=String(location.hash || '').split('?')[0];
    const parts=clean.split('/');
    return {
      code: normalizeCode(parts[3] || ''),
      draftId: normalizeCode(parts[4] || '')
    };
  }
  function parseViewHash(){
    const clean=String(location.hash || '').split('?')[0];
    const parts=clean.split('/');
    return normalizeCode(parts[3] || '');
  }

  function openDb(){
    if(dbPromise) return dbPromise;
    dbPromise = new Promise((resolve,reject)=>{
      if(!('indexedDB' in window)){ reject(new Error('IndexedDB unavailable')); return; }
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        let store;
        if(!db.objectStoreNames.contains(STORE)){
          store=db.createObjectStore(STORE,{keyPath:'id'});
        }else{
          store=req.transaction.objectStore(STORE);
        }
        if(!store.indexNames.contains('status')) store.createIndex('status','status',{unique:false});
        if(!store.indexNames.contains('workDate')) store.createIndex('workDate','workDate',{unique:false});
        if(!store.indexNames.contains('updatedAt')) store.createIndex('updatedAt','updatedAt',{unique:false});
        if(!store.indexNames.contains('templateCode')) store.createIndex('templateCode','templateCode',{unique:false});
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>{ dbPromise=null; reject(req.error || new Error('DB open failed')); };
      req.onblocked=()=>reject(new Error('DB blocked'));
    });
    return dbPromise;
  }
  function fallbackDocs(){
    return safeJson(localStorage.getItem(FALLBACK_KEY) || '{}',{});
  }
  function stripBlobForFallback(doc){
    const copy=cloneJson(doc);
    delete copy.pdfBlob;
    return copy;
  }
  function fallbackPut(doc){
    const all=fallbackDocs();
    all[doc.id]=stripBlobForFallback(doc);
    try{ localStorage.setItem(FALLBACK_KEY,JSON.stringify(all)); return doc; }
    catch(e){
      // 사진이 큰 경우 사진을 제거한 뒤 마지막으로 저장을 시도합니다.
      const small=stripBlobForFallback(doc);
      if(small.responses){
        Object.keys(small.responses).forEach(k=>{ if(small.responses[k]) delete small.responses[k].photo; });
      }
      all[doc.id]=small;
      localStorage.setItem(FALLBACK_KEY,JSON.stringify(all));
      return small;
    }
  }
  async function putDoc(doc){
    const next=Object.assign({},doc,{updatedAt:Date.now()});
    try{
      const db=await openDb();
      await new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE,'readwrite');
        tx.objectStore(STORE).put(next);
        tx.oncomplete=()=>resolve();
        tx.onerror=()=>reject(tx.error || new Error('save failed'));
        tx.onabort=()=>reject(tx.error || new Error('save aborted'));
      });
      return next;
    }catch(e){
      return fallbackPut(next);
    }
  }
  async function getDoc(id){
    if(!id) return null;
    try{
      const db=await openDb();
      const found=await new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE,'readonly');
        const req=tx.objectStore(STORE).get(id);
        req.onsuccess=()=>resolve(req.result || null);
        req.onerror=()=>reject(req.error || new Error('read failed'));
      });
      if(found) return found;
    }catch(e){}
    return fallbackDocs()[id] || null;
  }
  async function getAllDocs(){
    let rows=[];
    try{
      const db=await openDb();
      rows=await new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE,'readonly');
        const req=tx.objectStore(STORE).getAll();
        req.onsuccess=()=>resolve(req.result || []);
        req.onerror=()=>reject(req.error || new Error('read failed'));
      });
    }catch(e){
      rows=Object.values(fallbackDocs());
    }
    rows.sort((a,b)=>Number(b.updatedAt || b.completedAt || 0)-Number(a.updatedAt || a.completedAt || 0));
    return rows;
  }
  async function deleteDoc(id){
    try{
      const db=await openDb();
      await new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE,'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete=()=>resolve();
        tx.onerror=()=>reject(tx.error || new Error('delete failed'));
      });
    }catch(e){}
    const all=fallbackDocs();
    if(all[id]){
      delete all[id];
      try{ localStorage.setItem(FALLBACK_KEY,JSON.stringify(all)); }catch(e){}
    }
  }

  function readTbmContext(){
    const meta=safeJson(localStorage.getItem('tbm_meta_v1') || '{}',{});
    const draft=safeJson(localStorage.getItem('TBM_HELPER_MINUTES_DRAFT_V3') || 'null',null);
    const people=safeJson(localStorage.getItem('TBM_HELPER_MINUTES_PEOPLE_V1') || '{}',{});
    const fields={};
    if(draft && Array.isArray(draft.fields)){
      draft.fields.forEach(f=>{
        if(f && f.id) fields[f.id]=f.type==='checkbox' ? !!f.checked : String(f.value == null ? '' : f.value);
      });
    }
    const participants=[];
    if(people && Array.isArray(people.signNames)){
      people.signNames.forEach(v=>{ const s=String(v || '').trim(); if(s) participants.push(s); });
    }
    if(!participants.length && people && Array.isArray(people.dutyRows)){
      people.dutyRows.forEach(r=>['n1','n2'].forEach(k=>{ const s=String(r && r[k] || '').trim(); if(s) participants.push(s); }));
    }
    const uniqueParticipants=Array.from(new Set(participants));
    return {
      projectName:String(fields.minWorkName || meta.workName || '').trim(),
      company:String(fields.minCompany || meta.company || '').trim(),
      responsible:String(fields.minBoss || fields.minManager || meta.boss || people.managerName || people.bossName || '').trim(),
      location:String(fields.minLocation || meta.location || '').trim(),
      datetime:String(fields.minDatetime || '').trim(),
      headcount:String(fields.minHeadcount || '').trim(),
      participants:uniqueParticipants.join(', '),
      hasData:!!(meta.workName || meta.location || meta.company || meta.boss || (draft && draft.savedAt)),
      sourceSavedAt:Number(draft && draft.savedAt || 0)
    };
  }
  function mapTbmDate(v){
    const raw=String(v || '').trim();
    if(!raw) return localDateTimeInput(new Date());
    const direct=new Date(raw);
    if(!Number.isNaN(direct.getTime())) return localDateTimeInput(direct);
    const m=raw.match(/(\d{4})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})[^\d]*(\d{1,2})?(?:[:시]\s*(\d{1,2}))?/);
    if(m){
      const d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),Number(m[4] || 9),Number(m[5] || 0));
      return localDateTimeInput(d);
    }
    return localDateTimeInput(new Date());
  }
  function makeNewDraft(template, draftId){
    const tbm=readTbmContext();
    const responses={};
    template.checkpoints.forEach(cp=>{ responses[cp.id]={status:'',note:'',photo:''}; });
    const recordChecks={};
    template.requiredDocuments.forEach((_,i)=>{ recordChecks[i]=false; });
    return {
      id:draftId || uid('draft'),
      templateCode:template.code,
      status:'draft',
      createdAt:Date.now(),
      updatedAt:Date.now(),
      workDate:localDate(new Date()),
      meta:{
        projectName:tbm.projectName || '',
        company:tbm.company || '',
        department:'',
        location:tbm.location || '',
        datetime:mapTbmDate(tbm.datetime),
        headcount:tbm.headcount || '',
        manager:'',
        responsible:tbm.responsible || '',
        participants:tbm.participants || '',
        memo:'',
        tbmLinked:tbm.hasData,
        tbmLinkedAt:tbm.hasData ? Date.now() : 0
      },
      responses,
      recordChecks,
      signatures:{manager:'',responsible:''},
      issueCount:0,
      naCount:0,
      answeredCount:0,
      sourceVersion:template.sourceVersion || PDF_VERSION
    };
  }
  function ensureDraftShape(record,template){
    const r=record || makeNewDraft(template);
    r.meta=Object.assign({
      projectName:'',company:'',department:'',location:'',datetime:localDateTimeInput(new Date()),
      headcount:'',manager:'',responsible:'',participants:'',memo:'',tbmLinked:false,tbmLinkedAt:0
    },r.meta || {});
    r.responses=r.responses || {};
    template.checkpoints.forEach(cp=>{
      r.responses[cp.id]=Object.assign({status:'',note:'',photo:''},r.responses[cp.id] || {});
    });
    r.recordChecks=r.recordChecks || {};
    template.requiredDocuments.forEach((_,i)=>{
      if(typeof r.recordChecks[i] !== 'boolean') r.recordChecks[i]=false;
    });
    r.signatures=Object.assign({manager:'',responsible:''},r.signatures || {});
    r.templateCode=template.code;
    r.status=r.status || 'draft';
    r.workDate=localDate(r.meta.datetime || Date.now());
    return r;
  }

  function summarizeRecord(record,template){
    let answered=0,issues=0,na=0;
    template.checkpoints.forEach(cp=>{
      const v=record.responses && record.responses[cp.id] || {};
      if(v.status) answered++;
      if(v.status==='issue') issues++;
      if(v.status==='na') na++;
    });
    record.answeredCount=answered;
    record.issueCount=issues;
    record.naCount=na;
    record.workDate=localDate(record.meta && record.meta.datetime || Date.now());
    return {answered,issues,na,total:template.checkpoints.length};
  }
  function validateRecord(record,template,forComplete){
    const errors=[];
    const m=record.meta || {};
    [
      ['공정명(과제번호)',m.projectName],
      ['작업장소',m.location],
      ['작업일시',m.datetime],
      ['담당자',m.manager],
      ['책임자(PL)',m.responsible]
    ].forEach(([label,value])=>{ if(!String(value || '').trim()) errors.push(`${label}을(를) 입력하세요.`); });
    template.checkpoints.forEach((cp,i)=>{
      const res=record.responses && record.responses[cp.id] || {};
      if(!res.status) errors.push(`${i+1}번 체크포인트를 확인하세요.`);
      if((res.status==='issue' || res.status==='na') && !String(res.note || '').trim()){
        errors.push(`${i+1}번 ${res.status==='issue' ? '이상·조치내용' : '해당 없음 사유'}을 입력하세요.`);
      }
    });
    template.requiredDocuments.forEach((doc,i)=>{
      const optional=/^\(해당 시\)/.test(doc);
      if(!optional && !record.recordChecks[i]) errors.push(`기록·보관 항목 "${doc}"을 확인하세요.`);
    });
    if(forComplete){
      if(!record.signatures || !record.signatures.manager) errors.push('담당자 전자서명이 필요합니다.');
      if(!record.signatures || !record.signatures.responsible) errors.push('책임자(PL) 전자서명이 필요합니다.');
    }
    return errors;
  }

  function renderChecklistMenuPage(){
    if(writerCleanup){ try{ writerCleanup(); }catch(e){} writerCleanup=null; }
    setPageTop('작업안전 체크리스트','R&D 표준공정 96종 · TBM 기본정보 연동');
    const tbm=readTbmContext();
    const node=section(`
      <div class="checklist-hero">
        <div class="checklist-hero-icon">✓</div>
        <div>
          <div class="checklist-kicker">PAPERLESS SAFETY</div>
          <h2>R&D 작업안전 체크리스트</h2>
          <p>5대 분류 · 24개 중분류 · 표준공정 96종을 모바일에서 작성하고 서명·PDF로 보관합니다.</p>
        </div>
      </div>
      <div class="checklist-link-state ${tbm.hasData ? 'linked' : ''}">
        <span class="dot"></span>
        <div>
          <b>${tbm.hasData ? 'TBM 회의록 기본정보 연결 가능' : 'TBM 회의록 기본정보 없음'}</b>
          <small>${tbm.hasData ? `${esc(tbm.projectName || '작업명 미입력')} · ${esc(tbm.location || '장소 미입력')}` : 'TBM 회의록을 먼저 작성하면 공정명·장소·책임자를 자동으로 불러옵니다.'}</small>
        </div>
      </div>
      <div class="checklist-menu-cards">
        <a class="checklist-menu-card primary" href="#/checklists/new">
          <span class="menu-symbol">✎</span><span><b>새 체크리스트 작성</b><small>96종 검색 · 현장 점검 시작</small></span><i>›</i>
        </a>
        <a class="checklist-menu-card" href="#/checklists/drafts">
          <span class="menu-symbol">▤</span><span><b>임시저장 문서</b><small>작성 중인 점검표 이어쓰기</small></span><strong id="checklistDraftCount">-</strong><i>›</i>
        </a>
        <a class="checklist-menu-card" href="#/checklists/calendar">
          <span class="menu-symbol">▦</span><span><b>완료 문서·캘린더</b><small>전자서명 PDF 확인·저장</small></span><strong id="checklistCompleteCount">-</strong><i>›</i>
        </a>
      </div>
      <div class="checklist-source-card">
        <div><b>적용 원본</b><span>${esc(PDF_VERSION)}</span></div>
        <a href="docs/standard-process-checklists-96.pdf" target="_blank" rel="noopener">96종 원본 PDF 보기</a>
      </div>
    `,'panel checklist-page checklist-menu-page');
    mountNode(node);
    getAllDocs().then(rows=>{
      const drafts=rows.filter(x=>x.status==='draft').length;
      const completed=rows.filter(x=>x.status==='completed').length;
      const d=document.getElementById('checklistDraftCount');
      const c=document.getElementById('checklistCompleteCount');
      if(d) d.textContent=`${drafts}건`;
      if(c) c.textContent=`${completed}건`;
    }).catch(()=>{});
  }

  function renderChecklistPickerPage(){
    if(writerCleanup){ try{ writerCleanup(); }catch(e){} writerCleanup=null; }
    setPageTop('체크리스트 선택','코드·작업명·분류로 96종 검색');
    const majors=Array.from(new Map(DATA.map(x=>[x.majorCode,x.majorCategory])).entries());
    const node=section(`
      <div class="checklist-picker-head">
        <div class="checklist-search-wrap">
          <span>⌕</span><input id="checklistSearch" type="search" placeholder="예: 고전압, 수소, 연구-2-2-02" autocomplete="off">
        </div>
        <div class="checklist-filter-row">
          <select id="checklistMajorFilter" aria-label="대분류">
            <option value="">전체 대분류</option>
            ${majors.map(([code,name])=>`<option value="${esc(code)}">${esc(code)}. ${esc(name)}</option>`).join('')}
          </select>
          <select id="checklistSubFilter" aria-label="중분류"><option value="">전체 중분류</option></select>
        </div>
        <div class="checklist-result-summary"><b id="checklistResultCount">96</b>종 표시</div>
      </div>
      <div class="checklist-template-list" id="checklistTemplateList"></div>
    `,'panel checklist-page checklist-picker-page');
    mountNode(node);
    const search=node.querySelector('#checklistSearch');
    const major=node.querySelector('#checklistMajorFilter');
    const sub=node.querySelector('#checklistSubFilter');
    const list=node.querySelector('#checklistTemplateList');
    const count=node.querySelector('#checklistResultCount');

    function fillSubs(){
      const m=major.value;
      const rows=DATA.filter(x=>!m || x.majorCode===m);
      const opts=Array.from(new Map(rows.map(x=>[x.subCode,x.middleCategory])).entries());
      sub.innerHTML='<option value="">전체 중분류</option>'+opts.map(([code,name])=>`<option value="${esc(code)}">${esc(code)}. ${esc(name)}</option>`).join('');
    }
    function render(){
      const q=String(search.value || '').trim().toLowerCase().replace(/\s+/g,' ');
      const rows=DATA.filter(item=>{
        if(major.value && item.majorCode!==major.value) return false;
        if(sub.value && item.subCode!==sub.value) return false;
        if(!q) return true;
        const hay=[item.code,item.workName,item.majorCategory,item.middleCategory]
          .concat(item.hazards || []).join(' ').toLowerCase();
        return hay.includes(q);
      });
      count.textContent=String(rows.length);
      list.innerHTML=rows.length ? rows.map(item=>`
        <article class="checklist-template-card">
          <div class="template-card-top">
            <span class="template-code">${esc(item.code)}</span>
            <span class="template-category">${esc(item.majorCategory)} · ${esc(item.middleCategory)}</span>
          </div>
          <h3>${esc(item.workName)}</h3>
          <div class="template-stats">
            <span>절차 ${item.procedures.length}</span><span>위험요인 ${item.hazards.length}</span><span>점검 ${item.checkpoints.length}</span>
          </div>
          <div class="template-hazard-preview">${esc((item.hazards || []).slice(0,2).join(' · '))}</div>
          <button type="button" class="checklist-start-btn" data-code="${esc(item.code)}">이 체크리스트 작성</button>
        </article>`).join('') : '<div class="checklist-empty">검색 결과가 없습니다.</div>';
      list.querySelectorAll('[data-code]').forEach(btn=>{
        btn.addEventListener('click',()=>{
          const code=btn.getAttribute('data-code');
          const id=uid('draft');
          try{ sessionStorage.setItem(ACTIVE_DRAFT_KEY,id); }catch(e){}
          location.hash=`#/checklists/write/${encodeURIComponent(code)}/${encodeURIComponent(id)}`;
        });
      });
    }
    major.addEventListener('change',()=>{ fillSubs(); render(); });
    sub.addEventListener('change',render);
    search.addEventListener('input',render);
    fillSubs(); render();
  }

  function renderInfoFields(record,template){
    const m=record.meta;
    return `
      <div class="checklist-section-card checklist-info-card">
        <div class="section-card-head">
          <div><span class="section-step">1</span><b>작업 기본정보</b></div>
          <button type="button" class="mini-action" id="checklistImportTbm">TBM 정보 불러오기</button>
        </div>
        <div class="checklist-info-grid">
          <label class="wide">작업공종(Code)<input type="text" value="${esc(template.code)}" readonly></label>
          <label class="wide">작업명<input type="text" value="${esc(template.workName)}" readonly></label>
          <label class="wide">공정명(과제번호)<input id="clProjectName" data-meta="projectName" type="text" value="${esc(m.projectName)}" placeholder="예: R25XX01 암모니아 혼소 발전 실증"></label>
          <label>작업일시<input id="clDatetime" data-meta="datetime" type="datetime-local" value="${esc(m.datetime)}"></label>
          <label>작업장소<input data-meta="location" type="text" value="${esc(m.location)}" placeholder="실험실·현장명"></label>
          <label>회사·연구소<input data-meta="company" type="text" value="${esc(m.company)}" placeholder="회사 또는 연구소"></label>
          <label>부서<input data-meta="department" type="text" value="${esc(m.department)}" placeholder="부서명"></label>
          <label>담당자<input data-meta="manager" type="text" value="${esc(m.manager)}" placeholder="성명"></label>
          <label>책임자(PL)<input data-meta="responsible" type="text" value="${esc(m.responsible)}" placeholder="성명"></label>
          <label>작업인원<input data-meta="headcount" type="number" min="0" inputmode="numeric" value="${esc(m.headcount)}" placeholder="0"></label>
          <label class="wide">참여 작업자<input data-meta="participants" type="text" value="${esc(m.participants)}" placeholder="성명을 쉼표로 구분"></label>
          <label class="wide">비고<textarea data-meta="memo" rows="2" placeholder="작업 특이사항">${esc(m.memo)}</textarea></label>
        </div>
        <div class="tbm-import-note ${m.tbmLinked ? 'linked' : ''}" id="checklistTbmLinkNote">
          ${m.tbmLinked ? '✓ TBM 회의록 기본정보를 불러온 문서입니다.' : 'TBM 회의록의 공사명·회사·장소·책임자를 불러올 수 있습니다.'}
          <a href="#/tbm/minutes">TBM 회의록 열기</a>
        </div>
      </div>`;
  }

  function renderReferenceCards(template){
    return `
      <div class="checklist-reference-grid">
        <details class="checklist-reference-card">
          <summary><span>작업절차도</span><small>${template.procedures.length}단계</small></summary>
          <ol>${template.procedures.map(x=>`<li>${esc(x.replace(/^\d+\.\s*/,''))}</li>`).join('')}</ol>
        </details>
        <details class="checklist-reference-card danger">
          <summary><span>위험 요인</span><small>${template.hazards.length}개</small></summary>
          <ul>${template.hazards.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
        </details>
        <details class="checklist-reference-card ppe" open>
          <summary><span>필수 안전보호구</span></summary>
          <p>${esc(template.ppe)}</p>
        </details>
      </div>`;
  }

  function groupCheckpoints(template){
    const groups=[];
    let current=null;
    template.checkpoints.forEach((cp,index)=>{
      const name=cp.section || '핵심 Check Point';
      if(!current || current.name!==name){
        current={name,items:[]}; groups.push(current);
      }
      current.items.push({cp,index});
    });
    return groups;
  }
  function renderCheckpointGroups(record,template){
    return groupCheckpoints(template).map(group=>`
      <div class="checklist-cp-group">
        <div class="checklist-cp-group-title">${esc(group.name)}</div>
        ${group.items.map(({cp,index})=>{
          const r=record.responses[cp.id] || {};
          return `
          <article class="checklist-cp ${r.status ? `status-${esc(r.status)}` : ''}" data-cp="${esc(cp.id)}">
            <div class="checklist-cp-title">
              <span class="cp-number">${index+1}</span>
              <p>${cp.required ? '<b class="cp-focus">중점</b>' : ''}${esc(cp.text)}</p>
            </div>
            <div class="checklist-status-buttons" role="radiogroup" aria-label="${esc(cp.text)}">
              <button type="button" data-status="ok" class="${r.status==='ok' ? 'selected' : ''}">✓ 확인</button>
              <button type="button" data-status="issue" class="${r.status==='issue' ? 'selected' : ''}">! 이상</button>
              <button type="button" data-status="na" class="${r.status==='na' ? 'selected' : ''}">－ 해당 없음</button>
            </div>
            <div class="checklist-cp-detail ${(r.status==='issue' || r.status==='na') ? 'show' : ''}">
              <textarea data-note rows="2" placeholder="${r.status==='na' ? '해당 없음 사유' : '이상 내용과 즉시 조치사항'}">${esc(r.note || '')}</textarea>
              <div class="checklist-photo-row">
                <label class="photo-add">사진 첨부<input data-photo type="file" accept="image/*" capture="environment"></label>
                <button type="button" data-photo-remove ${r.photo ? '' : 'hidden'}>사진 삭제</button>
              </div>
              <div class="checklist-photo-preview" ${r.photo ? '' : 'hidden'}>${r.photo ? `<img src="${esc(r.photo)}" alt="현장 첨부사진">` : ''}</div>
            </div>
          </article>`;
        }).join('')}
      </div>`).join('');
  }

  function renderSignatureBlock(record){
    return `
      <div class="checklist-section-card checklist-sign-card">
        <div class="section-card-head"><div><span class="section-step">4</span><b>전자서명</b></div><small>완료 전에 담당자·책임자 모두 서명</small></div>
        <div class="checklist-sign-grid">
          <div class="signature-box">
            <div class="signature-title"><b>담당자</b><span id="clManagerSignName">${esc(record.meta.manager || '성명 미입력')}</span></div>
            <canvas id="clManagerSign" data-sign="manager" aria-label="담당자 서명란"></canvas>
            <button type="button" data-clear-sign="manager">서명 지우기</button>
          </div>
          <div class="signature-box">
            <div class="signature-title"><b>책임자(PL)</b><span id="clResponsibleSignName">${esc(record.meta.responsible || '성명 미입력')}</span></div>
            <canvas id="clResponsibleSign" data-sign="responsible" aria-label="책임자 서명란"></canvas>
            <button type="button" data-clear-sign="responsible">서명 지우기</button>
          </div>
        </div>
      </div>`;
  }

  function renderWriterShell(record,template){
    const summary=summarizeRecord(record,template);
    return `
      <div class="checklist-writer-head">
        <div>
          <span class="template-code">${esc(template.code)}</span>
          <h2>${esc(template.workName)}</h2>
          <p>${esc(template.majorCategory)} · ${esc(template.middleCategory)} · 원본 ${template.sourcePage}페이지</p>
        </div>
        <div class="checklist-progress-ring" id="checklistProgressRing" style="--p:${Math.round(summary.answered/summary.total*100)}">
          <b id="checklistProgressPercent">${Math.round(summary.answered/summary.total*100)}%</b><small>확인</small>
        </div>
      </div>
      <div class="checklist-autosave" id="checklistAutosaveState">자동저장 준비</div>
      <div id="checklistValidationBox" class="checklist-validation-box" hidden></div>
      ${renderInfoFields(record,template)}
      <div class="checklist-section-card">
        <div class="section-card-head"><div><span class="section-step">2</span><b>작업내용·위험요인 확인</b></div></div>
        ${renderReferenceCards(template)}
      </div>
      <div class="checklist-section-card">
        <div class="section-card-head sticky-head">
          <div><span class="section-step">3</span><b>핵심 Check Point</b></div>
          <div class="checklist-live-count"><span id="clAnsweredCount">${summary.answered}</span>/${summary.total} · 이상 <span id="clIssueCount">${summary.issues}</span></div>
        </div>
        <div class="checklist-cp-list" id="checklistCpList">${renderCheckpointGroups(record,template)}</div>
      </div>
      <div class="checklist-section-card">
        <div class="section-card-head"><div><span class="section-step">3-1</span><b>기록·보관 확인</b></div></div>
        <div class="checklist-record-list">
          ${template.requiredDocuments.map((doc,i)=>`
            <label class="checklist-record-row ${/^\(해당 시\)/.test(doc) ? 'optional' : ''}">
              <input type="checkbox" data-record-check="${i}" ${record.recordChecks[i] ? 'checked' : ''}>
              <span>${esc(doc)}</span>
              ${/^\(해당 시\)/.test(doc) ? '<small>해당 시</small>' : '<b>필수</b>'}
            </label>`).join('')}
        </div>
      </div>
      ${renderSignatureBlock(record)}
      <div class="checklist-writer-actions">
        <button type="button" id="checklistSaveDraft">임시저장</button>
        <button type="button" id="checklistPreviewPdf">PDF 미리보기</button>
        <button type="button" class="primary" id="checklistComplete">작성 완료·보관</button>
      </div>
    `;
  }

  function fileToCompressedDataUrl(file){
    return new Promise((resolve,reject)=>{
      if(!file || !file.type || !file.type.startsWith('image/')){ reject(new Error('이미지 파일만 첨부할 수 있습니다.')); return; }
      if(file.size>18*1024*1024){ reject(new Error('사진 용량이 너무 큽니다.')); return; }
      const reader=new FileReader();
      reader.onerror=()=>reject(new Error('사진을 읽지 못했습니다.'));
      reader.onload=()=>{
        const img=new Image();
        img.onload=()=>{
          const max=1280;
          const scale=Math.min(1,max/Math.max(img.width,img.height));
          const w=Math.max(1,Math.round(img.width*scale));
          const h=Math.max(1,Math.round(img.height*scale));
          const canvas=document.createElement('canvas');
          canvas.width=w; canvas.height=h;
          const ctx=canvas.getContext('2d');
          ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h);
          ctx.drawImage(img,0,0,w,h);
          resolve(canvas.toDataURL('image/jpeg',0.78));
        };
        img.onerror=()=>reject(new Error('사진 형식을 확인해 주세요.'));
        img.src=String(reader.result || '');
      };
      reader.readAsDataURL(file);
    });
  }

  function bindSignatureCanvas(canvas,initial,onChange){
    if(!canvas) return ()=>{};
    const ctx=canvas.getContext('2d');
    let drawing=false,hasInk=!!initial,last=null;
    function resize(){
      const rect=canvas.getBoundingClientRect();
      const dpr=Math.max(1,window.devicePixelRatio || 1);
      const saved=hasInk ? canvas.toDataURL('image/png') : initial;
      canvas.width=Math.max(1,Math.round(rect.width*dpr));
      canvas.height=Math.max(1,Math.round(rect.height*dpr));
      ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.lineCap='round'; ctx.lineJoin='round'; ctx.lineWidth=2.2; ctx.strokeStyle='#111827';
      ctx.fillStyle='#fff'; ctx.fillRect(0,0,rect.width,rect.height);
      if(saved){
        const img=new Image();
        img.onload=()=>{ ctx.drawImage(img,0,0,rect.width,rect.height); hasInk=true; };
        img.src=saved;
      }
    }
    function point(ev){
      const r=canvas.getBoundingClientRect();
      return {x:ev.clientX-r.left,y:ev.clientY-r.top};
    }
    function down(ev){
      ev.preventDefault(); drawing=true; last=point(ev);
      try{ canvas.setPointerCapture(ev.pointerId); }catch(e){}
    }
    function move(ev){
      if(!drawing) return;
      ev.preventDefault();
      const p=point(ev);
      ctx.beginPath(); ctx.moveTo(last.x,last.y); ctx.lineTo(p.x,p.y); ctx.stroke();
      last=p; hasInk=true;
    }
    function up(ev){
      if(!drawing) return;
      drawing=false; last=null;
      if(hasInk) onChange(canvas.toDataURL('image/png'));
    }
    canvas.addEventListener('pointerdown',down);
    canvas.addEventListener('pointermove',move);
    canvas.addEventListener('pointerup',up);
    canvas.addEventListener('pointercancel',up);
    const ro=('ResizeObserver' in window) ? new ResizeObserver(resize) : null;
    if(ro) ro.observe(canvas);
    else window.addEventListener('resize',resize);
    requestAnimationFrame(resize);
    return {
      clear(){
        hasInk=false; initial='';
        const r=canvas.getBoundingClientRect();
        ctx.fillStyle='#fff'; ctx.fillRect(0,0,r.width,r.height);
        onChange('');
      },
      destroy(){
        if(ro) ro.disconnect(); else window.removeEventListener('resize',resize);
        canvas.removeEventListener('pointerdown',down);
        canvas.removeEventListener('pointermove',move);
        canvas.removeEventListener('pointerup',up);
        canvas.removeEventListener('pointercancel',up);
      }
    };
  }

  async function renderChecklistWritePage(rawCode,rawDraftId){
    if(writerCleanup){ try{ writerCleanup(); }catch(e){} writerCleanup=null; }
    const parsed=parseWriterHash();
    const code=normalizeCode(rawCode || parsed.code);
    let draftId=normalizeCode(rawDraftId || parsed.draftId);
    const template=DATA_BY_CODE.get(code);
    if(!template){
      setPageTop('체크리스트 작성','');
      mountNode(section('<div class="checklist-empty">선택한 체크리스트를 찾을 수 없습니다.<br><a href="#/checklists/new">96종 목록으로 돌아가기</a></div>','panel checklist-page'));
      return;
    }
    if(!draftId){
      draftId=uid('draft');
      history.replaceState(null,document.title,`#/checklists/write/${encodeURIComponent(code)}/${encodeURIComponent(draftId)}`);
    }
    setPageTop('체크리스트 작성',`${template.code} · ${template.workName}`);
    const loading=section('<div class="checklist-loading"><span></span>작성 문서를 불러오는 중입니다.</div>','panel checklist-page');
    mountNode(loading);

    let record=await getDoc(draftId);
    if(record && record.templateCode!==code) record=null;
    record=ensureDraftShape(record || makeNewDraft(template,draftId),template);
    await putDoc(record);
    try{ sessionStorage.setItem(ACTIVE_DRAFT_KEY,draftId); }catch(e){}

    const node=section(renderWriterShell(record,template),'panel checklist-page checklist-writer-page');
    mountNode(node);
    let destroyed=false;
    let saveTimer=0;
    let saveSeq=0;
    const signBindings={};

    function collect(){
      node.querySelectorAll('[data-meta]').forEach(el=>{
        const k=el.getAttribute('data-meta');
        record.meta[k]=String(el.value == null ? '' : el.value);
      });
      node.querySelectorAll('[data-record-check]').forEach(el=>{
        record.recordChecks[el.getAttribute('data-record-check')]=!!el.checked;
      });
      summarizeRecord(record,template);
      return record;
    }
    async function saveNow(showMessage){
      clearTimeout(saveTimer);
      collect();
      const seq=++saveSeq;
      const state=node.querySelector('#checklistAutosaveState');
      if(state) state.textContent='저장 중…';
      try{
        record=await putDoc(record);
        if(destroyed || seq!==saveSeq) return;
        if(state) state.textContent=`저장됨 · ${new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}`;
        if(showMessage) flash('임시저장했습니다.','ok');
      }catch(e){
        if(state) state.textContent='저장 실패';
        if(showMessage) alert('임시저장에 실패했습니다.');
      }
    }
    function scheduleSave(){
      clearTimeout(saveTimer);
      const state=node.querySelector('#checklistAutosaveState');
      if(state) state.textContent='변경사항 저장 대기';
      saveTimer=setTimeout(()=>saveNow(false),450);
    }
    function refreshProgress(){
      const s=summarizeRecord(record,template);
      const pct=Math.round(s.answered/s.total*100);
      const ring=node.querySelector('#checklistProgressRing');
      if(ring) ring.style.setProperty('--p',pct);
      const percent=node.querySelector('#checklistProgressPercent');
      if(percent) percent.textContent=`${pct}%`;
      const ans=node.querySelector('#clAnsweredCount');
      const issue=node.querySelector('#clIssueCount');
      if(ans) ans.textContent=String(s.answered);
      if(issue) issue.textContent=String(s.issues);
    }
    function updateSignNames(){
      const m=node.querySelector('[data-meta="manager"]');
      const r=node.querySelector('[data-meta="responsible"]');
      const a=node.querySelector('#clManagerSignName');
      const b=node.querySelector('#clResponsibleSignName');
      if(a) a.textContent=String(m && m.value || '성명 미입력');
      if(b) b.textContent=String(r && r.value || '성명 미입력');
    }
    node.querySelectorAll('[data-meta]').forEach(el=>{
      el.addEventListener('input',()=>{ collect(); updateSignNames(); scheduleSave(); });
      el.addEventListener('change',()=>{ collect(); updateSignNames(); scheduleSave(); });
    });
    node.querySelectorAll('[data-record-check]').forEach(el=>el.addEventListener('change',scheduleSave));

    node.querySelectorAll('.checklist-cp').forEach(card=>{
      const cpId=card.getAttribute('data-cp');
      const response=record.responses[cpId];
      card.querySelectorAll('[data-status]').forEach(btn=>{
        btn.addEventListener('click',()=>{
          const status=btn.getAttribute('data-status');
          response.status=status;
          card.classList.remove('status-ok','status-issue','status-na');
          card.classList.add(`status-${status}`);
          card.querySelectorAll('[data-status]').forEach(b=>b.classList.toggle('selected',b===btn));
          const detail=card.querySelector('.checklist-cp-detail');
          if(detail) detail.classList.toggle('show',status==='issue' || status==='na');
          const note=card.querySelector('[data-note]');
          if(note) note.placeholder=status==='na' ? '해당 없음 사유' : '이상 내용과 즉시 조치사항';
          refreshProgress(); scheduleSave(); keepChecklistCardVisible(card);
        });
      });
      const note=card.querySelector('[data-note]');
      if(note) note.addEventListener('input',()=>{ response.note=note.value; scheduleSave(); });
      const photo=card.querySelector('[data-photo]');
      if(photo) photo.addEventListener('change',async()=>{
        const file=photo.files && photo.files[0];
        if(!file) return;
        const label=card.querySelector('.photo-add');
        if(label) label.classList.add('busy');
        try{
          response.photo=await fileToCompressedDataUrl(file);
          const preview=card.querySelector('.checklist-photo-preview');
          if(preview){ preview.hidden=false; preview.innerHTML=`<img src="${esc(response.photo)}" alt="현장 첨부사진">`; }
          const remove=card.querySelector('[data-photo-remove]');
          if(remove) remove.hidden=false;
          scheduleSave();
        }catch(e){ alert(e.message || '사진을 첨부하지 못했습니다.'); }
        finally{ if(label) label.classList.remove('busy'); photo.value=''; }
      });
      const remove=card.querySelector('[data-photo-remove]');
      if(remove) remove.addEventListener('click',()=>{
        response.photo='';
        remove.hidden=true;
        const preview=card.querySelector('.checklist-photo-preview');
        if(preview){ preview.hidden=true; preview.innerHTML=''; }
        scheduleSave();
      });
    });

    ['manager','responsible'].forEach(role=>{
      const canvas=node.querySelector(`[data-sign="${role}"]`);
      signBindings[role]=bindSignatureCanvas(canvas,record.signatures[role],value=>{
        record.signatures[role]=value; scheduleSave();
      });
    });
    node.querySelectorAll('[data-clear-sign]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const role=btn.getAttribute('data-clear-sign');
        if(signBindings[role] && signBindings[role].clear) signBindings[role].clear();
      });
    });

    const importBtn=node.querySelector('#checklistImportTbm');
    if(importBtn) importBtn.addEventListener('click',()=>{
      const tbm=readTbmContext();
      if(!tbm.hasData){
        alert('저장된 TBM 회의록 기본정보가 없습니다. TBM 회의록에서 기본정보를 먼저 입력해 주세요.');
        return;
      }
      const map={
        projectName:tbm.projectName,company:tbm.company,location:tbm.location,
        responsible:tbm.responsible,headcount:tbm.headcount,participants:tbm.participants,
        datetime:mapTbmDate(tbm.datetime)
      };
      Object.keys(map).forEach(k=>{
        if(map[k]) record.meta[k]=map[k];
        const el=node.querySelector(`[data-meta="${k}"]`);
        if(el && map[k]) el.value=map[k];
      });
      record.meta.tbmLinked=true; record.meta.tbmLinkedAt=Date.now();
      const note=node.querySelector('#checklistTbmLinkNote');
      if(note){
        note.classList.add('linked');
        note.innerHTML='✓ TBM 회의록 기본정보를 다시 불러왔습니다. <a href="#/tbm/minutes">TBM 회의록 열기</a>';
      }
      updateSignNames(); scheduleSave(); flash('TBM 기본정보를 반영했습니다.','ok');
    });

    const validation=node.querySelector('#checklistValidationBox');
    function showErrors(errors){
      if(!errors.length){ validation.hidden=true; validation.innerHTML=''; return; }
      validation.hidden=false;
      const visible=errors.slice(0,8);
      validation.innerHTML=`<b>완료 전 확인할 항목이 ${errors.length}개 있습니다.</b><ul>${visible.map(e=>`<li>${esc(e)}</li>`).join('')}</ul>${errors.length>8 ? `<small>외 ${errors.length-8}개</small>` : ''}`;
      validation.scrollIntoView({behavior:'smooth',block:'start'});
    }
    const saveBtn=node.querySelector('#checklistSaveDraft');
    if(saveBtn) saveBtn.addEventListener('click',()=>saveNow(true));

    const previewBtn=node.querySelector('#checklistPreviewPdf');
    if(previewBtn) previewBtn.addEventListener('click',async()=>{
      collect();
      const pdfTarget=preparePdfTarget();
      setBusy(previewBtn,true,'PDF 준비 중…');
      try{ await downloadRecordPdf(record,template,{preview:true,targetWindow:pdfTarget}); }
      catch(e){ closePdfTarget(pdfTarget); alert(e.message || 'PDF를 만들지 못했습니다.'); }
      finally{ setBusy(previewBtn,false); }
    });

    const completeBtn=node.querySelector('#checklistComplete');
    if(completeBtn) completeBtn.addEventListener('click',async()=>{
      collect();
      const errors=validateRecord(record,template,true);
      showErrors(errors);
      if(errors.length) return;
      if(record.issueCount>0){
        const ok=confirm(`이상 항목 ${record.issueCount}건이 포함되어 있습니다.\n조치내용을 확인한 뒤 완료 문서로 보관할까요?`);
        if(!ok) return;
      }
      setBusy(completeBtn,true,'완료 문서 생성 중…');
      try{
        record.status='completed';
        record.completedAt=Date.now();
        record.updatedAt=Date.now();
        record.id=record.id.replace(/^draft-/,'doc-');
        record.pdfFilename=pdfFilename(record,template);
        record=await putDoc(record);
        // 이전 draft 키가 달라진 경우 삭제
        if(draftId!==record.id) await deleteDoc(draftId);
        try{
          if(isIOSLike()){
            delete record.pdfBlob;
            record.pdfRenderVersion='ios-native-print-r2';
            record.pdfError='';
            record=await putDoc(record);
          }else{
            const blob=await createPdfBlob(record,template);
            if(blob){
              record.pdfBlob=blob;
              record.pdfRenderVersion=PDF_RENDER_VERSION;
              record.pdfError='';
              record=await putDoc(record);
            }
          }
        }catch(e){
          record.pdfError=String(e && e.message || e || '');
          record=await putDoc(record);
        }
        flash('완료 문서를 보관했습니다.','ok');
        location.hash=`#/checklists/view/${encodeURIComponent(record.id)}`;
      }catch(e){
        record.status='draft';
        alert(e.message || '완료 문서를 저장하지 못했습니다.');
      }finally{ setBusy(completeBtn,false); }
    });

    refreshProgress(); updateSignNames();
    writerCleanup=()=>{
      destroyed=true; clearTimeout(saveTimer);
      try{ collect(); putDoc(record); }catch(e){}
      Object.values(signBindings).forEach(b=>{ try{ b && b.destroy && b.destroy(); }catch(e){} });
    };
  }

  function renderChecklistDraftsPage(){
    if(writerCleanup){ try{ writerCleanup(); }catch(e){} writerCleanup=null; }
    setPageTop('임시저장 문서','작성 중인 체크리스트 이어쓰기');
    const node=section('<div class="checklist-loading"><span></span>임시저장 문서를 확인하는 중입니다.</div>','panel checklist-page');
    mountNode(node);
    getAllDocs().then(rows=>{
      const drafts=rows.filter(x=>x.status==='draft');
      node.innerHTML=`
        <div class="checklist-list-head"><b>임시저장 ${drafts.length}건</b><a href="#/checklists/new">새로 작성</a></div>
        <div class="checklist-document-list">
          ${drafts.length ? drafts.map(r=>{
            const t=DATA_BY_CODE.get(r.templateCode) || {workName:r.templateCode,checkpoints:[]};
            const s=summarizeRecord(r,t);
            return `<article class="checklist-document-card">
              <div><span class="template-code">${esc(r.templateCode)}</span><small>${displayDateTime(r.updatedAt)}</small></div>
              <h3>${esc(t.workName)}</h3>
              <p>${esc(r.meta && r.meta.projectName || '공정명 미입력')} · ${esc(r.meta && r.meta.location || '장소 미입력')}</p>
              <div class="doc-progress"><i style="width:${Math.round(s.answered/Math.max(1,s.total)*100)}%"></i></div>
              <div class="doc-card-actions">
                <a href="#/checklists/write/${encodeURIComponent(r.templateCode)}/${encodeURIComponent(r.id)}">이어쓰기</a>
                <button type="button" data-delete-draft="${esc(r.id)}">삭제</button>
              </div>
            </article>`;
          }).join('') : '<div class="checklist-empty">작성 중인 문서가 없습니다.<br><a href="#/checklists/new">첫 체크리스트 작성하기</a></div>'}
        </div>`;
      node.querySelectorAll('[data-delete-draft]').forEach(btn=>btn.addEventListener('click',async()=>{
        if(!confirm('이 임시저장 문서를 삭제할까요?')) return;
        await deleteDoc(btn.getAttribute('data-delete-draft'));
        renderChecklistDraftsPage();
      }));
    }).catch(e=>{ node.innerHTML=`<div class="checklist-empty">${esc(e.message || '문서를 불러오지 못했습니다.')}</div>`; });
  }

  function makeCalendarDays(year,month,records,selectedDate){
    const first=new Date(year,month,1);
    const last=new Date(year,month+1,0);
    const start=first.getDay();
    const cells=[];
    for(let i=0;i<start;i++) cells.push('<span class="calendar-blank"></span>');
    for(let d=1;d<=last.getDate();d++){
      const key=`${year}-${pad(month+1)}-${pad(d)}`;
      const count=records.filter(r=>r.workDate===key).length;
      cells.push(`<button type="button" class="checklist-calendar-day ${selectedDate===key ? 'selected' : ''} ${count ? 'has-doc' : ''}" data-date="${key}">
        <span>${d}</span>${count ? `<b>${count}</b>` : ''}
      </button>`);
    }
    return cells.join('');
  }
  function renderChecklistCalendarPage(){
    if(writerCleanup){ try{ writerCleanup(); }catch(e){} writerCleanup=null; }
    setPageTop('완료 문서·캘린더','날짜별 전자서명 문서와 PDF 보관');
    const node=section('<div class="checklist-loading"><span></span>완료 문서를 불러오는 중입니다.</div>','panel checklist-page checklist-calendar-page');
    mountNode(node);
    getAllDocs().then(rows=>{
      const records=rows.filter(x=>x.status==='completed');
      const now=new Date();
      let year=now.getFullYear(), month=now.getMonth();
      let selected=localDate(now);
      function dayList(){
        const dayRows=records.filter(r=>r.workDate===selected);
        return dayRows.length ? dayRows.map(r=>{
          const t=DATA_BY_CODE.get(r.templateCode) || {workName:r.templateCode};
          return `<article class="checklist-document-card completed ${Number(r.issueCount)>0 ? 'has-issue' : ''}">
            <div><span class="template-code">${esc(r.templateCode)}</span><small>${displayDateTime(r.completedAt)}</small></div>
            <h3>${esc(t.workName)}</h3>
            <p>${esc(r.meta && r.meta.projectName || '공정명 미입력')} · ${esc(r.meta && r.meta.location || '장소 미입력')}</p>
            <div class="completed-badges"><span>확인 ${Number(r.answeredCount || 0)}</span><span class="${Number(r.issueCount)>0 ? 'issue' : ''}">이상 ${Number(r.issueCount || 0)}</span><span>해당없음 ${Number(r.naCount || 0)}</span></div>
            <div class="doc-card-actions">
              <a href="#/checklists/view/${encodeURIComponent(r.id)}">문서 보기</a>
              <button type="button" data-pdf="${esc(r.id)}">${isIOSLike() ? 'PDF 저장·공유' : 'PDF 저장'}</button>
              <button type="button" class="danger-text" data-delete="${esc(r.id)}">삭제</button>
            </div>
          </article>`;
        }).join('') : '<div class="checklist-empty small">선택한 날짜의 완료 문서가 없습니다.</div>';
      }
      function draw(){
        node.innerHTML=`
          <div class="checklist-calendar-card">
            <div class="calendar-month-head">
              <button type="button" id="clPrevMonth">‹</button>
              <b>${year}년 ${month+1}월</b>
              <button type="button" id="clNextMonth">›</button>
            </div>
            <div class="calendar-week"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div>
            <div class="checklist-calendar-grid">${makeCalendarDays(year,month,records,selected)}</div>
          </div>
          <div class="checklist-list-head"><b>${selected} · ${records.filter(r=>r.workDate===selected).length}건</b><a href="#/checklists/new">새로 작성</a></div>
          <div class="checklist-document-list">${dayList()}</div>
          <div class="checklist-storage-note">이 기기의 브라우저 저장소에 완료 문서 ${records.length}건을 보관 중입니다. 중요한 문서는 PDF로 별도 저장해 주세요.</div>`;
        node.querySelector('#clPrevMonth').onclick=()=>{ month--; if(month<0){month=11;year--;} selected=`${year}-${pad(month+1)}-01`; draw(); };
        node.querySelector('#clNextMonth').onclick=()=>{ month++; if(month>11){month=0;year++;} selected=`${year}-${pad(month+1)}-01`; draw(); };
        node.querySelectorAll('[data-date]').forEach(btn=>btn.onclick=()=>{ selected=btn.getAttribute('data-date'); draw(); });
        node.querySelectorAll('[data-pdf]').forEach(btn=>btn.onclick=async()=>{
          const pdfTarget=preparePdfTarget();
          const id=btn.getAttribute('data-pdf');
          const record=records.find(r=>r.id===id) || await getDoc(id);
          const template=record && DATA_BY_CODE.get(record.templateCode);
          if(!record || !template){ closePdfTarget(pdfTarget); return; }
          setBusy(btn,true,'준비 중…');
          try{ await downloadRecordPdf(record,template,{targetWindow:pdfTarget}); }
          catch(e){ closePdfTarget(pdfTarget); alert(e.message || 'PDF를 저장하지 못했습니다.'); }
          finally{ setBusy(btn,false); }
        });
        node.querySelectorAll('[data-delete]').forEach(btn=>btn.onclick=async()=>{
          if(!confirm('완료 문서를 삭제할까요? 삭제 후 복구할 수 없습니다.')) return;
          await deleteDoc(btn.getAttribute('data-delete'));
          renderChecklistCalendarPage();
        });
      }
      draw();
    }).catch(e=>{ node.innerHTML=`<div class="checklist-empty">${esc(e.message || '문서를 불러오지 못했습니다.')}</div>`; });
  }

  function statusLabel(status){
    return status==='ok' ? '확인' : status==='issue' ? '이상' : status==='na' ? '해당 없음' : '미확인';
  }
  function pdfFilename(record,template){
    const project=String(record.meta && record.meta.projectName || template.workName || '작업').replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim().slice(0,35);
    const stamp=String(record.workDate || localDate(new Date())).replace(/-/g,'');
    return `작업안전체크리스트_${template.code}_${project}_${stamp}.pdf`;
  }
  function printableHtml(record,template){
    const responses=record.responses || {};
    const checkpointRows=template.checkpoints.map((cp,i)=>{
      const r=responses[cp.id] || {};
      return `<tr class="${r.status==='issue' ? 'pdf-issue' : ''}">
        <td>${i+1}</td><td><small>${esc(cp.section || '')}</small>${esc(cp.text)}</td>
        <td>${esc(statusLabel(r.status))}</td><td>${esc(r.note || '')}${r.photo ? `<div class="pdf-photo"><img src="${esc(r.photo)}" alt=""></div>` : ''}</td>
      </tr>`;
    }).join('');
    const procedures=template.procedures.map(x=>`<li>${esc(x)}</li>`).join('');
    const hazards=template.hazards.map(x=>`<li>${esc(x)}</li>`).join('');
    const docs=template.requiredDocuments.map((x,i)=>`<li><b>${record.recordChecks && record.recordChecks[i] ? '☑' : '☐'}</b> ${esc(x)}</li>`).join('');
    return `
      <div class="checklist-pdf-sheet">
        <header class="pdf-title">
          <h1>작업안전 체크리스트</h1>
          <div>${esc(template.code)} · ${esc(template.majorCategory)} / ${esc(template.middleCategory)}</div>
        </header>
        <table class="pdf-info-table">
          <tr><th>작업명</th><td colspan="3">${esc(template.workName)}</td></tr>
          <tr><th>공정명(과제번호)</th><td>${esc(record.meta && record.meta.projectName)}</td><th>작업장소</th><td>${esc(record.meta && record.meta.location)}</td></tr>
          <tr><th>작업일시</th><td>${esc(displayDateTime(record.meta && record.meta.datetime))}</td><th>회사·연구소</th><td>${esc(record.meta && record.meta.company)}</td></tr>
          <tr><th>담당자</th><td>${esc(record.meta && record.meta.manager)}</td><th>책임자(PL)</th><td>${esc(record.meta && record.meta.responsible)}</td></tr>
          <tr><th>작업인원</th><td>${esc(record.meta && record.meta.headcount)}</td><th>부서</th><td>${esc(record.meta && record.meta.department)}</td></tr>
          <tr><th>참여 작업자</th><td colspan="3">${esc(record.meta && record.meta.participants)}</td></tr>
        </table>
        <div class="pdf-two-col">
          <section><h2>작업절차도</h2><ol>${procedures}</ol></section>
          <section class="hazard"><h2>위험 요인</h2><ul>${hazards}</ul></section>
        </div>
        <section class="pdf-ppe"><b>필수 안전보호구</b><span>${esc(template.ppe)}</span></section>
        <h2 class="pdf-check-title">핵심 Check Point</h2>
        <table class="pdf-check-table">
          <thead><tr><th>No.</th><th>점검 항목</th><th>결과</th><th>이상·조치 / 사유</th></tr></thead>
          <tbody>${checkpointRows}</tbody>
        </table>
        <div class="pdf-bottom-grid">
          <section><h2>기록·보관</h2><ul>${docs}</ul></section>
          <section><h2>비고</h2><p>${esc(record.meta && record.meta.memo || '-')}</p></section>
        </div>
        <div class="pdf-signatures">
          <div><b>담당자 : ${esc(record.meta && record.meta.manager)}</b>${record.signatures && record.signatures.manager ? `<img src="${esc(record.signatures.manager)}" alt="담당자 서명">` : '<span>서명 없음</span>'}</div>
          <div><b>책임자(PL) : ${esc(record.meta && record.meta.responsible)}</b>${record.signatures && record.signatures.responsible ? `<img src="${esc(record.signatures.responsible)}" alt="책임자 서명">` : '<span>서명 없음</span>'}</div>
        </div>
        <footer>
          <span>${esc(PDF_VERSION)} · 원본 ${template.sourcePage}페이지</span>
          <span>완료 ${esc(displayDateTime(record.completedAt || Date.now()))} · 이상 ${Number(record.issueCount || 0)}건</span>
        </footer>
      </div>`;
  }
  async function waitImages(root){
    const images=Array.from(root.querySelectorAll('img'));
    await Promise.all(images.map(img=>img.complete && img.naturalWidth ? Promise.resolve() : new Promise(resolve=>{
      const done=()=>resolve();
      img.addEventListener('load',done,{once:true});
      img.addEventListener('error',done,{once:true});
      setTimeout(done,4000);
    })));
  }
  async function waitFonts(){
    try{
      if(document.fonts && document.fonts.ready){
        await Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,1800))]);
      }
    }catch(e){}
  }
  function nativePrintHtml(record,template){
    const styleLinks=Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map(link=>`<link rel="stylesheet" href="${esc(link.href)}">`).join('');
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(pdfFilename(record,template))}</title>${styleLinks}<style>
      html,body{margin:0!important;background:#fff!important;color:#111827!important}
      body{padding:0!important;overflow:auto!important}
      .native-print-help{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;background:#173c56;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif;font-size:12px}
      .native-print-help button{min-height:38px;padding:0 14px;border:0;border-radius:10px;background:#fff;color:#173c56;font-weight:900}
      .native-print-document{border:0!important;border-radius:0!important;background:#fff!important;padding:0!important;overflow:visible!important}
      .native-print-document .checklist-pdf-sheet{width:794px;min-width:794px;max-width:none;margin:0 auto;padding:18px!important}
      @media print{.native-print-help{display:none!important}.native-print-document{position:absolute!important;left:0!important;top:0!important}.native-print-document .checklist-pdf-sheet{width:100%!important;min-width:0!important;margin:0!important}}
    </style></head><body><div class="native-print-help"><span>인쇄 화면에서 <b>공유 → 파일에 저장</b>을 선택하면 PDF로 보관됩니다.</span><button type="button" onclick="window.print()">PDF 저장·공유</button></div><div class="checklist-view-document native-print-document">${printableHtml(record,template)}</div></body></html>`;
  }
  function openNativePrint(record,template,targetWindow){
    const win=targetWindow && !targetWindow.closed ? targetWindow : window.open('about:blank','_blank');
    if(!win) throw new Error('팝업이 차단되었습니다. Safari 설정에서 팝업 차단을 잠시 해제해 주세요.');
    win.document.open();
    win.document.write(nativePrintHtml(record,template));
    win.document.close();
    const startPrint=async()=>{
      try{
        const images=Array.from(win.document.images || []);
        await Promise.all(images.map(img=>img.complete ? Promise.resolve() : new Promise(resolve=>{
          img.addEventListener('load',resolve,{once:true});
          img.addEventListener('error',resolve,{once:true});
          setTimeout(resolve,2500);
        })));
        if(win.document.fonts && win.document.fonts.ready){
          await Promise.race([win.document.fonts.ready,new Promise(resolve=>setTimeout(resolve,1200))]);
        }
        setTimeout(()=>{ try{ win.focus(); win.print(); }catch(e){} },250);
      }catch(e){ try{ win.focus(); win.print(); }catch(err){} }
    };
    if(win.document.readyState==='complete') startPrint();
    else win.addEventListener('load',startPrint,{once:true});
    flash('인쇄 미리보기에서 공유 → 파일에 저장을 선택하세요.','ok');
    return null;
  }
  async function createPdfBlob(record,template){
    if(typeof window.html2pdf !== 'function') throw new Error('PDF 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.');
    const host=document.createElement('div');
    const cover=document.createElement('div');
    host.className='checklist-pdf-render-host';
    host.innerHTML=printableHtml(record,template);
    cover.className='checklist-pdf-generation-cover';
    cover.innerHTML='<span></span><b>PDF 문서를 만드는 중입니다.</b><small>화면을 닫지 말고 잠시 기다려 주세요.</small>';
    document.body.classList.add('checklist-pdf-generating');
    document.body.appendChild(host);
    document.body.appendChild(cover);
    try{
      await waitFonts();
      await waitImages(host);
      await waitForPaint();
      const source=host.firstElementChild;
      if(!source) throw new Error('PDF 내용을 준비하지 못했습니다.');
      const sourceWidth=Math.max(794,Math.ceil(source.scrollWidth || source.offsetWidth || 0));
      const sourceHeight=Math.max(1,Math.ceil(source.scrollHeight || source.offsetHeight || 0));
      const maxPixels=isIOSLike() ? 7200000 : 14500000;
      const maxScale=isIOSLike() ? 1.3 : 1.7;
      const scale=Math.max(1,Math.min(maxScale,Math.sqrt(maxPixels/Math.max(1,sourceWidth*sourceHeight))));
      const worker=window.html2pdf().set({
        margin:[7,7,8,7],
        filename:pdfFilename(record,template),
        image:{type:'jpeg',quality:0.94},
        html2canvas:{
          scale:scale,useCORS:true,allowTaint:false,backgroundColor:'#ffffff',logging:false,
          imageTimeout:8000,scrollX:0,scrollY:0,windowWidth:sourceWidth
        },
        jsPDF:{unit:'mm',format:'a4',orientation:'portrait',compress:true},
        pagebreak:{mode:['css','legacy'],avoid:['.pdf-signatures','.pdf-bottom-grid section']}
      }).from(source);
      const blob=await worker.outputPdf('blob');
      if(!(blob instanceof Blob) || blob.size<3500) throw new Error('생성된 PDF가 비어 있습니다. 다시 시도해 주세요.');
      return blob;
    }finally{
      document.body.classList.remove('checklist-pdf-generating');
      try{ cover.remove(); }catch(e){}
      try{ host.remove(); }catch(e){}
    }
  }
  function triggerBlobDownload(blob,filename,targetWindow){
    const url=URL.createObjectURL(blob);
    let opened=false;
    try{
      if(targetWindow && !targetWindow.closed){
        targetWindow.location.replace(url);
        opened=true;
      }else{
        const a=document.createElement('a');
        a.href=url; a.rel='noopener';
        if(isIOSLike()) a.target='_blank';
        else a.download=filename;
        document.body.appendChild(a); a.click(); a.remove();
        opened=true;
      }
    }finally{
      setTimeout(()=>URL.revokeObjectURL(url),isIOSLike() ? 300000 : 60000);
    }
    if(!opened) throw new Error('PDF 창을 열지 못했습니다.');
  }
  async function downloadRecordPdf(record,template,options){
    const opts=options || {};
    if(isIOSLike() && opts.nativePrint!==false){
      return openNativePrint(record,template,opts.targetWindow || null);
    }
    const cached=record.pdfBlob instanceof Blob && record.pdfRenderVersion===PDF_RENDER_VERSION && record.pdfBlob.size>=3500;
    let blob=cached ? record.pdfBlob : null;
    if(!blob) blob=await createPdfBlob(record,template);
    if(!blob) throw new Error('PDF 생성에 실패했습니다.');
    triggerBlobDownload(blob,pdfFilename(record,template),opts.targetWindow || null);
    if(record.status==='completed' && !cached){
      record.pdfBlob=blob;
      record.pdfRenderVersion=PDF_RENDER_VERSION;
      await putDoc(record);
    }
    return blob;
  }

  async function renderChecklistViewPage(rawId){
    if(writerCleanup){ try{ writerCleanup(); }catch(e){} writerCleanup=null; }
    const id=normalizeCode(rawId || parseViewHash());
    setPageTop('완료 체크리스트','전자서명 문서 확인·PDF 저장');
    const node=section('<div class="checklist-loading"><span></span>완료 문서를 불러오는 중입니다.</div>','panel checklist-page checklist-view-page');
    mountNode(node);
    const record=await getDoc(id);
    if(!record){
      node.innerHTML='<div class="checklist-empty">완료 문서를 찾을 수 없습니다.<br><a href="#/checklists/calendar">캘린더로 돌아가기</a></div>';
      return;
    }
    const template=DATA_BY_CODE.get(record.templateCode);
    if(!template){
      node.innerHTML='<div class="checklist-empty">문서 템플릿을 찾을 수 없습니다.</div>';
      return;
    }
    node.innerHTML=`
      <div class="checklist-complete-banner ${Number(record.issueCount)>0 ? 'issue' : ''}">
        <span>${Number(record.issueCount)>0 ? '!' : '✓'}</span>
        <div><b>${Number(record.issueCount)>0 ? `이상 ${Number(record.issueCount)}건 포함 완료` : '모든 항목 확인 완료'}</b><small>${displayDateTime(record.completedAt)}</small></div>
      </div>
      <div class="checklist-view-actions">
        <button type="button" class="primary" id="viewPdfDownload">${isIOSLike() ? 'PDF 저장·공유' : 'PDF 저장'}</button>
        <a href="#/checklists/calendar">캘린더</a>
      </div>
      <div class="checklist-view-document">${printableHtml(record,template)}</div>`;
    const btn=node.querySelector('#viewPdfDownload');
    btn.addEventListener('click',async()=>{
      const pdfTarget=preparePdfTarget();
      setBusy(btn,true,'PDF 준비 중…');
      try{ await downloadRecordPdf(record,template,{targetWindow:pdfTarget}); }
      catch(e){ closePdfTarget(pdfTarget); alert(e.message || 'PDF를 저장하지 못했습니다.'); }
      finally{ setBusy(btn,false); }
    });
  }

  window.addEventListener('hashchange',()=>{
    if(!String(location.hash || '').startsWith('#/checklists/write') && writerCleanup){
      try{ writerCleanup(); }catch(e){}
      writerCleanup=null;
    }
  });

  window.renderChecklistMenuPage=renderChecklistMenuPage;
  window.renderChecklistPickerPage=renderChecklistPickerPage;
  window.renderChecklistWritePage=renderChecklistWritePage;
  window.renderChecklistDraftsPage=renderChecklistDraftsPage;
  window.renderChecklistCalendarPage=renderChecklistCalendarPage;
  window.renderChecklistViewPage=renderChecklistViewPage;
  window.ResearchChecklistApp={
    data:DATA,
    getAllDocs,
    getDoc,
    putDoc,
    createPdfBlob
  };
})();
