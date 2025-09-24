import React, { useRef, useMemo } from 'react';

// data: [{x축: "04", 첫응답시간: 10, 평균응답시간: 20, ...}], 
// lines: [{key: "첫응답시간", color: "#007bff", label: "첫응답시간"}, ...]
const MultiLineChartSection = ({
  data = [],
  lines = [],
  label = "차트",
  xLabel = "x축",
  loading = false,
  dateGroup = "월간",
  onDateGroupChange = null
}) => {
  const svgRef = useRef();

  // 월 레이블 안전 추출
  const monthLabelOf = (item) => {
    if (item?.월레이블) return item.월레이블; // 집계 데이터 우선
    const raw =
      item?.__wStart ??
      item?.weekStart ??
      item?.createdAt ??
      item?.firstAskedAt;
    const d = new Date(raw);
    if (!isNaN(d)) return `${d.getMonth() + 1}월`;
    return item?.monthLabel || "";
  };

  // 각 월의 첫 주인지 확인
  const isFirstWeekOfMonth = (rows, idx) => {
    if (idx === 0) return true;
    const cur = rows[idx];
    const prev = rows[idx - 1];
    if (!cur || !prev) return false;
    return cur.월레이블 !== prev.월레이블;
  };

  // 주간 X축에서 "그 달의 첫 주"만 판단 (ChartSection 동일 로직)
  const isFirstWeekOfMonthXAxis = (rows, idx) => {
    if (idx === 0) return true;
    const cur = rows[idx];
    const prev = rows[idx - 1];
    if (!cur || !prev) return false;
    const monthOf = (it) => it?.월레이블 ?? monthLabelOf(it);
    return monthOf(cur) !== monthOf(prev);
  };

  // 주간 집계: data가 일/개별 레코드 기반일 때 주차(월요일~일요일) 평균으로 변환
  const plotData = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return [];
    if (dateGroup !== "주간") return data;

    // 날짜키 추론
    const dateKeys = ["발생시각", "createdAt", "openedAt", "timestamp", "date", "생성시각"];
    const sample = data[0] || {};
    const dateKey = dateKeys.find(k => k in sample);
    if (!dateKey) {
      // 날짜가 없으면 집계 불가 → 원본 반환
      return data;
    }

    // 주차 key 계산 (월요일 시작)
    const toWeekStart = (d) => {
      const dt = new Date(d);
      const day = dt.getDay(); // 0(일)~6(토)
      const diffToMon = (day + 6) % 7; // 월=0, 화=1 ...
      const wk = new Date(dt);
      wk.setDate(dt.getDate() - diffToMon);
      wk.setHours(0, 0, 0, 0);
      return wk;
    };

    // 누적 테이블
    const acc = new Map();
    const metricKeys = lines.map(l => l.key);

    data.forEach(row => {
      const raw = row[dateKey];
      if (!raw) return;
      const wStart = toWeekStart(raw);
      const key = wStart.getTime();
      if (!acc.has(key)) {
        const init = { __wStart: wStart, __count: 0, x축: "", 주레이블: "", 주보조레이블: "", 월레이블: "" };
        metricKeys.forEach(k => { init[k] = 0; });
        acc.set(key, init);
      }
      const bucket = acc.get(key);
      bucket.__count += 1;
      metricKeys.forEach(k => { bucket[k] += Number(row[k] || 0); });
    });

    // 평균 계산 및 라벨 구성
    const rows = Array.from(acc.values()).sort((a, b) => a.__wStart - b.__wStart).map(b => {
      const wEnd = new Date(b.__wStart); wEnd.setDate(wEnd.getDate() + 6);
      const mmdd = (d) => `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}`;
      const r = {
        x축: `${mmdd(b.__wStart)}~${mmdd(wEnd)}`,
        주레이블: `${mmdd(b.__wStart)}~${mmdd(wEnd)}`,
        주보조레이블: "", // 월 경계 표시용
        월레이블: `${b.__wStart.getMonth() + 1}월` // 월 레이블 추가
      };
      metricKeys.forEach(k => { r[k] = b.__count ? +(b[k] / b.__count).toFixed(1) : 0; });
      r.건수 = b.__count;
      r.__wStart = b.__wStart;
      return r;
    });

    // 월 경계 판단 → 첫 주 플래그 저장
    let prevMonth = "";
    rows.forEach(r => {
      const tag = `${r.__wStart.getFullYear()}-${String(r.__wStart.getMonth()+1).padStart(2,"0")}`;
      r.__isMonthHead = tag !== prevMonth;       // 이 주가 해당 달의 첫 주인가?
      r.주보조레이블 = r.__isMonthHead ? tag : ""; // (필요 시) 보조 라벨
      prevMonth = tag;
      // __wStart 계속 두어도 되지만, 안 쓸 거면 아래 주석 해제
      // delete r.__wStart;
    });

    return rows;
  }, [data, dateGroup, lines]);
  
  // 로딩 상태
  if (loading) {
    return (
      <div style={{
        backgroundColor: "#f8f9fa",
        padding: "20px",
        borderRadius: "8px",
        marginBottom: "20px",
        textAlign: "center"
      }}>
        <div>로딩 중...</div>
      </div>
    );
  }

  // 데이터 없음
  if (!plotData || plotData.length === 0) {
    return (
      <div style={{
        backgroundColor: "#f8f9fa",
        padding: "20px",
        borderRadius: "8px",
        marginBottom: "20px",
        textAlign: "center",
        color: "#666"
      }}>
        데이터가 없습니다.
      </div>
    );
  }

  const chartHeight = 350;
  const chartWidth = 650;
  
  // 모든 라인의 최대값 계산 (이미 분 단위)
  const allValues = [];
  lines.forEach(line => {
    plotData.forEach(item => {
      const value = Number(item[line.key]) || 0;
      allValues.push(value);
    });
  });
  const maxValue = Math.max(...allValues, 1); // 최소값 1로 설정

  // 각 라인의 포인트 계산 (이미 분 단위)
  const getLinePoints = (lineKey) => {
    return plotData.map((item, idx) => {
      const value = Number(item[lineKey]) || 0;
      // 데이터가 1개일 때는 차트 중앙에 배치, 여러 개일 때는 균등 분배
      const x = plotData.length === 1 
        ? chartWidth / 2  // 데이터가 1개일 때 중앙 배치
        : (idx / (plotData.length - 1)) * (chartWidth - 60) + 30;  // 여러 개일 때 균등 분배
      const y = chartHeight - 60 - ((value / maxValue) * (chartHeight - 120));
      return { x, y, value, label: item[xLabel] };
    });
  };

  // 라인 경로 생성
  const getLinePath = (points) => {
    return points.map((point, idx) => {
      if (idx === 0) return `M ${point.x} ${point.y}`;
      return `L ${point.x} ${point.y}`;
    }).join(' ');
  };

  // Y축 값 계산 (분 단위)
  const getYAxisValues = (maxVal) => {
    if (maxVal <= 5) return [0, 1, 2, 3, 4, 5];
    if (maxVal <= 10) return [0, 2, 4, 6, 8, 10];
    if (maxVal <= 20) return [0, 5, 10, 15, 20];
    if (maxVal <= 50) return [0, 10, 20, 30, 40, 50];
    if (maxVal <= 100) return [0, 20, 40, 60, 80, 100];
    // 더 큰 값들
    const step = Math.ceil(maxVal / 5);
    const values = [];
    for (let i = 0; i <= 5; i++) {
      values.push(i * step);
    }
    return values;
  };

  const yAxisValues = getYAxisValues(maxValue);

  return (
    <div style={{
      backgroundColor: "white",
      padding: "20px",
      borderRadius: "8px",
      marginBottom: "20px",
      boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "16px"
      }}>
        {label && <h3 style={{ color: "#333", margin: 0 }}>{label}</h3>}
        {onDateGroupChange && (
          <div style={{
            display: "inline-flex",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            overflow: "hidden"
          }}>
            {["주간", "월간"].map(g => (
              <button
                key={g}
                onClick={() => onDateGroupChange(g)}
                style={{
                  padding: "6px 10px",
                  fontSize: 12,
                  border: "none",
                  background: dateGroup === g ? "#111827" : "#fff",
                  color: dateGroup === g ? "#fff" : "#374151",
                  cursor: "pointer"
                }}
              >
                {g}
              </button>
            ))}
          </div>
        )}
      </div>

      <svg ref={svgRef} width={chartWidth} height={chartHeight} style={{ margin: "0 auto", display: "block" }}>
        {/* 배경 그리드 */}
        <defs>
          <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#f0f0f0" strokeWidth="1"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        
        {/* Y축 라벨 */}
        {yAxisValues.map((value, idx) => {
          const ratio = value / maxValue;
          const y = chartHeight - 60 - (ratio * (chartHeight - 120));
          return (
            <g key={idx}>
              <line x1="30" y1={y} x2="35" y2={y} stroke="#ccc" strokeWidth="1" />
              <text x="20" y={y + 4} fontSize="12" textAnchor="end" fill="#666">
                {value.toLocaleString()}
              </text>
            </g>
          );
        })}
        
        {/* X축 라벨 */}
        {(() => {
          const rows = plotData;
          return rows.map((item, idx) => {
            const x = rows.length === 1
              ? chartWidth / 2
              : (idx / (rows.length - 1)) * (chartWidth - 60) + 30;

            return (
              <g key={idx}>
                <line
                  x1={x}
                  y1={chartHeight - 60}
                  x2={x}
                  y2={chartHeight - 55}
                  stroke="#ccc"
                  strokeWidth="1"
                />

                {/* 월간: 모든 포인트에 라벨 */}
                {dateGroup === "월간" && (
                  <text
                    x={x}
                    y={chartHeight - 40}
                    fontSize="12"
                    textAnchor="middle"
                    fill="#666"
                  >
                    {item[xLabel]}
                  </text>
                )}

                {/* 주간: 그 달의 첫 주만 월 레이블 */}
                {dateGroup === "주간" && item.월레이블 && isFirstWeekOfMonth(rows, idx) && (
                  <text
                    x={x}
                    y={chartHeight - 40}
                    fontSize="13"
                    textAnchor="middle"
                    fill="#007bff"
                    fontWeight="bold"
                  >
                    {item.월레이블}
                  </text>
                )}
              </g>
            );
          });
        })()}
        
        {/* 각 라인 그리기 */}
        {lines.map((line, lineIdx) => {
          const points = getLinePoints(line.key);
          const linePath = getLinePath(points);
          
          return (
            <g key={lineIdx}>
              {/* 라인 */}
              <path d={linePath} stroke={line.color} strokeWidth="3" fill="none" />
              
              {/* 포인트 */}
              {points.map((point, idx) => (
                <circle
                  key={idx}
                  cx={point.x}
                  cy={point.y}
                  r="4"
                  fill={line.color}
                  stroke="white"
                  strokeWidth="2"
                />
              ))}
              
              {/* 툴팁 (호버 시) */}
              {points.map((point, idx) => (
                <circle
                  key={`tooltip-${lineIdx}-${idx}`}
                  cx={point.x}
                  cy={point.y}
                  r="8"
                  fill="transparent"
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(e) => {
                    const tooltip = document.createElement('div');
                    tooltip.style.cssText = `
                      position: fixed;
                      background: rgba(0,0,0,0.8);
                      color: white;
                      padding: 8px;
                      border-radius: 4px;
                      font-size: 12px;
                      pointer-events: none;
                      z-index: 1000;
                      left: ${e.clientX + 10}px;
                      top: ${e.clientY - 10}px;
                    `;
                    tooltip.textContent = `${line.label}: ${point.value.toFixed(1)}분`;
                    // 주간/월간 전환 시에도 동일하게 동작. 필요하면
                    // tooltip.textContent 앞에 `${point.label} · `를 붙여 기간 라벨을 노출할 수 있음.
                    document.body.appendChild(tooltip);
                    
                    e.target.onmouseleave = () => document.body.removeChild(tooltip);
                  }}
                />
              ))}
            </g>
          );
        })}
      </svg>
      
      {/* 범례 */}
      <div style={{ 
        display: "flex", 
        justifyContent: "center", 
        gap: "20px", 
        marginTop: "16px",
        flexWrap: "wrap"
      }}>
        {lines.map((line, idx) => (
          <div key={idx} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{
              width: "12px",
              height: "12px",
              backgroundColor: line.color,
              borderRadius: "2px"
            }}></div>
            <span style={{ fontSize: "12px", color: "#666" }}>{line.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MultiLineChartSection; 