import React, { useRef } from 'react';

// data: [{...}], label: 제목, xKey: x축 데이터 key, yKey: y축 데이터 key, loading: boolean
const ChartSection = ({
  data = [],
  label = "차트",
  xLabel = "x축",
  yLabel = "y축",
  loading = false,
  dateGroup = "월간",
  chartType = "line", // "line" 또는 "horizontalBar"
  width = 650,
  height = 350
}) => {
  const svgRef = useRef();
  
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
  if (!data || data.length === 0) {
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

  // 표준화된 데이터 구조 {label, value} 사용
  const yKey = "value";
  const xKey = "label";
  
  // NaN 값 방어적 처리
  const safeData = data.filter(item => {
    const yValue = Number(item[yKey]);
    return !isNaN(yValue) && isFinite(yValue) && yValue >= 0;
  });
  
  if (safeData.length === 0) {
    return (
      <div style={{
        backgroundColor: "#f8f9fa",
        padding: "20px",
        borderRadius: "8px",
        marginBottom: "20px",
        textAlign: "center",
        color: "#666"
      }}>
        유효한 데이터가 없습니다.
      </div>
    );
  }
  
  const maxValue = Math.max(...safeData.map(item => Number(item[yKey]) || 0));
  const chartHeight = height;
  const chartWidth = width;

  // 각 월의 첫 주인지 확인
  const isFirstWeekOfMonth = (rows, idx) => {
    if (idx === 0) return true;
    const cur = rows[idx];
    const prev = rows[idx - 1];
    if (!cur || !prev) return false;
    return cur.월레이블 !== prev.월레이블;
  };

  // 가로막대 차트 그리기
  const renderHorizontalBarChart = () => {
    if (safeData.length === 0) return null;

    const barHeight = 30;
    const barSpacing = 10;
    const totalBarHeight = safeData.length * (barHeight + barSpacing);
    const chartPadding = 80;
    const actualChartHeight = Math.max(totalBarHeight + chartPadding, chartHeight);
    
    return (
      <svg ref={svgRef} width={chartWidth} height={actualChartHeight} style={{ margin: "0 auto", display: "block" }}>
        {/* 배경 그리드 */}
        <defs>
          <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#f0f0f0" strokeWidth="1"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        
        {/* Y축 라벨 (카테고리명) */}
        {safeData.map((item, idx) => {
          const y = 40 + idx * (barHeight + barSpacing) + barHeight / 2;
          return (
            <text key={idx} x="10" y={y} fontSize="12" textAnchor="start" fill="#666" dominantBaseline="middle">
              {item[xKey]}
            </text>
          );
        })}
        
        {/* X축 라벨 (수치) */}
        {(() => {
          const getXAxisValues = (maxVal) => {
            if (maxVal <= 50) return [0, 10, 20, 30, 40, 50];
            if (maxVal <= 100) return [0, 20, 40, 60, 80, 100];
            if (maxVal <= 200) return [0, 50, 100, 150, 200];
            if (maxVal <= 500) return [0, 100, 200, 300, 400, 500];
            if (maxVal <= 1000) return [0, 200, 400, 600, 800, 1000];
            const step = Math.ceil(maxVal / 5 / 100) * 100;
            const values = [];
            for (let i = 0; i <= 5; i++) {
              values.push(i * step);
            }
            return values;
          };
          
          const xAxisValues = getXAxisValues(maxValue);
          
          return xAxisValues.map((value, idx) => {
            const ratio = value / maxValue;
            const x = 100 + (ratio * (chartWidth - 120));
            return (
              <g key={idx}>
                <line x1={x} y1={actualChartHeight - 40} x2={x} y2={actualChartHeight - 35} stroke="#ccc" strokeWidth="1" />
                <text x={x} y={actualChartHeight - 20} fontSize="12" textAnchor="middle" fill="#666">
                  {value.toLocaleString()}
                </text>
              </g>
            );
          });
        })()}
        
                 {/* 가로막대 */}
         {safeData.map((item, idx) => {
           const value = Number(item[yKey]) || 0;
           const ratio = value / maxValue;
           const y = 40 + idx * (barHeight + barSpacing);
           const barWidth = ratio * (chartWidth - 120);
           const colors = ["#007bff", "#28a745", "#ffc107", "#dc3545", "#6f42c1", "#fd7e14"];
           const color = colors[idx % colors.length];
          
          return (
            <g key={idx}>
              <rect
                x={100}
                y={y}
                width={barWidth}
                height={barHeight}
                fill={color}
                rx="4"
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
                  tooltip.textContent = `${item[xKey]}: ${value.toLocaleString()}`;
                  document.body.appendChild(tooltip);
                  
                  e.target.onmouseleave = () => document.body.removeChild(tooltip);
                }}
              />
              {/* 막대 위에 수치 표시 */}
              <text
                x={100 + barWidth + 10}
                y={y + barHeight / 2}
                fontSize="12"
                fill="#333"
                dominantBaseline="middle"
              >
                {value.toLocaleString()}
              </text>
            </g>
          );
        })}
      </svg>
    );
  };

  // 라인 차트 그리기
  const renderLineChart = () => {
    if (safeData.length === 0) return null;

    const points = safeData.map((item, idx) => {
       const value = Number(item[yKey]) || 0;
      // safeData.length가 1일 때 NaN 방지
      const x = safeData.length === 1 ? chartWidth / 2 : (idx / (safeData.length - 1)) * (chartWidth - 60) + 30;
       const y = chartHeight - 60 - ((value / maxValue) * (chartHeight - 120));
       return { x, y, value, label: item[xKey] };
     });

    // 라인 경로 생성
    const linePath = points.map((point, idx) => {
      if (idx === 0) return `M ${point.x} ${point.y}`;
      return `L ${point.x} ${point.y}`;
    }).join(' ');

    return (
      <svg ref={svgRef} width={chartWidth} height={chartHeight} style={{ margin: "0 auto", display: "block" }}>
        {/* 배경 그리드 */}
        <defs>
          <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#f0f0f0" strokeWidth="1"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        
                 {/* Y축 라벨 */}
         {(() => {
           // 적절한 Y축 단위 계산
           const getYAxisValues = (maxVal) => {
             if (maxVal <= 50) return [0, 10, 20, 30, 40, 50];
             if (maxVal <= 100) return [0, 20, 40, 60, 80, 100];
             if (maxVal <= 200) return [0, 50, 100, 150, 200];
             if (maxVal <= 500) return [0, 100, 200, 300, 400, 500];
             if (maxVal <= 1000) return [0, 200, 400, 600, 800, 1000];
             // 더 큰 값들
             const step = Math.ceil(maxVal / 5 / 100) * 100;
             const values = [];
             for (let i = 0; i <= 5; i++) {
               values.push(i * step);
             }
             return values;
           };
           
           const yAxisValues = getYAxisValues(maxValue);
           
           return yAxisValues.map((value, idx) => {
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
           });
         })()}
        
        {/* X축 라벨 */}
        {(() => {
          const rows = safeData;
          // 시작 날짜 계산 (데이터의 첫 번째 항목 날짜)
          const startDate = rows.length > 0 && rows[0].label ? new Date(rows[0].label) : null;
          
          return rows.map((item, idx) => {
            const x = rows.length === 1
              ? chartWidth / 2
              : (idx / (rows.length - 1)) * (chartWidth - 60) + 30;

            // 현재 아이템의 날짜
            const itemDate = item.label ? new Date(item.label) : null;
            
            // 시작 날짜 이상인지 확인
            const isValidDate = !startDate || !itemDate || itemDate >= startDate;

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
                    {item[xLabel] || item.label}
                  </text>
                )}

                {/* 주간: 그 달의 첫 주만 월 레이블 (시작 날짜 이상만 표시) */}
                {dateGroup === "주간" && item.월레이블 && isFirstWeekOfMonth(rows, idx) && isValidDate && (
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
        
        {/* 라인 차트 */}
        <path d={linePath} stroke="#007bff" strokeWidth="3" fill="none" />
        
        {/* 포인트 */}
        {points.map((point, idx) => (
          <circle
            key={idx}
            cx={point.x}
            cy={point.y}
            r="4"
            fill="#007bff"
            stroke="white"
            strokeWidth="2"
          />
        ))}
        
        {/* 툴팁 (호버 시) */}
        {points.map((point, idx) => (
          <circle
            key={`tooltip-${idx}`}
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
              // 값만 표시 (라벨 제거)
              tooltip.textContent = point.value.toLocaleString();
              document.body.appendChild(tooltip);
              
              e.target.onmouseleave = () => document.body.removeChild(tooltip);
            }}
          />
        ))}
      </svg>
    );
  };

  return (
    <div style={{
      backgroundColor: "white",
      padding: "20px",
      borderRadius: "8px",
      marginBottom: "20px",
      boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
    }}>
      {label && (
        <h3 style={{ color: "#333", margin: "0 0 16px 0" }}>{label}</h3>
      )}
      {chartType === "horizontalBar" ? renderHorizontalBarChart() : renderLineChart()}
    </div>
  );
};

export default ChartSection; 