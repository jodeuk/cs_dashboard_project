import React, { useRef } from 'react';

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

  const chartHeight = 350;
  const chartWidth = 650;
  
  // 모든 라인의 최대값 계산 (이미 분 단위)
  const allValues = [];
  lines.forEach(line => {
    data.forEach(item => {
      const value = Number(item[line.key]) || 0;
      allValues.push(value);
    });
  });
  const maxValue = Math.max(...allValues, 1); // 최소값 1로 설정

  // 각 라인의 포인트 계산 (이미 분 단위)
  const getLinePoints = (lineKey) => {
    return data.map((item, idx) => {
      const value = Number(item[lineKey]) || 0;
      const x = (idx / (data.length - 1)) * (chartWidth - 60) + 30;
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
      {label && (
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          marginBottom: "16px" 
        }}>
          <h3 style={{ color: "#333", margin: 0 }}>{label}</h3>
        </div>
      )}

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
        {data.map((item, idx) => {
          const x = (idx / (data.length - 1)) * (chartWidth - 60) + 30;
          return (
            <g key={idx}>
              <line x1={x} y1={chartHeight - 60} x2={x} y2={chartHeight - 55} stroke="#ccc" strokeWidth="1" />
              {/* X축 라벨 */}
              <text x={x} y={chartHeight - 40} fontSize="12" textAnchor="middle" fill="#666">
                {item[xLabel]}
              </text>
              {/* 월 레이블 (월이 변경되는 지점에만) */}
              {item.월레이블 && (
                <text x={x} y={chartHeight - 20} fontSize="13" textAnchor="middle" fill="#007bff" fontWeight="bold">
                  {item.월레이블}
                </text>
              )}
            </g>
          );
        })}
        
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