import axios from "axios";

// 이전 요청 취소를 위한 컨트롤러
let periodController = null;

// BASE는 호스트까지만 (끝 슬래시 정리)
const BASE = (process.env.REACT_APP_API_BASE || "").replace(/\/+$/, "");
const ORIGIN_FOR_HEALTH = BASE.replace(/\/api$/, ""); // 헬스는 루트(/health)

// axios 인스턴스 생성 (공통 옵션)
const api = axios.create({
  baseURL: BASE,
  timeout: 300000, // 5분 타임아웃 (데이터 새로고침용)
  headers: {
    "Content-Type": "application/json",
  },
});

// 요청/응답 인터셉터 (디버깅/토큰 등 추가 가능)
api.interceptors.request.use(
  (config) => {
    // 필요 시 토큰 등 헤더 주입 가능
    // config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    // 더 친절한 에러 처리
    if (error.code === "ECONNABORTED") {
      return Promise.reject(new Error("API 호출 시간 초과 (5분)"));
    }
    if (!window.navigator.onLine) {
      return Promise.reject(new Error("네트워크 연결이 없습니다."));
    }
    if (error.response) {
      // 서버가 응답을 반환한 경우
      const detail = error.response.data?.detail || `API 호출 실패: ${error.response.status}`;
      return Promise.reject(new Error(detail));
    }
    // 기타 네트워크 에러
    return Promise.reject(new Error(error.message || "알 수 없는 오류 발생"));
  }
);

// 공통 호출 함수 (GET, POST, DELETE, PUT 지원)
export async function apiCall(method, endpoint, params = {}, data = {}, options = {}) {
  try {
    // 헬스는 루트(/health). 그 외는 '/api'가 없으면 붙이고, 이미 있으면 그대로.
    const apiEndpoint =
      endpoint.startsWith('/health')
        ? endpoint
        : (endpoint.startsWith('/api') ? endpoint : `/api${endpoint}`);
    const config = { method, url: apiEndpoint, ...options };
    if (options?.signal) config.signal = options.signal; // axios v1은 signal 지원
    
    if (method === "get" || method === "delete") {
      config.params = params;
    } else {
      config.data = data;
      config.params = params; // 필요시 쿼리도 같이 보낼 수 있음
    }
    
    // 최종 URL 디버그 (axios가 조합한 baseURL + url)
    const finalUrl = `${api.defaults.baseURL}${apiEndpoint}`;
    console.log(`➡️ ${method.toUpperCase()} ${finalUrl}`, { params: config.params });
    const res = await api(config);
    console.log(`✅ ${method.toUpperCase()} ${finalUrl}`, res);
    return res;
  } catch (err) {
    console.error(`❌ ${method.toUpperCase()} ${endpoint}`, err.message);
    throw err;
  }
}

// 기존 API들 함수화 (호환성을 위해 params 통일)
// ✅ [변경] fetchFilterOptions - 통합 맵만 받도록
export async function fetchFilterOptions() {
  try {
    const res = await apiCall("get", "/filter-options");
    const d = res || {};
    return {
      ...d,
      subtypeMaps: d.subtype_maps || {},  // [ADD] inquiry/service/customer 통합
    };
  } catch (e1) {
    try {
      // 2) 최소 파라미터만 보내고 같은 엔드포인트 재시도(핸들러 자체 확인용)
      return await apiCall("get", "/filter-options", { start: "2025-04-01", end: "2025-12-31", refresh_mode: "cache" });
    } catch (e2) {
      // 3) 백엔드 라우트가 스네이크 케이스인 환경 폴백 + ASCII 키 사용
      return await apiCall("get", "/filter_options", { start: "2025-04-01", end: "2025-12-31", refresh_mode: "cache" });
    }
  }
}
// ✅ /period-data 연속 호출 시 이전 요청 취소 + 취소는 성공처럼 처리
let lastPeriodData = [];   // 마지막 성공 결과(배너 방지용)

