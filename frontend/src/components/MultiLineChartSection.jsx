import React, { useRef, useMemo, useState } from 'react';

// data: [{x축: "04", 첫응답시간: 10, 평균응답시간: 20, ...}], 
// lines: [{key: "첫응답시간", color: "#007bff", label: "첫응답시간"}, ...]
const MultiLineChartSection = ({
  data = [],
  lines = [],
  label = "차트",
  xLabel = "x축",
  loading = false,
  dateGroup = "Monthly",
  onDateGroupChange = null,
  unit = "분" // 기본값은 "분", 담당자별 문의량 차트는 "건"
}) => {
  const svgRef = useRef();
  const [selectedLineKey, setSelectedLineKey] = useState(null); // 선택된 라인 키

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

  // Weekly X축에서 "그 달의 첫 주"만 판단 (ChartSection 동일 로직)
  const isFirstWeekOfMonthXAxis = (rows, idx) => {
    if (idx === 0) return true;
    const cur = rows[idx];
    const prev = rows[idx - 1];
    if (!cur || !prev) return false;
    const monthOf = (it) => it?.월레이블 ?? monthLabelOf(it);
    return monthOf(cur) !== monthOf(prev);
  };

  // Weekly 집계: data가 일/개별 레코드 기반일 때 주차(월요일~일요일) 평균으로 변환
  // 단, unit이 "건"인 경우(담당자별 문의량 등)는 이미 집계된 데이터이므로 평균 대신 합계 사용
  const plotData = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return [];
    if (dateGroup !== "Weekly") return data;

    // 날짜키 추론
    const dateKeys = ["발생시각", "createdAt", "openedAt", "timestamp", "date", "생성시각"];
    const sample = data[0] || {};
    const dateKey = dateKeys.find(k => k in sample);
    if (!dateKey) {
      // 날짜가 없으면 집계 불가 → 원본 반환 (담당자별 문의량처럼 이미 집계된 데이터)
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
      // unit이 "건"이면 합계, 아니면 평균 계산
      if (unit === "건") {
        metricKeys.forEach(k => { r[k] = +(b[k] || 0); });
      } else {
        metricKeys.forEach(k => { r[k] = b.__count ? +(b[k] / b.__count).toFixed(1) : 0; });
      }
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
  }, [data, dateGroup, lines, unit]);
  
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
  
  // 해결시간과 다른 값들을 분리하여 최대값 계산
  const resolutionTimeKey = lines.find(l => l.key === "operationResolutionTime")?.key;
  const otherValues = [];
  const resolutionValues = [];
  
  lines.forEach(line => {
    plotData.forEach(item => {
      const value = Number(item[line.key]) || 0;
      // NaN, Infinity 체크
      if (isFinite(value) && !isNaN(value)) {
        if (line.key === resolutionTimeKey) {
          resolutionValues.push(value);
        } else {
          otherValues.push(value);
        }
      }
    });
  });
  
  const maxOtherValue = otherValues.length > 0 ? Math.max(...otherValues, 1) : 1;
  const filteredOtherValues = otherValues.filter(v => v > 0);
  const minOtherValue = filteredOtherValues.length > 0 ? Math.min(...filteredOtherValues) : 0;
  const maxResolutionValue = resolutionValues.length > 0 ? Math.max(...resolutionValues, 1) : 1;
  const filteredResolutionValues = resolutionValues.filter(v => v > 0);
  const minResolutionValue = filteredResolutionValues.length > 0 ? Math.min(...filteredResolutionValues) : 0;
  
  // break가 필요한지 판단 (해결시간이 다른 값의 2배 이상이면 break 추가)
  const needsBreak = maxResolutionValue > maxOtherValue * 2 && maxOtherValue > 0;
  
  // break 위치 설정
  // 아래쪽 구간을 매우 넓게 해서 첫응답시간, 평균응답시간, 총응답시간 비교를 쉽게
  // 위쪽 구간은 해결시간만 극도로 좁게 표시 (최소값이 물결선보다 위에 있어야 함)
  // 아래쪽 구간은 물결선보다 아래에 있어야 함
  const breakY = needsBreak ? (chartHeight - 60) * 0.55 : chartHeight - 60; // break 위치 (차트 높이의 55% 지점)
  const breakGap = needsBreak ? 30 : 0; // break 구간의 간격
  const waveY = needsBreak ? breakY + breakGap / 2 : 0; // 물결선 위치
  // 위쪽 구간: 해결시간 최소값이 물결선보다 위에 있어야 함
  // 최소값이 upperStartY(위), 최대값이 upperBottomY(아래)에 위치
  const upperStartY = needsBreak ? 5 : 40; // 위쪽 구간 시작 위치 (매우 위로 - 극도로 좁게)
  const upperBottomY = needsBreak ? waveY - 20 : chartHeight - 60; // 위쪽 구간 하단 (물결선보다 충분히 위 - 극도로 좁게)
  // 아래쪽 구간: 물결선보다 아래, 최소값부터 최대값까지의 범위 사용
  const lowerTopY = needsBreak ? waveY + breakGap / 2 : chartHeight - 60; // 아래쪽 구간 상단 (물결선보다 아래)

  // 각 라인의 포인트 계산 (이미 분 단위)
  const getLinePoints = (lineKey) => {
    const isResolutionTime = lineKey === resolutionTimeKey;
    
    return plotData.map((item, idx) => {
      let value = Number(item[lineKey]) || 0;
      // NaN, Infinity 체크
      if (!isFinite(value) || isNaN(value)) {
        value = 0;
      }
      
      // 데이터가 1개일 때는 차트 중앙에 배치, 여러 개일 때는 균등 분배
      const x = plotData.length === 1 
        ? chartWidth / 2  // 데이터가 1개일 때 중앙 배치
        : (idx / Math.max(plotData.length - 1, 1)) * (chartWidth - 60) + 30;  // 여러 개일 때 균등 분배
      
      let y;
      if (needsBreak) {
        if (isResolutionTime) {
          // 해결시간: break 위쪽 구간 사용
          const safeMaxValue = isFinite(maxResolutionValue) && maxResolutionValue > 0 ? maxResolutionValue : 1;
          const safeMinValue = isFinite(minResolutionValue) && minResolutionValue >= 0 ? minResolutionValue : 0;
          // Y축 라벨 범위 사용 (실제 값보다 작은/큰 10단위)
          const step = safeMaxValue <= 20 ? 5 : 10;
          const labelMinValue = Math.floor(safeMinValue / step) * step;
          const labelMaxValue = Math.ceil(safeMaxValue / step) * step;
          const labelRange = labelMaxValue - labelMinValue;
          // 위쪽 구간: upperBottomY (아래) ~ upperStartY (위) - 물결선보다 위에
          const upperHeight = upperBottomY - upperStartY;
          // 작은 값이 아래(upperBottomY), 큰 값이 위(upperStartY)에 위치
          const ratio = labelRange > 0 ? (value - labelMinValue) / labelRange : 0;
          y = upperBottomY - (isFinite(ratio) ? (ratio * upperHeight) : 0);
        } else {
          // 다른 값들: break 아래쪽 구간 사용
          // Y축 라벨 범위 사용 (실제 값보다 작은/큰 10단위)
          const safeMaxValue = isFinite(maxOtherValue) && maxOtherValue > 0 ? maxOtherValue : 1;
          const safeMinValue = isFinite(minOtherValue) && minOtherValue >= 0 ? minOtherValue : 0;
          const step = safeMaxValue <= 20 ? 5 : 10;
          const labelMinValue = Math.floor(safeMinValue / step) * step;
          const labelMaxValue = Math.ceil(safeMaxValue / step) * step;
          const labelRange = labelMaxValue - labelMinValue;
          // 아래쪽 구간: chartHeight - 60 (아래) ~ lowerTopY (위) - 물결선보다 아래
          const lowerHeight = (chartHeight - 60) - lowerTopY;
          // labelMinValue가 chartHeight - 60에, labelMaxValue가 lowerTopY에 위치
          const ratio = labelRange > 0 ? (value - labelMinValue) / labelRange : 0;
          y = chartHeight - 60 - (isFinite(ratio) ? (ratio * lowerHeight) : 0);
        }
      } else {
        // break가 없을 때는 기존 로직 사용
        const maxValue = Math.max(maxOtherValue, maxResolutionValue);
        const safeMaxValue = isFinite(maxValue) && maxValue > 0 ? maxValue : 1;
        const ratio = value / safeMaxValue;
        y = chartHeight - 60 - (isFinite(ratio) ? (ratio * (chartHeight - 120)) : 0);
      }
      
      return { x: isFinite(x) ? x : chartWidth / 2, y: isFinite(y) ? y : chartHeight - 60, value, label: item[xLabel] };
    });
  };

  // 라인 경로 생성
  const getLinePath = (points) => {
    return points.map((point, idx) => {
      if (idx === 0) return `M ${point.x} ${point.y}`;
      return `L ${point.x} ${point.y}`;
    }).join(' ');
  };

  // Y축 값 계산 (분 단위) - 라벨 개수 최대 4개로 제한
  const getYAxisValues = (maxVal) => {
    // NaN, Infinity 체크
    if (!isFinite(maxVal) || isNaN(maxVal) || maxVal <= 0) {
      return [0, 1, 2, 3];
    }
    
    if (maxVal <= 5) return [0, 2, 4];
    if (maxVal <= 10) return [0, 5, 10];
    if (maxVal <= 20) return [0, 10, 20];
    if (maxVal <= 50) return [0, 20, 40];
    if (maxVal <= 100) return [0, 50, 100];
    // 더 큰 값들 - 최대 4개
    const step = Math.ceil(maxVal / 3);
    const values = [];
    for (let i = 0; i <= 3; i++) {
      values.push(i * step);
    }
    return values;
  };

  // Y축 값 계산
  // 아래쪽 구간: 실제 값보다 작은 10단위와 큰 10단위를 표시
  // 예: 실제값 17이면 10, 20 표시
  const getYAxisValuesInRange = (minVal, maxVal) => {
    if (!isFinite(minVal) || !isFinite(maxVal) || maxVal <= minVal) {
      return getYAxisValues(maxVal).map(v => Math.round(v));
    }
    
    const range = maxVal - minVal;
    // 범위에 따라 적절한 step과 최대 개수 결정
    let step, maxCount;
    if (range <= 20) {
      step = 5;
      maxCount = 4;
    } else if (range <= 50) {
      step = 10;
      maxCount = 4;
    } else if (range <= 100) {
      step = 20;
      maxCount = 4;
    } else {
      step = Math.ceil(range / 3);
      maxCount = 4;
    }
    
    const startValue = Math.floor(minVal / step) * step; // 최소값보다 작은 단위
    const endValue = Math.ceil(maxVal / step) * step; // 최대값보다 큰 단위
    
    const values = [];
    let count = 0;
    for (let v = startValue; v <= endValue && count < maxCount; v += step) {
      values.push(Math.round(v)); // 소수점 제거
      count++;
    }
    return values;
  };
  
  const lowerYAxisValues = needsBreak ? getYAxisValuesInRange(minOtherValue, maxOtherValue) : [];
  const yAxisValues = needsBreak ? [] : getYAxisValues(Math.max(maxOtherValue, maxResolutionValue));

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
            {["Weekly", "Monthly"].map(g => (
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
        {needsBreak ? (
          <>
            {/* 아래쪽 구간 (다른 값들) */}
            {lowerYAxisValues.map((value, idx) => {
              // Y축 라벨 범위 사용 (실제 값보다 작은/큰 10단위)
              const safeMaxValue = isFinite(maxOtherValue) && maxOtherValue > 0 ? maxOtherValue : 1;
              const safeMinValue = isFinite(minOtherValue) && minOtherValue >= 0 ? minOtherValue : 0;
              const step = safeMaxValue <= 20 ? 5 : 10;
              const labelMinValue = Math.floor(safeMinValue / step) * step;
              const labelMaxValue = Math.ceil(safeMaxValue / step) * step;
              const labelRange = labelMaxValue - labelMinValue;
              const ratio = labelRange > 0 ? (value - labelMinValue) / labelRange : 0;
              const lowerHeight = (chartHeight - 60) - lowerTopY;
              // labelMinValue가 chartHeight - 60에, labelMaxValue가 lowerTopY에 위치
              const y = chartHeight - 60 - (isFinite(ratio) ? (ratio * lowerHeight) : 0);
              const safeY = isFinite(y) ? y : chartHeight - 60;
              // lowerTopY 아래에만 표시 (물결선보다 아래)
              if (safeY >= lowerTopY && safeY <= chartHeight - 60) {
                return (
                  <g key={`lower-${idx}`}>
                    <line x1="30" y1={safeY} x2="35" y2={safeY} stroke="#ccc" strokeWidth="1" />
                    <text x="20" y={safeY + 4} fontSize="12" textAnchor="end" fill="#666">
                      {value.toLocaleString()}
                    </text>
                  </g>
                );
              }
              return null;
            })}
            {/* Break 물결선 */}
            <g>
              {(() => {
                const wavePath = [];
                const startX = 30;
                const endX = chartWidth - 30;
                const amplitude = 4;
                const wavelength = 20;
                
                for (let x = startX; x <= endX; x += 2) {
                  const y = waveY + Math.sin((x - startX) / wavelength * Math.PI * 2) * amplitude;
                  if (x === startX) {
                    wavePath.push(`M ${x} ${y}`);
                  } else {
                    wavePath.push(`L ${x} ${y}`);
                  }
                }
                return (
                  <path
                    d={wavePath.join(' ')}
                    fill="none"
                    stroke="#999"
                    strokeWidth="2"
                  />
                );
              })()}
            </g>
            {/* 위쪽 구간 (해결시간 - 최대값, 최소값만) */}
            {(() => {
              const upperHeight = upperBottomY - upperStartY;
              const safeMaxValue = isFinite(maxResolutionValue) && maxResolutionValue > 0 ? maxResolutionValue : 1;
              const safeMinValue = isFinite(minResolutionValue) && minResolutionValue >= 0 ? minResolutionValue : 0;
              
              // 실제 값보다 작은/큰 10단위 계산 (데이터 포인트와 동일한 범위 사용)
              const step = safeMaxValue <= 20 ? 5 : 10;
              const roundedMinValue = Math.floor(safeMinValue / step) * step; // 최소값보다 작은 단위
              const roundedMaxValue = Math.ceil(safeMaxValue / step) * step; // 최대값보다 큰 단위
              const labelRange = roundedMaxValue - roundedMinValue;
              
              // 최소값 위치 (최소값이 0보다 크고 최대값과 다를 때만 표시)
              const showMin = roundedMinValue > 0 && labelRange > 0;
              const minRatio = 0; // roundedMinValue는 아래 (upperBottomY)
              const minY = upperBottomY - (minRatio * upperHeight);
              
              // 최대값 위치
              const maxRatio = labelRange > 0 ? 1 : 0; // roundedMaxValue는 위 (upperStartY)
              const maxY = upperBottomY - (maxRatio * upperHeight);
              
              return (
                <>
                  {/* 최소값 (조건부 표시) */}
                  {showMin && (
                    <g key="upper-min">
                      <line x1="30" y1={minY} x2="35" y2={minY} stroke="#ccc" strokeWidth="1" />
                      <text x="20" y={minY + 4} fontSize="12" textAnchor="end" fill="#666">
                        {Math.round(roundedMinValue).toLocaleString()}
                      </text>
                    </g>
                  )}
                  {/* 최대값 */}
                  <g key="upper-max">
                    <line x1="30" y1={maxY} x2="35" y2={maxY} stroke="#ccc" strokeWidth="1" />
                    <text x="20" y={maxY + 4} fontSize="12" textAnchor="end" fill="#666">
                      {Math.round(roundedMaxValue).toLocaleString()}
                    </text>
                  </g>
                </>
              );
            })()}
          </>
        ) : (
          yAxisValues.map((value, idx) => {
            const maxValue = Math.max(maxOtherValue, maxResolutionValue);
            const safeMaxValue = isFinite(maxValue) && maxValue > 0 ? maxValue : 1;
            const ratio = value / safeMaxValue;
            const y = chartHeight - 60 - (isFinite(ratio) ? (ratio * (chartHeight - 120)) : 0);
            const safeY = isFinite(y) ? y : chartHeight - 60;
            return (
              <g key={idx}>
                <line x1="30" y1={safeY} x2="35" y2={safeY} stroke="#ccc" strokeWidth="1" />
                <text x="20" y={safeY + 4} fontSize="12" textAnchor="end" fill="#666">
                  {value.toLocaleString()}
                </text>
              </g>
            );
          })
        )}
        
        {/* X축 라벨 */}
        {(() => {
          const rows = plotData;
          return rows.map((item, idx) => {
            const x = rows.length === 1
              ? chartWidth / 2
              : (idx / Math.max(rows.length - 1, 1)) * (chartWidth - 60) + 30;
            const safeX = isFinite(x) ? x : chartWidth / 2;

            return (
              <g key={idx}>
                <line
                  x1={safeX}
                  y1={chartHeight - 60}
                  x2={safeX}
                  y2={chartHeight - 55}
                  stroke="#ccc"
                  strokeWidth="1"
                />

                {/* Monthly: 모든 포인트에 라벨 */}
                {dateGroup === "Monthly" && (
                  <text
                    x={safeX}
                    y={chartHeight - 40}
                    fontSize="12"
                    textAnchor="middle"
                    fill="#666"
                  >
                    {item[xLabel]}
                  </text>
                )}

                {/* Weekly/Daily: 모든 포인트에 시계열 표시 */}
                {(dateGroup === "Weekly" || dateGroup === "Daily") && (
                  <text
                    x={safeX}
                    y={chartHeight - 40}
                    fontSize="12"
                    textAnchor="middle"
                    fill="#666"
                    transform={rows.length >= 18 ? `rotate(-45 ${safeX} ${chartHeight - 40})` : undefined}
                  >
                    {item[xLabel]}
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
          const isSelected = selectedLineKey === line.key;
          const isDimmed = selectedLineKey !== null && !isSelected;
          const lineColor = isDimmed ? "#d3d3d3" : line.color; // 선택되지 않은 라인은 회색
          const lineWidth = isSelected ? 4 : (isDimmed ? 2 : 3); // 선택된 라인은 더 두껍게
          
          return (
            <g key={lineIdx}>
              {/* 라인 */}
              <path 
                d={linePath} 
                stroke={lineColor} 
                strokeWidth={lineWidth} 
                fill="none"
                style={{ cursor: "pointer" }}
                onClick={() => {
                  // 같은 라인 클릭 시 선택 해제, 다른 라인 클릭 시 선택
                  setSelectedLineKey(isSelected ? null : line.key);
                }}
              />
              
              {/* 포인트 */}
              {points.map((point, idx) => {
                const item = plotData[idx];
                return (
                  <circle
                    key={idx}
                    cx={point.x}
                    cy={point.y}
                    r={isSelected ? 5 : (isDimmed ? 3 : 4)}
                    fill={lineColor}
                    stroke="white"
                    strokeWidth={isSelected ? 2.5 : 2}
                    style={{ cursor: "pointer" }}
                    onClick={(e) => {
                      // 라인 선택 토글
                      setSelectedLineKey(isSelected ? null : line.key);
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
                      const displayValue = unit === "건" ? Math.round(point.value).toLocaleString() : point.value.toFixed(1);
                      // Weekly일 때 호버 툴팁에는 무조건 WB 포함
                      let xAxisLabel = item?.[xLabel] || point.label;
                      if (dateGroup === "Weekly" && xAxisLabel && !xAxisLabel.startsWith('WB')) {
                        xAxisLabel = `WB${xAxisLabel}`;
                      }
                      tooltip.innerHTML = `
                        <div style="font-weight: bold; margin-bottom: 4px;">시계열: ${xAxisLabel}</div>
                        <div>${line.label}: ${displayValue}${unit}</div>
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
              
              {/* 툴팁 (호버 시) - 선택된 라인이 있을 때는 선택된 라인에만 표시 */}
              {(!selectedLineKey || isSelected) && points.map((point, idx) => {
                const item = plotData[idx];
                return (
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
                      const displayValue = unit === "건" ? Math.round(point.value).toLocaleString() : point.value.toFixed(1);
                      // Weekly일 때 호버 툴팁에는 무조건 WB 포함
                      let xAxisLabel = item?.[xLabel] || point.label;
                      if (dateGroup === "Weekly" && xAxisLabel && !xAxisLabel.startsWith('WB')) {
                        xAxisLabel = `WB${xAxisLabel}`;
                      }
                      tooltip.innerHTML = `
                        <div style="font-weight: bold; margin-bottom: 2px;">${xAxisLabel}</div>
                        <div>${line.label}: ${displayValue}${unit}</div>
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
      </svg>
      
      {/* 범례 */}
      <div style={{ 
        display: "flex", 
        justifyContent: "center", 
        gap: "20px", 
        marginTop: "16px",
        flexWrap: "wrap"
      }}>
        {lines.map((line, idx) => {
          const isSelected = selectedLineKey === line.key;
          const isDimmed = selectedLineKey !== null && !isSelected;
          const legendColor = isDimmed ? "#d3d3d3" : line.color;
          return (
            <div 
              key={idx} 
              style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: "8px",
                cursor: "pointer",
                opacity: isDimmed ? 0.5 : 1,
                fontWeight: isSelected ? "bold" : "normal"
              }}
              onClick={() => {
                // 같은 라인 클릭 시 선택 해제, 다른 라인 클릭 시 선택
                setSelectedLineKey(isSelected ? null : line.key);
              }}
            >
              <div style={{
                width: "12px",
                height: "12px",
                backgroundColor: legendColor,
                borderRadius: "2px",
                border: isSelected ? "2px solid #333" : "none"
              }}></div>
              <span style={{ fontSize: "12px", color: isDimmed ? "#999" : "#666" }}>{line.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MultiLineChartSection; 