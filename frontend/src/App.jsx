import React, { useEffect, useState } from "react";
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
import CsatSection from "./components/CsatSection";

function App() {
  // 필터 상태
  const [filterOptions, setFilterOptions] = useState({});
  const [filterVals, setFilterVals] = useState({});
  const [dateGroup, setDateGroup] = useState("월간");
  const [start, setStart] = useState("2024-04-01");
  const [end, setEnd] = useState("2024-07-31");

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
          백엔드 서버: <code>http://localhost:8000</code>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 32, fontFamily: "sans-serif" }}>
      <h2>CS 대시보드</h2>
      
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
        <label style={{ marginRight: "8px" }}>기간:</label>
        <input
          type="date"
          value={start}
          onChange={e => setStart(e.target.value)}
          style={{ margin: "0 8px" }}
        />
        ~
        <input
          type="date"
          value={end}
          onChange={e => setEnd(e.target.value)}
          style={{ margin: "0 8px" }}
        />
        <select 
          value={dateGroup} 
          onChange={e => setDateGroup(e.target.value)}
          style={{ marginLeft: "8px" }}
        >
          <option value="월간">월간</option>
          <option value="주간">주간</option>
        </select>
      </div>

      {statistics.총문의수 && (
        <div style={{ 
          backgroundColor: "#f5f5f5", 
          padding: "12px", 
          borderRadius: "4px", 
          marginBottom: "16px",
          display: "flex",
          gap: "20px"
        }}>
          <span>📊 총 문의수: <strong>{statistics.총문의수.toLocaleString()}</strong></span>
          <span>👥 고객유형: <strong>{statistics.고객유형수}</strong></span>
          <span>❓ 문의유형: <strong>{statistics.문의유형수}</strong></span>
          <span>🔧 서비스유형: <strong>{statistics.서비스유형수}</strong></span>
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
        xLabel="월/주"
        yLabel="문의량"
        loading={loading}
      />

      <WordCloudSection params={{ start, end, ...filterVals }} loading={loading} />
      <CsatSection data={csatData} loading={loading} />
    </div>
  );
}

export default App;
