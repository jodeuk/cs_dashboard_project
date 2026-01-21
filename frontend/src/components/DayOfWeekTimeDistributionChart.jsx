import React, { useMemo, useState, useRef, useEffect } from "react";

// robust timestamp parser
function parseTsKST(ts) {
  if (ts == null) return null;
  if (typeof ts === "number" || (/^\d+$/.test(String(ts)) && String(ts).length >= 12)) {
    const n = Number(ts);
    return Number.isFinite(n) ? new Date(n) : null;
  }
  if (typeof ts !== "string") return null;
  let s = ts.trim();
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(s)) {
    s = s.replace(/\s+/, "T");
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// 요일 이름 (한글)
const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

// 시간 라벨 (0시~23시)
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => `${i}시`);

export default function DayOfWeekTimeDistributionChart({ rows = [] }) {
  const [viewMode, setViewMode] = useState("요일별"); // "요일별" or "시간별"
  const containerRef = useRef(null);
  const [cw, setCw] = useState(0);
  
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width);
      setCw(prev => (Math.abs(next - prev) <= 1 ? prev : next));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 데이터 계산
  const chartData = useMemo(() => {
    const counts = viewMode === "요일별" 
      ? new Map() // 요일별: 일~토 (0~6)
      : new Map(); // 시간별: 0~23시

    rows.forEach((row) => {
      // createdAt 우선, 없으면 firstAskedAt 사용
      const timestamp = row.createdAt || row.firstAskedAt;
      const date = parseTsKST(timestamp);
      
      if (!date || isNaN(date.getTime())) return;

      if (viewMode === "요일별") {
        const dayOfWeek = date.getDay(); // 0=일요일, 6=토요일
        counts.set(dayOfWeek, (counts.get(dayOfWeek) || 0) + 1);
      } else {
        // 시간별
        const hour = date.getHours(); // 0~23
        counts.set(hour, (counts.get(hour) || 0) + 1);
      }
    });

    // 차트 데이터 형식으로 변환
    if (viewMode === "요일별") {
      // 요일별: 일~토 순서대로
      return Array.from({ length: 7 }, (_, i) => ({
        label: DAY_NAMES[i],
        value: counts.get(i) || 0,
        index: i
      }));
    } else {
      // 시간별: 0~23시 순서대로
      return Array.from({ length: 24 }, (_, i) => ({
        label: HOUR_LABELS[i],
        value: counts.get(i) || 0,
        index: i
      }));
    }
  }, [rows, viewMode]);

  const margin = { top: 40, right: 40, bottom: 60, left: 90 };
  const innerW = Math.max(560, cw || 980);
  const W = innerW - margin.left - margin.right;
  const H = 350;

  const maxValue = Math.max(...chartData.map(d => d.value), 1);
  const dataLength = chartData.length;
  // 총합 계산 (퍼센트 표시용)
  const totalCount = chartData.reduce((sum, d) => sum + d.value, 0);

  // 스케일 함수
  // xScale: 각 점의 x 위치를 계산 (y축과 겹치지 않도록 충분한 패딩 추가)
  const xScale = (index) => {
    if (dataLength <= 1) return margin.left + W / 2;
    // y축과 첫 점 사이, 마지막 점과 오른쪽 사이에 충분한 패딩 확보
    const leftPadding = 30; // y축 라벨 공간 확보
    const rightPadding = 10;
    const chartWidth = W - leftPadding - rightPadding;
    return margin.left + leftPadding + (index / (dataLength - 1)) * chartWidth;
  };
  const yScale = (value) => margin.top + H - (value / maxValue) * H;

  return (
    <div
      ref={containerRef}
      style={{
        backgroundColor: "white",
        borderRadius: 12,
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        padding: 16,
        width: "100%",
        boxSizing: "border-box",
        overflow: "visible",
      }}
    >
      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between", 
        marginBottom: "16px" 
      }}>
        <h3 style={{ margin: 0, color: "#333", fontWeight: 600 }}>
          CS 요일별/시간별 분포
        </h3>
        <div style={{
          display: "inline-flex",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          overflow: "hidden"
        }}>
          {["요일별", "시간별"].map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                border: "none",
                background: viewMode === mode ? "#111827" : "#fff",
                color: viewMode === mode ? "#fff" : "#374151",
                cursor: "pointer",
                fontWeight: viewMode === mode ? "600" : "400"
              }}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {chartData.length === 0 || chartData.every(d => d.value === 0) ? (
        <div style={{ 
          textAlign: "center", 
          color: "#666", 
          padding: "40px 0",
          fontSize: 14
        }}>
          데이터가 없습니다.
        </div>
      ) : (
        <svg width="100%" height={H + margin.top + margin.bottom}>
          {/* 배경 그리드 */}
          <defs>
            <pattern id="grid-dow" width="50" height="50" patternUnits="userSpaceOnUse">
              <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#f0f0f0" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height={H + margin.top + margin.bottom} fill="url(#grid-dow)" />

          {/* Y축 그리드 및 라벨 */}
          {(() => {
            const step = Math.max(1, Math.ceil(maxValue / 5));
            const ticks = [];
            for (let t = 0; t <= maxValue; t += step) {
              ticks.push(t);
            }
            if (ticks[ticks.length - 1] !== maxValue) {
              ticks.push(maxValue);
            }
            return ticks.map((t, i) => {
              const y = yScale(t);
              return (
                <g key={`y-${i}`}>
                  <line 
                    x1={margin.left} 
                    x2={margin.left + W} 
                    y1={y} 
                    y2={y} 
                    stroke="#eef2f7" 
                    strokeWidth="1"
                  />
                  <text
                    x={margin.left - 12}
                    y={y}
                    textAnchor="end"
                    alignmentBaseline="middle"
                    fontSize="12"
                    fill="#6b7280"
                  >
                    {Math.round(t)}
                  </text>
                </g>
              );
            });
          })()}

          {/* Y축 라벨 */}
          <text
            transform={`translate(${margin.left - 55}, ${margin.top + H / 2}) rotate(-90)`}
            fontSize="12"
            fill="#94a3b8"
            textAnchor="middle"
          >
            건수
          </text>

          {/* X축 그리드 및 라벨 */}
          {chartData.map((item, idx) => {
            const x = xScale(idx);
            return (
              <g key={`x-${idx}`}>
                <line
                  x1={x}
                  y1={margin.top}
                  x2={x}
                  y2={margin.top + H}
                  stroke="#eef2f7"
                  strokeWidth="1"
                />
                <line
                  x1={x}
                  y1={margin.top + H}
                  x2={x}
                  y2={margin.top + H + 6}
                  stroke="#d1d5db"
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={margin.top + H + 20}
                  fontSize="11"
                  textAnchor="middle"
                  fill="#6b7280"
                >
                  {item.label}
                </text>
              </g>
            );
          })}

          {/* X축 라인 (y축 라벨과 겹치지 않도록 시작 위치 조정) */}
          <line
            x1={margin.left}
            y1={margin.top + H}
            x2={margin.left + W}
            y2={margin.top + H}
            stroke="#d1d5db"
            strokeWidth="2"
          />
          
          {/* Y축 라인 */}
          <line
            x1={margin.left}
            y1={margin.top}
            x2={margin.left}
            y2={margin.top + H}
            stroke="#d1d5db"
            strokeWidth="2"
          />

          {/* 면적 차트 (라인 + 면적) */}
          {(() => {
            // 점 좌표 계산
            const points = chartData.map((item, idx) => {
              const x = xScale(idx);
              const y = yScale(item.value);
              return { x, y, ...item };
            });

            // 라인 경로 생성
            const linePath = points.reduce((path, point, idx) => {
              if (idx === 0) return `M ${point.x} ${point.y}`;
              return `${path} L ${point.x} ${point.y}`;
            }, "");

            // 면적 경로 생성 (바닥까지)
            const areaPath = `${linePath} L ${points[points.length - 1].x} ${margin.top + H} L ${points[0].x} ${margin.top + H} Z`;

            return (
              <g>
                {/* 면적 채우기 */}
                <path
                  d={areaPath}
                  fill="#2563eb22"
                  stroke="none"
                />
                
                {/* 라인 */}
                <path
                  d={linePath}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="2.5"
                />

                {/* 점들 및 툴팁 */}
                {points.map((point, idx) => {
                  const percent = totalCount > 0 ? ((point.value / totalCount) * 100).toFixed(1) : 0;
                  return (
                    <g key={`point-${idx}`}>
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r="4"
                        fill="#2563eb"
                        stroke="white"
                        strokeWidth="2"
                        style={{ cursor: "pointer" }}
                        onMouseEnter={(e) => {
                          const tooltip = document.createElement('div');
                          tooltip.style.cssText = `
                            position: fixed;
                            background: rgba(0,0,0,0.8);
                            color: white;
                            padding: 8px 12px;
                            border-radius: 4px;
                            font-size: 12px;
                            pointer-events: none;
                            z-index: 1000;
                            left: ${e.clientX + 10}px;
                            top: ${e.clientY - 10}px;
                            white-space: nowrap;
                          `;
                          tooltip.textContent = `${point.label}: ${point.value.toLocaleString()}건 (${percent}%)`;
                          document.body.appendChild(tooltip);
                          
                          e.target.onmouseleave = () => {
                            if (document.body.contains(tooltip)) {
                              document.body.removeChild(tooltip);
                            }
                          };
                        }}
                      />
                      
                      {/* 점 위에 퍼센트 표시 (값이 0이 아닐 때만) */}
                      {point.value > 0 && (
                        <text
                          x={point.x}
                          y={point.y - 10}
                          fontSize="11"
                          textAnchor="middle"
                          fill="#374151"
                          fontWeight="500"
                        >
                          {percent}%
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })()}
        </svg>
      )}
    </div>
  );
}

