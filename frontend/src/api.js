const API_BASE = process.env.REACT_APP_API_BASE || "https://cs-dashboard-project.onrender.com/api";

// 기본 API 호출 함수
async function apiCall(endpoint, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${API_BASE}${endpoint}${qs ? `?${qs}` : ''}`;

  console.log(`🌐 API 호출: ${url}`);

  try {
    const response = await fetch(url);
    console.log(`📡 응답 상태: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      let errorDetail = `API 호출 실패: ${response.status}`;
      try {
        const error = await response.json();
        errorDetail = error.detail || errorDetail;
      } catch (e) {
        console.warn('에러 응답 파싱 실패:', e);
      }
      throw new Error(errorDetail);
    }
    
    const data = await response.json();
    console.log(`✅ API 응답 성공: ${endpoint}`, data);
    return data;
  } catch (error) {
    console.error(`❌ API 호출 실패: ${endpoint}`, error);
    throw error;
  }
}

// 필터 옵션 조회 (기간 파라미터 필요)
export async function fetchFilterOptions(start, end) {
  return apiCall('/filter-options', { start, end });
}

// 기간별 문의량 조회
export async function fetchPeriodCounts(params) {
  return apiCall('/period-counts', params);
}

// 평균 응답 시간 조회
export async function fetchAvgTimes(params) {
  return apiCall('/avg-times', params);
}

// 고객유형별 CS 문의량 조회
export async function fetchCustomerTypeCS(params) {
  return apiCall('/customer-type-cs', params);
}

// CSAT 분석 데이터 조회
export async function fetchCsatAnalysis(params) {
  return apiCall('/csat-analysis', params);
}

// 워드클라우드 데이터 조회
export async function fetchWordCloudData(params) {
  return apiCall('/wordcloud', params);
}

// 통계 데이터 조회
export async function fetchStatistics(start, end) {
  return apiCall('/statistics', { start, end });
}

// 샘플 데이터 조회
export async function fetchSample(start, end, n = 5) {
  return apiCall('/sample', { start, end, n });
}

// 캐시 관리 API 함수들
export async function fetchCacheStatus() {
  return apiCall('/cache/status');
}

export async function clearCache() {
  const response = await fetch(`${API_BASE}/cache/clear`, {
    method: 'DELETE'
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || `캐시 삭제 실패: ${response.status}`);
  }
  return response.json();
}

export async function refreshCache(start, end) {
  return apiCall('/cache/refresh', { start, end });
}

// API 상태 확인
export async function checkApiHealth() {
  try {
    console.log('🔍 API 상태 확인 중...');
    const response = await fetch(API_BASE.replace('/api', '/health'));
    console.log(`🏥 API 상태: ${response.status} ${response.statusText}`);
    return response.ok;
  } catch (error) {
    console.error('❌ API 연결 실패:', error);
    return false;
  }
} 