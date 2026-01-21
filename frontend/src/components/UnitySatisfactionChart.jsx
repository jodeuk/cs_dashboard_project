import React, { useMemo, useRef, useState, useEffect } from "react";
import { unity1Satisfaction } from "../constants/unity1_satisfaction";

export default function UnitySatisfactionChart({
  width = 900,
  height = 360,
  margin = { top: 24, right: 24, bottom: 52, left: 48 },
}) {
  // ✅ 데이터는 constants에서 가져옴
  const { chapters, content_or_project_avg: contentOrProject, coach_avg: coach, weekTypes } = unity1Satisfaction;

  const W = width - margin.left - margin.right;
  const H = height - margin.top - margin.bottom;

  const x = (ch) => ((ch - 1) / (chapters.length - 1)) * W;

  const yDomain = useMemo(() => {
    const all = [...contentOrProject, ...coach];
    const min = Math.min(...all);
    const max = Math.max(...all);
    return [Math.max(3.8, min - 0.1), Math.min(5.0, max + 0.1)];
  }, [contentOrProject, coach]);

  const y = (v) => {
    const [min, max] = yDomain;
    return H - ((v - min) / (max - min)) * H;
  };

  const toPath = (arr) =>
    arr.map((v, i) => `${i === 0 ? "M" : "L"} ${x(chapters[i])},${y(v)}`).join(" ");

  const pathContent = toPath(contentOrProject);
  const pathCoach = toPath(coach);

  const yTicks = useMemo(() => {
    const [a, b] = yDomain;
    const ticks = [];
    for (let v = a; v <= b + 1e-9; v += 0.2) ticks.push(Number(v.toFixed(2)));
    return ticks;
  }, [yDomain]);

  // 이론주간/프로젝트주간 구간 계산
  const weekRegions = useMemo(() => {
    const regions = [];
    let start = 0;
    let currentType = weekTypes[0];
    
    for (let i = 1; i <= weekTypes.length; i++) {
      if (i === weekTypes.length || weekTypes[i] !== currentType) {
        regions.push({
          type: currentType,
          startCh: chapters[start],
          endCh: chapters[i - 1]
        });
        if (i < weekTypes.length) {
          start = i;
          currentType = weekTypes[i];
        }
      }
    }
    return regions;
  }, [weekTypes, chapters]);

  const [hover, setHover] = useState(null);
  const svgRef = useRef();

  const onEnter = (e, ch, key, val) => {
    const rect = svgRef.current?.getBoundingClientRect?.() || { left: 0, top: 0 };
    setHover({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      ch,
      key,
      val,
    });
  };
  const onLeave = () => setHover(null);

  useEffect(() => {
    const handleScroll = () => setHover((h) => (h ? { ...h } : h));
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{
          display: "block",
          background: "#fff",
          borderRadius: 8,
          boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
        }}
      >
        {/* 범례 - 우측 상단 */}
        <g transform={`translate(${width - margin.right - 320}, 12)`}>
          <g>
            <line x1={0} y1={0} x2={24} y2={0} stroke="#4dabf7" strokeWidth="2.5" />
            <circle cx={12} cy={0} r={4} fill="#4dabf7" stroke="#fff" strokeWidth="1.5" />
            <text x={30} y={0} fontSize="12" fill="#495057" dominantBaseline="middle">컨텐츠/프로젝트 만족도</text>
          </g>
          <g transform="translate(180, 0)">
            <line x1={0} y1={0} x2={24} y2={0} stroke="#e64980" strokeWidth="2.5" />
            <circle cx={12} cy={0} r={4} fill="#e64980" stroke="#fff" strokeWidth="1.5" />
            <text x={30} y={0} fontSize="12" fill="#495057" dominantBaseline="middle">코치 만족도</text>
          </g>
        </g>
        
        <g transform={`translate(${margin.left},${margin.top})`}>
          {/* 이론주간/프로젝트주간 배경 */}
          {weekRegions.map((region, idx) => {
            const startX = x(region.startCh);
            const endX = x(region.endCh);
            const regionWidth = endX - startX;
            
            return (
              <g key={idx}>
                <rect
                  x={startX}
                  y={0}
                  width={regionWidth}
                  height={H}
                  fill={region.type === "이론" ? "rgba(74, 144, 226, 0.05)" : "rgba(250, 82, 82, 0.05)"}
                />
                <text
                  x={startX + regionWidth / 2}
                  y={H + 36}
                  textAnchor="middle"
                  fontSize="10"
                  fill={region.type === "이론" ? "#4a90e2" : "#fa5252"}
                  fontWeight="600"
                >
                  {region.type}주간
                </text>
              </g>
            );
          })}

          {/* 그리드 / y축 */}
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={0} y1={y(t)} x2={W} y2={y(t)} stroke="#e9ecef" strokeDasharray="4 4" />
              <text
                x={-8}
                y={y(t)}
                fontSize="11"
                textAnchor="end"
                fill="#6c757d"
                dominantBaseline="middle"
              >
                {t.toFixed(2)}
              </text>
            </g>
          ))}

          {/* x축 */}
          {chapters.map((ch) => (
            <text
              key={ch}
              x={x(ch)}
              y={H + 22}
              textAnchor="middle"
              fontSize="11"
              fill="#6c757d"
            >
              {ch}
            </text>
          ))}
          <line x1={0} y1={H} x2={W} y2={H} stroke="#adb5bd" />
          <line x1={0} y1={0} x2={0} y2={H} stroke="#adb5bd" />

          {/* 라인 */}
          <path d={pathContent} fill="none" stroke="#4dabf7" strokeWidth="2.5" />
          <path d={pathCoach} fill="none" stroke="#e64980" strokeWidth="2.5" />

          {/* 점 */}
          {chapters.map((ch, i) => (
            <circle
              key={`c-${ch}`}
              cx={x(ch)}
              cy={y(contentOrProject[i])}
              r={4}
              fill="#4dabf7"
              stroke="#fff"
              strokeWidth="1.5"
              onMouseEnter={(e) => onEnter(e, ch, "콘텐츠/프로젝트", contentOrProject[i])}
              onMouseLeave={onLeave}
            />
          ))}
          {chapters.map((ch, i) => (
            <circle
              key={`co-${ch}`}
              cx={x(ch)}
              cy={y(coach[i])}
              r={4}
              fill="#e64980"
              stroke="#fff"
              strokeWidth="1.5"
              onMouseEnter={(e) => onEnter(e, ch, "코치", coach[i])}
              onMouseLeave={onLeave}
            />
          ))}

          {/* 툴팁 */}
          {hover && (
            <foreignObject x={hover.x - 70} y={hover.y - 48} width="140" height="40" style={{ pointerEvents: "none" }}>
              <div
                style={{
                  background: "rgba(33,37,41,0.92)",
                  color: "#fff",
                  borderRadius: 6,
                  padding: "6px 8px",
                  fontSize: 12,
                  lineHeight: 1.3,
                  boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
                  pointerEvents: "none",
                }}
              >
                <div>챕터 {hover.ch}</div>
                <div>{hover.key}: {hover.val.toFixed(2)}</div>
              </div>
            </foreignObject>
          )}
        </g>

        <text
          x={margin.left}
          y={20}
          fontSize="14"
          fontWeight="600"
          fill="#212529"
        >
          [Unity 1기] 강의만족도 (챕터별)
        </text>
      </svg>
    </div>
  );
}
