import React, { useState, useEffect } from 'react';
import {
  fetchFilterOptions,
  fetchPeriodCounts,
  fetchAvgTimes,
  fetchCustomerTypeCS,
  fetchCsatAnalysis,
  fetchStatistics,
  checkApiHealth,
} from "./api";
import FilterPanel from "./components/FilterPanel";
import ChartSection from "./components/ChartSection";
import WordCloudSection from "./components/WordCloudSection";
import CsatUploadSection from "./components/CsatUploadSection";
import CsatAnalysisSection from "./components/CsatAnalysisSection";
import CacheStatusSection from "./components/CacheStatusSection";

function App() {
  // 필터 상태
  const [filterOptions, setFilterOptions] = useState({});
  const [filterVals, setFilterVals] = useState({});
  const [dateGroup, setDateGroup] = useState("월간");
  // 날짜 초기값 설정 (CS_dashboard0725.py 참고)
  const today = new Date();
  const oneMonthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
  
  const formatDate = (date) => date.toISOString().split('T')[0];
  const todayStr = formatDate(today);
  const oneMonthAgoStr = formatDate(oneMonthAgo);
  
  // CS_dashboard0725.py 방식: 데이터가 있으면 실제 범위, 없으면 기본값
  const [start, setStart] = useState(oneMonthAgoStr);
  const [end, setEnd] = useState(todayStr);

  // 데이터 상태
  const [periodData, setPeriodData] = useState([]);
  const [avgTime, setAvgTime] = useState({});
  const [customerTypeCS, setCustomerTypeCS] = useState([]);
  const [csatData, setCsatData] = useState({});
  const [statistics, setStatistics] = useState({});

  // UI 상태
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [apiConnected, setApiConnected] = useState(false);

  // API 연결 상태 확인
  useEffect(() => {
    checkApiHealth().then(setApiConnected);
  }, []);

  // 사용자 ID 필드 제거
  useEffect(() => {
    const removeUserIdField = () => {
      const labels = document.querySelectorAll('label');
      labels.forEach(label => {
        if (label.textContent.includes('사용자 ID') || label.textContent.includes('이벤트 분석용')) {
          const parentDiv = label.closest('div');
          if (parentDiv) {
            parentDiv.style.display = 'none';
          }
        }
      });
      
      const inputs = document.querySelectorAll('input[type="text"]');
      inputs.forEach(input => {
        if (input.placeholder && input.placeholder.includes('사용자 ID')) {
          const parentDiv = input.closest('div');
          if (parentDiv) {
            parentDiv.style.display = 'none';
          }
        }
      });
    };

    // DOM이 로드된 후 실행
    setTimeout(removeUserIdField, 100);
    
    // MutationObserver로 동적으로 추가되는 요소도 감지
    const observer = new MutationObserver(removeUserIdField);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  // 필터 옵션 불러오기
  useEffect(() => {
    if (!apiConnected) return;

    setLoading(true);
    setError(null);

    fetchFilterOptions(start, end)
      .then(setFilterOptions)
      .catch(err => {
        setError(`필터 옵션 로드 실패: ${err.message}`);
        console.error("Filter options error:", err);
      })
      .finally(() => setLoading(false));
  }, [apiConnected, start, end]);

  // 필터 변경시 데이터 로드
  const onFilter = async () => {
    if (!apiConnected) return;

    setLoading(true);
    setError(null);

    try {
      const params = {
        start,
        end,
        date_group: dateGroup,
        ...filterVals,
      };

      // 병렬로 데이터 로드
      const [periodData, avgTime, customerTypeCS, csatData, statistics] = await Promise.all([
        fetchPeriodCounts(params),
        fetchAvgTimes(params),
        fetchCustomerTypeCS({ start, end }),
        fetchCsatAnalysis(params),
        fetchStatistics(start, end)
      ]);

      setPeriodData(periodData);
      setAvgTime(avgTime);
      setCustomerTypeCS(customerTypeCS);
      setCsatData(csatData);
      setStatistics(statistics);
    } catch (err) {
      setError(`데이터 로드 실패: ${err.message}`);
      console.error("Data loading error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (apiConnected) {
      onFilter();
    }
  }, [filterVals, dateGroup, start, end, apiConnected]);

  if (!apiConnected) {
    return (
      <div style={{ padding: 32, fontFamily: "sans-serif", textAlign: "center" }}>
        <h2>CS 대시보드</h2>
        <div style={{ color: "red", margin: "20px 0" }}>
          ⚠️ 백엔드 API에 연결할 수 없습니다.
          <br />
          백엔드 서버가 실행 중인지 확인해주세요.
        </div>
        <div style={{ fontSize: "14px", color: "gray" }}>
          백엔드 서버: <code>https://cs-dashboard-project.onrender.com</code>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 32, fontFamily: "sans-serif", backgroundColor: "#f5f5f5", minHeight: "100vh" }}>
      {/* 사용자 ID 필드 숨기기 */}
      <style>
        {`
          label:contains("사용자 ID"), 
          input[placeholder*="사용자 ID"],
          div:has(label:contains("사용자 ID")) {
            display: none !important;
          }
        `}
      </style>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <h1 style={{ textAlign: "center", color: "#333", marginBottom: "32px" }}>
          📊 CS 대시보드
        </h1>

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

        <div style={{ marginBottom: 16 }}>
          <label style={{ marginRight: "8px", fontWeight: "bold" }}>기간:</label>
          <input
            type="date"
            value={start}
            onChange={e => {
              const newStart = e.target.value;
              setStart(newStart);
              // 시작일이 종료일보다 늦으면 종료일을 시작일로 설정
              if (newStart > end) {
                setEnd(newStart);
              }
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
              // 오늘 이후 날짜는 선택 불가
              if (newEnd <= todayStr) {
                setEnd(newEnd);
              }
            }}
            max={todayStr}
            min={start}
            style={{ margin: "0 8px", padding: "4px 8px", borderRadius: "4px", border: "1px solid #ddd" }}
          />
          <select
            value={dateGroup}
            onChange={e => setDateGroup(e.target.value)}
            style={{ marginLeft: "8px", padding: "4px 8px", borderRadius: "4px", border: "1px solid #ddd" }}
          >
            <option value="월간">월간</option>
            <option value="주간">주간</option>
          </select>
        </div>



        {statistics && (
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
        )}

        <FilterPanel
          options={filterOptions}
          values={filterVals}
          setValues={setFilterVals}
          onFilter={onFilter}
        />

        <ChartSection
          data={periodData}
          label="CS 문의량"
          xLabel="x축"
          yLabel="문의량"
          loading={loading}
        />

        {/* 평균 시간 표시 섹션 추가 */}
        {avgTime && Object.keys(avgTime).length > 0 && (
          <div style={{
            backgroundColor: "white",
            padding: "20px",
            borderRadius: "8px",
            marginBottom: "20px",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
          }}>
            <h3 style={{ marginBottom: "16px", color: "#333" }}>평균 응답 시간</h3>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "16px"
            }}>
              {Object.entries(avgTime).map(([key, value]) => (
                <div key={key} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "20px", fontWeight: "bold", color: "#007bff" }}>
                    {value}
                  </div>
                  <div style={{ fontSize: "14px", color: "#666" }}>{key}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <WordCloudSection params={{ start, end, ...filterVals }} loading={loading} />
        
        <CsatUploadSection onUploadSuccess={onFilter} />
        <CsatAnalysisSection data={csatData} loading={loading} />
        <CacheStatusSection start={start} end={end} />
      </div>
    </div>
  );
}

export default App; 