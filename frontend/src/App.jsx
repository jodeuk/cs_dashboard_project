import React, { useState, useEffect, useCallback, useMemo } from "react";
import { fetchUserchats, fetchFilterOptions, checkApiHealth, checkCacheForPeriod } from "./api";
import FilterPanel from "./components/FilterPanel";
import ChartSection from "./components/ChartSection";
import MultiLineChartSection from "./components/MultiLineChartSection";

import CacheStatusSection from "./components/CacheStatusSection";
import CSatChartSection from "./components/CSatChartSection";
import CSatTypeChartSection from "./components/CSatTypeChartSection";

// === KST 유틸 (파일 상단 util 섹션에 추가) ===
const KST_OFFSET = "+09:00";
const toFiniteNumber = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};
const asString = (v, def = "") => (v == null ? def : String(v));

// === robust timestamp parser: number/ms, ' '→'T' ===
function parseTsKST(ts) {
  if (ts == null) return null;
  // number(ms) or numeric string
  if (typeof ts === "number" || (/^\d+$/.test(String(ts)) && String(ts).length >= 12)) {
    const n = Number(ts);
    return Number.isFinite(n) ? new Date(n) : null;
  }
  if (typeof ts !== "string") return null;
  let s = ts.trim();
  // 'YYYY-MM-DD HH:MM:SS(.ms)?' → 'YYYY-MM-DDTHH:MM:SS(.ms)?'
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(s)) {
    s = s.replace(/\s+/, "T");
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
function buildRangeKST(startStr, endStr) {
  const startMs = new Date(`${startStr}T00:00:00.000${KST_OFFSET}`).getTime();
  const endMs   = new Date(`${endStr}T23:59:59.999${KST_OFFSET}`).getTime();
  return { startMs, endMs };
}

// 차트 표준 데이터키로 정규화: {label, value}
function normalizeChartRows(rows, { labelKeyCandidates = ["label", "x축", "dateLabel"], valueKeyCandidates = ["value", "문의량", "count"] } = {}) {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => {
    const label = asString(labelKeyCandidates.find(k => r?.[k] != null) ? r[labelKeyCandidates.find(k => r?.[k] != null)] : "", "");
    const value = toFiniteNumber(valueKeyCandidates.find(k => r?.[k] != null) ? r[valueKeyCandidates.find(k => r?.[k] != null)] : 0);
    return { label, value };
  }).filter(d => d.label !== "" && Number.isFinite(d.value));
}

// 날짜 포맷
const formatDate = (date) => date.toISOString().split("T")[0];

