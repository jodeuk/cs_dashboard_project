import React, { useMemo, useEffect, useRef, useState } from "react";

/** HH:MM:SS -> 분 */
const hmsToMinutes = (s) => {
  if (!s || typeof s !== "string") return null;
  const [h = 0, m = 0, sec = 0] = s.split(":").map((x) => parseInt(x, 10));
  if ([h, m, sec].some(Number.isNaN)) return null;
  return h * 60 + m + (sec || 0) / 60;
};

const quantile = (arr, p) => {
  if (!arr || arr.length === 0) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const i = (a.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? a[lo] : a[lo] * (hi - i) + a[hi] * (i - lo);
};

// (NEW) 태그에서 직접 파싱 → 없으면 1/2차 컬럼 폴백
const pickHandlingTag = (row) => {
  const tags = row?.tags || [];
  for (const t of tags) {
    if (typeof t !== "string") continue;
    const norm = t.replace(/\s+/g, "");
    if (norm.startsWith("처리유형/")) return norm; // "처리유형/이관/개발팀" 같이 반환
  }
  return null;
};

const normalizeBucket = (row) => {
  // 1) 태그 우선
  const tag = pickHandlingTag(row);
  if (tag) {
    const [, top = "", tail = ""] = tag.split("/");
    if (!top || top === "기타") return null;       // 미분류/기타 제외
    if (top === "자체해결") return "자체해결";
    if (top === "이관") {
      const ok = new Set(["개발팀","사업팀","운영팀","고객사"]);
      return ok.has(tail) ? `이관/${tail}` : null;
    }
    if (top === "처리불가") {
      const ok = new Set(["개발팀","사업팀","운영팀"]);
      return ok.has(tail) ? `처리불가/${tail}` : null;
    }
    return null;
  }
  // 2) 폴백: 1/2차 컬럼
  const head = String(row?.처리유형 || row?.처리유형_1차 || "").trim();
  const tail = String(row?.처리유형_2차 || "").trim();
  if (!head || head === "기타") return null;
  if (head === "자체해결") return "자체해결";
  if (head === "이관") {
    const ok = new Set(["개발팀","사업팀","운영팀","고객사"]);
    return ok.has(tail) ? `이관/${tail}` : null;
  }
  if (head === "처리불가") {
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

const COLORS = [
  "#2563eb", "#16a34a", "#f59e0b", "#0891b2", "#7c3aed",
  "#dc2626", "#f97316", "#1f2937",
];

/** 간단 스무딩(이동평균) */
const smooth = (arr, win = 2) => {
  if (win <= 1) return arr.slice();
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    let s = 0, c = 0;
    for (let k = i - win; k <= i + win; k++) {
      if (k >= 0 && k < arr.length) { s += arr[k]; c++; }
    }
    out.push(s / c);
  }
  return out;
};

export default function HandlingLeadtimeDensity({
  rows = [],
  width = 980,
  height = 420,
  bins = 40,          // 히스토그램 bin 개수 (겹침 곡선을 그릴 베이스)
  smoothWindow = 2,   // 스무딩 윈도우
}) {
  const margin = { top: 64, right: 64, bottom: 56, left: 72 }; // 범례 자리 확보
  const containerRef = useRef(null);
  const [cw, setCw] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width);
      setCw(prev => (Math.abs(next - prev) <= 1 ? prev : next)); // 미세변화 무시
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const innerW = Math.max(560, cw || width);
  const W = innerW - margin.left - margin.right;
  const H = Math.max(260, height) - margin.top - margin.bottom;

  const { series, xMaxP95, yMax } = useMemo(() => {
    // 1) 분 단위 변환 + 버킷 라벨 정규화
    const byBucket = new Map();
    rows.forEach((r) => {
      const b = normalizeBucket(r);
      if (!b) return;
      const mins = hmsToMinutes(r?.operationResolutionTime);
      if (!(mins > 0)) return;
      if (!byBucket.has(b)) byBucket.set(b, []);
      byBucket.get(b).push(mins);
    });

    // 보여줄 순서대로 정렬(없는건 뒤로)
    const buckets = Array.from(byBucket.keys()).sort((a, b) => {
      const ai = ORDER.indexOf(a), bi = ORDER.indexOf(b);
      return (ai - bi) || a.localeCompare(b);
    });

    const all = buckets.flatMap((b) => byBucket.get(b));
    const xMaxP95 = Math.max(30, Math.round(quantile(all, 0.95))); // 긴 꼬리는 P95에서 잘라 표시

    // 2) 히스토그램 → 스무딩 → 라인용 포인트
    const binW = xMaxP95 / bins;
    const makeCounts = (arr) => {
      const counts = Array(bins + 1).fill(0);
      for (const v of arr) {
        const x = Math.min(xMaxP95, Math.max(0, v));
        const idx = Math.min(bins, Math.floor(x / binW));
        counts[idx] += 1;
      }
      return smooth(counts, smoothWindow);
    };
    const series = buckets.map((b, i) => {
      const counts = makeCounts(byBucket.get(b));
      const color = COLORS[i % COLORS.length];
      return { label: b, counts, color, n: byBucket.get(b).length };
    });

    // y축 최대값을 올림 정수로 고정(겹침/부동소수점 문제 방지)
    const yMaxFloat = Math.max(
      1,
      ...series.map((s) => s.counts.reduce((m, v) => Math.max(m, v), 0))
    );
    const yMax = Math.ceil(yMaxFloat);

    return { series, xMaxP95, yMax };
  }, [rows, bins, smoothWindow]);

  // ── 동적 y축 절단 판정 ──────────────────────────────────────────
  // "초반(0~100분 근처)에 자체해결만 과도하게 높은가?"를 보고 결정
  const { useBreak, yBreak } = useMemo(() => {
    if (!series || series.length === 0) return { useBreak: false, yBreak: {} };
    const self = series.find((s) => s.label === "자체해결");
    if (!self) return { useBreak: false, yBreak: {} };

    // 초반 구간: 0~100분 (단, 전체 길이가 짧으면 비율로 보정)
    const earlyMinutes = Math.min(100, Math.round(xMaxP95 * 0.25)); // 최대 25%
    const earlyBins = Math.max(1, Math.floor((earlyMinutes / xMaxP95) * bins));

    const selfEarly = self.counts.slice(0, earlyBins);
    const othersEarly = series
      .filter((s) => s.label !== "자체해결")
      .map((s) => s.counts.slice(0, earlyBins));

    const peakSelfEarly   = Math.max(0, ...selfEarly);
    const peakOthersEarly = Math.max(0, ...(othersEarly.flat()));

    // 자체해결이 초반에서 다른 시리즈보다 충분히 크면 절단 활성화
    const enabled =
      peakSelfEarly >= 12 && // 최소 수준(노이즈 방지)
      peakSelfEarly >= peakOthersEarly * 2 && // 다른 시리즈 대비 우세
      earlyBins >= 3;

    if (!enabled) return { useBreak: false, yBreak: {} };

    // y0: 다른 시리즈가 주로 움직이는 상한선 바로 위 (여기까지 크게 보임)
    const y0 = Math.min(
      Math.max(6, Math.ceil(peakOthersEarly + 1)), // 최소 6, others peak + 1
      Math.max(10, Math.ceil(peakSelfEarly * 0.35)) // 너무 낮지 않게 가드
    );
    // y1: 자체해결 과도 피크까지의 압축 상단 (여기까지 압축해서 보임)
    const y1 = Math.min(
      yMax - 1,
      Math.max(y0 + 4, Math.ceil(peakSelfEarly * 0.6))
    );
    if (y1 <= y0 + 2) return { useBreak: false, yBreak: {} }; // 폭이 너무 좁으면 비활성화

    return { useBreak: true, yBreak: { y0, y1, gap: 12 } };
  }, [series, xMaxP95, bins, yMax]);

  // 스케일 함수
  const x = (v) => margin.left + (v / xMaxP95) * W;

  // ── 분할 선형 스케일: [0~y0](크게) · [y0~y1](압축) · [y1~yMax](보통)
  const y = (v) => {
    const bottom = margin.top + H;
    if (!useBreak) return bottom - (v / yMax) * H;

    const { y0, y1 } = yBreak;
    // 화면 높이 배분(필요시 비율만 조정하세요)
    const H0 = H * 0.55; // 0~y0 : 크게
    const H1 = H * 0.15; // y0~y1 : 압축
    const H2 = H - (H0 + H1); // y1~yMax : 보통

    if (v <= y0) return bottom - (v / y0) * H0;
    if (v <= y1) return bottom - H0 - ((v - y0) / (y1 - y0)) * H1;
    return bottom - H0 - H1 - ((v - y1) / (yMax - y1)) * H2;
  };

  // 축 눈금
  let xticks = (() => {
    const step = xMaxP95 <= 120 ? 20 : xMaxP95 <= 360 ? 60 : 120; // 20/60/120분
    const arr = [];
    for (let t = 0; t <= xMaxP95; t += step) arr.push(t);
    if (arr[arr.length - 1] !== xMaxP95) arr.push(xMaxP95);
    return arr;
  })();
  // ⬇️ 겹침 방지: 두 라벨 간 간격이 28px 미만이면 앞의 것을 제거
  const xtClean = [];
  for (const t of xticks) {
    if (xtClean.length === 0) { xtClean.push(t); continue; }
    const prev = xtClean[xtClean.length - 1];
    if (x(t) - x(prev) < 28) {
      // 마지막 값을 우선(최댓값 보존)
      xtClean[xtClean.length - 1] = t;
    } else {
      xtClean.push(t);
    }
  }
  xticks = xtClean;
  const yticks = (() => {
    const step = Math.max(1, Math.ceil(yMax / 5));
    const arr = [];
    for (let t = 0; t <= yMax; t += step) arr.push(t);
    if (arr[arr.length - 1] !== yMax) arr.push(yMax);
    return arr;
  })();

  // path 생성
  const makePath = (counts) => {
    const binW = xMaxP95 / bins;
    const pts = counts.map((c, i) => [x(i * binW), y(c)]);
    return pts.reduce((d, [px, py], i) => (i === 0 ? `M${px},${py}` : `${d} L${px},${py}`), "");
  };

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
      <h3 style={{ margin: "0 0 8px 4px", color: "#333", fontWeight: 600 }}>
        처리시간 분포
      </h3>

      {/* 범례 (우상단, 줄바꿈 가능) */}
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        justifyContent: "flex-end",
        margin: "4px 4px 8px"
      }}>
        {series.map((s, i) => {
          // 이관과 처리불가 레이블을 두 줄로 분리
          const formatLabel = (label) => {
            if (label.startsWith("이관/")) {
              const team = label.split("/")[1];
              return (
                <div style={{ lineHeight: 1.2 }}>
                  <div>이관</div>
                  <div>({team})</div>
                </div>
              );
            }
            if (label.startsWith("처리불가/")) {
              const team = label.split("/")[1];
              return (
                <div style={{ lineHeight: 1.2 }}>
                  <div>처리불가</div>
                  <div>({team})</div>
                </div>
              );
            }
            return `${label} (${s.n})`;
          };

          return (
            <div key={`lg-${i}`} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#374151" }}>
              <span style={{ width: 18, height: 8, background: s.color, borderRadius: 2 }} />
              <span>{formatLabel(s.label)}</span>
            </div>
          );
        })}
      </div>

      <svg width="100%" height={H + margin.top + margin.bottom}>
        {/* y 그리드/축 */}
        <g>
          {yticks.map((t, i) => (
            <g key={`y-${i}`}>
              <line x1={margin.left} x2={margin.left + W} y1={y(t)} y2={y(t)} stroke="#eef2f7" />
              <text
                x={margin.left - 8}
                y={y(t)}
                textAnchor="end"
                alignmentBaseline="middle"
                fontSize="12"
                fill="#6b7280"
              >
                {Math.round(t)}
              </text>
            </g>
          ))}
          {/* y축 라벨(회전) – 상단 겹침/글리치 방지 */}
          <text
            transform={`translate(${margin.left - 46}, ${margin.top + H / 2}) rotate(-90)`}
            fontSize="12"
            fill="#94a3b8"
            textAnchor="middle"
          >
            건수
          </text>
        </g>


        {/* x 축 */}
        <g>
          <line x1={margin.left} x2={margin.left + W} y1={margin.top + H} y2={margin.top + H} stroke="#d1d5db" />
          {xticks.map((t, i) => {
            const xpos = x(t);
            const nearRight = xpos > (margin.left + W - 10);
            const nearLeft  = xpos < (margin.left + 10);
            const anchor = nearRight ? "end" : nearLeft ? "start" : "middle";
            const dx = nearRight ? -4 : nearLeft ? 4 : 0;
            return (
              <g key={`x-${i}`} transform={`translate(${xpos}, ${margin.top + H})`}>
                <line y2="6" stroke="#d1d5db" />
                <text x={dx} y="18" fontSize="12" textAnchor={anchor} fill="#6b7280">{t}</text>
              </g>
            );
          })}
          <text x={margin.left + W} y={margin.top + H + 34} fontSize="12" fill="#94a3b8" textAnchor="end">
            처리시간(분) · x스케일=P95 기준(긴 꼬리 제외)
          </text>
        </g>

        {/* 시리즈(겹침 라인 + 반투명 면적) */}
        {series.map((s, i) => {
          const path = makePath(s.counts);
          // area(바닥까지) 그리기 위해 동일 path에 바닥선 붙이기
          const binW = xMaxP95 / bins;
          const area =
            `${path} L ${x(xMaxP95)}, ${y(0)} L ${x(0)}, ${y(0)} Z`;

          return (
            <g key={s.label}>
              <path d={area} fill={s.color + "22"} stroke="none" />
              <path d={path} fill="none" stroke={s.color} strokeWidth="2.5" />
            </g>
          );
        })}

        {/* y축 물결(절단 표시) – 실제 절단 경계(y0 근처)에 그리기 */}
        {useBreak && (() => {
          const x0 = margin.left - 10;
          const s  = 6; // 물결 크기
          const yWave = y(yBreak.y0) - 3; // y0 경계 부근
          return (
            <path
              d={`M ${x0},${yWave} l ${s},${s/2} l -${s},${s/2}`}
              stroke="#9ca3af"
              strokeWidth="2"
              fill="none"
              pointerEvents="none"
            />
          );
        })()}


      </svg>
    </div>
  );
}
