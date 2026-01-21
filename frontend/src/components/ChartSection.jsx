import React, { useRef, useState } from 'react';

// data: [{...}], label: 제목, xKey: x축 데이터 key, yKey: y축 데이터 key, loading: boolean
const ChartSection = ({
  data = [],
  label = "차트",
  xLabel = "x축",
  yLabel = "y축",
  loading = false,
  dateGroup = "Monthly",
  chartType = "line", // "line" 또는 "horizontalBar"
  width = 650,
  height = 350,
  multiLineData = {}, // 서비스 유형별 개별 데이터 {서비스유형1: [...], 서비스유형2: [...]}
  showTotalLine = true // 합계 라인 표시 여부
}) => {
  const svgRef = useRef();
  const [selectedServiceType, setSelectedServiceType] = useState(null); // 선택된 서비스 유형
  
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
  
  const maxValue = safeData.length > 0 
    ? Math.max(...safeData.map(item => {
        const val = Number(item[yKey]) || 0;
        return isFinite(val) && !isNaN(val) ? val : 0;
      }))
    : 1;
  // maxValue가 유효하지 않으면 기본값 1로 설정
  const safeMaxValue = isFinite(maxValue) && !isNaN(maxValue) && maxValue > 0 ? maxValue : 1;
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

    // 모든 데이터의 최대값 계산 (개별 라인과 합계 라인 모두 고려)
    let allMaxValue = safeMaxValue;
    if (Object.keys(multiLineData).length > 0) {
      const multiLineMaxValues = Object.values(multiLineData).map(data => {
        const values = data.map(item => Number(item.value) || 0).filter(v => isFinite(v) && !isNaN(v));
        return values.length > 0 ? Math.max(...values) : 0;
      }).filter(v => isFinite(v) && !isNaN(v));
      if (multiLineMaxValues.length > 0) {
        allMaxValue = Math.max(safeMaxValue, ...multiLineMaxValues);
      }
    }
    
    // allMaxValue가 0이거나 유효하지 않으면 기본값 1로 설정
    if (!isFinite(allMaxValue) || isNaN(allMaxValue) || allMaxValue <= 0) {
      allMaxValue = 1;
    }

    const points = safeData.map((item, idx) => {
       const value = Number(item[yKey]) || 0;
       // NaN, Infinity 체크
       const safeValue = isFinite(value) && !isNaN(value) ? value : 0;
      // safeData.length가 1일 때 NaN 방지
      const x = safeData.length === 1 ? chartWidth / 2 : (idx / (safeData.length - 1)) * (chartWidth - 60) + 30;
      // 안전한 y 계산
      const ratio = safeValue / allMaxValue;
      const safeRatio = isFinite(ratio) && !isNaN(ratio) ? ratio : 0;
       const y = chartHeight - 60 - (safeRatio * (chartHeight - 120));
       return { x: isFinite(x) ? x : chartWidth / 2, y: isFinite(y) ? y : chartHeight - 60, value: safeValue, label: item[xKey] };
     });

    // 서비스 유형별 개별 라인 데이터 생성
    const serviceTypeLines = Object.entries(multiLineData).map(([serviceType, serviceData]) => {
      const servicePoints = serviceData.map((item, idx) => {
        const value = Number(item.value) || 0;
        // NaN, Infinity 체크
        const safeValue = isFinite(value) && !isNaN(value) ? value : 0;
        const x = serviceData.length === 1 ? chartWidth / 2 : (idx / (serviceData.length - 1)) * (chartWidth - 60) + 30;
        // 안전한 y 계산
        const ratio = safeValue / allMaxValue;
        const safeRatio = isFinite(ratio) && !isNaN(ratio) ? ratio : 0;
        const y = chartHeight - 60 - (safeRatio * (chartHeight - 120));
        return { x: isFinite(x) ? x : chartWidth / 2, y: isFinite(y) ? y : chartHeight - 60, value: safeValue, label: item.label, serviceType };
      });
      return { serviceType, points: servicePoints };
    });

    // 라인 경로 생성
    const totalLinePath = points.map((point, idx) => {
      if (idx === 0) return `M ${point.x} ${point.y}`;
      return `L ${point.x} ${point.y}`;
    }).join(' ');

    // 서비스 유형별 라인 경로 생성
    const serviceLinePaths = serviceTypeLines.map(({ serviceType, points }) => {
      const path = points.map((point, idx) => {
        if (idx === 0) return `M ${point.x} ${point.y}`;
        return `L ${point.x} ${point.y}`;
      }).join(' ');
      return { serviceType, path, points };
    });

    // 색상 팔레트
    const colors = ["#007bff", "#28a745", "#ffc107", "#dc3545", "#6f42c1", "#fd7e14", "#20c997", "#e83e8c"];

    return (
      <>
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
          
          const yAxisValues = getYAxisValues(allMaxValue);
          
          return yAxisValues.map((value, idx) => {
            const ratio = value / allMaxValue;
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

                {/* Monthly: 모든 포인트에 라벨 */}
                {dateGroup === "Monthly" && (
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

                {/* Weekly/Daily: 모든 포인트에 시계열 표시 */}
                {(dateGroup === "Weekly" || dateGroup === "Daily") && (
                  <text
                    x={x}
                    y={chartHeight - 40}
                    fontSize="12"
                    textAnchor="middle"
                    fill="#666"
                    transform={rows.length >= 18 ? `rotate(-45 ${x} ${chartHeight - 40})` : undefined}
                  >
                    {item[xLabel] || item.label}
                  </text>
                )}
              </g>
            );
          });
        })()}
        
        {/* 서비스 유형별 개별 라인들 */}
        {serviceLinePaths.map(({ serviceType, path, points }, lineIdx) => {
          const isSelected = selectedServiceType === serviceType;
          const isDimmed = selectedServiceType !== null && !isSelected;
          const lineColor = isDimmed ? "#d3d3d3" : colors[lineIdx % colors.length];
          const lineWidth = isSelected ? 4 : (isDimmed ? 2 : 3);
          return (
            <g key={serviceType}>
              <path d={path} stroke={lineColor} strokeWidth={lineWidth} fill="none" style={{ cursor: "pointer" }}
                    onClick={() => setSelectedServiceType(isSelected ? null : serviceType)} />
              {points.map((point, idx) => {
                const item = multiLineData[serviceType]?.[idx];
                return (
                  <circle
                    key={`${serviceType}-${idx}`}
                    cx={point.x}
                    cy={point.y}
                    r={isSelected ? 5 : (isDimmed ? 3 : 4)}
                    fill={lineColor}
                    stroke="white"
                    strokeWidth={isSelected ? 2.5 : 2}
                    style={{ cursor: "pointer" }}
                    onClick={(e) => {
                      setSelectedServiceType(isSelected ? null : serviceType);
                      e.stopPropagation();
                      
                      const tooltip = document.createElement('div');
                      tooltip.style.cssText = `
                        position: fixed;
                        background: rgba(0,0,0,0.9);
                        color: white;
                        padding: 10px 12px;
                        border-radius: 6px;
                        font-size: 13px;
                        pointer-events: none;
                        z-index: 1000;
                        left: ${e.clientX + 10}px;
                        top: ${e.clientY - 10}px;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                      `;
                      // Weekly일 때 호버 툴팁에는 무조건 WB 포함
                      let xAxisLabel = item?.label || point.label;
                      if (dateGroup === "Weekly" && xAxisLabel && !xAxisLabel.startsWith('WB')) {
                        xAxisLabel = `WB${xAxisLabel}`;
                      }
                      tooltip.innerHTML = `
                        <div style="font-weight: bold; margin-bottom: 4px;">시계열: ${xAxisLabel}</div>
                        <div>${serviceType}: ${point.value.toLocaleString()}</div>
                      `;
                      document.body.appendChild(tooltip);
                      
                      const removeTooltip = () => {
                        if (tooltip.parentNode) {
                          document.body.removeChild(tooltip);
                        }
                      };
                      
                      // 3초 후 자동 제거 또는 클릭 시 제거
                      setTimeout(removeTooltip, 3000);
                      document.addEventListener('click', removeTooltip, { once: true });
                    }}
                  />
                );
              })}
              {/* 서비스 유형별 툴팁 (호버) - 선택된 라인이 있을 때는 선택된 라인에만 표시 */}
              {(!selectedServiceType || isSelected) && points.map((point, idx) => {
                const item = multiLineData[serviceType]?.[idx];
                return (
                  <circle
                    key={`tooltip-${serviceType}-${idx}`}
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
                      // Weekly일 때 호버 툴팁에는 무조건 WB 포함
                      let xAxisLabel = item?.label || point.label;
                      if (dateGroup === "Weekly" && xAxisLabel && !xAxisLabel.startsWith('WB')) {
                        xAxisLabel = `WB${xAxisLabel}`;
                      }
                      tooltip.innerHTML = `
                        <div style="font-weight: bold; margin-bottom: 2px;">${xAxisLabel}</div>
                        <div>${serviceType}: ${point.value.toLocaleString()}</div>
                      `;
                      document.body.appendChild(tooltip);
                      
                      e.target.onmouseleave = () => document.body.removeChild(tooltip);
                    }}
                  />
                );
              })}
            </g>
          );
        })}
        
        {/* 합계 라인 (점선) */}
        {showTotalLine && (() => {
          const isTotalSelected = selectedServiceType === "합계";
          const isTotalDimmed = selectedServiceType !== null && !isTotalSelected;
          const totalLineColor = isTotalDimmed ? "#d3d3d3" : "#666";
          const totalLineWidth = isTotalSelected ? 4 : (isTotalDimmed ? 2 : 3);
          return (
            <path d={totalLinePath} stroke={totalLineColor} strokeWidth={totalLineWidth} fill="none" strokeDasharray="5,5" 
                  style={{ cursor: "pointer" }} onClick={() => setSelectedServiceType(isTotalSelected ? null : "합계")} />
          );
        })()}
        
        {/* 합계 포인트 */}
        {showTotalLine && (() => {
          const isTotalSelected = selectedServiceType === "합계";
          const isTotalDimmed = selectedServiceType !== null && !isTotalSelected;
          const totalColor = isTotalDimmed ? "#d3d3d3" : "#666";
          return points.map((point, idx) => {
            const item = safeData[idx];
            return (
              <circle
                key={`total-${idx}`}
                cx={point.x}
                cy={point.y}
                r={isTotalSelected ? 5 : (isTotalDimmed ? 3 : 4)}
                fill={totalColor}
                stroke="white"
                strokeWidth={isTotalSelected ? 2.5 : 2}
                style={{ cursor: "pointer" }}
                onClick={(e) => {
                  setSelectedServiceType(isTotalSelected ? null : "합계");
                  e.stopPropagation();
                  
                  const tooltip = document.createElement('div');
                  tooltip.style.cssText = `
                    position: fixed;
                    background: rgba(0,0,0,0.9);
                    color: white;
                    padding: 10px 12px;
                    border-radius: 6px;
                    font-size: 13px;
                    pointer-events: none;
                    z-index: 1000;
                    left: ${e.clientX + 10}px;
                    top: ${e.clientY - 10}px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                  `;
                  // 주간일 때 호버 툴팁에는 무조건 WB 포함
                  let xAxisLabel = item[xLabel] || item.label;
                  if (dateGroup === "Weekly" && xAxisLabel && !xAxisLabel.startsWith('WB')) {
                    xAxisLabel = `WB${xAxisLabel}`;
                  }
                  tooltip.innerHTML = `
                    <div style="font-weight: bold; margin-bottom: 4px;">시계열: ${xAxisLabel}</div>
                    <div>합계: ${point.value.toLocaleString()}</div>
                  `;
                  document.body.appendChild(tooltip);
                  
                  const removeTooltip = () => {
                    if (tooltip.parentNode) {
                      document.body.removeChild(tooltip);
                    }
                  };
                  
                  // 3초 후 자동 제거 또는 클릭 시 제거
                  setTimeout(removeTooltip, 3000);
                  document.addEventListener('click', removeTooltip, { once: true });
                }}
              />
            );
          });
        })()}
        
        {/* 툴팁 (호버 시) */}
        {points.map((point, idx) => {
          const item = safeData[idx];
          return (
            <circle
              key={`tooltip-total-${idx}`}
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
                // 주간일 때 호버 툴팁에는 무조건 WB 포함
                let xAxisLabel = item[xLabel] || item.label;
                if (dateGroup === "Weekly" && xAxisLabel && !xAxisLabel.startsWith('WB')) {
                  xAxisLabel = `WB${xAxisLabel}`;
                }
                tooltip.innerHTML = `
                  <div style="font-weight: bold; margin-bottom: 2px;">${xAxisLabel}</div>
                  <div>합계: ${point.value.toLocaleString()}</div>
                `;
                document.body.appendChild(tooltip);
                
                e.target.onmouseleave = () => document.body.removeChild(tooltip);
              }}
            />
          );
        })}
      </svg>
      {/* 범례 - 차트 아래에 표시 */}
      {Object.keys(multiLineData).length > 0 && (
        <div style={{ 
          display: "flex", 
          justifyContent: "center", 
          gap: "20px", 
          marginTop: "16px",
          flexWrap: "wrap"
        }}>
          {serviceLinePaths.map(({ serviceType }, idx) => {
            const isSelected = selectedServiceType === serviceType;
            const isDimmed = selectedServiceType !== null && !isSelected;
            const legendColor = isDimmed ? "#d3d3d3" : colors[idx % colors.length];
            return (
              <div 
                key={`legend-${serviceType}`} 
                style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "8px",
                  cursor: "pointer",
                  opacity: isDimmed ? 0.5 : 1,
                  fontWeight: isSelected ? "bold" : "normal"
                }}
                onClick={() => {
                  // 같은 서비스 유형 클릭 시 선택 해제, 다른 서비스 유형 클릭 시 선택
                  setSelectedServiceType(isSelected ? null : serviceType);
                }}
              >
                <div style={{
                  width: "12px",
                  height: "12px",
                  backgroundColor: legendColor,
                  borderRadius: "2px",
                  border: isSelected ? "2px solid #333" : "none"
                }}></div>
                <span style={{ fontSize: "12px", color: isDimmed ? "#999" : "#666" }}>{serviceType}</span>
              </div>
            );
          })}
          {showTotalLine && (() => {
            const isTotalSelected = selectedServiceType === "합계";
            const isTotalDimmed = selectedServiceType !== null && !isTotalSelected;
            const totalLegendColor = isTotalDimmed ? "#d3d3d3" : "#666";
            return (
              <div 
                style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "8px",
                  cursor: "pointer",
                  opacity: isTotalDimmed ? 0.5 : 1,
                  fontWeight: isTotalSelected ? "bold" : "normal"
                }}
                onClick={() => {
                  // 합계 클릭 시 선택 해제, 다른 것 선택 시 합계 선택
                  setSelectedServiceType(isTotalSelected ? null : "합계");
                }}
              >
                <div style={{
                  width: "12px",
                  height: "12px",
                  backgroundColor: totalLegendColor,
                  borderRadius: "2px",
                  border: isTotalSelected ? "2px solid #333" : "none",
                  backgroundImage: isTotalDimmed ? "none" : "repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.3) 2px, rgba(255,255,255,0.3) 4px)"
                }}></div>
                <span style={{ fontSize: "12px", color: isTotalDimmed ? "#999" : "#666", fontWeight: isTotalSelected ? "bold" : "normal" }}>합계</span>
              </div>
            );
          })()}
        </div>
      )}
      </>
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