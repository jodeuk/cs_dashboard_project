import React, { lazy, Suspense, useState, useEffect, useMemo, useRef, useCallback } from "react";
import { fetchUserchats, checkApiHealth } from "./api";
import FilterPanel from "./components/FilterPanel";
import ChartSection from "./components/ChartSection";
import MultiLineChartSection from "./components/MultiLineChartSection";
import HandlingTypeDonut from "./components/HandlingTypeDonut";
import SLAStackBar from "./components/SLAStackBar";
// 박스플롯/비즈웜 대신 분포 커브 차트
import HandlingLeadtimeDensity from "./components/HandlingLeadtimeDensity";

const CacheStatusSection = lazy(() => import("./components/CacheStatusSection"));
const CSatChartSection = lazy(() => import("./components/CSatChartSection"));
const CSatTypeChartSection = lazy(() => import("./components/CSatTypeChartSection"));
const CSatCommentsSection = lazy(() => import("./components/CSatCommentsSection"));

// ===== App.jsx 파일 최상단(컴포넌트 밖) =====
const normArr = (v) => Array.isArray(v) ? v.filter(Boolean) : (v && v !== "전체" ? [v] : []);
const joinOrAll = (vals) => (Array.isArray(vals) && vals.length > 0) ? vals.join(",") : "전체";
const primaryOf = (s) => (typeof s === "string" && s.includes("/")) ? s.split("/")[0].trim() : (s || "");

function buildFilterParams(start, end, filterVals) {
  const effectiveChild = (parentVals, childVals) => {
    const p = normArr(parentVals);
    if (p.length === 0) return "전체";
    const c = normArr(childVals);
    return c.length ? c.join(",") : "전체";
  };
  return {
    start, end, refresh_mode: "cache",
    serviceType:   joinOrAll(filterVals.서비스유형),
    serviceType2:  effectiveChild(filterVals.서비스유형,  filterVals.서비스유형_2차),
    inquiryType:   joinOrAll(filterVals.문의유형),
    inquiryType2:  effectiveChild(filterVals.문의유형,  filterVals.문의유형_2차),
    customerType:  joinOrAll(filterVals.고객유형),
    customerType2: effectiveChild(filterVals.고객유형, filterVals.고객유형_2차),
  };
}

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

const toFiniteNumber = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};
const asString = (v, def = "") => (v == null ? def : String(v));

