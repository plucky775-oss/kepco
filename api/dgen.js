import { LEGAL_CITY_CODES } from './_legalCityCodes.js';

const KEPCO_DGEN_URL = 'https://bigdata.kepco.co.kr/openapi/v1/dispersedGeneration.do';
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const FETCH_TIMEOUT_MS = 12000;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
}

function cleanText(value) {
  return String(value || '')
    .replace(/[\n\r,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function expandProvinceName(value) {
  return cleanText(value)
    .replace(/^경기(?=\s)/, '경기도')
    .replace(/^강원도(?=\s|$)/, '강원특별자치도')
    .replace(/^강원(?=\s)/, '강원특별자치도')
    .replace(/^전북도(?=\s|$)/, '전북특별자치도')
    .replace(/^전북(?=\s)/, '전북특별자치도')
    .replace(/^제주도(?=\s|$)/, '제주특별자치도')
    .replace(/^제주(?=\s)/, '제주특별자치도')
    .replace(/^전남광주(?=\s|특별시)/, '전남광주통합특별시');
}

function valueOrNull(value) {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

function numberOrNull(value) {
  const text = String(value ?? '').trim().replace(/,/g, '');
  if (!text || text === '-' || /^null$/i.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

async function fetchText(url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });
    const text = await response.text();
    return { response, text };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, headers = {}) {
  const { response, text } = await fetchText(url, headers);
  try {
    return { ok: response.ok, status: response.status, body: JSON.parse(text) };
  } catch {
    return { ok: false, status: response.status, raw: text };
  }
}

function findCityCode(addressText) {
  const address = expandProvinceName(addressText);
  const candidates = LEGAL_CITY_CODES
    .map(([fullCode, name]) => {
      const position = address.indexOf(name);
      return position < 0 ? null : { fullCode, name, position };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const lengthDiff = right.name.length - left.name.length;
      if (lengthDiff) return lengthDiff;
      return left.position - right.position;
    });

  return candidates[0] || null;
}

function parseAddress(addressText, { includeJibun = true } = {}) {
  const address = expandProvinceName(addressText);
  const city = findCityCode(address);
  if (!city) return null;

  const afterCity = cleanText(address.slice(city.position + city.name.length));
  const tokens = afterCity.split(/\s+/).filter(Boolean);
  const lidongIndex = tokens.findIndex((token) => /(?:읍|면|동|가)$/.test(token));
  const lidong = lidongIndex >= 0 ? tokens[lidongIndex] : '';
  const li = lidongIndex >= 0
    ? (tokens.slice(lidongIndex + 1).find((token) => /리$/.test(token)) || '')
    : '';

  let jibun = '';
  if (includeJibun && lidongIndex >= 0) {
    const remainder = tokens.slice(lidongIndex + 1).join(' ');
    const match = remainder.match(/(?:^|\s)(산\s*)?(\d+(?:-\d+)?)(?:번지)?(?=\s|$)/);
    if (match) jibun = (match[1] ? '산 ' : '') + match[2];
  }

  return {
    sourceAddress: address,
    resolvedAddress: address,
    metroCd: city.fullCode.slice(0, 2),
    cityCd: city.fullCode.slice(2, 5),
    cityName: city.name,
    addrLidong: lidong,
    addrLi: li,
    addrJibun: jibun,
  };
}

function addressFromNominatim(record) {
  const address = record?.address || {};
  const parts = [
    address.province,
    address.state,
    address.city,
    address.county,
    address.city_district,
    address.municipality,
    address.town,
    address.village,
    address.suburb,
    address.quarter,
    address.neighbourhood,
  ].filter(Boolean);
  return cleanText([...new Set(parts)].join(' '));
}

async function geocodeAddress(address) {
  const params = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    limit: '1',
    countrycodes: 'kr',
    'accept-language': 'ko',
    q: address,
  });
  const result = await fetchJson(`${NOMINATIM_SEARCH_URL}?${params.toString()}`, {
    'User-Agent': 'KEPCO-DGen-Lookup/1.0 (distributed-generation lookup)',
    Accept: 'application/json',
  });
  const item = Array.isArray(result.body) ? result.body[0] : null;
  if (!item) return null;
  return {
    text: addressFromNominatim(item),
    displayName: valueOrNull(item.display_name),
  };
}

async function reverseGeocode(latitude, longitude) {
  const params = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    'accept-language': 'ko',
    lat: String(latitude),
    lon: String(longitude),
  });
  const result = await fetchJson(`${NOMINATIM_REVERSE_URL}?${params.toString()}`, {
    'User-Agent': 'KEPCO-DGen-Lookup/1.0 (distributed-generation lookup)',
    Accept: 'application/json',
  });
  if (!result.body || !result.body.address) return null;
  return {
    text: addressFromNominatim(result.body),
    displayName: valueOrNull(result.body.display_name),
  };
}

