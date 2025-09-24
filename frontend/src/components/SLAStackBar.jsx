// components/SLAStackBar.jsx
import React, { useMemo, useState } from "react";

// HH:MM:SS | MM:SS | number(분/초) → 분
const toMinutes = (v) => {
  if (v == null || v === "" || v === "null" || v === "undefined") return null;
  if (typeof v === "number") return v > 1000 ? v / 60 : v; // 초로 들어오면 분으로
  const s = String(v).trim();
  if (!s) return null;
  if (s.includes(":")) {
    const parts = s.split(":").map(x => parseFloat(x) || 0);
    if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
    if (parts.length === 2) return parts[0] + parts[1] / 60;
    if (parts.length === 1) return parts[0];
  }
  const n = parseFloat(s);
  if (!isFinite(n)) return null;
  return n > 1000 ? n / 60 : n;
};

// row → 처리유형 라벨(자체해결 / 이관/개발팀 ... / 처리불가/운영팀)
// 미분류/기타 제외
const normalizeBucket = (row) => {
  const head = String(row?.처리유형 || row?.처리유형_1차 || "").trim();
  const tail = String(row?.처리유형_2차 || "").trim();
  if (!head || head === "기타") return null; // 미분류 제외
  if (head === "자체해결") return "자체해결";
  if (head === "이관") {
    if (!tail || tail === "기타") return null;
    const ok = new Set(["개발팀","사업팀","운영팀","고객사"]);
    return ok.has(tail) ? `이관/${tail}` : null;
  }
  if (head === "처리불가") {
    if (!tail || tail === "기타") return null;
    const ok = new Set(["개발팀","사업팀","운영팀"]);
    return ok.has(tail) ? `처리불가/${tail}` : null;
  }
  return null;
};

const ORDER = [
  "자체해결",
  "이관/개발팀", "이관/사업팀", "이관/운영팀", "이관/고객사",
  "처리불가/개발팀", "처리불가/사업팀", "처리불가/운영팀",
];

const COLORS = {
  "자체해결":        "#2563eb",
  "이관/개발팀":      "#16a34a",
  "이관/사업팀":      "#f59e0b",
  "이관/운영팀":      "#0891b2",
  "이관/고객사":      "#7c3aed",
  "처리불가/개발팀":  "#dc2626",
  "처리불가/사업팀":  "#f97316",
  "처리불가/운영팀":  "#1f2937",
};