// ── 태그 매핑 유틸 ───────────────────────────────────────────────
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
// (사용처 없음 삭제)

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
  // 관리자 권한 확인
  const isAdmin = process.env.REACT_APP_ENABLE_ADMIN === "true";

  // 날짜 초기값: 한 달 전 ~ 오늘
  const today = new Date();
  const oneMonthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
  const todayStr = formatDate(today);
  const oneMonthAgoStr = formatDate(oneMonthAgo);

  // 상태
  const [userchats, setUserchats] = useState([]);
  // ✅ 복수선택 지원 (배열). 비선택 = [] = "전체"와 동일 의미
  const [filterVals, setFilterVals] = useState({
    고객유형: [],
    문의유형: [],
    서비스유형: [],
    고객유형_2차: [],
    문의유형_2차: [],
    서비스유형_2차: [],
  });

  // 차트별로 독립 상태
  const [csDateGroup, setCsDateGroup] = useState("월간");       // CS 문의량 차트용
  const [mlDateGroup, setMlDateGroup] = useState("월간");       // 평균 응답/해결 시간 차트용
  const [start, setStart] = useState(oneMonthAgoStr);
  const [end, setEnd] = useState(todayStr);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [apiConnected, setApiConnected] = useState(null);
  const [csatData, setCsatData] = useState(null);
  const [activeTab, setActiveTab] = useState("CS");
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, title: "", count: 0, percent: 0 });
  const [, setHoverIndex] = useState(null); // 값은 안 쓰므로 변수 생략

  // ✅ rows = userchats (서버에서 이미 필터링된 최종 데이터)
  const rows = useMemo(
    () => (Array.isArray(userchats) ? userchats : []),
    [userchats]
  );

  // ✅ 서버가 필터를 적용해 준 결과만 사용
  const filteredRows = rows;

  // ✅ 1차 옵션: userchats에서 동적 생성
  const serviceTypeOptions = useMemo(() => {
    const set = new Set();
    filteredRows.forEach(r => {
      const { 서비스유형 } = pickTagsFromRow(r);   // ← _1차까지 fallback
      if (서비스유형) set.add(서비스유형);
    });
    return Array.from(set).sort();
  }, [rows]);

  const inquiryTypeOptions = useMemo(() => {
    const set = new Set();
    filteredRows.forEach(r => {
      const { 문의유형 } = pickTagsFromRow(r);
      if (문의유형) set.add(문의유형);
    });
    return Array.from(set).sort();
  }, [rows]);

  const customerTypeOptions = useMemo(() => {
    const set = new Set();
    filteredRows.forEach(r => {
      const { 고객유형 } = pickTagsFromRow(r);
      if (고객유형) set.add(고객유형);
    });
    return Array.from(set).sort();
  }, [rows]);

  // ✅ 2차 옵션: 부모(복수) 합집합 (userchats 기반)
  const serviceType2Options = useMemo(() => {
    const parents = normArr(filterVals.서비스유형);
    const set = new Set();
    filteredRows.forEach(r => {
      const t = pickTagsFromRow(r);
      if ((!parents.length || parents.includes(t.서비스유형)) && t.서비스유형_2차) {
        set.add(t.서비스유형_2차);
      }
    });
    return Array.from(set).sort();
  }, [filterVals.서비스유형, rows]);

  const inquiryType2Options = useMemo(() => {
    const parents = normArr(filterVals.문의유형);
    const set = new Set();
    filteredRows.forEach(r => {
      const t = pickTagsFromRow(r);
      if ((!parents.length || parents.includes(t.문의유형)) && t.문의유형_2차) {
        set.add(t.문의유형_2차);
      }
    });
    return Array.from(set).sort();
  }, [filterVals.문의유형, rows]);

  const customerType2Options = useMemo(() => {
    const parents = normArr(filterVals.고객유형);
    const set = new Set();
    filteredRows.forEach(r => {
      const t = pickTagsFromRow(r);
      if ((!parents.length || parents.includes(t.고객유형)) && t.고객유형_2차) {
        set.add(t.고객유형_2차);
      }
    });
    return Array.from(set).sort();
  }, [filterVals.고객유형, rows]);

  // subtypeMaps 생성 (1차 → 2차 매핑)
  const subtypeMaps = useMemo(() => {
    const maps = { service: {}, inquiry: {}, customer: {} };
    
    filteredRows.forEach(row => {
      // 서비스유형 매핑
      const serviceParent = row.서비스유형;
      const serviceChild = row.서비스유형_2차;
      if (serviceParent && serviceChild && serviceChild !== "전체") {
        if (!maps.service[serviceParent]) maps.service[serviceParent] = [];
        if (!maps.service[serviceParent].includes(serviceChild)) {
          maps.service[serviceParent].push(serviceChild);
        }
      }
      
      // 문의유형 매핑
      const inquiryParent = row.문의유형;
      const inquiryChild = row.문의유형_2차;
      if (inquiryParent && inquiryChild && inquiryChild !== "전체") {
        if (!maps.inquiry[inquiryParent]) maps.inquiry[inquiryParent] = [];
        if (!maps.inquiry[inquiryParent].includes(inquiryChild)) {
          maps.inquiry[inquiryParent].push(inquiryChild);
        }
      }
      
      // 고객유형 매핑
      const customerParent = row.고객유형;
      const customerChild = row.고객유형_2차;
      if (customerParent && customerChild && customerChild !== "전체") {
        if (!maps.customer[customerParent]) maps.customer[customerParent] = [];
        if (!maps.customer[customerParent].includes(customerChild)) {
          maps.customer[customerParent].push(customerChild);
        }
      }
    });
    
    return maps;
  }, [rows]);

  // (App 내부 duplicate 함수 삭제 — buildFilterParams 내부에서 처리됨)


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

  // ✅ useEffect보다 위에 "함수 선언문"으로 둔다
  async function loadCsatAnalysis() {
    try {
      const params = new URLSearchParams({ start, end });
      const res = await fetch(`${process.env.REACT_APP_API_BASE}/api/csat-analysis?${params.toString()}`);
      setCsatData(res.ok ? await res.json() : null);
    } catch {
      setCsatData(null);
    }
  }


  const fetchRowsWithParams = useCallback(async (mode = "cache") => {
    try {
      setLoading(true);
      const params = buildFilterParams(start, end, filterVals);
      const rows = await fetchUserchats(start, end, mode, params); // 취소여도 배열 반환
      setUserchats(Array.isArray(rows) ? rows : []);
      if (mode === "update") {
        setSuccess("✅ 데이터 최신화 완료");
        setTimeout(() => setSuccess(null), 2000);
      }
    } catch (err) {
      // ✅ 취소된 요청은 에러로 처리하지 않음
      const isCanceled = 
        err?.name === "CanceledError" ||
        err?.name === "AbortError" ||
        err?.code === "ERR_CANCELED" ||
        err?.message === "canceled";
      
      if (!isCanceled) {
        console.error("❌ 데이터 로드 실패:", err);
        setError("데이터 로드 실패: " + (err?.message || err));
      }
    } finally {
      setLoading(false);
    }
  }, [start, end, filterVals]);

  // 최초 연결 후, 현재 필터로 로드
  useEffect(() => {
    if (apiConnected) {
      fetchRowsWithParams("cache");
      loadCsatAnalysis();
    }
  }, [apiConnected, start, end, filterVals, fetchRowsWithParams]);

  // ✅ 별도 이펙트 불필요 (위 이펙트가 start/end/filterVals 변화에 대응)


  window.debugData = { rows, start, end, filterVals };

  // CSAT 코멘트에 userchats 태그 병합 (렌더용)
  const csatTextWithTags = useMemo(() => {
    if (!csatCommentsRaw) return null;
    try {
      // 인덱스: userChatId / (userId+날짜) / userId 타임라인
      const byChatId = new Map();
      const byUserDay = new Map();
      const byUserList = new Map();
      filteredRows.forEach((r) => {
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
  }, [csatCommentsRaw, rows]);

  // ✅ 문의량 차트 데이터: filteredRows 직접 사용
  const chartData = useMemo(() => {
    if (filteredRows.length === 0) return [];

    console.log("🔍 chartData 계산 시작:", { rowsLength: filteredRows.length, dateGroup: csDateGroup });
    if (csDateGroup === "월간") {
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
  }, [filteredRows, csDateGroup]);

  // ✅ 평균 응답/해결 시간 차트: 주간/월간 각각 집계
  const avgTimeMonthly = useMemo(() => {
    if (filteredRows.length === 0) return [];
    const map = {};
    for (const item of filteredRows) {
      const d = parseTsKST(item.firstAskedAt);
      if (!d) continue;
      const monthKey = `${d.getFullYear()}-${d.getMonth()+1}`;
      if (!map[monthKey]) {
        map[monthKey] = {
          x축: `${d.getMonth()+1}월`,
          operationWaitingTime: [], operationAvgReplyTime: [],
          operationTotalReplyTime: [], operationResolutionTime: []
        };
      }
      const pushIf = (arr, v) => { const n = timeToSec(v); if (n > 0) arr.push(n); };
      pushIf(map[monthKey].operationWaitingTime, item.operationWaitingTime);
      pushIf(map[monthKey].operationAvgReplyTime, item.operationAvgReplyTime);
      pushIf(map[monthKey].operationTotalReplyTime, item.operationTotalReplyTime);
      pushIf(map[monthKey].operationResolutionTime, item.operationResolutionTime);
    }
    return Object.values(map).map(m => ({
      x축: m.x축,
      operationWaitingTime: (avg(m.operationWaitingTime) || null),
      operationAvgReplyTime: (avg(m.operationAvgReplyTime) || null),
      operationTotalReplyTime: (avg(m.operationTotalReplyTime) || null),
      operationResolutionTime: (avg(m.operationResolutionTime) || null),
    })).sort((a,b) => parseInt(a.x축) - parseInt(b.x축));
  }, [filteredRows]);

  const avgTimeWeekly = useMemo(() => {
    if (filteredRows.length === 0) return [];
    // 월요일 시작 주차
    const toWeekStart = (d) => {
      const day = d.getDay();              // 0(일)~6(토)
      const diffToMon = (day + 6) % 7;     // 월=0
      const w = new Date(d);
      w.setDate(d.getDate() - diffToMon);
      w.setHours(0,0,0,0);
      return w;
    };
    const map = new Map(); // key(ms) -> bucket
    for (const item of filteredRows) {
      const d = parseTsKST(item.firstAskedAt);
      if (!d) continue;
      const ws = toWeekStart(d);
      const k = ws.getTime();
      if (!map.has(k)) {
        map.set(k, {
          __wStart: ws,
          operationWaitingTime: [], operationAvgReplyTime: [],
          operationTotalReplyTime: [], operationResolutionTime: []
        });
      }
      const b = map.get(k);
      const pushIf = (arr, v) => { const n = timeToSec(v); if (n > 0) arr.push(n); };
      pushIf(b.operationWaitingTime, item.operationWaitingTime);
      pushIf(b.operationAvgReplyTime, item.operationAvgReplyTime);
      pushIf(b.operationTotalReplyTime, item.operationTotalReplyTime);
      pushIf(b.operationResolutionTime, item.operationResolutionTime);
    }
    const mmdd = (d) => `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}`;
    const rows = Array.from(map.values()).sort((a,b) => a.__wStart - b.__wStart).map(b => {
      const wEnd = new Date(b.__wStart); wEnd.setDate(wEnd.getDate()+6);
      return {
        x축: `${mmdd(b.__wStart)}~${mmdd(wEnd)}`,
        주레이블: `${mmdd(b.__wStart)}~${mmdd(wEnd)}`,
        주보조레이블: "",  // 월 경계 표시용
        월레이블: `${b.__wStart.getMonth() + 1}월`, // 월 레이블 추가
        operationWaitingTime: (avg(b.operationWaitingTime) || null),
        operationAvgReplyTime: (avg(b.operationAvgReplyTime) || null),
        operationTotalReplyTime: (avg(b.operationTotalReplyTime) || null),
        operationResolutionTime: (avg(b.operationResolutionTime) || null),
        __wStart: b.__wStart
      };
    });
    // 월 경계 라벨
    let prev = "";
    rows.forEach(r => {
      const tag = `${r.__wStart.getFullYear()}-${String(r.__wStart.getMonth()+1).padStart(2,"0")}`;
      if (tag !== prev) r.주보조레이블 = tag;
      prev = tag;
      delete r.__wStart;
    });
    return rows;
  }, [filteredRows]);

  // ✅ 통계: filteredRows 직접 사용
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

  // ✅ 문의유형별 차트: filteredRows 직접 사용
  const inquiryTypeData = useMemo(() => {
    if (filteredRows.length === 0) return [];

    console.log("🔍 inquiryTypeData 계산 시작:", {
      rowsLength: filteredRows.length,
      filters문의유형: filterVals.문의유형,
    });

    if (normArr(filterVals.문의유형).length === 0) {
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
        if (normArr(filterVals.문의유형).includes(itemType)) {
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
  }, [filteredRows, filterVals.문의유형]);

  // ✅ 고객유형 2차/도넛: filteredRows 직접 사용
  const customerTypeData = useMemo(() => {
    if (filteredRows.length === 0) return [];

    console.log("🔍 customerTypeData 계산 시작:", {
      rowsLength: filteredRows.length,
      filters고객유형: filterVals.고객유형,
    });

    if (normArr(filterVals.고객유형).length === 0) {
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
        if (normArr(filterVals.고객유형).includes(itemType)) {
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
  }, [filteredRows, filterVals.고객유형]);

  const customerDonutData = useMemo(() => {
    if (filteredRows.length === 0) return [];

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
  }, [filteredRows]);

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
              onClick={() => fetchRowsWithParams("update")}
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
          {["CS", "CSAT", ...(isAdmin ? ["Cache"] : [])].map((t) => (
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
            <FilterPanel
              options={{
                고객유형: customerTypeOptions,
                문의유형: inquiryTypeOptions,
                서비스유형: serviceTypeOptions,
                고객유형_2차: customerType2Options,
                문의유형_2차: inquiryType2Options,
                서비스유형_2차: serviceType2Options,
                subtype_maps: subtypeMaps
              }}
              values={filterVals}
              setValues={setFilterVals}
            />

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
                <div style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "space-between", 
                  marginBottom: "16px" 
                }}>
                  <h3 style={{ color: "#333", fontWeight: "600", margin: 0 }}>CS 문의량</h3>
                  <div style={{
                    display: "inline-flex",
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    overflow: "hidden"
                  }}>
                    {["주간", "월간"].map(g => (
                      <button
                        key={g}
                        onClick={() => setCsDateGroup(g)}
                        style={{
                          padding: "6px 10px",
                          fontSize: 12,
                          border: "none",
                          background: csDateGroup === g ? "#111827" : "#fff",
                          color: csDateGroup === g ? "#fff" : "#374151",
                          cursor: "pointer"
                        }}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
                <ChartSection
                  data={chartData}
                  label=""
                  xLabel="x축"
                  yLabel="문의량"
                  loading={loading}
                  dateGroup={csDateGroup}
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
                {(mlDateGroup === "주간" ? avgTimeWeekly : avgTimeMonthly).length > 0 ? (
                  <>
                    <div style={{ 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "space-between", 
                      marginBottom: "16px" 
                    }}>
                      <h3 style={{ color: "#333", fontWeight: "600", margin: 0 }}>평균 응답/해결 시간</h3>
                      <div style={{
                        display: "inline-flex",
                        border: "1px solid #e5e7eb",
                        borderRadius: 8,
                        overflow: "hidden"
                      }}>
                        {["주간", "월간"].map(g => (
                          <button
                            key={g}
                            onClick={() => setMlDateGroup(g)}
                            style={{
                              padding: "6px 10px",
                              fontSize: 12,
                              border: "none",
                              background: mlDateGroup === g ? "#111827" : "#fff",
                              color: mlDateGroup === g ? "#fff" : "#374151",
                              cursor: "pointer"
                            }}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ fontSize: "12px", color: "#999", marginBottom: "16px" }}>y축 단위: 분(min)</div>

                    <MultiLineChartSection
                      data={mlDateGroup === "주간" ? avgTimeWeekly : avgTimeMonthly}
                      lines={[
                        { key: "operationWaitingTime", color: "#007bff", label: "첫응답시간" },
                        { key: "operationAvgReplyTime", color: "#28a745", label: "평균응답시간" },
                        { key: "operationTotalReplyTime", color: "#ffc107", label: "총응답시간" },
                        { key: "operationResolutionTime", color: "#dc3545", label: "해결시간" },
                      ]}
                      label=""
                      xLabel="x축"
                      loading={loading}
                      dateGroup={mlDateGroup}
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
                    {normArr(filterVals.문의유형).length > 0 && ` (${normArr(filterVals.문의유형).join(", ")} > 세부분류)`}
                  </h3>
                  <ChartSection
                    data={inquiryTypeData}
                    label=""
                    xLabel={normArr(filterVals.문의유형).length === 0 ? "문의유형" : "문의유형_2차"}
                    yLabel="문의량"
                    loading={loading}
                    chartType="horizontalBar"
                    height={350}
                    width={600}
                  />
                </div>
              )}

              {normArr(filterVals.고객유형).length === 0 ? (
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
                      {normArr(filterVals.고객유형).length > 0 && ` (${normArr(filterVals.고객유형).join(", ")} > 세부분류)`}
                    </h3>
                    <ChartSection
                      data={customerTypeData}
                      label=""
                      xLabel={normArr(filterVals.고객유형).length === 0 ? "고객유형" : "고객유형_2차"}
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

            {/* 처리유형 분석 섹션 */}
            <div style={{ marginTop: 20 }}>
              <div style={{
                display:"grid",
                gridTemplateColumns:"1fr 1fr",
                gap:"16px",
                alignItems:"stretch",
                marginBottom:"24px"
              }}>
                <div>
                  <HandlingTypeDonut rows={filteredRows} width={520} height={320} />
                </div>
                <div>
                  {/* 2시간 단위 구간: 0~120 / 120~240 / 240~360 / 360~480 / 480~600 / 600~720 / 720+ */}
                  <SLAStackBar
                    rows={filteredRows}
                    width={520}
                    height={300}
                    bins={[0,120,240,360,480,600,720,Infinity]}
                  />
                </div>
              </div>

              {/* ▶ 처리유형별 처리시간 분포(겹쳐 그린 커브, x=분, y=건수) */}
              <div style={{ marginBottom: "24px" }}>
                <HandlingLeadtimeDensity
                  rows={filteredRows}
                  bins={40}
                  smoothWindow={2}
                  yBreak={{ from: 10, to: 40, gap: 12 }}   // ⬅️ 0~10 크게, 10~40 절단, 위는 압축
                />
              </div>
            </div>
          </>
        )}

        {/* CSAT 탭 */}
        {activeTab === "CSAT" && (
          <Suspense fallback={<div style={{padding:20}}>로딩 중...</div>}>
            {csatData && csatData.status === "success" ? (
              <>
                <CSatChartSection csatSummary={csatData.요약} totalResponses={csatData.총응답수} />

                {csatData?.유형별 && Object.keys(csatData.유형별).length > 0 && (
                  <CSatTypeChartSection typeScores={csatData.유형별} typeLabel="유형별" />
                )}

                {/* CSAT 상세 의견 */}
                <CSatCommentsSection csatTextWithTags={csatTextWithTags} />

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
          </Suspense>
        )}

        {/* Cache 탭 */}
        {activeTab === "Cache" && (
          <Suspense fallback={<div style={{padding:20}}>로딩 중...</div>}>
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
              {isAdmin && (
                <button
                  onClick={() => {/* 더 이상 프론트에서 호출하지 않음 (관리자만 서버에서) */}}
                  disabled
                  style={{
                    padding: "12px 24px",
                    backgroundColor: "#dc3545",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "not-allowed",
                    fontSize: "16px",
                    fontWeight: "bold",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                    opacity: 0.5,
                  }}
                >
                  관리자 전용 (서버에서 실행)
                </button>
              )}
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
          </Suspense>
        )}
      </div>
    </div>
  );
}

export default App;
