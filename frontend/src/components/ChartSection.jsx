import React, { useRef } from 'react';

// data: [{...}], label: 제목, xKey: x축 데이터 key, yKey: y축 데이터 key, loading: boolean
const ChartSection = ({
  data = [],
  label = "차트",
  xLabel = "x축",
  yLabel = "y축",
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



  // yLabel/xLabel이 "key" 값일 때 안전하게 처리
  const yKey = typeof yLabel === "string" ? yLabel : "y";
  const xKey = typeof xLabel === "string" ? xLabel : "x";
  const maxValue = Math.max(...data.map(item => Number(item[yKey]) || 0));
  const chartHeight = 350;
  const chartWidth = 650;

  // 각 월의 첫 주인지 확인하는 함수
  const isFirstWeekOfMonth = (data, currentIndex) => {
    if (currentIndex === 0) return true; // 첫 번째 데이터는 항상 표시
    
    const currentItem = data[currentIndex];
    const prevItem = data[currentIndex - 1];
    
    if (!currentItem || !prevItem) return false;
    
    // 현재 월과 이전 월이 다르면 첫 주
    return currentItem.월레이블 !== prevItem.월레이블;
  };

  // 라인 차트 그리기
  const renderLineChart = () => {
    if (data.length === 0) return null;

         const points = data.map((item, idx) => {
       const value = Number(item[yKey]) || 0;
       // data.length가 1일 때 NaN 방지
       const x = data.length === 1 ? chartWidth / 2 : (idx / (data.length - 1)) * (chartWidth - 60) + 30;
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
        {points.map((point, idx) => (
          <g key={idx}>
            <line x1={point.x} y1={chartHeight - 60} x2={point.x} y2={chartHeight - 55} stroke="#ccc" strokeWidth="1" />
            {/* 월간일 때는 X축 라벨 표시, 주간일 때는 월 레이블만 */}
            {dateGroup === "월간" ? (
              <text x={point.x} y={chartHeight - 40} fontSize="12" textAnchor="middle" fill="#666">
                {point.label}
              </text>
                         ) : (
               /* 주간일 때는 월 레이블만 표시 (첫 주에만) */
               <g>
                 {/* 월 레이블 (각 월의 첫 주에만 표시) */}
                 {data[idx] && data[idx].월레이블 && isFirstWeekOfMonth(data, idx) && (
                   <text x={point.x} y={chartHeight - 40} fontSize="13" textAnchor="middle" fill="#007bff" fontWeight="bold">
                     {data[idx].월레이블}
                   </text>
                 )}
               </g>
             )}
          </g>
        ))}
        
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
             <div style={{ 
         display: "flex", 
         alignItems: "center", 
         marginBottom: "16px" 
       }}>
         <h3 style={{ color: "#333", margin: 0, marginRight: "12px" }}>{label}</h3>
         <select
           value={dateGroup}
           onChange={(e) => {
             if (onDateGroupChange) {
               onDateGroupChange(e.target.value);
             }
           }}
           style={{ 
             padding: "4px 8px", 
             borderRadius: "4px", 
             border: "1px solid #ddd",
             fontSize: "14px"
           }}
         >
           <option value="월간">월간</option>
           <option value="주간">주간</option>
         </select>
       </div>
      {renderLineChart()}
    </div>
  );
};

export default ChartSection; 