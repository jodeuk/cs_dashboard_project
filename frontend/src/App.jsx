import React, { useState, useEffect, useCallback, useMemo } from "react";
import { fetchUserchats, fetchFilterOptions, checkApiHealth, checkCacheForPeriod } from "./api";
import FilterPanel from "./components/FilterPanel";
import ChartSection from "./components/ChartSection";
import MultiLineChartSection from "./components/MultiLineChartSection";
import CsatUploadSection from "./components/CsatUploadSection";
import CacheStatusSection from "./components/CacheStatusSection";
import CSatChartSection from "./components/CSatChartSection";
import CSatTypeChartSection from "./components/CSatTypeChartSection";

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
  const [filterVals, setFilterVals] = useState({});
  const [dateGroup, setDateGroup] = useState("월간");
  const [start, setStart] = useState(oneMonthAgoStr);
  const [end, setEnd] = useState(todayStr);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [apiConnected, setApiConnected] = useState(null);
  const [csatData, setCsatData] = useState(null);
  const [csatQuestionFilter, setCsatQuestionFilter] = useState("A-1"); // CSAT 질문 필터
  // 도넛 차트 툴팁/호버 상태
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, title: "", count: 0, percent: "" });
  const [hoverIndex, setHoverIndex] = useState(null);

  // --- 최초 API 연결 확인 ---
  useEffect(() => {
    checkApiHealth()
      .then(setApiConnected)
      .catch(() => setApiConnected(false));
  }, []);

  // --- 캐시데이터 한번만 전체 불러오기 ---
  const loadCacheData = useCallback(async (forceRefresh = false) => {
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
      
      // 강제 새로고침이면 캐시 무시하고 새로 가져오기
      if (forceRefresh) {
        console.log("🔄 강제 새로고침 모드 - 캐시 무시하고 최신 데이터 가져오기");
      }
      
      // 전체 기간 캐시 row fetch (날짜 범위는 나중에 필터링)
      const rows = await fetchUserchats(startDate, endDate, forceRefresh);
      setUserchats(rows);
      // 필터 옵션도 fetch
      const opts = await fetchFilterOptions(startDate, endDate, forceRefresh);
      setFilterOptions(opts);
      
      if (forceRefresh) {
        setError("✅ 데이터가 최신으로 갱신되었습니다.");
        setTimeout(() => setError(null), 3000); // 3초 후 메시지 제거
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
      // 캐시에서 CSAT 데이터 불러오기
      const csatRes = await fetch(`${process.env.REACT_APP_API_BASE}/cache/status`);
      const cacheStatus = await csatRes.json();
      console.log("📦 캐시 상태:", cacheStatus);
      
      // csat_raw.pkl이 있는지 확인
      const hasCsatCache = cacheStatus.files?.some(file => file.filename.includes('csat_raw'));
      console.log("📊 CSAT 캐시 존재:", hasCsatCache);
      
      if (hasCsatCache) {
        // 캐시된 CSAT 데이터와 userchats 병합 분석
        const params = new URLSearchParams({ start, end });
        const res = await fetch(`${process.env.REACT_APP_API_BASE}/csat-analysis?${params.toString()}`);
        const result = await res.json();
        console.log("✅ CSAT 분석 결과:", result);
        setCsatData(result);
      } else {
        console.log("⚠️ CSAT 캐시 데이터가 없습니다. Excel 파일을 업로드해주세요.");
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
    console.log("🔍 filteredRows 계산 시작:", { start, end, userchatsLength: userchats.length });
    
    // 디버깅용 전역 변수 노출 (임시)
    window.debugData = { userchats, start, end, filterVals };
    
    const filtered = userchats.filter((item) => {
      const d = new Date(item.firstAskedAt);
      if (isNaN(d)) return false;
      if (d < new Date(start) || d > new Date(end)) return false;

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
  }, [userchats, start, end, filterVals]);

  // --- 차트 집계: 월간 or 주간 ---
  const chartData = useMemo(() => {
    console.log("🔍 chartData 계산 시작:", { filteredRowsLength: filteredRows.length, dateGroup });
    if (!filteredRows.length) return [];
    if (dateGroup === "월간") {
      // 월별 집계
      const map = {};
      filteredRows.forEach((item) => {
        const d = new Date(item.firstAskedAt);
        const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
        if (!map[key]) map[key] = { x축: `${d.getMonth() + 1}월`, 문의량: 0 };
        map[key].문의량 += 1;
      });
      const result = Object.values(map).sort((a, b) => parseInt(a.x축) - parseInt(b.x축));
      console.log("🔍 chartData 월간 결과:", result);
      return result;
    } else {
      // 주별 집계
      const map = {};
      filteredRows.forEach((item) => {
        const d = new Date(item.firstAskedAt);
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay()); // 주의 시작 (일요일)
        const weekKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
        if (!map[weekKey]) {
          const isFirstWeekOfMonth = weekStart.getDate() <= 7;
          map[weekKey] = { 
            x축: `${weekStart.getMonth() + 1}/${weekStart.getDate()}`, 
            문의량: 0,
            월레이블: isFirstWeekOfMonth ? `${weekStart.getMonth() + 1}월` : null
          };
        }
        map[weekKey].문의량 += 1;
      });
      return Object.values(map).sort((a, b) => {
        const [monthA, dayA] = a.x축.split('/').map(Number);
        const [monthB, dayB] = b.x축.split('/').map(Number);
        if (monthA !== monthB) return monthA - monthB;
        return dayA - dayB;
      });
      console.log("🔍 chartData 주간 결과:", chartData);
      return chartData;
    }
  }, [filteredRows, dateGroup]);

  // --- 평균 응답/해결 시간 차트 데이터 ---
  const avgTimeChartData = useMemo(() => {
    if (!filteredRows.length) return [];
    // 월별 평균 구하기
    const map = {};
    filteredRows.forEach((item) => {
      const d = new Date(item.firstAskedAt);
      const month = `${d.getFullYear()}-${d.getMonth() + 1}`;
      if (!map[month])
        map[month] = {
          x축: `${d.getMonth() + 1}월`,
          operationWaitingTime: [],
          operationAvgReplyTime: [],
          operationTotalReplyTime: [],
          operationResolutionTime: [],
        };
      map[month].operationWaitingTime.push(timeToSec(item.operationWaitingTime));
      map[month].operationAvgReplyTime.push(timeToSec(item.operationAvgReplyTime));
      map[month].operationTotalReplyTime.push(timeToSec(item.operationTotalReplyTime));
      map[month].operationResolutionTime.push(timeToSec(item.operationResolutionTime));
    });

    return Object.values(map)
      .map((m) => ({
        x축: m.x축,
        operationWaitingTime: avg(m.operationWaitingTime),
        operationAvgReplyTime: avg(m.operationAvgReplyTime),
        operationTotalReplyTime: avg(m.operationTotalReplyTime),
        operationResolutionTime: avg(m.operationResolutionTime),
      }))
      .sort((a, b) => parseInt(a.x축) - parseInt(b.x축));
  }, [filteredRows, dateGroup]);

  // --- 통계 ---
  const statistics = useMemo(() => {
    return {
      총문의수: filteredRows.length,
    };
  }, [filteredRows]);

  // --- 문의유형별 차트 데이터 ---
  const inquiryTypeData = useMemo(() => {
    console.log("🔍 inquiryTypeData 계산 시작:", { 
      filteredRowsLength: filteredRows.length, 
      filterVals문의유형: filterVals.문의유형 
    });
    
    if (!filteredRows.length) return [];
    
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
      const result = Object.entries(counts)
        .map(([type, count]) => ({ 문의유형: type, 문의량: count }))
        .sort((a, b) => b.문의량 - a.문의량);
      
      console.log("🔍 inquiryTypeData 전체 결과:", result);
      return result;
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
      const result = Object.entries(counts)
        .map(([type, count]) => ({ 문의유형_2차: type, 문의량: count }))
        .sort((a, b) => b.문의량 - a.문의량);
      
      console.log("🔍 inquiryTypeData 2차 결과:", result);
      return result;
    }
  }, [filteredRows, filterVals.문의유형]);

  // --- 고객유형별 도넛 차트 데이터 ---
  const customerTypeData = useMemo(() => {
    if (!filteredRows.length) return [];
    
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
          <button
            onClick={() => loadCacheData(true)}
            disabled={loading}
            style={{
              padding: "10px 20px",
              backgroundColor: "#007bff",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "14px",
              fontWeight: "bold",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
            }}
          >
            {loading ? "🔄 갱신 중..." : "🔄 데이터 갱신"}
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

        {/* 기간 필터 */}
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

        {/* 통계 */}
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

        <FilterPanel
          options={filterOptions}
          values={filterVals}
          setValues={setFilterVals}
          onFilter={() => {}}
        />

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
              {filterVals.문의유형 === "전체" ? "문의유형별 CS 문의량" : `"${filterVals.문의유형}"의 CS 문의량`}
            </h3>

            <div style={{ height: "300px", overflowY: "auto" }}>
              {inquiryTypeData.map((item, index) => {
                const maxValue = Math.max(...inquiryTypeData.map(d => d.문의량));
                const percentage = (item.문의량 / maxValue) * 100;
                return (
                  <div key={index} style={{
                    marginBottom: "12px"
                  }}>
                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "4px"
                    }}>
                      <span style={{ fontSize: "14px", fontWeight: "500" }}>
                        {filterVals.문의유형 === "전체" ? item.문의유형 : item.문의유형_2차}
                      </span>
                      <span style={{ fontSize: "14px", fontWeight: "bold", color: "#007bff" }}>
                        {item.문의량.toLocaleString()}
                      </span>
                    </div>
                    <div style={{
                      width: "100%",
                      height: "20px",
                      backgroundColor: "#e9ecef",
                      borderRadius: "10px",
                      overflow: "hidden"
                    }}>
                      <div style={{
                        width: `${percentage}%`,
                        height: "100%",
                        backgroundColor: "#007bff",
                        borderRadius: "10px",
                        transition: "width 0.3s ease"
                      }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
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
            <h3 style={{ marginBottom: "16px", color: "#333" }}>고객유형별 CS 문의량</h3>

            <div style={{ display: "flex", justifyContent: "center" }}>
              <div style={{ position: "relative", width: "300px", height: "300px" }}>
                <svg width="300" height="300" viewBox="0 0 300 300">
                  <circle
                    cx="150"
                    cy="150"
                    r="120"
                    fill="none"
                    stroke="#e9ecef"
                    strokeWidth="40"
                  />
                  {(() => {
                    const colors = ["#007bff", "#28a745", "#ffc107", "#dc3545", "#6f42c1", "#fd7e14"];
                    let currentAngle = -90;
                    return customerTypeData.map((item, index) => {
                      const percentage = parseFloat(item.퍼센트);
                      const angle = (percentage / 100) * 360;
                      const color = colors[index % colors.length];
                      
                      const x1 = 150 + 100 * Math.cos(currentAngle * Math.PI / 180);
                      const y1 = 150 + 100 * Math.sin(currentAngle * Math.PI / 180);
                      const x2 = 150 + 100 * Math.cos((currentAngle + angle) * Math.PI / 180);
                      const y2 = 150 + 100 * Math.sin((currentAngle + angle) * Math.PI / 180);
                      
                      const largeArcFlag = angle > 180 ? 1 : 0;
                      const pathData = `M ${x1} ${y1} A 100 100 0 ${largeArcFlag} 1 ${x2} ${y2}`;
                      
                      currentAngle += angle;
                      
                      return (
                        <g key={index}>
                          <path
                            d={pathData}
                            fill="none"
                            stroke={color}
                            strokeWidth={hoverIndex === index ? 45 : 40}
                            opacity={hoverIndex === index ? 0.8 : 1}
                            strokeLinecap="round"
                            style={{ cursor: "pointer" }}
                            onMouseEnter={(e) => {
                              setHoverIndex(index);
                              setTooltip({
                                visible: true,
                                x: e.clientX,
                                y: e.clientY,
                                title: item.고객유형,
                                count: item.문의량,
                                percent: item.퍼센트
                              });
                            }}
                            onMouseMove={(e) => {
                              setTooltip((prev) => ({ ...prev, x: e.clientX, y: e.clientY }));
                            }}
                            onMouseLeave={() => {
                              setHoverIndex(null);
                              setTooltip((prev) => ({ ...prev, visible: false }));
                            }}
                          />
                        </g>
                      );
                    });
                  })()}
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

        <CsatUploadSection onUploadSuccess={() => { loadCacheData(); loadCsatAnalysis(); }} />

        {/* CSAT 분석 차트 */}
        {csatData && csatData.status === "success" && (
          <>
            <CSatChartSection
              csatSummary={csatData.요약}
              totalResponses={csatData.총응답수}
            />
            
            {/* 유형별 CSAT 점수 차트들 */}
            {csatData.유형별 && Object.entries(csatData.유형별).map(([typeName, questions]) => (
              <div key={typeName} style={{ backgroundColor: "white", padding: "20px", borderRadius: "8px", marginBottom: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <h3 style={{ color: "#333", margin: 0 }}>{typeName}별 CSAT 점수</h3>
                  <div style={{ display: "flex", gap: "8px" }}>
                    {["A-1", "A-2", "A-4", "A-5"].map((question) => (
                      <button
                        key={question}
                        onClick={() => setCsatQuestionFilter(question)}
                        style={{
                          padding: "6px 12px",
                          border: "1px solid #ddd",
                          borderRadius: "4px",
                          backgroundColor: csatQuestionFilter === question ? "#007bff" : "white",
                          color: csatQuestionFilter === question ? "white" : "#333",
                          cursor: "pointer",
                          fontSize: "12px"
                        }}
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                </div>
                {csatQuestionFilter && questions[csatQuestionFilter] && (
                  <CSatTypeChartSection
                    typeScores={questions[csatQuestionFilter]}
                    typeLabel={typeName}
                  />
                )}
              </div>
            ))}
          </>
        )}
        <CacheStatusSection start={start} end={end} />
      </div>
    </div>
  );
}

export default App; 