async function resolveLookupAddress(query) {
  const latitude = numberOrNull(query.latitude);
  const longitude = numberOrNull(query.longitude);

  if (latitude != null && longitude != null) {
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      throw new Error('현재 위치 좌표 형식이 올바르지 않습니다.');
    }
    const reverse = await reverseGeocode(latitude, longitude);
    if (!reverse?.text) throw new Error('현재 위치의 주소를 찾지 못했습니다. 지번 주소로 직접 입력해 주세요.');
    const parsed = parseAddress(reverse.text, { includeJibun: false });
    if (!parsed?.addrLidong) {
      throw new Error('현재 위치를 한전 조회용 법정동 주소로 바꾸지 못했습니다. 지번 주소로 직접 입력해 주세요.');
    }
    return {
      ...parsed,
      lookupSource: 'current-location',
      inputAddress: reverse.displayName || reverse.text,
    };
  }

  const input = cleanText(query.address);
  if (!input) throw new Error('주소를 입력해 주세요.');

  const direct = parseAddress(input, { includeJibun: true });
  if (direct?.addrLidong) {
    return { ...direct, lookupSource: 'direct-address', inputAddress: input };
  }

  const geocoded = await geocodeAddress(input);
  const parsed = geocoded?.text ? parseAddress(geocoded.text, { includeJibun: false }) : null;
  if (!parsed?.addrLidong) {
    throw new Error('주소를 한전 조회용 법정동으로 확인하지 못했습니다. “시·도 시·군·구 읍·면·동 지번” 형식으로 입력해 주세요.');
  }
  return {
    ...parsed,
    lookupSource: 'address-converted',
    inputAddress: input,
    convertedAddress: geocoded.displayName || geocoded.text,
  };
}

function normalizeRows(body) {
  const rows = Array.isArray(body?.data)
    ? body.data
    : Array.isArray(body?.response?.body?.items)
      ? body.response.body.items
      : [];
  const seen = new Set();

  return rows.map((row) => ({
    substCd: valueOrNull(row?.substCd),
    substNm: valueOrNull(row?.substNm),
    jsSubstPwr: numberOrNull(row?.jsSubstPwr),
    substPwr: numberOrNull(row?.substPwr),
    mtrNo: valueOrNull(row?.mtrNo),
    jsMtrPwr: numberOrNull(row?.jsMtrPwr),
    mtrPwr: numberOrNull(row?.mtrPwr),
    dlCd: valueOrNull(row?.dlCd),
    dlNm: valueOrNull(row?.dlNm),
    jsDlPwr: numberOrNull(row?.jsDlPwr),
    dlPwr: numberOrNull(row?.dlPwr),
    vol1: numberOrNull(row?.vol1),
    vol2: numberOrNull(row?.vol2),
    vol3: numberOrNull(row?.vol3),
  })).filter((row) => {
    const key = [row.substCd, row.mtrNo, row.dlCd, row.dlNm].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => {
    const capacityDiff = (right.vol3 ?? -Infinity) - (left.vol3 ?? -Infinity);
    if (capacityDiff) return capacityDiff;
    return String(left.dlNm || '').localeCompare(String(right.dlNm || ''), 'ko');
  });
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'GET 요청만 사용할 수 있습니다.' });
  }

  const apiKey = String(process.env.KEPCO_DGEN_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: 'KEPCO_DGEN_API_KEY 환경변수가 설정되지 않았습니다.' });
  }

  try {
    const lookup = await resolveLookupAddress(req.query || {});
    const params = new URLSearchParams({
      metroCd: lookup.metroCd,
      cityCd: lookup.cityCd,
      addrLidong: lookup.addrLidong,
      apiKey,
      returnType: 'json',
    });
    if (lookup.addrLi) params.set('addrLi', lookup.addrLi);
    if (lookup.addrJibun) params.set('addrJibun', lookup.addrJibun);

    const result = await fetchJson(`${KEPCO_DGEN_URL}?${params.toString()}`, {
      Accept: 'application/json',
    });
    if (!result.body) {
      return res.status(502).json({ ok: false, error: '한전 API 응답을 해석하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
    }
    if (result.body.errCd || result.body.error) {
      return res.status(502).json({
        ok: false,
        error: valueOrNull(result.body.errMsg || result.body.error || result.body.message) || '한전 API 조회에 실패했습니다.',
      });
    }

    const data = normalizeRows(result.body);
    return res.status(200).json({
      ok: true,
      address: {
        input: lookup.inputAddress,
        converted: lookup.convertedAddress || null,
        source: lookup.lookupSource,
        metroCd: lookup.metroCd,
        cityCd: lookup.cityCd,
        cityName: lookup.cityName,
        addrLidong: lookup.addrLidong,
        addrLi: lookup.addrLi || null,
        addrJibun: lookup.addrJibun || null,
      },
      data,
    });
  } catch (error) {
    const message = String(error?.message || error || '조회 중 오류가 발생했습니다.');
    return res.status(400).json({ ok: false, error: message });
  }
}