export function fetchPeriodData(params) {
  const p = { ...params };
  [
    "inquiryType","inquirySubtype",
    "serviceType","serviceSubtype",
    "customerType","customerSubtype",
    "문의유형","문의유형_2차","서비스유형","서비스유형_2차","고객유형","고객유형_2차",
  ].forEach((k) => { if (Array.isArray(p[k])) p[k] = p[k].join(","); });
  
  if (periodController) periodController.abort();
  periodController = new AbortController();
  
  return apiCall("get", "/period-data", p, {}, { signal: periodController.signal })
    .then((res) => {
      const data = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
      lastPeriodData = data || [];
      return lastPeriodData;           // ✅ 항상 배열 반환
    })
    .catch((err) => {
      const canceled =
        err?.name === "CanceledError" ||
        err?.code === "ERR_CANCELED" ||
        err?.message === "canceled" ||
        axios.isCancel?.(err);
      if (canceled) {
        console.log("ℹ️ GET /period-data canceled");
        return lastPeriodData;         // ✅ 배너/토스트 띄우지 않음
      }
      throw err;                       // 진짜 오류만 올림
    });
}
export function fetchAvgTimes(params) {
  return apiCall("get", "/avg-times", params);
}
export function fetchCustomerTypeCS(params) {
  return apiCall("get", "/customer-type-cs", params);
}
export function fetchCsatAnalysis(params) {
  return apiCall("get", "/csat-analysis", params);
}

export async function fetchUserchats(start, end, refreshMode = "cache", filterParams = {}) {
  // 이전 요청 취소
  if (periodController) {
    periodController.abort();
  }
  periodController = new AbortController();

  const params = { start, end, refresh_mode: refreshMode, ...filterParams };
  
  try {
    const resp = await apiCall("get", "/period-data", params, undefined, { signal: periodController.signal });

    // 🔒 방어: 배열이 아니면 빈 배열로
    const rows = Array.isArray(resp) ? resp
              : (resp && Array.isArray(resp.data) ? resp.data : []);

    console.log("🔍 fetchUserchats resp type:", Array.isArray(resp) ? "array" : typeof resp, "length:", rows.length);
    lastPeriodData = rows; // ✅ 성공 시 캐시 업데이트
    return rows;
  } catch (error) {
    const canceled =
      error?.name === "CanceledError" ||
      error?.name === "AbortError" ||
      error?.code === "ERR_CANCELED" ||
      error?.message === "canceled" ||
      axios.isCancel?.(error);
    
    if (canceled) {
      console.log("ℹ️ fetchUserchats canceled");
      return lastPeriodData; // ✅ 이전 데이터 반환
    }
    throw error;
  }
}

export function fetchStatistics(start, end) {
  return apiCall("get", "/statistics", { start, end });
}
export function fetchSample(start, end, n = 5) {
  return apiCall("get", "/sample", { start, end, n });
}

// 캐시 관리 API
export function fetchCacheStatus() {
  return apiCall("get", "/cache/status");
}

export function fetchCSatTextAnalysis(start, end) {
  return apiCall("get", "/csat-text-analysis", { start, end });
}
export function checkCacheForPeriod(start, end) {
  return apiCall("get", "/cache/check", { start, end });
}
export function clearCache() {
  return apiCall("delete", "/cache/clear");
}
export function refreshCache(start, end, force = true, include_csat = false) {
  return apiCall("get", "/cache/refresh", { start, end, force, include_csat });
}

// API 상태 확인 (health)
export async function checkApiHealth() {
  try {
    const res = await fetch(`${ORIGIN_FOR_HEALTH}/health`);
    const ok = res.ok;
    console.log("🏥 API 상태:", ok ? "healthy" : "unhealthy", { url: `${ORIGIN_FOR_HEALTH}/health` });
    return { ok, url: `${ORIGIN_FOR_HEALTH}/health`, base: BASE, origin: ORIGIN_FOR_HEALTH };
  } catch (err) {
    console.error("❌ API 연결 실패:", err);
    return { ok: false, url: `${ORIGIN_FOR_HEALTH}/health`, base: BASE, origin: ORIGIN_FOR_HEALTH };
  }
}

// (예시) POST/PUT 함수가 필요하면 아래처럼 추가
// export function postSomeData(endpoint, data, params = {}) {
//   return apiCall("post", endpoint, params, data);
// }
// export function putSomeData(endpoint, data, params = {}) {
//   return apiCall("put", endpoint, params, data);
// } 