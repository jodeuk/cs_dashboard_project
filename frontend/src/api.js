import axios from "axios";

// API 기본 URL (환경변수, 기본값)
const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:8000/api";

// axios 인스턴스 생성 (공통 옵션)
const api = axios.create({
  baseURL: API_BASE,
  timeout: 60000, // 60초 타임아웃
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
      return Promise.reject(new Error("API 호출 시간 초과 (60초)"));
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
export async function apiCall(method, endpoint, params = {}, data = {}) {
  try {
    const config = { method, url: endpoint };
    if (method === "get" || method === "delete") {
      config.params = params;
    } else {
      config.data = data;
      config.params = params; // 필요시 쿼리도 같이 보낼 수 있음
    }
    const res = await api(config);
    // 콘솔 로그 남기기
    console.log(`✅ ${method.toUpperCase()} ${endpoint}`, res);
    return res;
  } catch (err) {
    console.error(`❌ ${method.toUpperCase()} ${endpoint}`, err.message);
    throw err;
  }
}

// 기존 API들 함수화 (호환성을 위해 params 통일)
export function fetchFilterOptions(start, end, forceRefresh = false) {
  return apiCall("get", "/filter-options", { start, end, force_refresh: forceRefresh });
}
export function fetchPeriodData(params) {
  return apiCall("get", "/period-data", params);
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

export function fetchUserchats(start, end, forceRefresh = false) {
  return apiCall("get", "/userchats", { start, end, force_refresh: forceRefresh });
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
export function checkCacheForPeriod(start, end) {
  return apiCall("get", "/cache/check", { start, end });
}
export function clearCache() {
  return apiCall("delete", "/cache/clear");
}
export function refreshCache(start, end) {
  return apiCall("get", "/cache/refresh", { start, end });
}

// API 상태 확인 (health)
export async function checkApiHealth() {
  try {
    console.log("🔍 API 상태 확인 중...");
    const res = await axios.get("http://localhost:8081/health");
    console.log(`🏥 API 상태: ${res.status} ${res.statusText}`);
    return res.status === 200;
  } catch (err) {
    console.error("❌ API 연결 실패:", err);
    return false;
  }
}

// (예시) POST/PUT 함수가 필요하면 아래처럼 추가
// export function postSomeData(endpoint, data, params = {}) {
//   return apiCall("post", endpoint, params, data);
// }
// export function putSomeData(endpoint, data, params = {}) {
//   return apiCall("put", endpoint, params, data);
// } 