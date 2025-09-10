import React, { useState, useEffect, useCallback, useMemo } from "react";
import { fetchUserchats, fetchFilterOptions, checkApiHealth } from "./api";
import FilterPanel from "./components/FilterPanel";
import ChartSection from "./components/ChartSection";
import MultiLineChartSection from "./components/MultiLineChartSection";

import CacheStatusSection from "./components/CacheStatusSection";
import CSatChartSection from "./components/CSatChartSection";
import CSatTypeChartSection from "./components/CSatTypeChartSection";

// === KST 유틸 ===
const KST_OFFSET = "+09:00";

// 안전 JSON 파서
const safeParse = (v) => {
  try {
    if (v == null) return null;
    if (typeof v === "string") {
      try { return JSON.parse(v); } catch {}
      // JSON 유사한 단일따옴표 문자열 대응
      try { return JSON.parse(v.replace(/'/g, '"')); } catch {}
      return null;
    }
    if (typeof v === "object") return v;
    return null;
  } catch { return null; }
};

// 어떤 스키마든 A-3/A-6 코멘트 추출
const extractCsatFromAny = (src, push, meta) => {
  if (src == null) return;
  // 문자열로 들어온 JSON/유사 JSON 처리
  if (typeof src === "string") {
    const obj = safeParse(src) || safeParse(src.replace(/'/g, '"'));
    if (obj) extractCsatFromAny(obj, push, meta);
    return;
  }
  if (typeof src !== "object") return;

  // 1) 배열형 응답
  if (Array.isArray(src)) {
    src.forEach((x) => extractCsatFromAny(x, push, meta));
    return;
  }
  // 2) 일반 키 스캔 (A-3, A3, Q3, 3 등)
  for (const [k, v] of Object.entries(src)) {
    const key = String(k).toUpperCase().replace(/\s+/g, "");
    const isA3 = /(^A-?3$|^Q3$|(^|[^0-9])3$)/.test(key);
    const isA6 = /(^A-?6$|^Q6$|(^|[^0-9])6$)/.test(key);
    // 한글 필드명까지 같이 탐색
    const text = typeof v === "string"
      ? v
      : (v && (v.comment ?? v.text ?? v.의견 ?? v.코멘트 ?? v.답변 ?? v.내용 ?? null));
    const score = v && (v.score ?? v.value ?? null);
    if (isA3 && text?.trim()) push("A-3", text, score, meta);
    if (isA6 && text?.trim()) push("A-6", text, score, meta);
    // 중첩 객체도 탐색
    if (v && typeof v === "object") extractCsatFromAny(v, push, meta);
  }
  // 3) 관용 필드
  const a3t = src.A3_comment ?? src.comment3 ?? src.c3 ?? src["A3 코멘트"] ?? src["A3의견"];
  const a6t = src.A6_comment ?? src.comment6 ?? src.c6 ?? src["A6 코멘트"] ?? src["A6의견"];
  if (a3t?.trim()) push("A-3", a3t, src.score3 ?? null, meta);
  if (a6t?.trim()) push("A-6", a6t, src.score6 ?? null, meta);
};
const toFiniteNumber = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};
const asString = (v, def = "") => (v == null ? def : String(v));

// ── 태그 매핑 유틸 ───────────────────────────────────────────────
const primaryOf = (s) => (typeof s === "string" && s.includes("/")) ? s.split("/")[0].trim() : (s || "");
// 기존에는 1차만 리턴했는데, 2차까지 같이 담아줍니다.
const pickTagsFromRow = (r) => ({
  고객유형: r.고객유형 || r.고객유형_1차 || "",
  고객유형_2차: r.고객유형_2차 || "",
  문의유형: primaryOf(r.문의유형 || r.문의유형_1차 || ""),
  문의유형_2차: r.문의유형_2차 || "",
  서비스유형: r.서비스유형 || r.서비스유형_1차 || "",
  서비스유형_2차: r.서비스유형_2차 || "",
});
const ymd = (d) => {
  const dt = parseTsKST(d);
  return dt ? dt.toISOString().slice(0, 10) : null;
};

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
function buildRangeKST(startStr, endStr) {
  const startMs = new Date(`${startStr}T00:00:00.000${KST_OFFSET}`).getTime();
  const endMs   = new Date(`${endStr}T23:59:59.999${KST_OFFSET}`).getTime();
  return { startMs, endMs };
}

// 차트 표준 데이터키로 정규화: {label, value}
function normalizeChartRows(
  rows,
  {
    labelKeyCandidates = ["label", "x축", "dateLabel"],
    valueKeyCandidates = ["value", "문의량", "count"],
  } = {}
) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => {
      const labelKey = labelKeyCandidates.find((k) => r?.[k] != null);
      const valueKey = valueKeyCandidates.find((k) => r?.[k] != null);
      const label = asString(labelKey ? r[labelKey] : "", "");
      const value = toFiniteNumber(valueKey ? r[valueKey] : 0);
      return { label, value };
    })
    .filter((d) => d.label !== "" && Number.isFinite(d.value));
}

// 날짜 포맷(로컬 기준)
const formatDate = (date) => date.toISOString().split("T")[0];

function App() {
  // 날짜 초기값: 한 달 전 ~ 오늘
  const today = new Date();
  const oneMonthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
  const todayStr = formatDate(today);
  const oneMonthAgoStr = formatDate(oneMonthAgo);

  // 상태
  const [userchats, setUserchats] = useState([]);
  const [filterOptions, setFilterOptions] = useState({});
  const [filterVals, setFilterVals] = useState({
    고객유형: [],
    고객유형_2차: [],
    문의유형: [],
    문의유형_2차: [],
    서비스유형: [],
    서비스유형_2차: [],
  });
  const [dateGroup, setDateGroup] = useState("월간");
  const [start, setStart] = useState(oneMonthAgoStr);
  const [end, setEnd] = useState(todayStr);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [apiConnected, setApiConnected] = useState(null);
  const [csatData, setCsatData] = useState(null);
  const [activeTab, setActiveTab] = useState("CS");
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, title: "", count: 0, percent: 0 });
  const [hoverIndex, setHoverIndex] = useState(null);

  // CSAT 코멘트 분리 (csat-analysis 응답에서)
  const csatCommentsRaw = useMemo(() => {
    if (!csatData || csatData.status !== "success") return null;

    // 백엔드가 comments(or 코멘트) 블록으로 줄 수도 있고,
    // comment_3/comment_6 바로 줄 수도 있으니 모두 대응
    const c = csatData.comments || csatData.코멘트 || null;
    if (c) return c;

    if (csatData.comment_3 || csatData.comment_6) {
      return {
        comment_3: {
          total: csatData.comment_3?.total ?? csatData.comment_3?.length ?? 0,
          data:  csatData.comment_3?.data  ?? csatData.comment_3 ?? [],
        },
        comment_6: {
          total: csatData.comment_6?.total ?? csatData.comment_6?.length ?? 0,
          data:  csatData.comment_6?.data  ?? csatData.comment_6 ?? [],
        },
      };
    }
    return null;
  }, [csatData]);

  // API 연결 확인
  useEffect(() => {
    checkApiHealth()
      .then((res) => setApiConnected(res))   // res가 boolean이든 {ok:true}든 내부 구현에 맞춰 그대로 전달
      .catch(() => setApiConnected(false));
  }, []);

  // 캐시데이터 로드
  const loadCacheData = useCallback(
    async (refreshMode = "cache") => {
      setLoading(true);
      try {
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1;
        const currentDay = today.getDate();

        const startDate = "2025-04-01";
        const endDate = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(currentDay).padStart(2, "0")}`;

        console.log("📅 데이터 로드 범위:", startDate, "~", endDate);

        if (refreshMode === "refresh") {
          console.log("🔄 전체 갱신 모드 - 기존 캐시 완전 삭제 후 새로 수집");
        } else if (refreshMode === "update") {
          console.log("📥 최신화 모드 - 기존 캐시 유지 + 누락된 기간만 API 호출");
        } else {
          console.log("💾 캐시 모드 - 기존 캐시만 사용");
        }

        // 초기 로딩: 최근 1개월만
        const rows = await fetchUserchats(oneMonthAgoStr, todayStr, refreshMode);
        setUserchats(Array.isArray(rows) ? rows : []);

        // 필터 옵션은 전체 범위
        const opts = await fetchFilterOptions(startDate, endDate, refreshMode);
        setFilterOptions(opts || {});

        if (refreshMode === "refresh") {
          setSuccess("✅ 데이터가 완전히 갱신되었습니다.");
          setTimeout(() => setSuccess(null), 3000);
        } else if (refreshMode === "update") {
          console.log("📥 CS 데이터 최신화 완료");
          setSuccess("✅ CS 데이터가 최신화되었습니다.");
          setTimeout(() => setSuccess(null), 3000);

          // CSAT 최신화(비동기)
          (async () => {
            try {
              const oneWeekAgo = new Date();
              oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
              const csatStart = oneWeekAgo.toISOString().split("T")[0];
              const csatEnd = todayStr;

              console.log("📥 CSAT 최신화 시작(비동기):", csatStart, "~", csatEnd);
              const csatRes = await fetch(
                `${process.env.REACT_APP_API_BASE}/api/cache/refresh?start=${csatStart}&end=${csatEnd}&force=true&include_csat=true`
              );
              if (csatRes.ok) {
                const csatResult = await csatRes.json();
                console.log("✅ CSAT 최신화 완료:", csatResult);
                loadCsatAnalysis(); // 최신화 후 재로드
                setSuccess("✅ CSAT 데이터도 최신화되었습니다.");
                setTimeout(() => setSuccess(null), 3000);
              } else {
                console.error("❌ CSAT 최신화 API 응답 오류:", csatRes.status);
              }
            } catch (err) {
              console.error("❌ CSAT 최신화 실패:", err);
            }
          })();
        }
      } catch (err) {
        setError("캐시 데이터 로드 실패: " + (err?.message || err));
      } finally {
        setLoading(false);
      }
    },
    [oneMonthAgoStr, todayStr]
  );

  // 새로고침 감지 → 자동 로드
  useEffect(() => {
    console.log("🔄 새로고침 감지됨 - 데이터 자동 갱신");
    if (apiConnected) loadCacheData();
  }, [apiConnected, loadCacheData]);

  // CSAT 분석 로드
  const loadCsatAnalysis = useCallback(async () => {
    console.log("🔍 CSAT 분석 시작...");
    try {
      const params = new URLSearchParams({ start, end });
      const res = await fetch(`${process.env.REACT_APP_API_BASE}/api/csat-analysis?${params.toString()}`);
      if (res.ok) {
        const result = await res.json();
        console.log("✅ CSAT 분석 결과:", result);
        console.log("🔍 CSAT 데이터 구조:", Object.keys(result || {}));
        setCsatData(result);
      } else {
        console.log("⚠️ CSAT 분석 API 호출 실패:", res.status);
        setCsatData(null);
      }
    } catch (e) {
      console.error("❌ CSAT 분석 로드 실패", e);
      setCsatData(null);
    }
  }, [start, end]);

  useEffect(() => {
    if (apiConnected) loadCsatAnalysis();
  }, [apiConnected, loadCsatAnalysis]);

  // 현재 기간의 row 필터링
  const filteredRows = useMemo(() => {
    if (loading || !Array.isArray(userchats) || userchats.length === 0 || !start || !end) {
      console.log("⏳ skip filteredRows compute (loading or not ready)", {
        loading,
        userchatsLen: userchats?.length,
        start,
        end,
      });
      return [];
    }

    console.log("🔍 filteredRows 계산 시작:", { start, end, userchatsLength: userchats?.length });
    window.debugData = { userchats, start, end, filterVals };

    const initialStartDate = oneMonthAgoStr;
    if (
      start < initialStartDate &&
      !userchats.some((r) => {
        const dt = parseTsKST(r?.firstAskedAt);
        return dt && dt.getTime() < new Date(`${initialStartDate}T00:00:00${KST_OFFSET}`).getTime();
      })
    ) {
      console.log("📥 이전 기간 데이터 필요 - 추가 로드 시작");
      (async () => {
        try {
          const additionalRows = await fetchUserchats("2025-04-01", initialStartDate, "cache");
          if (additionalRows && additionalRows.length > 0) {
            console.log("✅ 추가 데이터 로드 완료:", additionalRows.length, "건");
            setUserchats((prev) => [...additionalRows, ...prev]);
          }
        } catch (err) {
          console.error("❌ 추가 데이터 로드 실패:", err);
        }
      })();
    }

    const { startMs, endMs } = buildRangeKST(start, end);
    const baseFiltered = (Array.isArray(userchats) ? userchats : []).filter((r) => {
      const dt = parseTsKST(r?.firstAskedAt);
      const t = dt ? dt.getTime() : NaN;
      return Number.isFinite(t) && t >= startMs && t <= endMs;
    });

    console.log("🔍 filteredRows 결과:", {
      filteredLength: baseFiltered.length,
      sampleData: baseFiltered.slice(0, 2),
      dateRange: { start, end },
    });

    return baseFiltered;
  }, [userchats, start, end, loading, oneMonthAgoStr, filterVals]);

  // CSAT 코멘트에 userchats 태그 병합 (렌더용)
  const csatTextWithTags = useMemo(() => {
    if (!csatCommentsRaw) return null;
    try {
      // 인덱스: userChatId / (userId+날짜) / userId 타임라인
      const byChatId = new Map();
      const byUserDay = new Map();
      const byUserList = new Map();
      (filteredRows || []).forEach((r) => {
        const tags = pickTagsFromRow(r);
        const t = parseTsKST(r.firstAskedAt)?.getTime();
        if (r.userChatId) byChatId.set(String(r.userChatId), tags);
        const day = ymd(r.firstAskedAt);
        if (r.userId && day) byUserDay.set(`${r.userId}_${day}`, tags);
        if (r.userId && Number.isFinite(t)) {
          const arr = byUserList.get(r.userId) || [];
          arr.push({ t, tags });
          byUserList.set(r.userId, arr);
        }
      });
      for (const [, arr] of byUserList) arr.sort((a, b) => a.t - b.t);

      const attach = (list = []) => list.map((it) => {
        let tags = it.tags;
        if (!tags && it.userChatId && byChatId.has(String(it.userChatId))) {
          tags = byChatId.get(String(it.userChatId));
        }
        if (!tags) {
          const day = ymd(it.firstAskedAt || it.date);
          if (it.userId && day) tags = byUserDay.get(`${it.userId}_${day}`) || tags;
        }
        if (!tags) {
          const t = parseTsKST(it.firstAskedAt || it.date)?.getTime();
          const arr = byUserList.get(it.userId);
          if (arr && Number.isFinite(t)) {
            let best = null, bestDiff = Infinity;
            for (const o of arr) {
              const diff = Math.abs(o.t - t);
              if (diff < bestDiff) { bestDiff = diff; best = o; }
            }
            if (best && bestDiff <= 14 * 24 * 3600 * 1000) tags = best.tags;
          }
        }
        return { ...it, tags };
      });

      return {
        status: "success",
        comment_3: {
          total: csatCommentsRaw.comment_3?.total ?? (csatCommentsRaw.comment_3?.data?.length || 0),
          data:  attach(csatCommentsRaw.comment_3?.data || []),
        },
        comment_6: {
          total: csatCommentsRaw.comment_6?.total ?? (csatCommentsRaw.comment_6?.data?.length || 0),
          data:  attach(csatCommentsRaw.comment_6?.data || []),
        },
      };
    } catch (e) {
      console.warn("CSAT 태그 병합 실패:", e);
      return null;
    }
  }, [csatCommentsRaw, filteredRows]);

  // 추가 필터링 (다중 선택 지원)
  const filtered = useMemo(() => {
    return filteredRows.filter((item) => {
      if (filterVals.고객유형?.length > 0) {
        const matches = filterVals.고객유형.some(
          (selectedType) =>
            item.고객유형 === selectedType ||
            item.고객유형_1차 === selectedType ||
            (item.고객유형 && item.고객유형.includes(selectedType))
        );
        if (!matches) return false;
      }
      if (filterVals.고객유형_2차?.length > 0) {
        if (!filterVals.고객유형_2차.includes(item.고객유형_2차)) return false;
      }
      if (filterVals.문의유형?.length > 0) {
        const matches = filterVals.문의유형.some(
          (selectedType) =>
            item.문의유형 === selectedType ||
            item.문의유형_1차 === selectedType ||
            (item.문의유형 && item.문의유형.includes(selectedType))
        );
        if (!matches) return false;
      }
      if (filterVals.문의유형_2차?.length > 0) {
        if (!filterVals.문의유형_2차.includes(item.문의유형_2차)) return false;
      }
      if (filterVals.서비스유형?.length > 0) {
        const matches = filterVals.서비스유형.some(
          (selectedType) =>
            item.서비스유형 === selectedType ||
            item.서비스유형_1차 === selectedType ||
            (item.서비스유형 && item.서비스유형.includes(selectedType))
        );
        if (!matches) return false;
      }
      if (filterVals.서비스유형_2차?.length > 0) {
        if (!filterVals.서비스유형_2차.includes(item.서비스유형_2차)) return false;
      }
      return true;
    });
  }, [filteredRows, filterVals]);

  // 유형 필터 변경시 자동 적용
  useEffect(() => {
    if (Object.keys(filterVals).length > 0) {
      console.log("🔍 유형 필터 변경 감지:", filterVals);
      handleFilterChange();
    }
  }, [filterVals]); // eslint-disable-line react-hooks/exhaustive-deps

  // 유형 필터 변경 핸들러(캐시 기반 백엔드 필터링)
  const handleFilterChange = useCallback(async () => {
    try {
      setLoading(true);

      const makeParam = (arr) => (arr && arr.length > 0 ? arr.join(",") : "전체");

      // 옵션 갱신(1차에 따라 2차 옵션 변경)
      const opts = await fetchFilterOptions(start, end, "cache", {
        고객유형: makeParam(filterVals.고객유형),
        문의유형: makeParam(filterVals.문의유형),
        서비스유형: makeParam(filterVals.서비스유형),
      });
      setFilterOptions(opts || {});

      // 백엔드 캐시에서 필터링된 rows 가져오기
      const filteredRows = await fetchUserchats(start, end, "cache", {
        고객유형: makeParam(filterVals.고객유형),
        고객유형_2차: makeParam(filterVals.고객유형_2차),
        문의유형: makeParam(filterVals.문의유형),
        문의유형_2차: makeParam(filterVals.문의유형_2차),
        서비스유형: makeParam(filterVals.서비스유형),
        서비스유형_2차: makeParam(filterVals.서비스유형_2차),
      });

      setUserchats(Array.isArray(filteredRows) ? filteredRows : []);
      console.log("✅ 유형 필터 자동 적용 완료:", {
        filterVals,
        filteredCount: Array.isArray(filteredRows) ? filteredRows.length : 0,
      });
    } catch (err) {
      console.error("❌ 유형 필터 적용 실패:", err);
      setError("유형 필터 적용 실패: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  }, [
    start,
    end,
    filterVals.고객유형,
    filterVals.고객유형_2차,
    filterVals.문의유형,
    filterVals.문의유형_2차,
    filterVals.서비스유형,
    filterVals.서비스유형_2차,
  ]);

  // 문의량 차트 데이터
  const chartData = useMemo(() => {
    if (!Array.isArray(filteredRows) || filteredRows.length === 0) return [];

    console.log("🔍 chartData 계산 시작:", { filteredRowsLength: filteredRows.length, dateGroup });
    if (dateGroup === "월간") {
      const map = {};
      filteredRows.forEach((item) => {
        const d = parseTsKST(item.firstAskedAt);
        if (!d) return;
        const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
        if (!map[key]) map[key] = { x축: `${d.getMonth() + 1}월`, 문의량: 0 };
        map[key].문의량 += 1;
      });
      const monthlyRaw = Object.values(map).sort(
        (a, b) => parseInt(a.x축) - parseInt(b.x축)
      );
      const data = normalizeChartRows(monthlyRaw, {
        labelKeyCandidates: ["x축", "label", "dateLabel"],
        valueKeyCandidates: ["문의량", "value", "count"],
      });
      return data;
    } else {
      const map = {};
      filteredRows.forEach((item) => {
        const d = parseTsKST(item.firstAskedAt);
        if (!d) return;
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay()); // 일요일 시작
        const weekKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}-${String(
          weekStart.getDate()
        ).padStart(2, "0")}`;
        if (!map[weekKey]) {
          const isFirstWeekOfMonth = weekStart.getDate() <= 7;
          map[weekKey] = {
            x축: `${weekStart.getMonth() + 1}/${weekStart.getDate()}`,
            문의량: 0,
            월레이블: isFirstWeekOfMonth ? `${weekStart.getMonth() + 1}월` : null,
            month: weekStart.getMonth() + 1,
          };
        }
        map[weekKey].문의량 += 1;
      });
      const weeklyRaw = Object.values(map).sort((a, b) => {
        const [monthA, dayA] = a.x축.split("/").map(Number);
        const [monthB, dayB] = b.x축.split("/").map(Number);
        if (monthA !== monthB) return monthA - monthB;
        return dayA - dayB;
      });

      const data = weeklyRaw.map((item, index) => {
        let 월레이블 = item.월레이블;
        if (!월레이블 && index > 0) {
          const prevItem = weeklyRaw[index - 1];
          if (prevItem && prevItem.month !== item.month) {
            월레이블 = `${item.month}월`;
          }
        }
        if (index === 0 && !월레이블) 월레이블 = `${item.month}월`;
        return { label: item.x축, value: item.문의량, 월레이블 };
      });
      return data;
    }
  }, [filteredRows, dateGroup]);

  // 평균 응답/해결 시간 차트
  const avgTimeChartData = useMemo(() => {
    if (!filteredRows.length) return [];
    const map = {};
    filteredRows.forEach((item) => {
      const d = parseTsKST(item.firstAskedAt);
      if (!d) return;
      const month = `${d.getFullYear()}-${d.getMonth() + 1}`;
      if (!map[month])
        map[month] = {
          x축: `${d.getMonth() + 1}월`,
          operationWaitingTime: [],
          operationAvgReplyTime: [],
          operationTotalReplyTime: [],
          operationResolutionTime: [],
        };

      if (item.operationWaitingTime != null && item.operationWaitingTime !== "") {
        const waitingTime = timeToSec(item.operationWaitingTime);
        if (waitingTime > 0) map[month].operationWaitingTime.push(waitingTime);
      }
      if (item.operationAvgReplyTime != null && item.operationAvgReplyTime !== "") {
        const avgReplyTime = timeToSec(item.operationAvgReplyTime);
        if (avgReplyTime > 0) map[month].operationAvgReplyTime.push(avgReplyTime);
      }
      if (item.operationTotalReplyTime != null && item.operationTotalReplyTime !== "") {
        const totalReplyTime = timeToSec(item.operationTotalReplyTime);
        if (totalReplyTime > 0) map[month].operationTotalReplyTime.push(totalReplyTime);
      }
      if (item.operationResolutionTime != null && item.operationResolutionTime !== "") {
        const resolutionTime = timeToSec(item.operationResolutionTime);
        if (resolutionTime > 0) map[month].operationResolutionTime.push(resolutionTime);
      }
    });

    const result = Object.values(map)
      .map((m) => {
        const avgWaitingTime = avg(m.operationWaitingTime);
        const avgReplyTime = avg(m.operationAvgReplyTime);
        const avgTotalReplyTime = avg(m.operationTotalReplyTime);
        const avgResolutionTime = avg(m.operationResolutionTime);
        return {
          x축: m.x축,
          operationWaitingTime: avgWaitingTime > 0 ? avgWaitingTime : null,
          operationAvgReplyTime: avgReplyTime > 0 ? avgReplyTime : null,
          operationTotalReplyTime: avgTotalReplyTime > 0 ? avgTotalReplyTime : null,
          operationResolutionTime: avgResolutionTime > 0 ? avgResolutionTime : null,
        };
      })
      .sort((a, b) => parseInt(a.x축.replace("월", "")) - parseInt(b.x축.replace("월", "")));

    return result;
  }, [filteredRows]);

  // 통계
  const statistics = useMemo(() => {
    const totalInquiries = filteredRows.length;

    const firstResponseTimes = filteredRows.map((i) => timeToSec(i.operationWaitingTime)).filter((t) => t > 0);
    const avgFirstResponseTime =
      firstResponseTimes.length > 0
        ? Math.round((firstResponseTimes.reduce((s, t) => s + t, 0) / firstResponseTimes.length) * 100) / 100
        : 0;

    const responseTimes = filteredRows.map((i) => timeToSec(i.operationAvgReplyTime)).filter((t) => t > 0);
    const avgResponseTime =
      responseTimes.length > 0
        ? Math.round((responseTimes.reduce((s, t) => s + t, 0) / responseTimes.length) * 100) / 100
        : 0;

    const resolutionTimes = filteredRows.map((i) => timeToSec(i.operationResolutionTime)).filter((t) => t > 0);
    const avgResolutionTime =
      resolutionTimes.length > 0
        ? Math.round((resolutionTimes.reduce((s, t) => s + t, 0) / resolutionTimes.length) * 100) / 100
        : 0;

    return {
      총문의수: totalInquiries,
      평균첫응답시간: avgFirstResponseTime,
      평균응답시간: avgResponseTime,
      평균해결시간: avgResolutionTime,
    };
  }, [filteredRows]);

  // 문의유형별 차트
  const inquiryTypeData = useMemo(() => {
    if (loading || !Array.isArray(filteredRows) || filteredRows.length === 0) {
      console.log("⏳ skip inquiryTypeData compute", { loading, filteredRowsLength: filteredRows?.length });
      return [];
    }

    console.log("🔍 inquiryTypeData 계산 시작:", {
      filteredRowsLength: filteredRows.length,
      filterVals문의유형: filterVals.문의유형,
    });

    if (!filterVals.문의유형 || filterVals.문의유형.length === 0) {
      const counts = {};
      filteredRows.forEach((item) => {
        let type = item.문의유형 || "";
        if (type && type.includes("/")) type = type.split("/")[0].trim();
        if (type && type.trim() !== "") counts[type] = (counts[type] || 0) + 1;
      });
      const inquiryRaw = Object.entries(counts)
        .map(([type, count]) => ({ 문의유형: type, 문의량: Number(count) || 0 }))
        .filter((item) => !isNaN(item.문의량) && item.문의량 > 0)
        .sort((a, b) => b.문의량 - a.문의량);

      return normalizeChartRows(inquiryRaw, {
        labelKeyCandidates: ["label", "라벨", "name", "유형", "문의유형"],
        valueKeyCandidates: ["value", "건수", "count", "문의량"],
      });
    } else {
      const counts = {};
      filteredRows.forEach((item) => {
        let itemType = item.문의유형 || "";
        if (itemType.includes("/")) itemType = itemType.split("/")[0].trim();
        if (filterVals.문의유형.includes(itemType)) {
          const type2 = item.문의유형_2차 || "";
          if (type2 && type2.trim() !== "") counts[type2] = (counts[type2] || 0) + 1;
        }
      });
      const inquiryRaw = Object.entries(counts)
        .map(([type, count]) => ({ 문의유형_2차: type, 문의량: Number(count) || 0 }))
        .filter((item) => !isNaN(item.문의량) && item.문의량 > 0)
        .sort((a, b) => b.문의량 - a.문의량);

      return normalizeChartRows(inquiryRaw, {
        labelKeyCandidates: ["label", "라벨", "name", "유형", "문의유형_2차"],
        valueKeyCandidates: ["value", "건수", "count", "문의량"],
      });
    }
  }, [filteredRows, filterVals.문의유형, loading]);

  // 고객유형 2차/도넛
  const customerTypeData = useMemo(() => {
    if (loading || !Array.isArray(filteredRows) || filteredRows.length === 0) {
      console.log("⏳ skip customerTypeData compute", { loading, filteredRowsLength: filteredRows?.length });
      return [];
    }

    console.log("🔍 customerTypeData 계산 시작:", {
      filteredRowsLength: filteredRows.length,
      filterVals고객유형: filterVals.고객유형,
    });

    if (!filterVals.고객유형 || filterVals.고객유형.length === 0) {
      const counts = {};
      filteredRows.forEach((item) => {
        let type = item.고객유형 || "";
        if (type && type.includes("/")) type = type.split("/")[0].trim();
        if (type && type.trim() !== "") counts[type] = (counts[type] || 0) + 1;
      });
      const customerRaw = Object.entries(counts)
        .map(([type, count]) => ({ 고객유형: type, 문의량: Number(count) || 0 }))
        .filter((item) => !isNaN(item.문의량) && item.문의량 > 0)
        .sort((a, b) => b.문의량 - a.문의량);

      return normalizeChartRows(customerRaw, {
        labelKeyCandidates: ["label", "라벨", "name", "유형", "고객유형"],
        valueKeyCandidates: ["value", "건수", "count", "문의량"],
      });
    } else {
      const counts = {};
      filteredRows.forEach((item) => {
        let itemType = item.고객유형 || "";
        if (itemType.includes("/")) itemType = itemType.split("/")[0].trim();
        if (filterVals.고객유형.includes(itemType)) {
          const type2 = item.고객유형_2차 || "";
          if (type2 && type2.trim() !== "") counts[type2] = (counts[type2] || 0) + 1;
        }
      });
      const customerRaw = Object.entries(counts)
        .map(([type, count]) => ({ 고객유형_2차: type, 문의량: Number(count) || 0 }))
        .filter((item) => !isNaN(item.문의량) && item.문의량 > 0)
        .sort((a, b) => b.문의량 - a.문의량);

      return normalizeChartRows(customerRaw, {
        labelKeyCandidates: ["label", "라벨", "name", "유형", "고객유형_2차"],
        valueKeyCandidates: ["value", "건수", "count", "문의량"],
      });
    }
  }, [filteredRows, filterVals.고객유형, loading]);

  const customerDonutData = useMemo(() => {
    if (loading || !Array.isArray(filteredRows) || filteredRows.length === 0) {
      console.log("⏳ skip customerDonutData compute", { loading, filteredRowsLength: filteredRows?.length });
      return [];
    }

    const counts = {};
    filteredRows.forEach((item) => {
      let type = item.고객유형 || "";
      if (type && type.includes("/")) type = type.split("/")[0].trim();
      if (type && type.trim() !== "") counts[type] = (counts[type] || 0) + 1;
    });

    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, [, c]) => s + c, 0);
    const top5 = entries.slice(0, 5);
    const others = entries.slice(5).reduce((s, [, c]) => s + c, 0);

    const result = top5.map(([type, count]) => ({
      고객유형: type,
      문의량: count,
      퍼센트: total ? (count / total) * 100 : 0, // 숫자(%)로 저장
      라벨: `${type} (${total ? ((count / total) * 100).toFixed(1) : "0.0"}%)`,
    }));
    if (others > 0) {
      result.push({
        고객유형: "기타",
        문의량: others,
        퍼센트: total ? (others / total) * 100 : 0,
        라벨: `기타 (${total ? ((others / total) * 100).toFixed(1) : "0.0"}%)`,
      });
    }
    return result;
  }, [filteredRows, loading]);

  // 유틸
  function timeToSec(t) {
    if (!t || t === "" || t === " " || t === "null" || t === "undefined") return 0;
    if (typeof t === "number") {
      if (isNaN(t)) return 0;
      return t; // 분 단위 가정
    }
    if (typeof t === "string") {
      t = t.trim();
      if (!t) return 0;
      if (t.includes(":")) {
        const parts = t.split(":").map((x) => {
          const num = parseInt(String(x).trim(), 10);
          return isNaN(num) ? 0 : num;
        });
        if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60; // HH:MM:SS -> 분
        if (parts.length === 2) return parts[0] + parts[1] / 60; // MM:SS -> 분
        if (parts.length === 1) return parts[0]; // M
        return 0;
      }
      const num = parseFloat(t);
      if (isNaN(num)) return 0;
      if (num > 1000) return num / 60; // 큰 숫자는 초로 간주 → 분
      return num; // 분
    }
    return 0;
  }
  function avg(arr) {
    const f = arr.filter((x) => x !== null && x !== undefined && x !== "" && !isNaN(x) && typeof x === "number");
    if (!f.length) return 0;
    return Math.round((f.reduce((a, b) => a + b, 0) / f.length) * 100) / 100;
  }

  // --- 화면 ---
  const TagChips = ({ tags }) => {
    if (!tags) return null;

    const rows = [
      { label: "고객유형", a: tags.고객유형, b: tags.고객유형_2차 },
      { label: "문의유형", a: tags.문의유형, b: tags.문의유형_2차 },
      { label: "서비스유형", a: tags.서비스유형, b: tags.서비스유형_2차 },
    ].filter(({ a, b }) => (a && a.trim()) || (b && b.trim())); // 값 있는 것만

    if (!rows.length) return null;

    return (
      <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
        {rows.map(({ label, a, b }) => {
          const segs = [label, a, b].filter(s => s && String(s).trim());
          const text = segs.join("/");
          return (
            <span
              key={label}
              style={{
                backgroundColor: "#e3f2fd",
                color: "#1976d2",
                padding: "2px 6px",
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 500,
              }}
              title={text}
            >
              {text}
            </span>
          );
        })}
      </div>
    );
  };

  if (apiConnected === null) {
    return (
      <div style={{ padding: 32, fontFamily: "sans-serif", textAlign: "center" }}>
        <h2>CS 대시보드</h2>
        <div style={{ color: "#1565c0", margin: "20px 0" }}>🔄 백엔드 연결 확인 중...</div>
      </div>
    );
  }
  if (!apiConnected) {
    return (
      <div style={{ padding: 32, fontFamily: "sans-serif", textAlign: "center" }}>
        <h2>CS 대시보드</h2>
        <div style={{ color: "red", margin: "20px 0" }}>
          ⚠️ 백엔드 API에 연결할 수 없습니다.
          <br />
          백엔드 서버가 실행 중인지 확인해주세요.
        </div>
        <div style={{ fontSize: "14px", color: "gray" }}>
          백엔드 서버: <code>{process.env.REACT_APP_API_BASE}</code>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif", backgroundColor: "#f5f5f5", minHeight: "100vh" }}>
      {/* 커스텀 툴팁 */}
      <div
        style={{
          position: "fixed",
          display: tooltip.visible ? "block" : "none",
          left: tooltip.x + 10,
          top: tooltip.y - 10,
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          color: "white",
          padding: "8px 12px",
          borderRadius: "6px",
          fontSize: "14px",
          zIndex: 1000,
          pointerEvents: "none",
          whiteSpace: "nowrap",
        }}
      >
        <div style={{ fontWeight: "bold", marginBottom: 4 }}>{tooltip.title}</div>
        <div>문의량: {tooltip.count?.toLocaleString?.() ?? tooltip.count}건</div>
        <div>비율: {typeof tooltip.percent === "number" ? tooltip.percent.toFixed(1) : tooltip.percent}%</div>
      </div>

      <div style={{ maxWidth: "1600px", margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
          <h1 style={{ textAlign: "center", color: "#333", margin: 0 }}>📊 CS 대시보드</h1>
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={() => loadCacheData("update")}
              disabled={loading}
              style={{
                padding: "10px 20px",
                backgroundColor: "#28a745",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: "14px",
                fontWeight: "bold",
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
              }}
            >
              {loading ? "🔄 최신화 중..." : "🔄 최신화"}
            </button>
          </div>
        </div>

        {/* 탭 */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid #dee2e6",
            backgroundColor: "white",
            marginBottom: "20px",
            borderRadius: "8px 8px 0 0",
          }}
        >
          {["CS", "CSAT", "Cache"].map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              style={{
                padding: "12px 24px",
                border: "none",
                backgroundColor: activeTab === t ? "#007bff" : "transparent",
                color: activeTab === t ? "white" : "#495057",
                cursor: "pointer",
                borderBottom: activeTab === t ? "2px solid #007bff" : "none",
                fontWeight: activeTab === t ? "600" : "400",
                borderRadius: "8px 8px 0 0",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {error && (
          <div
            style={{
              backgroundColor: "#ffebee",
              color: "#c62828",
              padding: "12px",
              borderRadius: "4px",
              marginBottom: "16px",
            }}
          >
            ❌ {error}
          </div>
        )}

        {success && (
          <div
            style={{
              backgroundColor: "#e8f5e8",
              color: "#2e7d32",
              padding: "12px",
              borderRadius: "4px",
              marginBottom: "16px",
            }}
          >
            ✅ {success}
          </div>
        )}

        {loading && (
          <div
            style={{
              backgroundColor: "#e3f2fd",
              color: "#1565c0",
              padding: "12px",
              borderRadius: "4px",
              marginBottom: "16px",
            }}
          >
            🔄 데이터를 불러오는 중...
          </div>
        )}

        {/* 기간 필터 - CS/CSAT 탭만 */}
        {(activeTab === "CS" || activeTab === "CSAT") && (
          <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <label style={{ marginRight: "8px", fontWeight: "bold" }}>기간:</label>
            <input
              type="date"
              value={start}
              onChange={(e) => {
                const newStart = e.target.value;
                setStart(newStart);
                if (newStart > end) setEnd(newStart);
              }}
              max={todayStr}
              style={{ margin: "0 8px", padding: "4px 8px", borderRadius: "4px", border: "1px solid #ddd" }}
            />
            ~
            <input
              type="date"
              value={end}
              onChange={(e) => {
                const newEnd = e.target.value;
                if (newEnd <= todayStr) setEnd(newEnd);
              }}
              max={todayStr}
              min={start}
              style={{ margin: "0 8px", padding: "4px 8px", borderRadius: "4px", border: "1px solid #ddd" }}
            />
          </div>
        )}

        {/* CS 탭 */}
        {activeTab === "CS" && (
          <>
            {/* KPI 카드 */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "12px",
                marginBottom: "20px",
              }}
            >
              {[
                { label: "총 문의수", value: statistics.총문의수?.toLocaleString() || 0, color: "#007bff" },
                { label: "평균 첫 응답시간", value: `${statistics.평균첫응답시간?.toFixed(1) || 0}분`, color: "#17a2b8" },
                { label: "평균 응답시간", value: `${statistics.평균응답시간?.toFixed(1) || 0}분`, color: "#28a745" },
                { label: "평균 해결시간", value: `${statistics.평균해결시간?.toFixed(1) || 0}분`, color: "#dc3545" },
              ].map((kpi, idx) => (
                <div
                  key={idx}
                  style={{
                    backgroundColor: "white",
                    padding: "20px",
                    borderRadius: "12px",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: "28px", fontWeight: "600", color: kpi.color, marginBottom: "4px" }}>{kpi.value}</div>
                  <div style={{ fontSize: "14px", color: "#666", fontWeight: "500" }}>{kpi.label}</div>
                </div>
              ))}
            </div>

            {/* 유형 필터 */}
            <FilterPanel options={filterOptions} values={filterVals} setValues={setFilterVals} />

            {/* 차트 2열 */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                marginBottom: "20px",
              }}
            >
              <div
                style={{
                  backgroundColor: "white",
                  padding: "20px",
                  borderRadius: "12px",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                }}
              >
                <ChartSection
                  data={chartData}
                  label="CS 문의량"
                  xLabel="x축"
                  yLabel="문의량"
                  loading={loading}
                  dateGroup={dateGroup}
                  onDateGroupChange={setDateGroup}
                />
              </div>

              <div
                style={{
                  backgroundColor: "white",
                  padding: "20px",
                  borderRadius: "12px",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                }}
              >
                {avgTimeChartData.length > 0 ? (
                  <>
                    <h3 style={{ marginBottom: "16px", color: "#333", fontWeight: "600" }}>평균 응답/해결 시간</h3>
                    <div style={{ fontSize: "12px", color: "#999", marginBottom: "16px" }}>y축 단위: 분(min)</div>

                    <MultiLineChartSection
                      data={avgTimeChartData}
                      lines={[
                        { key: "operationWaitingTime", color: "#007bff", label: "첫응답시간" },
                        { key: "operationAvgReplyTime", color: "#28a745", label: "평균응답시간" },
                        { key: "operationTotalReplyTime", color: "#ffc107", label: "총응답시간" },
                        { key: "operationResolutionTime", color: "#dc3545", label: "해결시간" },
                      ]}
                      label=""
                      xLabel="x축"
                      loading={loading}
                      dateGroup={"월간"}
                    />
                  </>
                ) : (
                  <div style={{ textAlign: "center", color: "#666", padding: "40px 0" }}>응답/해결 시간 데이터가 없습니다.</div>
                )}
              </div>
            </div>

            {/* 하단 2열 */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                marginBottom: "20px",
              }}
            >
              {inquiryTypeData.length > 0 && (
                <div
                  style={{
                    backgroundColor: "white",
                    padding: "20px",
                    borderRadius: "12px",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                  }}
                >
                  <h3 style={{ marginBottom: "16px", color: "#333", fontWeight: "600" }}>
                    문의유형별 분포
                    {filterVals.문의유형?.length > 0 && ` (${filterVals.문의유형.join(", ")} > 세부분류)`}
                  </h3>
                  <ChartSection
                    data={inquiryTypeData}
                    label=""
                    xLabel={!filterVals.문의유형 || filterVals.문의유형.length === 0 ? "문의유형" : "문의유형_2차"}
                    yLabel="문의량"
                    loading={loading}
                    chartType="horizontalBar"
                    height={350}
                    width={600}
                  />
                </div>
              )}

              {(!filterVals.고객유형 || filterVals.고객유형.length === 0) ? (
                customerDonutData.length > 0 && (
                  <div
                    style={{
                      backgroundColor: "white",
                      padding: "20px",
                      borderRadius: "12px",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    }}
                  >
                    <h3 style={{ marginBottom: "16px", color: "#333", fontWeight: "600" }}>고객유형별 분포</h3>
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "300px" }}>
                      <div style={{ position: "relative", width: "300px", height: "300px" }}>
                        <svg width="300" height="300" viewBox="0 0 300 300">
                          <circle cx="150" cy="150" r="120" fill="none" stroke="#e0e0e0" strokeWidth="40" />
                          {(() => {
                            const total = customerDonutData.reduce((s, x) => s + x.문의량, 0) || 1;
                            let accAngle = 0;
                            const radius = 100;
                            const strokeW = 40;
                            const colors = ["#007bff", "#28a745", "#ffc107", "#dc3545", "#6f42c1", "#fd7e14"];
                            return customerDonutData.map((item, index) => {
                              const frac = item.문의량 / total;
                              const startAngle = accAngle;
                              const endAngle = accAngle + frac * 2 * Math.PI;
                              accAngle = endAngle;
                              const x1 = 150 + radius * Math.cos(startAngle);
                              const y1 = 150 + radius * Math.sin(startAngle);
                              const x2 = 150 + radius * Math.cos(endAngle);
                              const y2 = 150 + radius * Math.sin(endAngle);
                              const largeArcFlag = endAngle - startAngle <= Math.PI ? "0" : "1";
                              const color = colors[index % colors.length];
                              return (
                                <g key={index}>
                                  <path
                                    d={`M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`}
                                    fill="none"
                                    stroke={color}
                                    strokeWidth={strokeW}
                                    onMouseEnter={(e) => {
                                      const rect = e.target.getBoundingClientRect();
                                      setTooltip({
                                        visible: true,
                                        x: rect.left + rect.width / 2,
                                        y: rect.top,
                                        title: item.고객유형,
                                        count: item.문의량,
                                        percent: item.퍼센트, // 숫자
                                      });
                                      setHoverIndex(index);
                                    }}
                                    onMouseLeave={() => {
                                      setTooltip({ visible: false, x: 0, y: 0, title: "", count: 0, percent: 0 });
                                      setHoverIndex(null);
                                    }}
                                    style={{ cursor: "pointer" }}
                                  />
                                </g>
                              );
                            });
                          })()}
                        </svg>
                        <div
                          style={{
                            position: "absolute",
                            top: "50%",
                            left: "50%",
                            transform: "translate(-50%, -50%)",
                            textAlign: "center",
                          }}
                        >
                          <div style={{ fontSize: "24px", fontWeight: "600", color: "#333" }}>
                            {customerDonutData.reduce((sum, item) => sum + item.문의량, 0).toLocaleString()}
                          </div>
                          <div style={{ fontSize: "14px", color: "#666" }}>총 문의</div>
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: "20px", display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "center" }}>
                      {customerDonutData.map((item, index) => {
                        const colors = ["#007bff", "#28a745", "#ffc107", "#dc3545", "#6f42c1", "#fd7e14"];
                        return (
                          <div
                            key={index}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              padding: "4px 8px",
                              backgroundColor: "#f8f9fa",
                              borderRadius: "6px",
                              fontSize: "12px",
                              cursor: "default",
                            }}
                            title={`${item.고객유형}: ${item.문의량.toLocaleString()}건 (${item.퍼센트.toFixed(1)}%)`}
                          >
                            <div
                              style={{
                                width: "12px",
                                height: "12px",
                                borderRadius: "50%",
                                backgroundColor: colors[index % colors.length],
                              }}
                            />
                            <span>{item.고객유형}</span>
                            <span style={{ color: "#666" }}>({item.퍼센트.toFixed(1)}%)</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )
              ) : (
                customerTypeData.length > 0 && (
                  <div
                    style={{
                      backgroundColor: "white",
                      padding: "20px",
                      borderRadius: "12px",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    }}
                  >
                    <h3 style={{ marginBottom: "16px", color: "#333", fontWeight: "600" }}>
                      고객유형별 분포
                      {filterVals.고객유형?.length > 0 && ` (${filterVals.고객유형.join(", ")} > 세부분류)`}
                    </h3>
                    <ChartSection
                      data={customerTypeData}
                      label=""
                      xLabel={!filterVals.고객유형 || filterVals.고객유형.length === 0 ? "고객유형" : "고객유형_2차"}
                      yLabel="문의량"
                      loading={loading}
                      chartType="horizontalBar"
                      height={350}
                      width={600}
                    />
                  </div>
                )
              )}
            </div>
          </>
        )}

        {/* CSAT 탭 */}
        {activeTab === "CSAT" && (
          <>
            {csatData && csatData.status === "success" ? (
              <>
                <CSatChartSection csatSummary={csatData.요약} totalResponses={csatData.총응답수} />

                {csatData?.유형별 && Object.keys(csatData.유형별).length > 0 && (
                  <CSatTypeChartSection typeScores={csatData.유형별} typeLabel="유형별" />
                )}

                {/* CSAT 텍스트 분석 */}
                {csatTextWithTags && csatTextWithTags.status === "success" && (
                  <div
                    style={{
                      backgroundColor: "white",
                      padding: "20px",
                      borderRadius: "12px",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                      marginBottom: "20px",
                    }}
                  >
                    <h3 style={{ marginBottom: "16px", color: "#333", fontWeight: "600" }}>CSAT 상세 의견</h3>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                      {/* A-3 */}
                      <div>
                        <h4 style={{ marginBottom: "12px", color: "#007bff", fontWeight: "600" }}>
                          A-3 응답 ({csatTextWithTags.comment_3?.total || csatTextWithTags.comment_3?.data?.length || 0}건)
                        </h4>
                        <div
                          style={{
                            maxHeight: "300px",
                            overflowY: "auto",
                            border: "1px solid #e0e0e0",
                            borderRadius: "8px",
                            padding: "12px",
                          }}
                        >
                          {Array.isArray(csatTextWithTags.comment_3?.data) && csatTextWithTags.comment_3.data.length > 0
                            ? csatTextWithTags.comment_3.data.map((item, index) => (
                              <div
                                key={`${item.userId || "u"}-${item.firstAskedAt || index}-${index}`}
                                style={{
                                  padding: "8px",
                                  marginBottom: "8px",
                                  backgroundColor: "#f8f9fa",
                                  borderRadius: "6px",
                                  borderLeft: "3px solid #007bff",
                                }}
                              >
                                <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>
                                  {new Date(item.firstAskedAt ?? item.date ?? Date.now()).toLocaleDateString()} | User: {item.userId ?? item.user ?? item.personId ?? item.id ?? "-"}
                                  {typeof item.score === "number" && ` | Score: ${item.score}`}
                                </div>
                                <TagChips tags={item.tags} />
                                <div style={{ fontSize: "14px", lineHeight: "1.4" }}>{item.text ?? item.comment ?? item.의견 ?? item.코멘트 ?? ""}</div>
                              </div>
                            ))
                            : <div style={{ color: "#666", fontStyle: "italic" }}>데이터가 없습니다.</div>}
                        </div>
                      </div>

                      {/* A-6 */}
                      <div>
                        <h4 style={{ marginBottom: "12px", color: "#28a745", fontWeight: "600" }}>
                          A-6 응답 ({csatTextWithTags.comment_6?.total || csatTextWithTags.comment_6?.data?.length || 0}건)
                        </h4>
                        <div
                          style={{
                            maxHeight: "300px",
                            overflowY: "auto",
                            border: "1px solid #e0e0e0",
                            borderRadius: "8px",
                            padding: "12px",
                          }}
                        >
                          {Array.isArray(csatTextWithTags.comment_6?.data) && csatTextWithTags.comment_6.data.length > 0
                            ? csatTextWithTags.comment_6.data.map((item, index) => (
                              <div
                                key={`${item.userId || "u"}-${item.firstAskedAt || index}-${index}`}
                                style={{
                                  padding: "8px",
                                  marginBottom: "8px",
                                  backgroundColor: "#f8f9fa",
                                  borderRadius: "6px",
                                  borderLeft: "3px solid #28a745",
                                }}
                              >
                                <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>
                                  {new Date(item.firstAskedAt ?? item.date ?? Date.now()).toLocaleDateString()} | User: {item.userId ?? item.user ?? item.personId ?? item.id ?? "-"}
                                  {typeof item.score === "number" && ` | Score: ${item.score}`}
                                </div>
                                <TagChips tags={item.tags} />
                                <div style={{ fontSize: "14px", lineHeight: "1.4" }}>{item.text ?? item.comment ?? item.의견 ?? item.코멘트 ?? ""}</div>
                              </div>
                            ))
                            : <div style={{ color: "#666", fontStyle: "italic" }}>데이터가 없습니다.</div>}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div
                style={{
                  backgroundColor: "white",
                  padding: "40px",
                  borderRadius: "8px",
                  textAlign: "center",
                  color: "#666",
                }}
              >
                {csatData ? "CSAT 데이터 로드 중..." : "CSAT 데이터를 불러오는 중입니다..."}
              </div>
            )}
          </>
        )}

        {/* Cache 탭 */}
        {activeTab === "Cache" && (
          <>
            <CacheStatusSection start={start} end={end} />
            <div
              style={{
                backgroundColor: "white",
                padding: "20px",
                borderRadius: "8px",
                marginTop: "20px",
                textAlign: "center",
              }}
            >
              <h3 style={{ margin: "0 0 20px 0", color: "#333" }}>캐시 관리</h3>
              <button
                onClick={() => loadCacheData("refresh")}
                disabled={loading}
                style={{
                  padding: "12px 24px",
                  backgroundColor: "#dc3545",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontSize: "16px",
                  fontWeight: "bold",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                }}
              >
                {loading ? "📥 갱신 중..." : "📥 전체 데이터 갱신"}
              </button>
              <p
                style={{
                  margin: "15px 0 0 0",
                  fontSize: "14px",
                  color: "#666",
                  fontStyle: "italic",
                }}
              >
                ⚠️ 주의: 기존 캐시를 완전히 삭제하고 전체 데이터를 새로 수집합니다
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