export default function SLAStackBar({
  rows = [],
  // 예시처럼 0~240 / 240~480 / 480~720 / 720~∞ (4시간 단위)
  // 원하면 2시간 단위로 바꾸려면: bins=[0,120,240,360,480,600,720,Infinity]
  bins = [0,240,480,720,Infinity],
  width = 420,
  height = 300,
}) {
  const margin = { top: 12, right: 16, bottom: 36, left: 40 };
  const W = Math.max(360, width) - margin.left - margin.right;
  const H = Math.max(220, height) - margin.top - margin.bottom;

  // 툴팁 상태
  const [tip, setTip] = useState({ show: false, x: 0, y: 0, type: "", count: 0 });

  const { stacked, labels } = useMemo(() => {
    // bin 라벨
    const labels = [];
    for (let i = 0; i < bins.length - 1; i++) {
      const a = bins[i], b = bins[i+1];
      labels.push(b === Infinity ? `${a/60}h+` : `${a}~${b}`);
    }

    // bin x type 카운트
    const initObj = () => ORDER.reduce((o,k)=> (o[k]=0,o), {});
    const counters = Array(bins.length - 1).fill(0).map(() => initObj());

    rows.forEach(r => {
      const label = normalizeBucket(r);
      if (!label) return;
      const m = toMinutes(r?.operationResolutionTime);
      if (!(m > 0)) return;
      let idx = -1;
      for (let i = 0; i < bins.length - 1; i++) {
        if (m >= bins[i] && m < bins[i+1]) { idx = i; break; }
      }
      if (idx < 0) idx = bins.length - 2; // 마지막 구간으로
      counters[idx][label] = (counters[idx][label] || 0) + 1;
    });

    // 퍼센트 스택으로 변환
    const stacked = counters.map((obj) => {
      const total = Object.values(obj).reduce((s, v) => s + v, 0) || 1;
      let acc = 0;
      return ORDER.map((k) => {
        const v = obj[k] || 0;
        const p = (v / total) * 100;
        const start = acc;
        acc += p;
        return { key: k, value: v, p, y0: start, y1: acc };
      });
    });

    return { stacked, labels };
  }, [rows, bins]);

  const x = (i) => margin.left + (i + 0.5) * (W / stacked.length);
  const bandW = Math.min(64, W / stacked.length * 0.7);
  const y = (p) => margin.top + H - (p / 100) * H;

  return (
    <div style={{
      background:"#fff", borderRadius:12,
      boxShadow:"0 2px 8px rgba(0,0,0,0.08)", padding:16
    }}>
      {/* 툴팁 */}
      <div
        style={{
          position: "fixed",
          left: tip.x + 12,
          top: tip.y + 12,
          display: tip.show ? "block" : "none",
          background: "rgba(17,24,39,.96)",
          color: "#fff",
          padding: "6px 10px",
          borderRadius: 8,
          fontSize: 12,
          pointerEvents: "none",
          zIndex: 1000
        }}
      >
        {tip.type} / {tip.count.toLocaleString()}건
      </div>

      <h3 style={{margin:"0 0 8px 4px", color:"#333", fontWeight:600}}>SLA 스택(시간 구간별 · 유형 비율)</h3>

      {/* 범례 */}
      <div style={{display:"flex", flexWrap:"wrap", gap:10, margin:"0 4px 8px"}}>
        {ORDER.map(k => (
          <div key={k} style={{display:"flex", alignItems:"center", gap:6, fontSize:12, color:"#374151"}}>
            <span style={{width:12, height:12, borderRadius:2, background:COLORS[k]}} />
            {k}
          </div>
        ))}
      </div>

      <svg width={W + margin.left + margin.right} height={H + margin.top + margin.bottom}>
        {/* y grid & ticks (0,25,50,75,100%) */}
        {[0,25,50,75,100].map(t => (
          <g key={t}>
            <line x1={margin.left} x2={margin.left + W} y1={y(t)} y2={y(t)} stroke="#eef2f7" />
            <text x={margin.left - 8} y={y(t)} textAnchor="end" alignmentBaseline="middle" fontSize="11" fill="#6b7280">{t}</text>
          </g>
        ))}
        <text x={margin.left - 24} y={margin.top - 6} fontSize="11" fill="#9ca3af">%</text>

        {/* bars */}
        {stacked.map((st, i) => (
          <g key={i} transform={`translate(${x(i)},0)`}>
            {st.map(seg => (
              seg.p > 0 ? (
                <rect
                  key={seg.key}
                  x={-bandW/2}
                  width={bandW}
                  y={y(seg.y1)}
                  height={y(seg.y0) - y(seg.y1)}
                  fill={COLORS[seg.key]}
                  opacity={0.9}
                  rx="2"
                  onMouseEnter={(e) => setTip({ show: true, x: e.clientX, y: e.clientY, type: seg.key, count: seg.value })}
                  onMouseMove={(e) => setTip(t => ({ ...t, x: e.clientX, y: e.clientY }))}
                  onMouseLeave={() => setTip(t => ({ ...t, show: false }))}
                />
              ) : null
            ))}
            {/* x tick */}
            <line x1="0" x2="0" y1={margin.top + H} y2={margin.top + H + 4} stroke="#d1d5db" />
            <text x="0" y={margin.top + H + 16} textAnchor="middle" fontSize="11" fill="#6b7280">
              {labels[i]}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
