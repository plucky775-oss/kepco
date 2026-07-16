const addressInput = document.getElementById('addressInput');
const lookupButton = document.getElementById('lookupButton');
const locationButton = document.getElementById('locationButton');
const clearButton = document.getElementById('clearButton');
const statusBox = document.getElementById('status');
const resolvedSection = document.getElementById('resolvedSection');
const resolvedAddress = document.getElementById('resolvedAddress');
const convertedAddress = document.getElementById('convertedAddress');
const resultSection = document.getElementById('resultSection');
const resultSummary = document.getElementById('resultSummary');
const resultList = document.getElementById('resultList');
const LAST_ADDRESS_KEY = 'kepco_dgen_last_address_v1';

const escapeHtml = (value)=>String(value ?? '')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#039;');

const capacityText = (value)=>{
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toLocaleString('ko-KR')} kW` : '-';
};

function setStatus(message, type=''){
  statusBox.className = `status ${type}`.trim();
  statusBox.textContent = message;
}

function setLoading(loading){
  lookupButton.disabled = loading;
  locationButton.disabled = loading;
  clearButton.disabled = loading;
  lookupButton.textContent = loading ? '조회 중…' : '조회하기';
}

function resetResults(){
  resolvedSection.hidden = true;
  resultSection.hidden = true;
  resultList.innerHTML = '';
}

function renderResults(payload){
  const meta = payload.address || {};
  const rows = Array.isArray(payload.data) ? payload.data : [];
  const basis = [meta.cityName, meta.addrLidong, meta.addrLi, meta.addrJibun].filter(Boolean).join(' ');
  resolvedAddress.textContent = basis || meta.input || '주소 정보 없음';
  convertedAddress.textContent = meta.converted ? `입력 주소 확인: ${meta.converted}` : '';
  convertedAddress.hidden = !meta.converted;
  resolvedSection.hidden = false;

  if(!rows.length){
    resultSection.hidden = true;
    setStatus('해당 주소 기준의 공개 연계정보가 없습니다. 지번 주소를 확인하거나 인근 지번으로 다시 조회해 주세요.', 'warn');
    return;
  }

  resultSummary.textContent = `후보 회선 ${rows.length}개 · 배전선로 여유용량이 큰 순서`;
  resultList.innerHTML = '';
  rows.forEach((row, index)=>{
    const card = document.createElement('article');
    card.className = 'result-card';
    card.innerHTML = `
      <div class="result-top">
        <div>
          <div class="result-kicker">변전소 · 주변압기</div>
          <div class="substation">${escapeHtml(row.substNm || '변전소 정보 없음')}</div>
          <div class="transformer">${escapeHtml(row.mtrNo ? `주변압기 ${row.mtrNo}` : '주변압기 정보 없음')}</div>
        </div>
        ${index === 0 ? '<span class="rank-badge">DL 여유순</span>' : ''}
      </div>
      <div class="feeder">
        <span>회선명(DL)</span><strong>${escapeHtml(row.dlNm || '정보 없음')}</strong>
        ${row.dlCd ? `<small>${escapeHtml(row.dlCd)}</small>` : ''}
      </div>
      <div class="capacity-grid">
        <div class="capacity"><span>변전소 여유</span><strong>${capacityText(row.vol1)}</strong></div>
        <div class="capacity"><span>주변압기 여유</span><strong>${capacityText(row.vol2)}</strong></div>
        <div class="capacity main"><span>배전선로 여유</span><strong>${capacityText(row.vol3)}</strong></div>
      </div>
      <details class="details">
        <summary>연계용량 상세 보기</summary>
        <div class="detail-grid">
          <span>변전소 총 연계가능용량</span><b>${capacityText(row.jsSubstPwr)}</b>
          <span>변전소 누적 연계용량</span><b>${capacityText(row.substPwr)}</b>
          <span>주변압기 총 연계가능용량</span><b>${capacityText(row.jsMtrPwr)}</b>
          <span>주변압기 누적 연계용량</span><b>${capacityText(row.mtrPwr)}</b>
          <span>배전선로 총 연계가능용량</span><b>${capacityText(row.jsDlPwr)}</b>
          <span>배전선로 누적 연계용량</span><b>${capacityText(row.dlPwr)}</b>
        </div>
      </details>`;
    resultList.appendChild(card);
  });
  resultSection.hidden = false;
  setStatus(`조회가 완료되었습니다. 후보 회선 ${rows.length}개를 확인하세요.`, 'ok');
}

async function lookup(params){
  resetResults();
  setLoading(true);
  setStatus('한전 분산전원 연계정보를 확인하고 있습니다…');
  try{
    const query = new URLSearchParams(params);
    const response = await fetch(`/api/dgen?${query.toString()}`, {cache:'no-store'});
    const payload = await response.json().catch(()=>null);
    if(!response.ok || !payload?.ok) throw new Error(payload?.error || `조회에 실패했습니다. (${response.status})`);
    if(params.address){
      try{ localStorage.setItem(LAST_ADDRESS_KEY, String(params.address)); }catch{}
    }
    renderResults(payload);
  }catch(error){
    setStatus(String(error?.message || '조회 중 오류가 발생했습니다.'), 'error');
  }finally{
    setLoading(false);
  }
}

function lookupAddress(){
  const address = addressInput.value.trim();
  if(!address){
    setStatus('주소를 입력해 주세요. 지번 주소가 가장 정확합니다.', 'warn');
    addressInput.focus();
    return;
  }
  lookup({address});
}

lookupButton.addEventListener('click', lookupAddress);
addressInput.addEventListener('keydown', (event)=>{
  if(event.key === 'Enter'){ event.preventDefault(); lookupAddress(); }
});

locationButton.addEventListener('click', ()=>{
  if(!navigator.geolocation){
    setStatus('이 기기에서는 현재 위치를 사용할 수 없습니다.', 'error');
    return;
  }
  setLoading(true);
  setStatus('현재 위치를 확인하고 있습니다…');
  navigator.geolocation.getCurrentPosition(
    (position)=>lookup({latitude:String(position.coords.latitude), longitude:String(position.coords.longitude)}),
    ()=>{ setLoading(false); setStatus('현재 위치를 가져오지 못했습니다. 주소를 직접 입력해 주세요.', 'warn'); },
    {enableHighAccuracy:false,timeout:10000,maximumAge:300000}
  );
});

clearButton.addEventListener('click', ()=>{
  addressInput.value = '';
  resetResults();
  setStatus('주소를 입력하고 조회하기를 눌러주세요.');
  addressInput.focus();
});

try{
  const saved = localStorage.getItem(LAST_ADDRESS_KEY);
  if(saved) addressInput.value = saved;
}catch{}