function App() {
  // 날짜 초기값: 한 달 전 ~ 오늘
  const today = new Date();
  const oneMonthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
  const todayStr = formatDate(today);
  const oneMonthAgoStr = formatDate(oneMonthAgo);

  // 상태
  const [userchats, setUserchats] = useState([]); // "상세 row" 전체
  const [filterOptions, setFilterOptions] = useState({});
  const [filterVals, setFilterVals] = useState({
    고객유형: "전체",
    문의유형: "전체", 
    서비스유형: "전체",
    문의유형_2차: "전체",
    서비스유형_2차: "전체"
  });
  const [dateGroup, setDateGroup] = useState("월간");
  const [start, setStart] = useState(oneMonthAgoStr);
  const [end, setEnd] = useState(todayStr);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [apiConnected, setApiConnected] = useState(null);
  const [csatData, setCsatData] = useState(null);
  const [csatQuestionFilter, setCsatQuestionFilter] = useState("A-1"); // CSAT 질문 필터
  const [activeTab, setActiveTab] = useState("CS"); // "CS", "CSAT", "Cache"
  // 도넛 차트 툴팁/호버 상태
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, title: "", count: 0, percent: "" });
  const [hoverIndex, setHoverIndex] = useState(null);

  // --- 최초 API 연결 확인 ---
  useEffect(() => {
    checkApiHealth()
      .then(setApiConnected)
      .catch(() => setApiConnected(false));
  }, []);

  // --- 캐시데이터 로드 ---
  const loadCacheData = useCallback(async (refreshMode = "cache") => {
    setLoading(true);
    try {
      // 현재 날짜까지 자동으로 갱신
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth() + 1;
      const currentDay = today.getDate();
      
      // 4월 1일부터 현재까지
      const startDate = "2025-04-01";
      const endDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;
      
      console.log("📅 데이터 로드 범위:", startDate, "~", endDate);
      
      // refresh_mode에 따른 로그
      if (refreshMode === "refresh") {
        console.log("🔄 전체 갱신 모드 - 기존 캐시 완전 삭제 후 새로 수집");
      } else if (refreshMode === "update") {
        console.log("📥 최신화 모드 - 기존 캐시 유지 + 누락된 기간만 API 호출");
      } else {
        console.log("💾 캐시 모드 - 기존 캐시만 사용");
      }
      
      // 초기 로딩: 최근 1개월만
      const initialEndDate = todayStr;
      const initialStartDate = oneMonthAgoStr;
      
      const rows = await fetchUserchats(initialStartDate, initialEndDate, refreshMode);
      setUserchats(rows);
      
      // 필터 옵션은 전체 범위 (4월 1일~현재)
      const opts = await fetchFilterOptions(startDate, endDate, refreshMode);
      setFilterOptions(opts);
      
      if (refreshMode === "refresh") {
        setSuccess("✅ 데이터가 완전히 갱신되었습니다.");
        setTimeout(() => setSuccess(null), 3000); // 3초 후 메시지 제거
      } else if (refreshMode === "update") {
        // CS 데이터 최신화 완료
        console.log("📥 CS 데이터 최신화 완료");
        setSuccess("✅ CS 데이터가 최신화되었습니다.");
        setTimeout(() => setSuccess(null), 3000);
        
        // CS 데이터 최신화 완료 후 로딩 상태 해제
        setLoading(false);
        
        // CSAT 데이터 최신화는 백그라운드에서 진행 (로딩 상태에 영향 없음)
        (async () => {
          try {
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
            const csatStart = oneWeekAgo.toISOString().split('T')[0];  // 8/13
            const csatEnd = todayStr;  // 8/20
            
            console.log("📥 CSAT 최신화 시작 (백그라운드):", csatStart, "~", csatEnd);
            
            // CS와 동일한 방식으로 CSAT 최신화
            const csatRes = await fetch(`${process.env.REACT_APP_API_BASE}/api/cache/refresh?start=${csatStart}&end=${csatEnd}&force=true&include_csat=true`);
            if (csatRes.ok) {
              const csatResult = await csatRes.json();
              console.log("✅ CSAT 최신화 완료:", csatResult);
              // CSAT 데이터 다시 로드
              loadCsatAnalysis();
              // CSAT 최신화 완료 메시지
              setSuccess("✅ CSAT 데이터도 최신화되었습니다.");
              setTimeout(() => setSuccess(null), 3000);
            } else {
              console.error("❌ CSAT 최신화 API 응답 오류:", csatRes.status);
            }
          } catch (err) {
            console.error("❌ CSAT 최신화 실패:", err);
          }
        })();
      }
    } catch (err) {
      setError("캐시 데이터 로드 실패: " + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // 새로고침 감지 및 자동 갱신
  useEffect(() => {
    const handleBeforeUnload = () => {
      // 페이지 새로고침 시 로컬 스토리지에 플래그 저장
      localStorage.setItem('needsRefresh', 'true');
    };

    const handleLoad = () => {
      // 페이지 로드 시 새로고침 플래그 확인
      const needsRefresh = localStorage.getItem('needsRefresh');
      if (needsRefresh === 'true') {
        localStorage.removeItem('needsRefresh');
        console.log("🔄 새로고침 감지됨 - 데이터 자동 갱신");
        // 새로고침 후 자동으로 최신 데이터 가져오기
        setTimeout(() => {
          if (apiConnected) {
            loadCacheData(true); // 강제 새로고침 모드
          }
        }, 1000); // 1초 후 실행
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('load', handleLoad);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('load', handleLoad);
    };
  }, [apiConnected, loadCacheData]);

  useEffect(() => {
    if (apiConnected) {
      loadCacheData();
    }
  }, [apiConnected, loadCacheData]);

  // CSAT 분석 로드
  const loadCsatAnalysis = useCallback(async () => {
    console.log("🔍 CSAT 분석 시작...");
    try {
      // CSAT 분석 API 직접 호출 (캐시 상태와 관계없이)
      const params = new URLSearchParams({ start, end });
      const res = await fetch(`${process.env.REACT_APP_API_BASE}/api/csat-analysis?${params.toString()}`);
      
      if (res.ok) {
        const result = await res.json();
        console.log("✅ CSAT 분석 결과:", result);
        setCsatData(result);
      } else {
        console.log("⚠️ CSAT 분석 API 호출 실패:", res.status);
        setCsatData(null);
      }
    } catch (e) {
      console.error("❌ CSAT 분석 로드 실패", e);
      setCsatData(null);
    }
  }, [start, end]);

  useEffect(() => {
    if (apiConnected) {
      loadCsatAnalysis();
    }
  }, [apiConnected, loadCsatAnalysis]);

  // --- 실제로 사용할 "현재 필터+기간"의 row ---
  const filteredRows = useMemo(() => {
    // 데이터/날짜 준비되기 전엔 계산 스킵
    if (loading || !Array.isArray(userchats) || userchats.length === 0 || !start || !end) {
      console.log("⏳ skip filteredRows compute (loading or not ready)", { 
        loading, 
        userchatsLen: userchats?.length, 
        start, 
        end 
      });
      return [];
    }
    
    console.log("🔍 filteredRows 계산 시작:", { start, end, userchatsLength: userchats.length });
    
    // 디버깅용 전역 변수 노출 (임시)
    window.debugData = { userchats, start, end, filterVals };
    
    // 사용자가 더 이전 기간 선택 시: 필요할 때만 추가 로드
    const initialStartDate = oneMonthAgoStr;
    if (start < initialStartDate && !userchats.some(r => {
      const dt = parseTsKST(r?.firstAskedAt);
      return dt && dt.getTime() < new Date(`${initialStartDate}T00:00:00+09:00`).getTime();
    })) {
      console.log("📥 이전 기간 데이터 필요 - 추가 로드 시작");
      // 비동기로 추가 데이터 로드 (UI 블로킹 방지)
      (async () => {
        try {
          const additionalRows = await fetchUserchats("2025-04-01", initialStartDate, "cache");
          if (additionalRows && additionalRows.length > 0) {
            console.log("✅ 추가 데이터 로드 완료:", additionalRows.length, "건");
            setUserchats(prev => [...additionalRows, ...prev]);
          }
        } catch (err) {
          console.error("❌ 추가 데이터 로드 실패:", err);
        }
      })();
    }
    
    const { startMs, endMs } = buildRangeKST(start, end);
    const filteredRows = (Array.isArray(userchats) ? userchats : []).filter(r => {
      const dt = parseTsKST(r?.firstAskedAt);
      const t = dt ? dt.getTime() : NaN;
      return Number.isFinite(t) && t >= startMs && t <= endMs;
    });
    
    // 추가 필터링
    const filtered = filteredRows.filter((item) => {

    if (filterVals.고객유형 && filterVals.고객유형 !== "전체") {
        if (
          item.고객유형 !== filterVals.고객유형 &&
          item.고객유형_1차 !== filterVals.고객유형 &&
          (!item.고객유형 || !item.고객유형.includes(filterVals.고객유형))
        )
          return false;
      }
      if (filterVals.고객유형_2차 && filterVals.고객유형_2차 !== "전체") {
        if (item.고객유형_2차 !== filterVals.고객유형_2차) return false;
    }
    if (filterVals.문의유형 && filterVals.문의유형 !== "전체") {
        if (
          item.문의유형 !== filterVals.문의유형 &&
          item.문의유형_1차 !== filterVals.문의유형 &&
          (!item.문의유형 || !item.문의유형.includes(filterVals.문의유형))
        )
          return false;
      }
      if (filterVals.문의유형_2차 && filterVals.문의유형_2차 !== "전체") {
        if (item.문의유형_2차 !== filterVals.문의유형_2차) return false;
    }
    if (filterVals.서비스유형 && filterVals.서비스유형 !== "전체") {
        if (
          item.서비스유형 !== filterVals.서비스유형 &&
          item.서비스유형_1차 !== filterVals.서비스유형 &&
          (!item.서비스유형 || !item.서비스유형.includes(filterVals.서비스유형))
        )
          return false;
      }
      if (filterVals.서비스유형_2차 && filterVals.서비스유형_2차 !== "전체") {
        if (item.서비스유형_2차 !== filterVals.서비스유형_2차) return false;
      }
      return true;
    });
    
    console.log("🔍 filteredRows 결과:", {
      filteredLength: filtered.length,
      sampleData: filtered.slice(0, 2),
      dateRange: { start, end }
    });
    
    return filtered;
  }, [userchats, start, end, filterVals.고객유형, filterVals.문의유형, filterVals.서비스유형, filterVals.문의유형_2차, filterVals.서비스유형_2차]);

  // 유형 필터 변경 시 자동 적용
  useEffect(() => {
    if (Object.keys(filterVals).length > 0) {
      console.log("🔍 유형 필터 변경 감지:", filterVals);
      handleFilterChange();
    }
  }, [filterVals]);

  // 유형 필터 변경 핸들러
  const handleFilterChange = useCallback(async () => {
    try {
      setLoading(true);
      
      // 백엔드에서 유형 필터링된 데이터 가져오기 (캐시에서 필터링)
      const filteredRows = await fetchUserchats(start, end, "cache", {
        고객유형: filterVals.고객유형 || "전체",
        문의유형: filterVals.문의유형 || "전체",
        서비스유형: filterVals.서비스유형 || "전체",
        문의유형_2차: filterVals.문의유형_2차 || "전체",
        서비스유형_2차: filterVals.서비스유형_2차 || "전체"
      });
      
      setUserchats(filteredRows);
      
      console.log("✅ 유형 필터 자동 적용 완료:", { 
        filterVals, 
        filteredCount: filteredRows.length 
      });
      
    } catch (err) {
      console.error("❌ 유형 필터 적용 실패:", err);
      setError("유형 필터 적용 실패: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [start, end, filterVals.고객유형, filterVals.문의유형, filterVals.서비스유형, filterVals.문의유형_2차, filterVals.서비스유형_2차]);

  // --- 차트 집계: 월간 or 주간 ---
  const chartData = useMemo(() => {
    // 로딩 중이거나 데이터 준비 안 됐으면 스킵
    if (!Array.isArray(filteredRows) || filteredRows.length === 0) {
      console.warn("📉 chart/inquiry guard: filteredRows empty → fallback");
      return [];
    }
    
    console.log("🔍 chartData 계산 시작:", { filteredRowsLength: filteredRows.length, dateGroup });
    if (dateGroup === "월간") {
      // 월별 집계
      const map = {};
      filteredRows.forEach((item) => {
        const d = parseTsKST(item.firstAskedAt);
        const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
        if (!map[key]) map[key] = { x축: `${d.getMonth() + 1}월`, 문의량: 0 };
        map[key].문의량 += 1;
      });
      const monthlyRaw = Object.values(map).sort((a, b) => parseInt(a.x축) - parseInt(b.x축));
      console.log("🔍 chartData 월간 결과:", monthlyRaw);
      
      // 표준키 {label, value}로 정규화
      const chartData = normalizeChartRows(monthlyRaw, {
        labelKeyCandidates: ["x축", "label", "dateLabel"],
        valueKeyCandidates: ["문의량", "value", "count"]
      });
      
      // 빈 배열 가드 (NaN 방지)
      if (!chartData.length) {
        console.warn("📉 chart guard: empty chartData");
        return [];
      }
      
      console.log("🔍 chartData 표준화 결과:", chartData);
      return chartData;
    } else {
      // 주별 집계
      const map = {};
      filteredRows.forEach((item) => {
        const d = parseTsKST(item.firstAskedAt);
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay()); // 주의 시작 (일요일)
        const weekKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
        if (!map[weekKey]) {
          const isFirstWeekOfMonth = weekStart.getDate() <= 7;
          map[weekKey] = { 
            x축: `${weekStart.getMonth() + 1}/${weekStart.getDate()}`, 
            문의량: 0,
            월레이블: isFirstWeekOfMonth ? `${weekStart.getMonth() + 1}월` : null,
            month: weekStart.getMonth() + 1  // 월 정보 추가
          };
        }
        map[weekKey].문의량 += 1;
      });
      const weeklyRaw = Object.values(map).sort((a, b) => {
        const [monthA, dayA] = a.x축.split('/').map(Number);
        const [monthB, dayB] = b.x축.split('/').map(Number);
        if (monthA !== monthB) return monthA - monthB;
        return dayA - dayB;
      });
      console.log("🔍 chartData 주간 결과:", weeklyRaw);
      
      // 주간 차트는 월레이블 정보를 유지하기 위해 normalizeChartRows 사용하지 않음
      // ChartSection에서 label, value, 월레이블을 모두 사용할 수 있도록
      const chartData = weeklyRaw.map((item, index) => {
        // 각 월의 첫 번째 데이터가 있는 주에 월 레이블 표시
        let 월레이블 = item.월레이블;
        if (!월레이블 && index > 0) {
          const prevItem = weeklyRaw[index - 1];
          if (prevItem && prevItem.month !== item.month) {
            월레이블 = `${item.month}월`;
          }
        }
        
        // 첫 번째 데이터에는 항상 월 레이블 표시 (기간 필터링으로 인해 월의 첫 주가 빠져있을 수 있음)
        if (index === 0 && !월레이블) {
          월레이블 = `${item.month}월`;
        }
        
        return {
          label: item.x축,
          value: item.문의량,
          월레이블: 월레이블
        };
      });
      
      // 빈 배열 가드 (NaN 방지)
      if (!chartData.length) {
        console.warn("📉 chart guard: empty chartData");
        return [];
      }
      
      console.log("🔍 chartData 주간 결과 (월레이블 포함):", chartData);
      return chartData;
    }
  }, [filteredRows, dateGroup]);

  // --- 평균 응답/해결 시간 차트 데이터 ---
  const avgTimeChartData = useMemo(() => {
    if (!filteredRows.length) return [];
    // 월별 평균 구하기
    const map = {};
          filteredRows.forEach((item) => {
        const d = parseTsKST(item.firstAskedAt);
        const month = `${d.getFullYear()}-${d.getMonth() + 1}`;
      if (!map[month])
        map[month] = {
          x축: `${d.getMonth() + 1}월`,
          operationWaitingTime: [],
          operationAvgReplyTime: [],
          operationTotalReplyTime: [],
          operationResolutionTime: [],
        };
      
      // 유효한 데이터만 배열에 추가 (None 값 제외, 실제 값만)
      if (item.operationWaitingTime != null && item.operationWaitingTime !== '') {
        const waitingTime = timeToSec(item.operationWaitingTime);
        if (waitingTime > 0) map[month].operationWaitingTime.push(waitingTime);
      }
      
      if (item.operationAvgReplyTime != null && item.operationAvgReplyTime !== '') {
        const avgReplyTime = timeToSec(item.operationAvgReplyTime);
        if (avgReplyTime > 0) map[month].operationAvgReplyTime.push(avgReplyTime);
      }
      
      if (item.operationTotalReplyTime != null && item.operationTotalReplyTime !== '') {
        const totalReplyTime = timeToSec(item.operationTotalReplyTime);
        if (totalReplyTime > 0) map[month].operationTotalReplyTime.push(totalReplyTime);
      }
      
      if (item.operationResolutionTime != null && item.operationResolutionTime !== '') {
        const resolutionTime = timeToSec(item.operationResolutionTime);
        if (resolutionTime > 0) {
          map[month].operationResolutionTime.push(resolutionTime);
          // 7월 데이터 디버깅
          if (month === '2025-7') {
            console.log(`🔍 7월 해결시간 데이터 추가:`, {
              원본값: item.operationResolutionTime,
              변환값: resolutionTime,
              배열길이: map[month].operationResolutionTime.length
            });
          }
        }
      }
    });

    const result = Object.values(map)
      .map((m) => {
        const avgWaitingTime = avg(m.operationWaitingTime);
        const avgReplyTime = avg(m.operationAvgReplyTime);
        const avgTotalReplyTime = avg(m.operationTotalReplyTime);
        const avgResolutionTime = avg(m.operationResolutionTime);
        
        return {
          x축: m.x축,
          operationWaitingTime: avgWaitingTime > 0 ? avgWaitingTime : null,
          operationAvgReplyTime: avgReplyTime > 0 ? avgReplyTime : null,
          operationTotalReplyTime: avgTotalReplyTime > 0 ? avgTotalReplyTime : null,
          operationResolutionTime: avgResolutionTime > 0 ? avgResolutionTime : null,
        };
      })
      .sort((a, b) => parseInt(a.x축) - parseInt(a.x축));
    
    return result;
  }, [filteredRows, dateGroup]);

  // --- 통계 ---
  const statistics = useMemo(() => {
    return {
      총문의수: filteredRows.length,
    };
  }, [filteredRows]);

  // --- 문의유형별 차트 데이터 ---
  const inquiryTypeData = useMemo(() => {
    // 로딩 중이거나 데이터 준비 안 됐으면 스킵
    if (loading || !Array.isArray(filteredRows) || filteredRows.length === 0) {
      console.log("⏳ skip inquiryTypeData compute", { loading, filteredRowsLength: filteredRows?.length });
    return [];
    }
    
    console.log("🔍 inquiryTypeData 계산 시작:", { 
      filteredRowsLength: filteredRows.length, 
      filterVals문의유형: filterVals.문의유형 
    });
    
    if (filterVals.문의유형 === "전체") {
      // 문의유형별 집계 (1차 값만 사용)
      const counts = {};
      filteredRows.forEach(item => {
        let type = item.문의유형 || "";
        // '/'로 분리된 경우 첫 번째 값만 사용
        if (type && type.includes('/')) {
          type = type.split('/')[0].trim();
        }
        // 빈 값이나 null이 아닌 경우만 카운트
        if (type && type.trim() !== "") {
          counts[type] = (counts[type] || 0) + 1;
        }
      });
      const inquiryRaw = Object.entries(counts)
        .map(([type, count]) => ({ 문의유형: type, 문의량: Number(count) || 0 }))
        .filter(item => !isNaN(item.문의량) && item.문의량 > 0)
        .sort((a, b) => b.문의량 - a.문의량);
      
      console.log("🔍 inquiryTypeData 전체 결과:", inquiryRaw);
      
      // 표준키 {label, value}로 정규화
      const inquiryData = normalizeChartRows(inquiryRaw, {
        labelKeyCandidates: ["label", "라벨", "name", "유형", "문의유형"],
        valueKeyCandidates: ["value", "건수", "count", "문의량"]
      });
      
      console.log("🔍 inquiryTypeData 표준화 결과:", inquiryData);
      return inquiryData;
      } else {
      // 선택된 문의유형의 2차 분류별 집계
      const counts = {};
      filteredRows.forEach(item => {
        let itemType = item.문의유형 || "";
        if (itemType.includes('/')) {
          itemType = itemType.split('/')[0].trim();
        }
        if (itemType === filterVals.문의유형) {
          const type2 = item.문의유형_2차 || "";
          // 빈 값이나 null이 아닌 경우만 카운트
          if (type2 && type2.trim() !== "") {
            counts[type2] = (counts[type2] || 0) + 1;
          }
        }
      });
      const inquiryRaw = Object.entries(counts)
        .map(([type, count]) => ({ 문의유형_2차: type, 문의량: Number(count) || 0 }))
        .filter(item => !isNaN(item.문의량) && item.문의량 > 0)
        .sort((a, b) => b.문의량 - a.문의량);
      
      console.log("🔍 inquiryTypeData 2차 결과:", inquiryRaw);
      
      // 표준키 {label, value}로 정규화
      const inquiryData = normalizeChartRows(inquiryRaw, {
        labelKeyCandidates: ["label", "라벨", "name", "유형", "문의유형_2차"],
        valueKeyCandidates: ["value", "건수", "count", "문의량"]
      });
      
      console.log("🔍 inquiryTypeData 표준화 결과:", inquiryData);
      return inquiryData;
    }
  }, [filteredRows, filterVals.문의유형]);

  // --- 고객유형별 도넛 차트 데이터 ---
  const customerTypeData = useMemo(() => {
    // 로딩 중이거나 데이터 준비 안 됐으면 스킵
    if (loading || !Array.isArray(filteredRows) || filteredRows.length === 0) {
      console.log("⏳ skip customerTypeData compute", { loading, filteredRowsLength: filteredRows?.length });
      return [];
    }
    
    const counts = {};
    filteredRows.forEach(item => {
      let type = item.고객유형 || "";
      // '/'로 분리된 경우 첫 번째 값만 사용
      if (type && type.includes('/')) {
        type = type.split('/')[0].trim();
      }
      // 빈 값이나 null이 아닌 경우만 카운트
      if (type && type.trim() !== "") {
        counts[type] = (counts[type] || 0) + 1;
      }
    });
    
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    const top5 = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    const others = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(5)
      .reduce((sum, [_, count]) => sum + count, 0);
    
    let result = top5.map(([type, count]) => ({
      고객유형: type,
      문의량: count,
      퍼센트: (count / total * 100).toFixed(1),
      라벨: `${type} (${(count / total * 100).toFixed(1)}%)`
    }));
    
    if (others > 0) {
      result.push({
        고객유형: "기타",
        문의량: others,
        퍼센트: (others / total * 100).toFixed(1),
        라벨: `기타 (${(others / total * 100).toFixed(1)}%)`
      });
    }
    
    return result;
  }, [filteredRows]);

  // --- 유틸 함수 ---
  function timeToSec(t) {
    // null, undefined, 빈 문자열 처리
    if (!t || t === "" || t === " " || t === "null" || t === "undefined") return 0;
    
    if (typeof t === "number") {
      // NaN 체크
      if (isNaN(t)) return 0;
      // 이미 분 단위라면 그대로
      return t;
    }
    
    if (typeof t === "string") {
      // 공백 제거
      t = t.trim();
      if (!t) return 0;
      
      if (t.includes(":")) {
        const parts = t.split(":");
        // 각 부분이 숫자인지 확인
        const p = parts.map((x) => {
          const num = parseInt(x.trim(), 10);
          return isNaN(num) ? 0 : num;
        });
        
        if (p.length === 3) {
          // HH:MM:SS -> 분으로 변환
          return p[0] * 60 + p[1] + p[2] / 60;
        }
        if (p.length === 2) {
          // MM:SS -> 분으로 변환
          return p[0] + p[1] / 60;
        }
        if (p.length === 1) {
          // M -> 분으로 변환
          return p[0];
        }
        return 0;
      }
      
      // 숫자 문자열인 경우
      const num = parseFloat(t);
      if (isNaN(num)) return 0;
      
      if (num > 1000) {
        // 큰 숫자는 초 단위로 간주하고 분으로 변환
        return num / 60;
      } else {
        // 작은 숫자는 분 단위로 간주
        return num;
      }
    }
    
    return 0;
  }
  function avg(arr) {
    const f = arr.filter((x) => 
      x !== null && 
      x !== undefined && 
      x !== "" && 
      !isNaN(x) && 
      typeof x === "number"
    );
    if (!f.length) return 0;
    return Math.round((f.reduce((a, b) => a + b, 0) / f.length) * 100) / 100;
  }

  // --- 화면 ---
  if (apiConnected === null) {
    return (
      <div style={{ padding: 32, fontFamily: "sans-serif", textAlign: "center" }}>
        <h2>CS 대시보드</h2>
        <div style={{ color: "#1565c0", margin: "20px 0" }}>🔄 백엔드 연결 확인 중...</div>
      </div>
    );
  }
  if (!apiConnected) {
    return (
      <div style={{ padding: 32, fontFamily: "sans-serif", textAlign: "center" }}>
        <h2>CS 대시보드</h2>
        <div style={{ color: "red", margin: "20px 0" }}>
          ⚠️ 백엔드 API에 연결할 수 없습니다.<br />
          백엔드 서버가 실행 중인지 확인해주세요.
        </div>
        <div style={{ fontSize: "14px", color: "gray" }}>
          백엔드 서버: <code>{process.env.REACT_APP_API_BASE}</code>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 32, fontFamily: "sans-serif", backgroundColor: "#f5f5f5", minHeight: "100vh" }}>
      {/* 커스텀 툴팁 */}
      <div
        style={{
          position: "fixed",
          display: tooltip.visible ? "block" : "none",
          left: tooltip.x + 10,
          top: tooltip.y - 10,
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          color: "white",
          padding: "8px 12px",
          borderRadius: "6px",
          fontSize: "14px",
          zIndex: 1000,
          pointerEvents: "none",
          whiteSpace: "nowrap"
        }}
      >
        <div style={{ fontWeight: "bold", marginBottom: 4 }}>{tooltip.title}</div>
        <div>문의량: {tooltip.count?.toLocaleString?.() ?? tooltip.count}건</div>
        <div>비율: {tooltip.percent}%</div>
      </div>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
          <h1 style={{ textAlign: "center", color: "#333", margin: 0 }}>
          📊 CS 대시보드
        </h1>
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={() => loadCacheData("update")}
              disabled={loading}
              style={{
                padding: "10px 20px",
                backgroundColor: "#28a745",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: "14px",
                fontWeight: "bold",
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
              }}
            >
              {loading ? "🔄 최신화 중..." : "🔄 최신화"}
            </button>

          </div>
        </div>

        {/* 탭 네비게이션 */}
        <div style={{ 
          display: "flex", 
          borderBottom: "1px solid #dee2e6",
          backgroundColor: "white",
          marginBottom: "20px",
          borderRadius: "8px 8px 0 0"
        }}>
          <button
            onClick={() => setActiveTab("CS")}
            style={{
              padding: "12px 24px",
              border: "none",
              backgroundColor: activeTab === "CS" ? "#007bff" : "transparent",
              color: activeTab === "CS" ? "white" : "#495057",
              cursor: "pointer",
              borderBottom: activeTab === "CS" ? "2px solid #007bff" : "none",
              fontWeight: activeTab === "CS" ? "600" : "400",
              borderRadius: "8px 8px 0 0"
            }}
          >
            CS
          </button>
          <button
            onClick={() => setActiveTab("CSAT")}
            style={{
              padding: "12px 24px",
              border: "none",
              backgroundColor: activeTab === "CSAT" ? "#007bff" : "transparent",
              color: activeTab === "CSAT" ? "white" : "#495057",
              cursor: "pointer",
              borderBottom: activeTab === "CSAT" ? "2px solid #007bff" : "none",
              fontWeight: activeTab === "CSAT" ? "600" : "400"
            }}
          >
            CSAT
          </button>
          <button
            onClick={() => setActiveTab("Cache")}
            style={{
              padding: "12px 24px",
              border: "none",
              backgroundColor: activeTab === "Cache" ? "#007bff" : "transparent",
              color: activeTab === "Cache" ? "white" : "#495057",
              cursor: "pointer",
              borderBottom: activeTab === "Cache" ? "2px solid #007bff" : "none",
              fontWeight: activeTab === "Cache" ? "600" : "400"
            }}
          >
            Cache
          </button>
        </div>

        {error && (
          <div style={{
            backgroundColor: "#ffebee",
            color: "#c62828",
            padding: "12px",
            borderRadius: "4px",
            marginBottom: "16px"
          }}>
            ❌ {error}
          </div>
        )}

        {success && (
          <div style={{
            backgroundColor: "#e8f5e8",
            color: "#2e7d32",
            padding: "12px",
            borderRadius: "4px",
            marginBottom: "16px"
          }}>
            ✅ {success}
          </div>
        )}

        {loading && (
          <div style={{
            backgroundColor: "#e3f2fd",
            color: "#1565c0",
            padding: "12px",
            borderRadius: "4px",
            marginBottom: "16px"
          }}>
            🔄 데이터를 불러오는 중...
          </div>
        )}

        {/* 기간 필터 - CS와 CSAT 탭에서만 표시 */}
        {(activeTab === "CS" || activeTab === "CSAT") && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ marginRight: "8px", fontWeight: "bold" }}>기간:</label>
          <input
            type="date"
            value={start}
            onChange={e => {
              const newStart = e.target.value;
              setStart(newStart);
              if (newStart > end) setEnd(newStart);
            }}
            max={todayStr}
            style={{ margin: "0 8px", padding: "4px 8px", borderRadius: "4px", border: "1px solid #ddd" }}
          />
          ~
          <input
            type="date"
            value={end}
            onChange={e => {
              const newEnd = e.target.value;
              if (newEnd <= todayStr) setEnd(newEnd);
            }}
            max={todayStr}
            min={start}
            style={{ margin: "0 8px", padding: "4px 8px", borderRadius: "4px", border: "1px solid #ddd" }}
          />
        </div>
        )}










        {/* CS 탭 */}
        {activeTab === "CS" && (
          <>
            {/* 총문의량 통계 */}
          <div style={{
            backgroundColor: "#f8f9fa",
            padding: "16px",
            borderRadius: "8px",
            marginBottom: "20px",
            display: "flex",
            justifyContent: "center"
          }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "32px", fontWeight: "bold", color: "#007bff" }}>
                {statistics.총문의수?.toLocaleString() || 0}
              </div>
              <div style={{ fontSize: "16px", color: "#666" }}>총 문의수</div>
            </div>
          </div>

            {/* 유형 필터링 */}
        <FilterPanel
          options={filterOptions}
          values={filterVals}
          setValues={setFilterVals}
        />

            {/* CS 문의량 차트 */}
        <ChartSection
          data={chartData}
          label="CS 문의량"
          xLabel="x축"
          yLabel="문의량"
          loading={loading}
          dateGroup={dateGroup}
          onDateGroupChange={setDateGroup}
        />

        {/* 평균 응답시간 차트 */}
            {avgTimeChartData.length > 0 && (
          <div style={{
            backgroundColor: "white",
            padding: "20px",
            borderRadius: "8px",
            marginBottom: "20px",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
          }}>
                <h3 style={{ marginBottom: "16px", color: "#333" }}>평균 응답/해결 시간</h3>
            <div style={{ fontSize: "14px", color: "#666", marginBottom: "16px" }}>y축 단위: 분(min)</div>
            
            <MultiLineChartSection
                  data={avgTimeChartData}
              lines={[
                    { key: "operationWaitingTime", color: "#007bff", label: "첫응답시간" },
                    { key: "operationAvgReplyTime", color: "#28a745", label: "평균응답시간" },
                    { key: "operationTotalReplyTime", color: "#ffc107", label: "총응답시간" },
                    { key: "operationResolutionTime", color: "#dc3545", label: "해결시간" }
              ]}
              label=""
              xLabel="x축"
              loading={loading}
                  dateGroup={"월간"}
                />
              </div>
            )}

            {/* 문의유형별 차트 */}
            {inquiryTypeData.length > 0 && (
              <div style={{
                backgroundColor: "white",
                padding: "20px",
                borderRadius: "8px",
                marginBottom: "20px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
              }}>
                <h3 style={{ marginBottom: "16px", color: "#333" }}>
                  문의유형별 분포
                  {filterVals.문의유형 && filterVals.문의유형 !== "전체" && ` (${filterVals.문의유형} > 2차분류)`}
                </h3>
                <ChartSection
                  data={inquiryTypeData}
                  label=""
                  xLabel={!filterVals.문의유형 || filterVals.문의유형 === "전체" ? "문의유형" : "문의유형_2차"}
                  yLabel="문의량"
                  loading={loading}
                  chartType="horizontalBar"
                  height={400}
                  width={800}
            />
          </div>
        )}

            {/* 고객유형별 도넛 차트 */}
            {customerTypeData.length > 0 && (
              <div style={{
                backgroundColor: "white",
                padding: "20px",
                borderRadius: "8px",
                marginBottom: "20px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
              }}>
                <h3 style={{ marginBottom: "16px", color: "#333" }}>고객유형별 분포</h3>
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "300px" }}>
                  <div style={{ position: "relative", width: "300px", height: "300px" }}>
                    <svg width="300" height="300" viewBox="0 0 300 300">
                      <circle
                        cx="150"
                        cy="150"
                        r="120"
                        fill="none"
                        stroke="#e0e0e0"
                        strokeWidth="40"
                      />
                      {customerTypeData.map((item, index) => {
                        const startAngle = customerTypeData
                          .slice(0, index)
                          .reduce((sum, d) => sum + (d.문의량 / customerTypeData.reduce((s, x) => s + x.문의량, 0)) * 2 * Math.PI, 0);
                        const endAngle = startAngle + (item.문의량 / customerTypeData.reduce((s, x) => s + x.문의량, 0)) * 2 * Math.PI;
                        const x1 = 150 + 100 * Math.cos(startAngle);
                        const y1 = 150 + 100 * Math.sin(startAngle);
                        const x2 = 150 + 100 * Math.cos(endAngle);
                        const y2 = 150 + 100 * Math.sin(endAngle);
                        const largeArcFlag = endAngle - startAngle <= Math.PI ? "0" : "1";
                        const colors = ["#007bff", "#28a745", "#ffc107", "#dc3545", "#6f42c1", "#fd7e14"];
                        const color = colors[index % colors.length];
                        
                        return (
                          <g key={index}>
                            <path
                              d={`M ${x1} ${y1} A 100 100 0 ${largeArcFlag} 1 ${x2} ${y2}`}
                              fill="none"
                              stroke={color}
                              strokeWidth="40"
                              onMouseEnter={(e) => {
                                const rect = e.target.getBoundingClientRect();
                                setTooltip({
                                  visible: true,
                                  x: rect.left + rect.width / 2,
                                  y: rect.top,
                                  title: item.고객유형,
                                  count: item.문의량,
                                  percent: item.퍼센트 + "%"
                                });
                                setHoverIndex(index);
                              }}
                              onMouseLeave={() => {
                                setTooltip({ visible: false, x: 0, y: 0, title: "", count: 0, percent: "" });
                                setHoverIndex(null);
                              }}
                              style={{ cursor: "pointer" }}
                            />
                          </g>
                        );
                      })}
                    </svg>
                    <div style={{
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                      transform: "translate(-50%, -50%)",
                      textAlign: "center"
                    }}>
                      <div style={{ fontSize: "24px", fontWeight: "bold", color: "#333" }}>
                        {customerTypeData.reduce((sum, item) => sum + item.문의량, 0).toLocaleString()}
                      </div>
                      <div style={{ fontSize: "14px", color: "#666" }}>총 문의</div>
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: "20px", display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "center" }}>
                  {customerTypeData.map((item, index) => {
                    const colors = ["#007bff", "#28a745", "#ffc107", "#dc3545", "#6f42c1", "#fd7e14"];
                    return (
                      <div key={index} style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "4px 8px",
                        backgroundColor: "#f8f9fa",
                        borderRadius: "4px",
                        fontSize: "12px",
                        cursor: "pointer"
                      }}
                      title={`${item.고객유형}: ${item.문의량.toLocaleString()}건 (${item.퍼센트}%)`}
                      >
                        <div style={{
                          width: "12px",
                          height: "12px",
                          borderRadius: "50%",
                          backgroundColor: colors[index % colors.length]
                        }}></div>
                        <span>{item.고객유형}</span>
                        <span style={{ color: "#666" }}>({item.퍼센트}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* CSAT 탭 */}
        {activeTab === "CSAT" && (
          <>
            {csatData && csatData.status === "success" ? (
              <>
                <CSatChartSection
                  csatSummary={csatData.요약}
                  totalResponses={csatData.총응답수}
                />
                
                {/* 유형별 CSAT 분석 */}
                {csatData?.유형별 && Object.keys(csatData.유형별).length > 0 && (
                  <CSatTypeChartSection
                    typeScores={csatData.유형별}
                    typeLabel="유형별"
                  />
                )}
              </>
            ) : (
              <div style={{ 
                backgroundColor: "white", 
                padding: "40px", 
                borderRadius: "8px", 
                textAlign: "center",
                color: "#666"
              }}>
                {csatData ? "CSAT 데이터 로드 중..." : "CSAT 데이터를 불러오는 중입니다..."}
              </div>
            )}
          </>
        )}

        {/* Cache 탭 */}
        {activeTab === "Cache" && (
          <>
        <CacheStatusSection start={start} end={end} />
            
            {/* 데이터 갱신 버튼 */}
            <div style={{ 
              backgroundColor: "white", 
              padding: "20px", 
              borderRadius: "8px", 
              marginTop: "20px",
              textAlign: "center"
            }}>
              <h3 style={{ margin: "0 0 20px 0", color: "#333" }}>캐시 관리</h3>
              <button
                onClick={() => loadCacheData("refresh")}
                disabled={loading}
                style={{
                  padding: "12px 24px",
                  backgroundColor: "#dc3545",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontSize: "16px",
                  fontWeight: "bold",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
                }}
              >
                {loading ? "📥 갱신 중..." : "📥 전체 데이터 갱신"}
              </button>
              <p style={{ 
                margin: "15px 0 0 0", 
                fontSize: "14px", 
                color: "#666",
                fontStyle: "italic"
              }}>
                ⚠️ 주의: 기존 캐시를 완전히 삭제하고 전체 데이터를 새로 수집합니다
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App; 