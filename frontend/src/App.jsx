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

function App() {
  // 필터 상태
  const [filterOptions, setFilterOptions] = useState({});
  const [filterVals, setFilterVals] = useState({});
  const [dateGroup, setDateGroup] = useState("월간");
  // 날짜 초기값 설정 (첨부 파일 참고)
  const today = new Date();
  const oneMonthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
  
  const formatDate = (date) => date.toISOString().split('T')[0];
  
  const [start, setStart] = useState(formatDate(oneMonthAgo));
  const [end, setEnd] = useState(formatDate(today));

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
            onChange={e => setStart(e.target.value)}
            max={formatDate(today)}
            style={{ margin: "0 8px", padding: "4px 8px", borderRadius: "4px", border: "1px solid #ddd" }}
          />
          ~
          <input
            type="date"
            value={end}
            onChange={e => setEnd(e.target.value)}
            max={formatDate(today)}
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



        {statistics.총문의수 && (
          <div style={{
            backgroundColor: "#f8f9fa",
            padding: "16px",
            borderRadius: "8px",
            marginBottom: "20px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "16px"
          }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "24px", fontWeight: "bold", color: "#007bff" }}>
                {statistics.총문의수?.toLocaleString() || 0}
              </div>
              <div style={{ fontSize: "14px", color: "#666" }}>총 문의수</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "24px", fontWeight: "bold", color: "#28a745" }}>
                {statistics.고객유형수 || 0}
              </div>
              <div style={{ fontSize: "14px", color: "#666" }}>고객유형</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "24px", fontWeight: "bold", color: "#ffc107" }}>
                {statistics.문의유형수 || 0}
              </div>
              <div style={{ fontSize: "14px", color: "#666" }}>문의유형</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "24px", fontWeight: "bold", color: "#dc3545" }}>
                {statistics.서비스유형수 || 0}
              </div>
              <div style={{ fontSize: "14px", color: "#666" }}>서비스유형</div>
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

        <WordCloudSection params={{ start, end, ...filterVals }} loading={loading} />
        
        <CsatUploadSection onUploadSuccess={onFilter} />
        <CsatAnalysisSection data={csatData} loading={loading} />
      </div>
    </div>
  );
}

export default App; 