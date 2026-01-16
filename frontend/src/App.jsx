import React, { lazy, Suspense, useState, useEffect, useMemo, useRef, useCallback } from "react";
import { fetchUserchats, checkApiHealth, refreshCache, fetchCloudCustomers, createCloudCustomer, updateCloudCustomer, deleteCloudCustomer, fetchRefundCustomers, createRefundCustomer, updateRefundCustomer, deleteRefundCustomer, fetchManagerStats, fetchCrmCustomers, createCrmCustomer, updateCrmCustomer, deleteCrmCustomer } from "./api";
import FilterPanel from "./components/FilterPanel";
import ChartSection from "./components/ChartSection";
import MultiLineChartSection from "./components/MultiLineChartSection";
import HandlingTypeDonut from "./components/HandlingTypeDonut";
import SLAStackBar from "./components/SLAStackBar";
// 박스플롯/비즈웜 대신 분포 커브 차트
import HandlingLeadtimeDensity from "./components/HandlingLeadtimeDensity";
import DayOfWeekTimeDistributionChart from "./components/DayOfWeekTimeDistributionChart";
import CloudCrmChartsSection from "./components/CloudCrmChartsSection";
import CloudAmountSummaryCard from "./components/CloudAmountSummaryCard";
import CloudTimelineChart from "./components/CloudTimelineChart";
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const CSatChartSection = lazy(() => import("./components/CSatChartSection"));
const CSatTypeChartSection = lazy(() => import("./components/CSatTypeChartSection"));
const CSatCommentsSection = lazy(() => import("./components/CSatCommentsSection"));
const EliceTrackItemTrendChart = lazy(() => import("./components/EliceTrackItemTrendChart"));
const UnitySatisfactionChart = lazy(() => import("./components/UnitySatisfactionChart"));
const UnitySatisfactionRadar = lazy(() => import("./components/UnitySatisfactionRadar"));
const KdtTpm3SatisfactionChart = lazy(() => import("./components/KdtTpm3SatisfactionChart"));
const KdtTpm3SatisfactionRadar = lazy(() => import("./components/KdtTpm3SatisfactionRadar"));

// Cloud 사용자원 매핑 (코드 -> 설명)
const resourceMap = {
  "G-NBTHS-1440": "8 x B200 180GB SXM",
  "G-NBTHS-720": "4 x B200 180GB SXM",
  "G-NBTHS-180": "B200 180GB SXM",
  "G-NHHS-640": "8 x H100 80GB SXM",
  "G-NHHS-320": "4 x H100 80GB SXM",
  "G-NHHS-160": "2 x H100 80GB SXM",
  "G-NHHS-80": "H100 80GB SXM",
  "G-NAHP-320": "4 x A100 80GB PCIe",
  "G-NAHP-160": "2 x A100 80GB PCIe",
  "G-NAHP-80": "A100 80GB PCIe",
  "G-NAHPM-40": "A100 80GB PCIe MIG 3g-40GB",
  "G-NAHPM-20": "A100 80GB PCIe MIG 2g-20GB",
  "G-NAHPM-10": "A100 80GB PCIe MIG 1g-10GB"
};

// 자원 그룹화
const resourceGroups = {
  "B200 180GB SXM": [
    { code: "G-NBTHS-1440", label: "G-NBTHS-1440 (8 x B200 180GB SXM) [NEW]" },
    { code: "G-NBTHS-720", label: "G-NBTHS-720 (4 x B200 180GB SXM) [NEW]" },
    { code: "G-NBTHS-180", label: "G-NBTHS-180 (B200 180GB SXM) [NEW]" }
  ],
  "H100 80GB SXM": [
    { code: "G-NHHS-640", label: "G-NHHS-640 (8 x H100 80GB SXM)" },
    { code: "G-NHHS-320", label: "G-NHHS-320 (4 x H100 80GB SXM)" },
    { code: "G-NHHS-160", label: "G-NHHS-160 (2 x H100 80GB SXM)" },
    { code: "G-NHHS-80", label: "G-NHHS-80 (H100 80GB SXM)" }
  ],
  "A100 80GB PCIe": [
    { code: "G-NAHP-320", label: "G-NAHP-320 (4 x A100 80GB PCIe)" },
    { code: "G-NAHP-160", label: "G-NAHP-160 (2 x A100 80GB PCIe)" },
    { code: "G-NAHP-80", label: "G-NAHP-80 (A100 80GB PCIe)" },
    { code: "G-NAHPM-40", label: "G-NAHPM-40 (A100 80GB PCIe MIG 3g-40GB)" },
    { code: "G-NAHPM-20", label: "G-NAHPM-20 (A100 80GB PCIe MIG 2g-20GB)" },
    { code: "G-NAHPM-10", label: "G-NAHPM-10 (A100 80GB PCIe MIG 1g-10GB)" }
  ]
};

// ===== App.jsx 파일 최상단(컴포넌트 밖) =====
const normArr = (v) =>
  Array.isArray(v) ? v.filter((x) => x && x !== "전체") : (v && v !== "전체" ? [v] : []);
const joinOrAll = (vals) => (Array.isArray(vals) && vals.length > 0) ? vals.join(",") : "전체";
const primaryOf = (s) => (typeof s === "string" && s.includes("/")) ? s.split("/")[0].trim() : (s || "");

// CSV 다운로드 유틸리티 함수
const convertToCSV = (data, headers) => {
  if (!data || data.length === 0) {
    return "";
  }
  
  // 헤더 행 생성
  const headerRow = headers.map(h => `"${h.label}"`).join(",");
  
  // 데이터 행 생성
  const dataRows = data.map(row => {
    return headers.map(h => {
      let value = row[h.key] || "";
      
      // 배열인 경우 처리 (예: 사용자원)
      if (Array.isArray(value)) {
        value = value.map(item => {
          if (typeof item === 'object' && item.resource) {
            return `${resourceMap[item.resource] || item.resource}${item.quantity ? ` (${item.quantity}개)` : ''}`;
          }
          return item;
        }).join("; ");
      }
      
      // 객체인 경우 JSON 문자열로 변환
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        value = JSON.stringify(value);
      }
      
      // 문자열로 변환하고 따옴표 이스케이프
      value = String(value).replace(/"/g, '""');
      return `"${value}"`;
    }).join(",");
  });
  
  return [headerRow, ...dataRows].join("\n");
};

const downloadCSV = (csvContent, filename) => {
  // BOM 추가 (한글 깨짐 방지)
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

function buildFilterParams(start, end, filterVals) {
  const effectiveChild = (parentVals, childVals) => {
    const p = normArr(parentVals);
    if (p.length === 0) return "전체";
    const c = normArr(childVals);
    return c.length ? c.join(",") : "전체";
  };
  const serviceType = joinOrAll(filterVals.서비스유형);
  const serviceSubtype = effectiveChild(filterVals.서비스유형, filterVals.서비스유형_2차);
  const inquiryType = joinOrAll(filterVals.문의유형);
  const inquirySubtype = effectiveChild(filterVals.문의유형, filterVals.문의유형_2차);
  const customerType = joinOrAll(filterVals.고객유형);
  const customerSubtype = effectiveChild(filterVals.고객유형, filterVals.고객유형_2차);
  return {
    start, end, refresh_mode: "cache",
    serviceType,
    serviceType2: serviceSubtype,
    serviceSubtype,
    serviceSubtypes: serviceSubtype,
    "서비스유형": serviceType,
    "서비스유형_2차": serviceSubtype,
    inquiryType,
    inquiryType2: inquirySubtype,
    inquirySubtype,
    inquirySubtypes: inquirySubtype,
    "문의유형": inquiryType,
    "문의유형_2차": inquirySubtype,
    customerType,
    customerType2: customerSubtype,
    customerSubtype,
    customerSubtypes: customerSubtype,
    "고객유형": customerType,
    "고객유형_2차": customerSubtype,
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
  const [managerDateGroup, setManagerDateGroup] = useState("월간"); // 담당자별 문의량 차트용
  const [start, setStart] = useState(oneMonthAgoStr);
  const [end, setEnd] = useState(todayStr);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [apiConnected, setApiConnected] = useState(null);
  const [csatData, setCsatData] = useState(null);
  const [managerStats, setManagerStats] = useState(null);
  const [activeTab, setActiveTab] = useState("CS");
  const [subTab, setSubTab] = useState("Unity"); // 서브 탭
  const [lectureSatisfactionTab, setLectureSatisfactionTab] = useState("엘리스트랙");
  const [eliceTrackTab, setEliceTrackTab] = useState("");
  const [eliceTrackFiles, setEliceTrackFiles] = useState([]); // 엘리스트랙 엑셀 파일 목록
  const [selectedFile, setSelectedFile] = useState(null); // 선택된 파일
  const [coachData, setCoachData] = useState([]); // 코치 데이터
  const [sortField, setSortField] = useState("평균점수"); // 정렬 필드
  const [sortDirection, setSortDirection] = useState("desc"); // 정렬 방향
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, title: "", count: 0, percent: 0 });
  const [, setHoverIndex] = useState(null); // 값은 안 쓰므로 변수 생략
  const [direction, setDirection] = useState(["IB"]); // IB/OB 필터 (기본값: IB만)
  
  // 서비스유형/문의유형별 문의량 테이블 정렬 상태
  const [serviceInquiryTableSortField, setServiceInquiryTableSortField] = useState("문의량");
  const [serviceInquiryTableSortDirection, setServiceInquiryTableSortDirection] = useState("desc");

  // Cloud 고객 데이터 상태
  const [cloudCustomers, setCloudCustomers] = useState([]);
  const [refundCustomers, setRefundCustomers] = useState([]); // 환불 고객 목록
  const [cloudSubTab, setCloudSubTab] = useState("차트"); // Cloud 서브탭 (차트/테이블/환불/CRM)
  const [crmCustomers, setCrmCustomers] = useState([]); // CRM 고객(기관) 목록
  const [crmFilters, setCrmFilters] = useState({
    기관생성일: "전체",
    카드미등록발송일자: "전체",
    카드등록일: "전체",
    크레딧충전일: "전체",
  });
  const [showResourceDetail, setShowResourceDetail] = useState(false); // 자원 상세보기 토글
  const [salesFunnelDateFilter, setSalesFunnelDateFilter] = useState("전체"); // 세일즈 퍼널 날짜 필터: 전체/오늘/1주/1개월
  
  // 테이블 필터링 상태
  const [tableFilters, setTableFilters] = useState({
    사업유형: "전체",
    세일즈단계: "전체", 
    사용유형: "전체"
  });
  const [tableSearch, setTableSearch] = useState("");
  const [tableSearchField, setTableSearchField] = useState("이름");
  const [cloudFormData, setCloudFormData] = useState({
    사업유형: "",
    이름: "",
    기관: "",
    기관페이지링크: "",
    이메일: "",
    문의날짜: "",
    계약날짜: "",
    세일즈단계: "",
    사용자원: [],  // 배열로 변경: [{resource: string, quantity: number}]
    사용유형: "",
    사용기간시작일: "",
    사용기간종료일: "",
    종료일없음: false,
    "견적/정산금액": "",
    비고: ""
  });
  const [refundFormData, setRefundFormData] = useState({
    이름: "",
    기관: "",
    기관링크: "",
    크레딧충전금액: "",
    환불금액: "",
    환불날짜: "",
    환불사유: ""
  });
  const [crmFormData, setCrmFormData] = useState({
    기관생성일: "",
    성함: "",
    이메일: "",
    카드미등록발송일자: "",
    카드등록일: "",
    크레딧충전일: "",
    기관링크: "",
    기관어드민링크: ""
  });
  const [refundReasonOption, setRefundReasonOption] = useState("");
  const refundReasonOptions = ["자원할당불가", "연구종료", "결제방식 변경", "자동충전", "기타"];
  const [refundEditingIndex, setRefundEditingIndex] = useState(null);
  const [refundEditingId, setRefundEditingId] = useState(null);
  const [crmEditingIndex, setCrmEditingIndex] = useState(null);
  const [crmEditingId, setCrmEditingId] = useState(null);

  const crmDateOptions = useMemo(() => {
    const make = (key) =>
      Array.from(
        new Set(
          (crmCustomers || [])
            .map((c) => (c?.[key] || "").trim())
            .filter((v) => v && v !== "undefined" && v !== "null")
        )
      ).sort();
    return {
      기관생성일: make("기관생성일"),
      카드미등록발송일자: make("카드미등록발송일자"),
      카드등록일: make("카드등록일"),
      크레딧충전일: make("크레딧충전일"),
    };
  }, [crmCustomers]);

  const filteredCrmCustomers = useMemo(() => {
    const match = (c, key) =>
      crmFilters[key] === "전체" || (c?.[key] || "").trim() === crmFilters[key];
    return (crmCustomers || []).filter(
      (c) =>
        match(c, "기관생성일") &&
        match(c, "카드미등록발송일자") &&
        match(c, "카드등록일") &&
        match(c, "크레딧충전일")
    );
  }, [crmCustomers, crmFilters]);
  const [cloudEditingIndex, setCloudEditingIndex] = useState(null);
  const [resourceDropdownOpen, setResourceDropdownOpen] = useState(false); // 사용자원 드롭다운 열림 상태

  const resetRefundForm = useCallback(() => {
    setRefundFormData({
      이름: "",
      기관: "",
      기관링크: "",
      크레딧충전금액: "",
      환불금액: "",
      환불날짜: "",
      환불사유: ""
    });
    setRefundReasonOption("");
    setRefundEditingIndex(null);
    setRefundEditingId(null);
  }, []);

  const resetCrmForm = useCallback(() => {
    setCrmFormData({
      기관생성일: "",
      성함: "",
      이메일: "",
      카드미등록발송일자: "",
      카드등록일: "",
      크레딧충전일: "",
      기관링크: "",
      기관어드민링크: ""
    });
    setCrmEditingIndex(null);
    setCrmEditingId(null);
  }, []);

  const loadRefundCustomers = useCallback(async () => {
    if (!apiConnected) return;
    try {
      const data = await fetchRefundCustomers();
      const rows = Array.isArray(data)
        ? data
        : Array.isArray(data?.customers)
          ? data.customers
          : Array.isArray(data?.data)
            ? data.data
            : [];
      setRefundCustomers(rows);
    } catch (err) {
      console.error("환불 고객 데이터 로드 실패:", err);
    }
  }, [apiConnected]);

  const loadCrmCustomers = useCallback(async () => {
    if (!apiConnected) return;
    try {
      const data = await fetchCrmCustomers();
      const rows = Array.isArray(data)
        ? data
        : Array.isArray(data?.customers)
          ? data.customers
          : Array.isArray(data?.data)
            ? data.data
            : [];
      setCrmCustomers(rows);
    } catch (err) {
      console.error("CRM 고객 데이터 로드 실패:", err);
    }
  }, [apiConnected]);

  const buildRefundPayload = useCallback(
    (data) => ({
      이름: (data.이름 || "").trim(),
      기관: (data.기관 || "").trim(),
      기관링크: (data.기관링크 || "").trim(),
      크레딧충전금액: (data.크레딧충전금액 || "").trim(),
      환불금액: (data.환불금액 || "").toString().trim(),
      환불날짜: (data.환불날짜 || "").trim(),
      환불사유: (data.환불사유 || "").trim()
    }),
    []
  );

  const buildCrmPayload = useCallback(
    (data) => ({
      기관생성일: (data.기관생성일 || "").trim(),
      성함: (data.성함 || "").trim(),
      이메일: (data.이메일 || "").trim(),
      카드미등록발송일자: (data.카드미등록발송일자 || "").trim(),
      카드등록일: (data.카드등록일 || "").trim(),
      크레딧충전일: (data.크레딧충전일 || "").trim(),
      기관링크: (data.기관링크 || "").trim(),
      기관어드민링크: (data.기관어드민링크 || "").trim()
    }),
    []
  );

  const handleRefundSubmit = useCallback(async () => {
    if (!refundFormData.이름 || !refundFormData.환불금액 || !refundFormData.환불날짜) {
      alert("이름, 환불금액, 환불날짜는 필수 입력 항목입니다.");
      return;
    }

    const payload = buildRefundPayload(refundFormData);

    try {
      if (refundEditingId != null) {
        await updateRefundCustomer(refundEditingId, payload);
      } else if (refundEditingIndex !== null) {
        const target = refundCustomers[refundEditingIndex];
        if (target?.id != null) {
          await updateRefundCustomer(target.id, payload);
        } else {
          await createRefundCustomer(payload);
        }
      } else {
        await createRefundCustomer(payload);
      }

      await loadRefundCustomers();
      resetRefundForm();
      setSuccess("✅ 환불 정보가 저장되었습니다.");
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      console.error("환불 정보 저장 실패:", err);
      alert("환불 정보를 저장하는 데 실패했습니다. 다시 시도해주세요.");
    }
  }, [buildRefundPayload, loadRefundCustomers, refundCustomers, refundEditingId, refundEditingIndex, refundFormData, resetRefundForm]);

  const handleCrmSubmit = useCallback(async () => {
    if (!crmFormData.성함 || !crmFormData.이메일) {
      alert("성함과 이메일은 필수 입력 항목입니다.");
      return;
    }

    const payload = buildCrmPayload(crmFormData);

    try {
      if (crmEditingId != null) {
        await updateCrmCustomer(crmEditingId, payload);
      } else if (crmEditingIndex !== null) {
        const target = crmCustomers[crmEditingIndex];
        if (target?.id != null) {
          await updateCrmCustomer(target.id, payload);
        } else {
          await createCrmCustomer(payload);
        }
      } else {
        await createCrmCustomer(payload);
      }

      await loadCrmCustomers();
      resetCrmForm();
      setSuccess("✅ CRM 정보가 저장되었습니다.");
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      console.error("CRM 정보 저장 실패:", err);
      alert("CRM 정보를 저장하는 데 실패했습니다. 다시 시도해주세요.");
    }
  }, [buildCrmPayload, loadCrmCustomers, crmCustomers, crmEditingId, crmEditingIndex, crmFormData, resetCrmForm]);

  const handleRefundDelete = useCallback(
    async (refundId) => {
      if (!window.confirm("정말 삭제하시겠습니까?")) return;
      try {
        await deleteRefundCustomer(refundId);
        await loadRefundCustomers();
        if (refundEditingId === refundId) {
          resetRefundForm();
        }
      } catch (err) {
        console.error("환불 정보 삭제 실패:", err);
        alert("환불 정보를 삭제하는 데 실패했습니다. 다시 시도해주세요.");
      }
    },
    [loadRefundCustomers, refundEditingId, resetRefundForm]
  );

  const handleCrmDelete = useCallback(
    async (crmId) => {
      if (!window.confirm("정말 삭제하시겠습니까?")) return;
      try {
        await deleteCrmCustomer(crmId);
        await loadCrmCustomers();
        if (crmEditingId === crmId) {
          resetCrmForm();
        }
      } catch (err) {
        console.error("CRM 정보 삭제 실패:", err);
        alert("CRM 정보를 삭제하는 데 실패했습니다. 다시 시도해주세요.");
      }
    },
    [loadCrmCustomers, crmEditingId, resetCrmForm]
  );

  const handleCrmEdit = useCallback(
    (customer, index) => {
      if (!customer) return;
      const { id, ...rest } = customer;
      setCrmFormData({
        기관생성일: rest.기관생성일 || "",
        성함: rest.성함 || "",
        이메일: rest.이메일 || "",
        카드미등록발송일자: rest.카드미등록발송일자 || "",
        카드등록일: rest.카드등록일 || "",
        크레딧충전일: rest.크레딧충전일 || "",
        기관링크: rest.기관링크 || "",
        기관어드민링크: rest.기관어드민링크 || ""
      });
      setCrmEditingIndex(index);
      setCrmEditingId(id ?? null);
    },
    []
  );

  const handleRefundEdit = useCallback(
    (customer, index) => {
      if (!customer) return;
      const { id, ...rest } = customer;
      setRefundFormData({
        이름: rest.이름 || "",
        기관: rest.기관 || "",
        기관링크: rest.기관링크 || "",
        크레딧충전금액: rest.크레딧충전금액 || rest.원계약금액 || "",
        환불금액: rest.환불금액 || "",
        환불날짜: rest.환불날짜 || "",
        환불사유: rest.환불사유 || ""
      });
      const matchedOption = refundReasonOptions.includes(rest.환불사유)
        ? rest.환불사유
        : rest.환불사유
          ? "기타"
          : "";
      setRefundReasonOption(matchedOption);
      setRefundEditingIndex(index);
      setRefundEditingId(id ?? null);
    },
    [refundReasonOptions]
  );

  const handleRefundCancel = useCallback(() => {
    resetRefundForm();
  }, [resetRefundForm]);

  // ✅ rows = userchats (서버에서 이미 필터링된 최종 데이터)
  const rows = useMemo(() => {
    const result = Array.isArray(userchats) ? userchats : [];
    // 디버깅: rows 단계에서 OB 데이터 확인
    const phoneRows = result.filter(r => r.mediumType === "phone");
    if (phoneRows.length > 0) {
      const obRows = phoneRows.filter(r => r.direction === "OB");
      const obWithoutFirstAskedAt = obRows.filter(r => !r.firstAskedAt);
      console.log("[DEBUG rows] rows 단계 OB 데이터:", {
        totalRows: result.length,
        totalPhone: phoneRows.length,
        totalOB: obRows.length,
        obWithoutFirstAskedAt: obWithoutFirstAskedAt.length,
        obSamples: obRows.slice(0, 3).map(r => ({
          direction: r.direction,
          firstAskedAt: r.firstAskedAt,
          createdAt: r.createdAt
        }))
      });
    }
    return result;
  }, [userchats]);

  // 샘플 코치 데이터 로드 (실제로는 DB에서 가져와야 함)
  useEffect(() => {
    // 임시 샘플 데이터 - 실제로는 API 호출로 DB에서 가져와야 함
    const sampleCoachData = [
      {
        코치명: "김코치",
        강의과목: "React 기초",
        평균점수: 4.7,
        강의내용: 4.8,
        강의방식: 4.6,
        소통: 4.5,
        피드백: 4.9
      },
      {
        코치명: "이코치",
        강의과목: "JavaScript 심화",
        평균점수: 4.2,
        강의내용: 4.3,
        강의방식: 4.1,
        소통: 4.0,
        피드백: 4.4
      },
      {
        코치명: "박코치",
        강의과목: "Node.js",
        평균점수: 3.8,
        강의내용: 3.9,
        강의방식: 3.7,
        소통: 3.6,
        피드백: 4.0
      },
      {
        코치명: "최코치",
        강의과목: "Python 기초",
        평균점수: 4.9,
        강의내용: 4.9,
        강의방식: 4.8,
        소통: 5.0,
        피드백: 4.9
      },
      {
        코치명: "정코치",
        강의과목: "데이터베이스",
        평균점수: 4.1,
        강의내용: 4.2,
        강의방식: 4.0,
        소통: 4.1,
        피드백: 4.0
      }
    ];
    
    setCoachData(sampleCoachData);
  }, []);

  // ✅ 서버가 필터를 적용해 준 결과 + direction 필터
  const filteredRows = useMemo(() => {
    if (direction.length === 0) return []; // 아무것도 선택 안하면 빈 배열
    if (direction.length === 2) return rows; // 둘 다 선택하면 전체
    // IB 또는 OB만 선택한 경우
    return rows.filter(r => {
      // direction이 없는 구 데이터는 IB로 간주
      const rowDirection = r.direction || "IB";
      return direction.includes(rowDirection);
    });
  }, [rows, direction]);

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

  async function loadManagerStats() {
    try {
      console.log("[MANAGER_STATS] 로드 시작:", { start, end });
      const data = await fetchManagerStats(start, end);
      console.log("[MANAGER_STATS] 로드 완료:", data);
      setManagerStats(data);
    } catch (err) {
      console.error("담당자 통계 로드 실패:", err);
      setManagerStats(null);
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
      loadManagerStats();
    }
  }, [apiConnected, start, end, filterVals, fetchRowsWithParams]);

  // Cloud 고객 데이터 로드
  useEffect(() => {
    const loadCloudCustomers = async () => {
      if (apiConnected && activeTab === "Cloud") {
        try {
          const data = await fetchCloudCustomers();
          // 백엔드에서 반환된 데이터 형식에 따라 처리
          const customers = Array.isArray(data) ? data : (data?.customers || data?.data || []);
          setCloudCustomers(customers);
        } catch (err) {
          console.error("Cloud 고객 데이터 로드 실패:", err);
          // API 실패 시에도 에러 표시하지 않음 (최초 접속 시 에러 방지)
        }
      }
    };
    loadCloudCustomers();
  }, [apiConnected, activeTab]);

  useEffect(() => {
    if (apiConnected && activeTab === "Cloud") {
      loadRefundCustomers();
    }
  }, [apiConnected, activeTab, loadRefundCustomers]);

  useEffect(() => {
    if (apiConnected && activeTab === "Cloud") {
      loadCrmCustomers();
    }
  }, [apiConnected, activeTab, loadCrmCustomers]);

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
  }, [csatCommentsRaw, filteredRows]);

  // ✅ 문의량 차트 데이터: filteredRows 직접 사용
  const chartData = useMemo(() => {
    console.log("🔍 chartData 계산 시작:", { rowsLength: filteredRows.length, dateGroup: csDateGroup, start, end });
    
    // 시작일과 종료일 파싱
    const startDate = new Date(start);
    const endDate = new Date(end);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
    
    if (csDateGroup === "월간") {
      // filteredRows가 비어있어도 start부터 end까지 모든 월 생성
      const map = {};
      filteredRows.forEach((item) => {
        const d = parseTsKST(item.firstAskedAt || item.createdAt);
        if (!d) return;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!map[key]) map[key] = { 
          x축: `${d.getMonth() + 1}월`, 
          문의량: 0,
          year: d.getFullYear(),
          month: d.getMonth() + 1
        };
        map[key].문의량 += 1;
      });
      
      // start부터 end까지 모든 월 생성
      const allMonths = [];
      const current = new Date(startDate);
      while (current <= endDate) {
        const year = current.getFullYear();
        const month = current.getMonth() + 1;
        const key = `${year}-${String(month).padStart(2, "0")}`;
        allMonths.push({
          key,
          x축: `${month}월`,
          문의량: map[key]?.문의량 || 0,
          year,
          month
        });
        // 다음 달로 이동
        current.setMonth(current.getMonth() + 1);
        current.setDate(1);
      }
      
      const data = allMonths.map(item => ({
        label: item.x축,
        value: item.문의량
      }));
      return data;
    } else {
      const map = {};
      
      filteredRows.forEach((item) => {
        const d = parseTsKST(item.firstAskedAt);
        if (!d) return;
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay()); // 일요일 시작
        weekStart.setHours(0, 0, 0, 0);
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
            weekStartDate: new Date(weekStart),
          };
        }
        map[weekKey].문의량 += 1;
      });
      
      // start부터 end까지 모든 주 생성
      const allWeeks = [];
      const current = new Date(startDate);
      // 시작일이 속한 주의 일요일로 이동
      const startDay = current.getDay();
      current.setDate(current.getDate() - startDay);
      current.setHours(0, 0, 0, 0);
      
      while (current <= endDate) {
        const weekKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(
          current.getDate()
        ).padStart(2, "0")}`;
        const isFirstWeekOfMonth = current.getDate() <= 7;
        const existing = map[weekKey];
        
        allWeeks.push({
          key: weekKey,
          x축: `${current.getMonth() + 1}/${current.getDate()}`,
          문의량: existing?.문의량 || 0,
          월레이블: isFirstWeekOfMonth ? `${current.getMonth() + 1}월` : null,
          month: current.getMonth() + 1,
          weekStartDate: new Date(current),
        });
        
        // 다음 주로 이동 (7일 후)
        current.setDate(current.getDate() + 7);
      }

      const data = allWeeks.map((item, index) => {
        let 월레이블 = item.월레이블;
        if (!월레이블 && index > 0) {
          const prevItem = allWeeks[index - 1];
          if (prevItem && prevItem.month !== item.month) {
            월레이블 = `${item.month}월`;
          }
        }
        if (index === 0 && !월레이블) 월레이블 = `${item.month}월`;
        return { label: item.x축, value: item.문의량, 월레이블 };
      });
      return data;
    }
  }, [filteredRows, csDateGroup, start, end]);

  // ✅ 서비스 유형별 개별 차트 데이터
  const serviceTypeChartData = useMemo(() => {
    if (filteredRows.length === 0) return {};
    
    const selectedServiceTypes = normArr(filterVals.서비스유형);
    if (selectedServiceTypes.length <= 1) return {}; // 1개 이하면 개별 차트 불필요
    
    // 시작일과 종료일 파싱
    const startDate = new Date(start);
    const endDate = new Date(end);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
    
    const result = {};
    
    selectedServiceTypes.forEach(serviceType => {
      const serviceRows = filteredRows.filter(row => {
        const tags = pickTagsFromRow(row);
        return tags.서비스유형 === serviceType;
      });
      
      if (csDateGroup === "월간") {
        const map = {};
        serviceRows.forEach((item) => {
          const d = parseTsKST(item.firstAskedAt);
          if (!d) return;
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          if (!map[key]) map[key] = { 
            x축: `${d.getMonth() + 1}월`, 
            문의량: 0,
            year: d.getFullYear(),
            month: d.getMonth() + 1
          };
          map[key].문의량 += 1;
        });
        
        // start부터 end까지 모든 월 생성
        const allMonths = [];
        const current = new Date(startDate);
        while (current <= endDate) {
          const year = current.getFullYear();
          const month = current.getMonth() + 1;
          const key = `${year}-${String(month).padStart(2, "0")}`;
          allMonths.push({
            key,
            x축: `${month}월`,
            문의량: map[key]?.문의량 || 0,
            year,
            month
          });
          current.setMonth(current.getMonth() + 1);
          current.setDate(1);
        }
        
        result[serviceType] = allMonths.map(item => ({
          label: item.x축,
          value: item.문의량
        }));
      } else {
        const map = {};
        
        serviceRows.forEach((item) => {
          const d = parseTsKST(item.firstAskedAt);
          if (!d) return;
          const weekStart = new Date(d);
          weekStart.setDate(d.getDate() - d.getDay());
          weekStart.setHours(0, 0, 0, 0);
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
              weekStartDate: new Date(weekStart),
            };
          }
          map[weekKey].문의량 += 1;
        });
        
        // start부터 end까지 모든 주 생성
        const allWeeks = [];
        const current = new Date(startDate);
        const startDay = current.getDay();
        current.setDate(current.getDate() - startDay);
        current.setHours(0, 0, 0, 0);
        
        while (current <= endDate) {
          const weekKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(
            current.getDate()
          ).padStart(2, "0")}`;
          const isFirstWeekOfMonth = current.getDate() <= 7;
          const existing = map[weekKey];
          
          allWeeks.push({
            key: weekKey,
            x축: `${current.getMonth() + 1}/${current.getDate()}`,
            문의량: existing?.문의량 || 0,
            월레이블: isFirstWeekOfMonth ? `${current.getMonth() + 1}월` : null,
            month: current.getMonth() + 1,
            weekStartDate: new Date(current),
          });
          
          current.setDate(current.getDate() + 7);
        }

        result[serviceType] = allWeeks.map((item, index) => {
          let 월레이블 = item.월레이블;
          if (!월레이블 && index > 0) {
            const prevItem = allWeeks[index - 1];
            if (prevItem && prevItem.month !== item.month) {
              월레이블 = `${item.month}월`;
            }
          }
          if (index === 0 && !월레이블) 월레이블 = `${item.month}월`;
          return { label: item.x축, value: item.문의량, 월레이블 };
        });
      }
    });
    
    return result;
  }, [filteredRows, csDateGroup, start, end, filterVals.서비스유형]);

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
    const filterStartDate = new Date(start); // 사용자가 선택한 시작 날짜
    
    const rows = Array.from(map.values())
      .filter(b => b.__wStart >= filterStartDate) // 시작 날짜 이전의 주 제외
      .sort((a,b) => a.__wStart - b.__wStart)
      .map(b => {
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
  }, [filteredRows, start]);

  // ✅ 담당자별 기간별 문의량 집계 (멀티라인 차트용)
  // 주의: direction 필터를 무시하고 모든 데이터 사용 (담당자별 통계는 전체 데이터 필요)
  const managerChartData = useMemo(() => {
    // filteredRows 대신 rows 사용 (direction 필터 무시)
    const allRows = rows; // direction 필터 적용 전의 모든 데이터 사용
    
    // 디버깅: 전체 rows에서 direction과 mediumType 분포 확인
    const phoneRows = allRows.filter(r => r.mediumType === "phone");
    if (phoneRows.length > 0) {
      const directionCounts = phoneRows.reduce((acc, r) => {
        const dir = r.direction || "없음";
        acc[dir] = (acc[dir] || 0) + 1;
        return acc;
      }, {});
      console.log("[DEBUG] 유선(phone) 데이터 direction 분포:", directionCounts);
      console.log("[DEBUG] 유선(phone) 샘플 데이터:", phoneRows.slice(0, 5).map(r => ({
        direction: r.direction,
        mediumType: r.mediumType,
        firstAskedAt: r.firstAskedAt,
        createdAt: r.createdAt,
        userId: r.userId
      })));
      
      // OB 데이터가 있는지, firstAskedAt이 없는 데이터가 있는지 확인
      const obRows = phoneRows.filter(r => r.direction === "OB");
      const rowsWithoutFirstAskedAt = phoneRows.filter(r => !r.firstAskedAt);
      const obRowsWithoutFirstAskedAt = obRows.filter(r => !r.firstAskedAt);
      console.log("[DEBUG OB] OB 데이터 분석:", {
        totalOB: obRows.length,
        obWithoutFirstAskedAt: obRowsWithoutFirstAskedAt.length,
        totalPhoneWithoutFirstAskedAt: rowsWithoutFirstAskedAt.length,
        obSamples: obRows.slice(0, 3).map(r => ({
          direction: r.direction,
          firstAskedAt: r.firstAskedAt,
          createdAt: r.createdAt,
          parseFirstAskedAt: parseTsKST(r.firstAskedAt),
          parseCreatedAt: parseTsKST(r.createdAt),
          parseCreatedAtOrFirst: parseTsKST(r.createdAt || r.firstAskedAt)
        }))
      });
    }
    
    // 담당자 ID -> 이름 매핑
    const managerMap = {
      "557191": "안예은",
      "547547": "조용준",
      "531024": "우지훈"
    };

    // 담당자 매칭 함수 (백엔드 로직과 동일: managerIds와 assigneeId가 일치하는지 확인)
    const checkManagerMatch = (managerIds, assigneeId) => {
      if (!assigneeId || !managerIds) return false;
      
      const assigneeStr = String(assigneeId).trim();
      
      // managerIds가 배열인 경우
      if (Array.isArray(managerIds)) {
        for (const mgrId of managerIds) {
          if (String(mgrId).trim() === assigneeStr) {
            return true;
          }
        }
        return false;
      } else {
        return String(managerIds).trim() === assigneeStr;
      }
    };

    // managerIds에 특정 담당자 ID가 포함되어 있는지 확인
    const hasManagerId = (managerIds, targetId) => {
      if (!managerIds) return false;
      
      const targetStr = String(targetId).trim();
      
      if (Array.isArray(managerIds)) {
        for (const mgrId of managerIds) {
          if (String(mgrId).trim() === targetStr) {
            return true;
          }
        }
        return false;
      } else {
        return String(managerIds).trim() === targetStr;
      }
    };

    // 백엔드와 동일하게: managerIds와 assigneeId가 일치하는 행만 필터링
    const matchedRows = allRows.filter(row => {
      return checkManagerMatch(row.managerIds, row.assigneeId);
    });

    // 담당자별로 분류 (백엔드 로직과 동일)
    const byManager = {
      "안예은": [],
      "조용준": [],
      "우지훈": []
    };

    // 각 담당자별로 managerIds에 해당 담당자 ID가 포함된 행을 분류
    matchedRows.forEach(row => {
      const managerIds = row.managerIds || [];
      for (const [managerId, managerName] of Object.entries(managerMap)) {
        if (hasManagerId(managerIds, managerId)) {
          if (byManager[managerName]) {
            byManager[managerName].push(row);
          }
        }
      }
    });

    // 디버깅: OB 데이터 매칭 확인
    const obRowsInMatched = matchedRows.filter(r => r.mediumType === "phone" && r.direction === "OB");
    const obRowsByManager = {
      "안예은": byManager["안예은"].filter(r => r.mediumType === "phone" && r.direction === "OB").length,
      "조용준": byManager["조용준"].filter(r => r.mediumType === "phone" && r.direction === "OB").length,
      "우지훈": byManager["우지훈"].filter(r => r.mediumType === "phone" && r.direction === "OB").length
    };
    console.log("[DEBUG OB 매칭] 담당자별 유선 OB 집계:", {
      matchedRows_total: matchedRows.length,
      obRowsInMatched: obRowsInMatched.length,
      obRowsByManager: obRowsByManager,
      allRows_total: allRows.length,
      allRows_ob: allRows.filter(r => r.mediumType === "phone" && r.direction === "OB").length
    });

    // 시작일과 종료일 파싱
    const startDate = new Date(start);
    const endDate = new Date(end);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    // 4가지 타입별 차트 데이터 생성
    const result = {
      total: [],      // 전체
      chat: [],       // 채팅
      phoneIB: [],    // 유선(IB)
      phoneOB: []     // 유선(OB)
    };

    const managers = ["조용준", "우지훈", "안예은"];

    if (managerDateGroup === "월간") {
      // 월간 집계
      const allMonths = [];
      const current = new Date(startDate);
      while (current <= endDate) {
        const year = current.getFullYear();
        const month = current.getMonth() + 1;
        const key = `${year}-${String(month).padStart(2, "0")}`;
        allMonths.push({ key, year, month, label: `${month}월` });
        current.setMonth(current.getMonth() + 1);
        current.setDate(1);
      }

      managers.forEach(managerName => {
        const managerRows = byManager[managerName] || [];

        // 전체
        const totalData = allMonths.map(({ key, label }) => {
          const count = managerRows.filter(row => {
            const d = parseTsKST(row.createdAt || row.firstAskedAt);
            if (!d) return false;
            const rowKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            return rowKey === key;
          }).length;
          return { x축: label, [managerName]: count, 월레이블: label };
        });

        // 채팅: mediumType !== "phone" (백엔드 로직과 동일)
        const chatData = allMonths.map(({ key, label }) => {
          const count = managerRows.filter(row => {
            const d = parseTsKST(row.createdAt || row.firstAskedAt);
            if (!d) return false;
            const rowKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            return rowKey === key && row.mediumType !== "phone";
          }).length;
          return { x축: label, [managerName]: count, 월레이블: label };
        });

        // 유선(IB): mediumType === "phone" && direction === "IB" (백엔드 로직과 동일)
        // 유선의 경우 같은 날짜에 같은 userId가 여러 번 나타나면 중복 제거 필요
        const phoneIBData = allMonths.map(({ key, label }) => {
          const phoneRows = managerRows.filter(row => {
            const d = parseTsKST(row.createdAt || row.firstAskedAt);
            if (!d) return false;
            const rowKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            return rowKey === key && row.mediumType === "phone";
          });
          
          // 같은 날짜에 같은 userId가 여러 번 나타나면 중복 제거 (백엔드 로직)
          const seen = new Set();
          const uniquePhoneRows = phoneRows.filter(row => {
            const d = parseTsKST(row.createdAt || row.firstAskedAt);
            if (!d) return false;
            const dateKey = d.toISOString().split('T')[0];
            const userId = row.userId || '';
            const key = `${dateKey}_${userId}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          
          const count = uniquePhoneRows.filter(row => row.direction === "IB").length;
          return { x축: label, [managerName]: count, 월레이블: label };
        });

        // 유선(OB): mediumType === "phone" && direction === "OB" (백엔드 로직과 동일)
        const phoneOBData = allMonths.map(({ key, label }) => {
          const phoneRows = managerRows.filter(row => {
            const d = parseTsKST(row.createdAt || row.firstAskedAt);
            if (!d) return false;
            const rowKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            return rowKey === key && row.mediumType === "phone";
          });
          
          // 같은 날짜에 같은 userId가 여러 번 나타나면 중복 제거 (백엔드 로직)
          const seen = new Set();
          const uniquePhoneRows = phoneRows.filter(row => {
            const d = parseTsKST(row.createdAt || row.firstAskedAt);
            if (!d) return false;
            const dateKey = d.toISOString().split('T')[0];
            const userId = row.userId || '';
            const key = `${dateKey}_${userId}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          
          // 디버깅: OB 데이터 확인
          if (managerName === "조용준" && label === "11월") {
            const obRows = uniquePhoneRows.filter(row => row.direction === "OB");
            const ibRows = uniquePhoneRows.filter(row => row.direction === "IB");
            const noDirectionRows = uniquePhoneRows.filter(row => !row.direction || (row.direction !== "IB" && row.direction !== "OB"));
            
            // 전체 rows에서 OB 데이터 확인
            const allOBRows = allRows.filter(r => {
              const d = parseTsKST(r.createdAt || r.firstAskedAt);
              if (!d) return false;
              const rowKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
              return rowKey === key && r.mediumType === "phone" && r.direction === "OB";
            });
            
            console.log(`[DEBUG OB] ${managerName} ${label}:`, {
              managerRows_total: managerRows.length,
              phoneRows_before_dedup: phoneRows.length,
              uniquePhoneRows: uniquePhoneRows.length,
              ob: obRows.length,
              ib: ibRows.length,
              noDirection: noDirectionRows.length,
              allOBRows_in_allRows: allOBRows.length,
              obSamples: obRows.slice(0, 3).map(r => ({
                direction: r.direction,
                mediumType: r.mediumType,
                firstAskedAt: r.firstAskedAt,
                createdAt: r.createdAt,
                userId: r.userId,
                managerIds: r.managerIds,
                assigneeId: r.assigneeId
              })),
              allDirections: [...new Set(uniquePhoneRows.map(r => r.direction))]
            });
          }
          
          const count = uniquePhoneRows.filter(row => row.direction === "OB").length;
          return { x축: label, [managerName]: count, 월레이블: label };
        });

        // 데이터 병합
        totalData.forEach((item, idx) => {
          if (!result.total[idx]) result.total[idx] = { x축: item.x축, 월레이블: item.월레이블 };
          result.total[idx][managerName] = item[managerName];
        });
        chatData.forEach((item, idx) => {
          if (!result.chat[idx]) result.chat[idx] = { x축: item.x축, 월레이블: item.월레이블 };
          result.chat[idx][managerName] = item[managerName];
        });
        phoneIBData.forEach((item, idx) => {
          if (!result.phoneIB[idx]) result.phoneIB[idx] = { x축: item.x축, 월레이블: item.월레이블 };
          result.phoneIB[idx][managerName] = item[managerName];
        });
        phoneOBData.forEach((item, idx) => {
          if (!result.phoneOB[idx]) result.phoneOB[idx] = { x축: item.x축, 월레이블: item.월레이블 };
          result.phoneOB[idx][managerName] = item[managerName];
        });
      });
    } else {
      // 주간 집계
      const allWeeks = [];
      const current = new Date(startDate);
      const startDay = current.getDay();
      current.setDate(current.getDate() - startDay);
      current.setHours(0, 0, 0, 0);

      while (current <= endDate) {
        const weekEnd = new Date(current);
        weekEnd.setDate(current.getDate() + 6);
        const isFirstWeekOfMonth = current.getDate() <= 7;
        const mmdd = (d) => `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}`;
        const weekKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`;
        
        allWeeks.push({
          key: weekKey,
          label: `${mmdd(current)}~${mmdd(weekEnd)}`,
          월레이블: isFirstWeekOfMonth ? `${current.getMonth() + 1}월` : null,
          weekStart: new Date(current),
          month: current.getMonth() + 1
        });
        current.setDate(current.getDate() + 7);
      }

      managers.forEach(managerName => {
        const managerRows = byManager[managerName] || [];

        // 전체
        const totalData = allWeeks.map(({ key, label, 월레이블, weekStart }) => {
          const count = managerRows.filter(row => {
            const d = parseTsKST(row.createdAt || row.firstAskedAt);
            if (!d) return false;
            const rowWeekStart = new Date(d);
            rowWeekStart.setDate(d.getDate() - d.getDay());
            rowWeekStart.setHours(0, 0, 0, 0);
            const rowKey = `${rowWeekStart.getFullYear()}-${String(rowWeekStart.getMonth() + 1).padStart(2, "0")}-${String(rowWeekStart.getDate()).padStart(2, "0")}`;
            return rowKey === key;
          }).length;
          return { x축: label, [managerName]: count, 월레이블, weekStart };
        });

        // 채팅: mediumType !== "phone" (백엔드 로직과 동일)
        const chatData = allWeeks.map(({ key, label, 월레이블, weekStart }) => {
          const count = managerRows.filter(row => {
            const d = parseTsKST(row.createdAt || row.firstAskedAt);
            if (!d) return false;
            const rowWeekStart = new Date(d);
            rowWeekStart.setDate(d.getDate() - d.getDay());
            rowWeekStart.setHours(0, 0, 0, 0);
            const rowKey = `${rowWeekStart.getFullYear()}-${String(rowWeekStart.getMonth() + 1).padStart(2, "0")}-${String(rowWeekStart.getDate()).padStart(2, "0")}`;
            return rowKey === key && row.mediumType !== "phone";
          }).length;
          return { x축: label, [managerName]: count, 월레이블, weekStart };
        });

        // 유선(IB): mediumType === "phone" && direction === "IB" (백엔드 로직과 동일)
        // 유선의 경우 같은 날짜에 같은 userId가 여러 번 나타나면 중복 제거 필요
        const phoneIBData = allWeeks.map(({ key, label, 월레이블, weekStart }) => {
          const phoneRows = managerRows.filter(row => {
            const d = parseTsKST(row.createdAt || row.firstAskedAt);
            if (!d) return false;
            const rowWeekStart = new Date(d);
            rowWeekStart.setDate(d.getDate() - d.getDay());
            rowWeekStart.setHours(0, 0, 0, 0);
            const rowKey = `${rowWeekStart.getFullYear()}-${String(rowWeekStart.getMonth() + 1).padStart(2, "0")}-${String(rowWeekStart.getDate()).padStart(2, "0")}`;
            return rowKey === key && row.mediumType === "phone";
          });
          
          // 같은 날짜에 같은 userId가 여러 번 나타나면 중복 제거 (백엔드 로직)
          const seen = new Set();
          const uniquePhoneRows = phoneRows.filter(row => {
            const d = parseTsKST(row.createdAt || row.firstAskedAt);
            if (!d) return false;
            const dateKey = d.toISOString().split('T')[0];
            const userId = row.userId || '';
            const uniqueKey = `${dateKey}_${userId}`;
            if (seen.has(uniqueKey)) return false;
            seen.add(uniqueKey);
            return true;
          });
          
          const count = uniquePhoneRows.filter(row => row.direction === "IB").length;
          return { x축: label, [managerName]: count, 월레이블, weekStart };
        });

        // 유선(OB): mediumType === "phone" && direction === "OB" (백엔드 로직과 동일)
        const phoneOBData = allWeeks.map(({ key, label, 월레이블, weekStart }) => {
          const phoneRows = managerRows.filter(row => {
            const d = parseTsKST(row.createdAt || row.firstAskedAt);
            if (!d) return false;
            const rowWeekStart = new Date(d);
            rowWeekStart.setDate(d.getDate() - d.getDay());
            rowWeekStart.setHours(0, 0, 0, 0);
            const rowKey = `${rowWeekStart.getFullYear()}-${String(rowWeekStart.getMonth() + 1).padStart(2, "0")}-${String(rowWeekStart.getDate()).padStart(2, "0")}`;
            return rowKey === key && row.mediumType === "phone";
          });
          
          // 같은 날짜에 같은 userId가 여러 번 나타나면 중복 제거 (백엔드 로직)
          const seen = new Set();
          const uniquePhoneRows = phoneRows.filter(row => {
            const d = parseTsKST(row.createdAt || row.firstAskedAt);
            if (!d) return false;
            const dateKey = d.toISOString().split('T')[0];
            const userId = row.userId || '';
            const uniqueKey = `${dateKey}_${userId}`;
            if (seen.has(uniqueKey)) return false;
            seen.add(uniqueKey);
            return true;
          });
          
          // 디버깅: OB 데이터 확인 (주간)
          if (managerName === "조용준" && label.includes("11/")) {
            const obRows = uniquePhoneRows.filter(row => row.direction === "OB");
            const ibRows = uniquePhoneRows.filter(row => row.direction === "IB");
            const noDirectionRows = uniquePhoneRows.filter(row => !row.direction || (row.direction !== "IB" && row.direction !== "OB"));
            console.log(`[DEBUG OB 주간] ${managerName} ${label}:`, {
              totalPhone: uniquePhoneRows.length,
              ob: obRows.length,
              ib: ibRows.length,
              noDirection: noDirectionRows.length,
              allDirections: [...new Set(uniquePhoneRows.map(r => r.direction))]
            });
          }
          
          const count = uniquePhoneRows.filter(row => row.direction === "OB").length;
          return { x축: label, [managerName]: count, 월레이블, weekStart };
        });

        // 데이터 병합
        totalData.forEach((item, idx) => {
          if (!result.total[idx]) result.total[idx] = { x축: item.x축, 월레이블: item.월레이블 };
          result.total[idx][managerName] = item[managerName];
        });
        chatData.forEach((item, idx) => {
          if (!result.chat[idx]) result.chat[idx] = { x축: item.x축, 월레이블: item.월레이블 };
          result.chat[idx][managerName] = item[managerName];
        });
        phoneIBData.forEach((item, idx) => {
          if (!result.phoneIB[idx]) result.phoneIB[idx] = { x축: item.x축, 월레이블: item.월레이블 };
          result.phoneIB[idx][managerName] = item[managerName];
        });
        phoneOBData.forEach((item, idx) => {
          if (!result.phoneOB[idx]) result.phoneOB[idx] = { x축: item.x축, 월레이블: item.월레이블 };
          result.phoneOB[idx][managerName] = item[managerName];
        });
      });
    }

    // 각 데이터에 담당자가 없는 경우 0으로 설정
    managers.forEach(managerName => {
      result.total.forEach(item => {
        if (!(managerName in item)) item[managerName] = 0;
      });
      result.chat.forEach(item => {
        if (!(managerName in item)) item[managerName] = 0;
      });
      result.phoneIB.forEach(item => {
        if (!(managerName in item)) item[managerName] = 0;
      });
      result.phoneOB.forEach(item => {
        if (!(managerName in item)) item[managerName] = 0;
      });
    });

    return result;
  }, [filteredRows, managerDateGroup, start, end]);

  // ✅ 통계: filteredRows 직접 사용
  const statistics = useMemo(() => {
    const totalInquiries = filteredRows.length;

    const firstResponseTimes = filteredRows.map((i) => timeToSec(i.operationWaitingTime)).filter((t) => t > 0);
    const avgFirstResponseTime =
      firstResponseTimes.length > 0
        ? Math.round((firstResponseTimes.reduce((s, t) => s + t, 0) / firstResponseTimes.length) * 100) / 100
        : 0;

    const resolutionTimes = filteredRows.map((i) => timeToSec(i.operationResolutionTime)).filter((t) => t > 0);
    const avgResolutionTime =
      resolutionTimes.length > 0
        ? Math.round((resolutionTimes.reduce((s, t) => s + t, 0) / resolutionTimes.length) * 100) / 100
        : 0;

    // 자체해결 비율 계산 (처리유형 비율 차트와 동일 로직)
    const pickHandlingTag = (row) => {
      const tags = row?.tags || [];
      for (const t of tags) {
        if (typeof t !== "string") continue;
        const norm = t.replace(/\s+/g, "");
        if (norm.startsWith("처리유형/")) return t;
      }
      return null;
    };
    const parseType = (tag) => {
      if (!tag) return null;
      const parts = tag.split("/").map(s => s.trim());
      if (parts.length < 2) return null;
      return parts[1]; // top 레벨만 반환
    };
    
    const handlingTypeCounts = new Map();
    filteredRows.forEach(r => {
      const tag = pickHandlingTag(r);
      const type = parseType(tag);
      if (!type || type === "기타") return; // 태그 없거나 기타 제외
      handlingTypeCounts.set(type, (handlingTypeCounts.get(type) || 0) + 1);
    });
    
    const totalWithHandlingType = Array.from(handlingTypeCounts.values()).reduce((sum, v) => sum + v, 0);
    const selfResolvedCount = handlingTypeCounts.get("자체해결") || 0;
    const selfResolvedRate = totalWithHandlingType > 0 ? (selfResolvedCount / totalWithHandlingType) * 100 : 0;

    return {
      총문의수: totalInquiries,
      평균첫응답시간: avgFirstResponseTime,
      평균해결시간: avgResolutionTime,
      자체해결비율: selfResolvedRate,
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

  // ✅ 서비스유형/문의유형/문의유형(세부) 테이블 데이터 (기간 필터 적용)
  const serviceInquiryTableData = useMemo(() => {
    if (filteredRows.length === 0) return [];

    // 서비스유형, 문의유형, 문의유형_2차 조합별 집계
    const map = new Map(); // key: "서비스유형|문의유형|문의유형_2차"
    
    filteredRows.forEach((row) => {
      const tags = pickTagsFromRow(row);
      const serviceType = tags.서비스유형 || "미분류";
      const inquiryType = tags.문의유형 || "미분류";
      let inquiryType2 = tags.문의유형_2차 || "";
      
      // 문의유형이 "/"로 구분되어 있으면 첫 부분만 사용
      let inquiryType1 = inquiryType;
      if (inquiryType.includes("/")) {
        inquiryType1 = inquiryType.split("/")[0].trim();
        if (!inquiryType2) {
          inquiryType2 = inquiryType.split("/").slice(1).join("/").trim();
        }
      }
      
      const key = `${serviceType}|${inquiryType1}|${inquiryType2 || "미분류"}`;
      
      if (!map.has(key)) {
        map.set(key, {
          서비스유형: serviceType,
          문의유형: inquiryType1,
          문의유형_2차: inquiryType2 || "미분류",
          문의량: 0,
          총응답시간: [],
          평균응답시간: [],
        });
      }
      
      const item = map.get(key);
      item.문의량 += 1;
      
      // 응답시간 계산
      const avgReplyTime = timeToSec(row.operationAvgReplyTime);
      const totalReplyTime = timeToSec(row.operationTotalReplyTime);
      
      if (avgReplyTime > 0) item.평균응답시간.push(avgReplyTime);
      if (totalReplyTime > 0) item.총응답시간.push(totalReplyTime);
    });
    
    const total = filteredRows.length;
    
    // 배열을 평균값으로 변환하고 전체 테이블 데이터 생성
    const result = Array.from(map.values()).map((item) => {
      const avgAvgReplyTime = item.평균응답시간.length > 0
        ? item.평균응답시간.reduce((sum, t) => sum + t, 0) / item.평균응답시간.length
        : null;
      const avgTotalReplyTime = item.총응답시간.length > 0
        ? item.총응답시간.reduce((sum, t) => sum + t, 0) / item.총응답시간.length
        : null;
      
      return {
        서비스유형: item.서비스유형,
        문의유형: item.문의유형,
        문의유형_2차: item.문의유형_2차,
        문의량: item.문의량,
        비율: total > 0 ? ((item.문의량 / total) * 100).toFixed(2) : "0.00",
        평균응답시간: avgAvgReplyTime !== null ? parseFloat((avgAvgReplyTime / 60).toFixed(1)) : null, // 분 단위 (숫자로 변환)
        총응답시간: avgTotalReplyTime !== null ? parseFloat((avgTotalReplyTime / 60).toFixed(1)) : null, // 분 단위 (숫자로 변환)
      };
    }); // 정렬은 별도 useMemo에서 처리
    
    return result;
  }, [filteredRows]);

  // ✅ 서비스유형/문의유형별 문의량 테이블 정렬된 데이터
  const sortedServiceInquiryTableData = useMemo(() => {
    if (serviceInquiryTableData.length === 0) return [];

    const sorted = [...serviceInquiryTableData];

    sorted.sort((a, b) => {
      let aVal, bVal;

      switch (serviceInquiryTableSortField) {
        case "문의량":
          aVal = a.문의량;
          bVal = b.문의량;
          break;
        case "평균응답시간":
          aVal = a.평균응답시간 !== null ? a.평균응답시간 : -Infinity;
          bVal = b.평균응답시간 !== null ? b.평균응답시간 : -Infinity;
          break;
        case "총응답시간":
          aVal = a.총응답시간 !== null ? a.총응답시간 : -Infinity;
          bVal = b.총응답시간 !== null ? b.총응답시간 : -Infinity;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return serviceInquiryTableSortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return serviceInquiryTableSortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [serviceInquiryTableData, serviceInquiryTableSortField, serviceInquiryTableSortDirection]);

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
              onClick={async () => {
                setLoading(true);
                try {
                  const res = await refreshCache(start, end, true, true); // force=true, include_csat=true
                  console.log("✅ 최신화 결과:", res);
                  await fetchRowsWithParams("cache"); // 최신화 후 캐시 데이터 다시 로드
                  await loadCsatAnalysis(); // CSAT 데이터도 다시 로드
                  await loadManagerStats(); // 담당자 통계도 다시 로드
                  setSuccess("✅ 캐시 최신화 완료 (CSAT 포함)");
                  setTimeout(() => setSuccess(null), 2000);
                } catch (err) {
                  setError("❌ 캐시 최신화 실패: " + (err?.message || err));
                } finally {
                  setLoading(false);
                }
              }}
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
          {["CS", "CSAT", "교육만족도", "Cloud"].map((t) => (
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
                { label: "평균 해결시간", value: `${statistics.평균해결시간?.toFixed(1) || 0}분`, color: "#28a745" },
                { label: "자체해결 비율", value: `${statistics.자체해결비율?.toFixed(1) || 0}%`, color: "#6f42c1" },
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
              direction={direction}
              onDirectionChange={setDirection}
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
                  multiLineData={serviceTypeChartData}
                  showTotalLine={true}
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

              {/* ▶ CS 요일별/시간별 분포 차트 */}
              <div style={{ marginBottom: "24px" }}>
                <DayOfWeekTimeDistributionChart rows={filteredRows} />
              </div>
            </div>

            {/* 서비스유형/문의유형별 문의량 테이블 */}
            {serviceInquiryTableData.length > 0 && (
              <div style={{ marginBottom: "24px" }}>
                <div
                  style={{
                    backgroundColor: "white",
                    padding: "20px",
                    borderRadius: "12px",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                  }}
                >
                  <h3 style={{ marginBottom: "16px", color: "#333", fontWeight: "600" }}>
                    서비스유형/문의유형별 문의량 ({filteredRows.length}건)
                  </h3>
                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: "13px",
                      }}
                    >
                      <thead>
                        <tr style={{ backgroundColor: "#f8f9fa" }}>
                          <th
                            style={{
                              padding: "12px",
                              textAlign: "left",
                              borderBottom: "2px solid #dee2e6",
                              fontWeight: "600",
                              color: "#495057",
                            }}
                          >
                            서비스유형
                          </th>
                          <th
                            style={{
                              padding: "12px",
                              textAlign: "left",
                              borderBottom: "2px solid #dee2e6",
                              fontWeight: "600",
                              color: "#495057",
                            }}
                          >
                            문의유형
                          </th>
                          <th
                            style={{
                              padding: "12px",
                              textAlign: "left",
                              borderBottom: "2px solid #dee2e6",
                              fontWeight: "600",
                              color: "#495057",
                            }}
                          >
                            문의유형(세부)
                          </th>
                          <th
                            onClick={() => {
                              if (serviceInquiryTableSortField === "평균응답시간") {
                                setServiceInquiryTableSortDirection(
                                  serviceInquiryTableSortDirection === "asc" ? "desc" : "asc"
                                );
                              } else {
                                setServiceInquiryTableSortField("평균응답시간");
                                setServiceInquiryTableSortDirection("desc");
                              }
                            }}
                            style={{
                              padding: "12px",
                              textAlign: "right",
                              borderBottom: "2px solid #dee2e6",
                              fontWeight: "600",
                              color: "#495057",
                              cursor: "pointer",
                              userSelect: "none",
                            }}
                          >
                            평균응답시간{" "}
                            {serviceInquiryTableSortField === "평균응답시간"
                              ? serviceInquiryTableSortDirection === "asc"
                                ? "↑"
                                : "↓"
                              : "↕"}
                          </th>
                          <th
                            onClick={() => {
                              if (serviceInquiryTableSortField === "총응답시간") {
                                setServiceInquiryTableSortDirection(
                                  serviceInquiryTableSortDirection === "asc" ? "desc" : "asc"
                                );
                              } else {
                                setServiceInquiryTableSortField("총응답시간");
                                setServiceInquiryTableSortDirection("desc");
                              }
                            }}
                            style={{
                              padding: "12px",
                              textAlign: "right",
                              borderBottom: "2px solid #dee2e6",
                              fontWeight: "600",
                              color: "#495057",
                              cursor: "pointer",
                              userSelect: "none",
                            }}
                          >
                            총응답시간{" "}
                            {serviceInquiryTableSortField === "총응답시간"
                              ? serviceInquiryTableSortDirection === "asc"
                                ? "↑"
                                : "↓"
                              : "↕"}
                          </th>
                          <th
                            onClick={() => {
                              if (serviceInquiryTableSortField === "문의량") {
                                setServiceInquiryTableSortDirection(
                                  serviceInquiryTableSortDirection === "asc" ? "desc" : "asc"
                                );
                              } else {
                                setServiceInquiryTableSortField("문의량");
                                setServiceInquiryTableSortDirection("desc");
                              }
                            }}
                            style={{
                              padding: "12px",
                              textAlign: "right",
                              borderBottom: "2px solid #dee2e6",
                              fontWeight: "600",
                              color: "#495057",
                              cursor: "pointer",
                              userSelect: "none",
                            }}
                          >
                            문의량{" "}
                            {serviceInquiryTableSortField === "문의량"
                              ? serviceInquiryTableSortDirection === "asc"
                                ? "↑"
                                : "↓"
                              : "↕"}
                          </th>
                          <th
                            style={{
                              padding: "12px",
                              textAlign: "right",
                              borderBottom: "2px solid #dee2e6",
                              fontWeight: "600",
                              color: "#495057",
                            }}
                          >
                            비율
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedServiceInquiryTableData.map((row, idx) => (
                          <tr
                            key={idx}
                            style={{
                              borderBottom: "1px solid #e9ecef",
                              backgroundColor: idx % 2 === 0 ? "#ffffff" : "#f8f9fa",
                            }}
                          >
                            <td style={{ padding: "12px", color: "#495057" }}>
                              {row.서비스유형}
                            </td>
                            <td style={{ padding: "12px", color: "#495057" }}>
                              {row.문의유형}
                            </td>
                            <td style={{ padding: "12px", color: "#495057" }}>
                              {row.문의유형_2차}
                            </td>
                            <td style={{ padding: "12px", textAlign: "right", color: "#495057" }}>
                              {row.평균응답시간 !== null ? `${row.평균응답시간}분` : "-"}
                            </td>
                            <td style={{ padding: "12px", textAlign: "right", color: "#495057" }}>
                              {row.총응답시간 !== null ? `${row.총응답시간}분` : "-"}
                            </td>
                            <td style={{ padding: "12px", textAlign: "right", color: "#495057", fontWeight: "600" }}>
                              {row.문의량}
                            </td>
                            <td style={{ padding: "12px", textAlign: "right", color: "#495057" }}>
                              {row.비율}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* 담당자별 통계 섹션 */}
            <div style={{ marginTop: "24px" }}>
              {/* 담당자별 문의량 멀티라인 차트들 */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "16px",
                marginBottom: "24px"
              }}>
                {/* 전체 */}
                <MultiLineChartSection
                  data={managerChartData.total}
                  lines={[
                    { key: "조용준", color: "#007bff", label: "조용준" },
                    { key: "우지훈", color: "#28a745", label: "우지훈" },
                    { key: "안예은", color: "#ffc107", label: "안예은" },
                  ]}
                  label="전체"
                  xLabel="x축"
                  loading={loading}
                  dateGroup={managerDateGroup}
                  onDateGroupChange={setManagerDateGroup}
                  unit="건"
                />

                {/* 채팅 */}
                <MultiLineChartSection
                  data={managerChartData.chat}
                  lines={[
                    { key: "조용준", color: "#007bff", label: "조용준" },
                    { key: "우지훈", color: "#28a745", label: "우지훈" },
                    { key: "안예은", color: "#ffc107", label: "안예은" },
                  ]}
                  label="채팅"
                  xLabel="x축"
                  loading={loading}
                  dateGroup={managerDateGroup}
                  onDateGroupChange={setManagerDateGroup}
                  unit="건"
                />

                {/* 유선(IB) */}
                <MultiLineChartSection
                  data={managerChartData.phoneIB}
                  lines={[
                    { key: "조용준", color: "#007bff", label: "조용준" },
                    { key: "우지훈", color: "#28a745", label: "우지훈" },
                    { key: "안예은", color: "#ffc107", label: "안예은" },
                  ]}
                  label="유선(IB)"
                  xLabel="x축"
                  loading={loading}
                  dateGroup={managerDateGroup}
                  onDateGroupChange={setManagerDateGroup}
                  unit="건"
                />

                {/* 유선(OB) */}
                <MultiLineChartSection
                  data={managerChartData.phoneOB}
                  lines={[
                    { key: "조용준", color: "#007bff", label: "조용준" },
                    { key: "우지훈", color: "#28a745", label: "우지훈" },
                    { key: "안예은", color: "#ffc107", label: "안예은" },
                  ]}
                  label="유선(OB)"
                  xLabel="x축"
                  loading={loading}
                  dateGroup={managerDateGroup}
                  onDateGroupChange={setManagerDateGroup}
                  unit="건"
                />
              </div>

              {managerStats && (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "16px",
                  marginBottom: "24px"
                }}>
                  {/* 담당자별 문의유형 비율 표 */}
                  <div
                    style={{
                      backgroundColor: "white",
                      padding: "20px",
                      borderRadius: "12px",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    }}
                  >
                    <h3 style={{ marginBottom: "16px", color: "#333", fontWeight: "600" }}>
                      담당자별 문의유형 비율
                    </h3>
                    <div style={{ overflowX: "auto", maxHeight: "400px", overflowY: "auto" }}>
                      {managerStats.manager_inquiry_types && Object.keys(managerStats.manager_inquiry_types).length > 0 ? (
                        Object.entries(managerStats.manager_inquiry_types).map(([managerId, data]) => (
                        <div key={managerId} style={{ marginBottom: "24px" }}>
                          <div style={{ 
                            fontSize: "14px", 
                            fontWeight: "600", 
                            color: "#374151", 
                            marginBottom: "8px",
                            paddingBottom: "8px",
                            borderBottom: "1px solid #e5e7eb"
                          }}>
                            {data.managerName} (총 {data.total.toLocaleString()}건)
                          </div>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                            <thead>
                              <tr style={{ backgroundColor: "#f9fafb" }}>
                                <th style={{ padding: "8px", textAlign: "left", fontWeight: "600", color: "#6b7280" }}>문의유형</th>
                                <th style={{ padding: "8px", textAlign: "right", fontWeight: "600", color: "#6b7280" }}>건수</th>
                                <th style={{ padding: "8px", textAlign: "right", fontWeight: "600", color: "#6b7280" }}>비율</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.inquiryTypes?.map((item, idx) => (
                                <tr key={idx} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                  <td style={{ padding: "8px", color: "#111827" }}>{item.문의유형}</td>
                                  <td style={{ padding: "8px", textAlign: "right", color: "#111827" }}>
                                    {item.count.toLocaleString()}
                                  </td>
                                  <td style={{ padding: "8px", textAlign: "right", color: "#111827", fontWeight: "500" }}>
                                    {item.ratio}%
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        ))
                      ) : (
                        <div style={{ padding: "20px", textAlign: "center", color: "#6b7280" }}>
                          데이터가 없습니다
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
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

        {/* 교육만족도 탭 */}
        {activeTab === "교육만족도" && (
          <div>
            {/* 교육만족도 서브 탭 */}
            <div
              style={{
                display: "flex",
                borderBottom: "1px solid #e5e7eb",
                backgroundColor: "white",
                marginBottom: "20px",
                borderRadius: "8px 8px 0 0",
              }}
            >
              {["엘리스트랙", "엘리스스쿨", "LXP", "코치대시보드"].map((t) => (
                <button
                  key={t}
                  onClick={() => setLectureSatisfactionTab(t)}
                  style={{
                    padding: "10px 20px",
                    border: "none",
                    backgroundColor: lectureSatisfactionTab === t ? "#28a745" : "transparent",
                    color: lectureSatisfactionTab === t ? "white" : "#495057",
                    cursor: "pointer",
                    borderBottom: lectureSatisfactionTab === t ? "2px solid #28a745" : "none",
                    fontWeight: lectureSatisfactionTab === t ? "600" : "400",
                    fontSize: "14px",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* LXP 서브탭 */}
            {lectureSatisfactionTab === "LXP" && (
              <div
                style={{
                  backgroundColor: "white",
                  padding: "40px",
                  borderRadius: "8px",
                  textAlign: "center",
                  minHeight: "400px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <h3 style={{ marginBottom: "20px", color: "#495057" }}>LXP 교육 만족도</h3>
                <p style={{ color: "#666" }}>LXP 데이터가 준비되면 여기에 표시됩니다.</p>
              </div>
            )}

            {/* 코치 대시보드 서브탭 */}
            {lectureSatisfactionTab === "코치대시보드" && (
              <div
                style={{
                  backgroundColor: "white",
                  padding: "20px",
                  borderRadius: "8px",
                  minHeight: "400px",
                }}
              >
                <h3 style={{ marginBottom: "20px", color: "#333", fontWeight: "600" }}>
                  👨‍🏫 코치 만족도 대시보드
                </h3>
                
                {/* 정렬 컨트롤 */}
                <div style={{ 
                  display: "flex", 
                  gap: "12px", 
                  marginBottom: "20px",
                  alignItems: "center",
                  flexWrap: "wrap"
                }}>
                  <label style={{ fontSize: "14px", fontWeight: "500", color: "#495057" }}>
                    정렬 기준:
                  </label>
                  <select
                    value={sortField}
                    onChange={(e) => setSortField(e.target.value)}
                    style={{
                      padding: "6px 12px",
                      border: "1px solid #ddd",
                      borderRadius: "4px",
                      fontSize: "14px"
                    }}
                  >
                    <option value="평균점수">평균점수</option>
                    <option value="강의과목">강의과목</option>
                    <option value="코치명">코치명</option>
                    <option value="강의내용">강의내용</option>
                    <option value="강의방식">강의방식</option>
                    <option value="소통">소통</option>
                    <option value="피드백">피드백</option>
                  </select>
                  
                  <button
                    onClick={() => setSortDirection(sortDirection === "asc" ? "desc" : "asc")}
                    style={{
                      padding: "6px 12px",
                      backgroundColor: "#007bff",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "14px",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px"
                    }}
                  >
                    {sortDirection === "asc" ? "↑ 오름차순" : "↓ 내림차순"}
                  </button>
                </div>

                {/* 코치 데이터 테이블 */}
                <div style={{ overflowX: "auto" }}>
                  <table style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "14px"
                  }}>
                    <thead>
                      <tr style={{ backgroundColor: "#f8f9fa" }}>
                        <th style={{ 
                          padding: "12px", 
                          textAlign: "left", 
                          borderBottom: "2px solid #dee2e6",
                          fontWeight: "600",
                          color: "#495057"
                        }}>
                          코치명
                        </th>
                        <th style={{ 
                          padding: "12px", 
                          textAlign: "left", 
                          borderBottom: "2px solid #dee2e6",
                          fontWeight: "600",
                          color: "#495057"
                        }}>
                          강의과목
                        </th>
                        <th style={{ 
                          padding: "12px", 
                          textAlign: "center", 
                          borderBottom: "2px solid #dee2e6",
                          fontWeight: "600",
                          color: "#495057"
                        }}>
                          평균점수
                        </th>
                        <th style={{ 
                          padding: "12px", 
                          textAlign: "center", 
                          borderBottom: "2px solid #dee2e6",
                          fontWeight: "600",
                          color: "#495057"
                        }}>
                          강의내용
                        </th>
                        <th style={{ 
                          padding: "12px", 
                          textAlign: "center", 
                          borderBottom: "2px solid #dee2e6",
                          fontWeight: "600",
                          color: "#495057"
                        }}>
                          강의방식
                        </th>
                        <th style={{ 
                          padding: "12px", 
                          textAlign: "center", 
                          borderBottom: "2px solid #dee2e6",
                          fontWeight: "600",
                          color: "#495057"
                        }}>
                          소통
                        </th>
                        <th style={{ 
                          padding: "12px", 
                          textAlign: "center", 
                          borderBottom: "2px solid #dee2e6",
                          fontWeight: "600",
                          color: "#495057"
                        }}>
                          피드백
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {coachData.length > 0 ? (
                        coachData
                          .sort((a, b) => {
                            const aVal = a[sortField];
                            const bVal = b[sortField];
                            
                            if (sortField === "평균점수" || sortField === "강의내용" || sortField === "강의방식" || sortField === "소통" || sortField === "피드백") {
                              const aNum = parseFloat(aVal) || 0;
                              const bNum = parseFloat(bVal) || 0;
                              return sortDirection === "asc" ? aNum - bNum : bNum - aNum;
                            } else {
                              const aStr = String(aVal || "").toLowerCase();
                              const bStr = String(bVal || "").toLowerCase();
                              return sortDirection === "asc" 
                                ? aStr.localeCompare(bStr)
                                : bStr.localeCompare(aStr);
                            }
                          })
                          .map((coach, index) => (
                            <tr key={index} style={{ 
                              borderBottom: "1px solid #e9ecef",
                              backgroundColor: index % 2 === 0 ? "#ffffff" : "#f8f9fa"
                            }}>
                              <td style={{ padding: "12px", fontWeight: "500" }}>
                                {coach.코치명 || "-"}
                              </td>
                              <td style={{ padding: "12px" }}>
                                {coach.강의과목 || "-"}
                              </td>
                              <td style={{ 
                                padding: "12px", 
                                textAlign: "center",
                                fontWeight: "600",
                                color: coach.평균점수 >= 4.5 ? "#28a745" : coach.평균점수 >= 4.0 ? "#ffc107" : "#dc3545"
                              }}>
                                {coach.평균점수 ? coach.평균점수.toFixed(1) : "-"}
                              </td>
                              <td style={{ 
                                padding: "12px", 
                                textAlign: "center",
                                color: coach.강의내용 >= 4.5 ? "#28a745" : coach.강의내용 >= 4.0 ? "#ffc107" : "#dc3545"
                              }}>
                                {coach.강의내용 ? coach.강의내용.toFixed(1) : "-"}
                              </td>
                              <td style={{ 
                                padding: "12px", 
                                textAlign: "center",
                                color: coach.강의방식 >= 4.5 ? "#28a745" : coach.강의방식 >= 4.0 ? "#ffc107" : "#dc3545"
                              }}>
                                {coach.강의방식 ? coach.강의방식.toFixed(1) : "-"}
                              </td>
                              <td style={{ 
                                padding: "12px", 
                                textAlign: "center",
                                color: coach.소통 >= 4.5 ? "#28a745" : coach.소통 >= 4.0 ? "#ffc107" : "#dc3545"
                              }}>
                                {coach.소통 ? coach.소통.toFixed(1) : "-"}
                              </td>
                              <td style={{ 
                                padding: "12px", 
                                textAlign: "center",
                                color: coach.피드백 >= 4.5 ? "#28a745" : coach.피드백 >= 4.0 ? "#ffc107" : "#dc3545"
                              }}>
                                {coach.피드백 ? coach.피드백.toFixed(1) : "-"}
                              </td>
                            </tr>
                          ))
                      ) : (
                        <tr>
                          <td colSpan="7" style={{ 
                            padding: "40px", 
                            textAlign: "center", 
                            color: "#666",
                            fontStyle: "italic"
                          }}>
                            코치 데이터가 없습니다. DB에서 데이터를 불러오는 중...
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* 통계 요약 */}
                {coachData.length > 0 && (
                  <div style={{
                    marginTop: "20px",
                    padding: "16px",
                    backgroundColor: "#f8f9fa",
                    borderRadius: "8px",
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: "16px"
                  }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "24px", fontWeight: "600", color: "#007bff" }}>
                        {coachData.length}
                      </div>
                      <div style={{ fontSize: "12px", color: "#666" }}>총 코치 수</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "24px", fontWeight: "600", color: "#28a745" }}>
                        {coachData.length > 0 ? (coachData.reduce((sum, coach) => sum + (coach.평균점수 || 0), 0) / coachData.length).toFixed(1) : "0.0"}
                      </div>
                      <div style={{ fontSize: "12px", color: "#666" }}>전체 평균</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "24px", fontWeight: "600", color: "#ffc107" }}>
                        {coachData.filter(coach => (coach.평균점수 || 0) >= 4.5).length}
                      </div>
                      <div style={{ fontSize: "12px", color: "#666" }}>우수 코치</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "24px", fontWeight: "600", color: "#dc3545" }}>
                        {coachData.filter(coach => (coach.평균점수 || 0) < 4.0).length}
                      </div>
                      <div style={{ fontSize: "12px", color: "#666" }}>개선 필요</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 엘리스트랙 서브탭 */}
            {lectureSatisfactionTab === "엘리스트랙" && (
              <div>
                {/* Unity/TPM 카드 선택 - eliceTrackTab이 빈 문자열일 때만 표시 */}
                {(!eliceTrackTab || eliceTrackTab === "") && (
                  <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "12px",
                  marginBottom: "20px"
                }}>
                  {/* Unity 카드 */}
                  <div
                    onClick={() => setEliceTrackTab("Unity")}
                    style={{
                      backgroundColor: "white",
                      padding: "12px",
                      borderRadius: "8px",
                      boxShadow: eliceTrackTab === "Unity" ? "0 8px 24px rgba(40, 167, 69, 0.2)" : "0 4px 12px rgba(0,0,0,0.1)",
                      cursor: "pointer",
                      transition: "all 0.3s ease",
                      border: eliceTrackTab === "Unity" ? "2px solid #28a745" : "2px solid transparent",
                      textAlign: "center",
                      transform: eliceTrackTab === "Unity" ? "translateY(-2px)" : "translateY(0)"
                    }}
                    onMouseEnter={(e) => {
                      if (eliceTrackTab !== "Unity") {
                        e.target.style.transform = "translateY(-4px)";
                        e.target.style.boxShadow = "0 8px 24px rgba(0,0,0,0.15)";
                        e.target.style.borderColor = "#28a745";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (eliceTrackTab !== "Unity") {
                        e.target.style.transform = "translateY(0)";
                        e.target.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)";
                        e.target.style.borderColor = "transparent";
                      }
                    }}
                  >
                    <div style={{ fontSize: "32px", marginBottom: "8px" }}>🎮</div>
                    <h3 style={{ 
                      color: eliceTrackTab === "Unity" ? "#28a745" : "#333", 
                      marginBottom: "6px", 
                      fontSize: "16px",
                      fontWeight: eliceTrackTab === "Unity" ? "600" : "500"
                    }}>
                      Unity 1기
                    </h3>
                    <p style={{ color: "#666", fontSize: "12px", margin: 0 }}>
                      Unity 강의 만족도 분석
                    </p>
                  </div>

                  {/* TPM 카드 */}
                  <div
                    onClick={() => setEliceTrackTab("TPM")}
                    style={{
                      backgroundColor: "white",
                      padding: "12px",
                      borderRadius: "8px",
                      boxShadow: eliceTrackTab === "TPM" ? "0 8px 24px rgba(0, 123, 255, 0.2)" : "0 4px 12px rgba(0,0,0,0.1)",
                      cursor: "pointer",
                      transition: "all 0.3s ease",
                      border: eliceTrackTab === "TPM" ? "2px solid #007bff" : "2px solid transparent",
                      textAlign: "center",
                      transform: eliceTrackTab === "TPM" ? "translateY(-2px)" : "translateY(0)"
                    }}
                    onMouseEnter={(e) => {
                      if (eliceTrackTab !== "TPM") {
                        e.target.style.transform = "translateY(-4px)";
                        e.target.style.boxShadow = "0 8px 24px rgba(0,0,0,0.15)";
                        e.target.style.borderColor = "#007bff";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (eliceTrackTab !== "TPM") {
                        e.target.style.transform = "translateY(0)";
                        e.target.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)";
                        e.target.style.borderColor = "transparent";
                      }
                    }}
                  >
                    <div style={{ fontSize: "32px", marginBottom: "8px" }}>📊</div>
                    <h3 style={{ 
                      color: eliceTrackTab === "TPM" ? "#007bff" : "#333", 
                      marginBottom: "6px", 
                      fontSize: "16px",
                      fontWeight: eliceTrackTab === "TPM" ? "600" : "500"
                    }}>
                      TPM 3기
                    </h3>
                    <p style={{ color: "#666", fontSize: "12px", margin: 0 }}>
                      TPM 강의 만족도 분석
                    </p>
                  </div>
                </div>
                )}

                {/* Unity 서브탭 */}
                {eliceTrackTab === "Unity" && (
                  <div
                    style={{
                      backgroundColor: "white",
                      padding: "40px",
                      borderRadius: "8px",
                      minHeight: "400px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
                      <h2 style={{ color: "#333", margin: 0 }}>🎮 Unity 1기 강의 만족도</h2>
                      <button
                        onClick={() => setEliceTrackTab("")}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "8px 16px",
                          backgroundColor: "#f8f9fa",
                          border: "1px solid #dee2e6",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "14px",
                          color: "#495057"
                        }}
                      >
                        ← 다른 강의 선택
                      </button>
                    </div>
                    
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "24px",
                      alignItems: "start"
                    }}>
                      <Suspense fallback={<div>차트 로딩 중...</div>}>
                        <UnitySatisfactionChart />
                      </Suspense>
                      
                      <Suspense fallback={<div>레이더 차트 로딩 중...</div>}>
                        <UnitySatisfactionRadar />
                      </Suspense>
                    </div>
                  </div>
                )}

                {/* TPM 서브탭 */}
                {eliceTrackTab === "TPM" && (
                  <div
                    style={{
                      backgroundColor: "white",
                      padding: "40px",
                      borderRadius: "8px",
                      minHeight: "400px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
                      <h2 style={{ color: "#333", margin: 0 }}>🎓 KDT TPM3기 교육 만족도</h2>
                      <button
                        onClick={() => setEliceTrackTab("")}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "8px 16px",
                          backgroundColor: "#f8f9fa",
                          border: "1px solid #dee2e6",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "14px",
                          color: "#495057"
                        }}
                      >
                        ← 다른 강의 선택
                      </button>
                    </div>
                    
                    <Suspense fallback={<div>차트 로딩 중...</div>}>
                      <KdtTpm3SatisfactionChart />
                    </Suspense>
                    
                    <Suspense fallback={<div>세부 차트 로딩 중...</div>}>
                      <KdtTpm3SatisfactionRadar />
                    </Suspense>
                  </div>
                )}
              </div>
            )}

            {/* 엘리스스쿨 서브 탭 */}
            {lectureSatisfactionTab === "엘리스스쿨" && (
              <div
                style={{
                  backgroundColor: "white",
                  padding: "40px",
                  borderRadius: "8px",
                  textAlign: "center",
                  minHeight: "400px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <h2 style={{ color: "#333", marginBottom: "16px" }}>📚 엘리스스쿨 강의 만족도</h2>
                <p style={{ color: "#666", fontSize: "16px" }}>
                  차트 및 데이터를 추가할 준비가 되었습니다.
                </p>
              </div>
            )}

            {/* 엘리스스쿨 서브탭 */}
            {lectureSatisfactionTab === "엘리스스쿨" && (
              <div
                style={{
                  backgroundColor: "white",
                  padding: "40px",
                  borderRadius: "8px",
                  textAlign: "center",
                  minHeight: "400px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <h3 style={{ marginBottom: "20px", color: "#495057" }}>엘리스스쿨 교육 만족도</h3>
                <p style={{ color: "#666" }}>엘리스스쿨 데이터가 준비되면 여기에 표시됩니다.</p>
              </div>
            )}
          </div>
        )}

        {/* Cloud 탭 */}
        {activeTab === "Cloud" && (
          <div style={{ backgroundColor: "white", padding: "24px", borderRadius: "8px" }}>
            <h2 style={{ color: "#333", marginBottom: "24px" }}>☁️ Cloud 고객 관리</h2>
            
            {/* Cloud 서브탭 */}
            <div style={{ 
              display: "flex", 
              gap: "8px", 
              marginBottom: "24px",
              borderBottom: "2px solid #e9ecef"
            }}>
              <button
                onClick={() => setCloudSubTab("차트")}
                style={{
                  padding: "12px 24px",
                  border: "none",
                  backgroundColor: cloudSubTab === "차트" ? "#007bff" : "transparent",
                  color: cloudSubTab === "차트" ? "white" : "#6c757d",
                  cursor: "pointer",
                  fontWeight: "500",
                  fontSize: "14px",
                  borderRadius: "4px 4px 0 0",
                  transition: "all 0.2s"
                }}
              >
                📊 차트
              </button>
              <button
                onClick={() => setCloudSubTab("테이블")}
                style={{
                  padding: "12px 24px",
                  border: "none",
                  backgroundColor: cloudSubTab === "테이블" ? "#007bff" : "transparent",
                  color: cloudSubTab === "테이블" ? "white" : "#6c757d",
                  cursor: "pointer",
                  fontWeight: "500",
                  fontSize: "14px",
                  borderRadius: "4px 4px 0 0",
                  transition: "all 0.2s"
                }}
              >
                📋 테이블
              </button>
              <button
                onClick={() => setCloudSubTab("환불")}
                style={{
                  padding: "12px 24px",
                  border: "none",
                  backgroundColor: cloudSubTab === "환불" ? "#dc3545" : "transparent",
                  color: cloudSubTab === "환불" ? "white" : "#6c757d",
                  cursor: "pointer",
                  fontWeight: "500",
                  fontSize: "14px",
                  borderRadius: "4px 4px 0 0",
                  transition: "all 0.2s"
                }}
              >
                💰 환불
              </button>
              <button
                onClick={() => setCloudSubTab("CRM")}
                style={{
                  padding: "12px 24px",
                  border: "none",
                  backgroundColor: cloudSubTab === "CRM" ? "#198754" : "transparent",
                  color: cloudSubTab === "CRM" ? "white" : "#6c757d",
                  cursor: "pointer",
                  fontWeight: "500",
                  fontSize: "14px",
                  borderRadius: "4px 4px 0 0",
                  transition: "all 0.2s"
                }}
              >
                📇 CRM
              </button>
            </div>

            {/* 차트 탭 */}
            {cloudSubTab === "차트" && (
              <div>
                {/* 상단 4개 위젯 */}
                <div style={{ 
                  display: "grid", 
                  gridTemplateColumns: "repeat(4, 1fr)", 
                  gap: "12px", 
                  marginBottom: "20px" 
                }}>
                  {/* 1. 세일즈 퍼널 */}
                  <div style={{
                    backgroundColor: "#fff",
                    border: "1px solid #dee2e6",
                    borderRadius: "8px",
                    padding: "12px",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.05)"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                      <h3 style={{ fontSize: "14px", color: "#495057", fontWeight: "600", margin: 0 }}>
                        세일즈 퍼널
                      </h3>
                      <div style={{
                        display: "inline-flex",
                        border: "1px solid #e5e7eb",
                        borderRadius: 8,
                        overflow: "hidden"
                      }}>
                        {["전체", "오늘", "1주", "1개월"].map((filter) => (
                          <button
                            key={filter}
                            onClick={() => setSalesFunnelDateFilter(filter)}
                            style={{
                              padding: "6px 10px",
                              fontSize: 12,
                              border: "none",
                              background: salesFunnelDateFilter === filter ? "#111827" : "#fff",
                              color: salesFunnelDateFilter === filter ? "#fff" : "#374151",
                              cursor: "pointer"
                            }}
                          >
                            {filter}
                          </button>
                        ))}
                      </div>
                    </div>
                    {(() => {
                      const stages = [
                        { name: "문의", key: "문의", color: "#e3f2fd" },
                        { name: "견적", key: "견적", color: "#bbdefb" },
                        { name: "계약", key: "계약", color: "#64b5f6" },
                        { name: "정산", key: "정산", color: "#1976d2" }
                      ];
                      
                      // 날짜 필터링 함수
                      const filterByDate = (customer) => {
                        if (salesFunnelDateFilter === "전체") return true;
                        if (!customer.문의날짜) return false;
                        
                        const inquiryDate = new Date(customer.문의날짜);
                        const now = new Date();
                        now.setHours(0, 0, 0, 0);
                        
                        if (salesFunnelDateFilter === "오늘") {
                          const today = new Date(now);
                          inquiryDate.setHours(0, 0, 0, 0);
                          return inquiryDate.getTime() === today.getTime();
                        } else if (salesFunnelDateFilter === "1주") {
                          const weekAgo = new Date(now);
                          weekAgo.setDate(weekAgo.getDate() - 7);
                          inquiryDate.setHours(0, 0, 0, 0);
                          return inquiryDate >= weekAgo && inquiryDate <= now;
                        } else if (salesFunnelDateFilter === "1개월") {
                          const monthAgo = new Date(now);
                          monthAgo.setMonth(monthAgo.getMonth() - 1);
                          inquiryDate.setHours(0, 0, 0, 0);
                          return inquiryDate >= monthAgo && inquiryDate <= now;
                        }
                        return true;
                      };
                      
                      // 필터링된 고객 목록
                      const filteredCustomers = cloudCustomers.filter(filterByDate);
                      
                      // 각 단계별 원본 카운트
                      const rawCounts = {};
                      stages.forEach(stage => {
                        rawCounts[stage.key] = filteredCustomers.filter(c => c.세일즈단계 === stage.key).length;
                      });
                      
                      // 건수는 원본 그대로 사용
                      const counts = rawCounts;
                      
                      // 전환율 계산용 누적값 (전환율만 누적식으로 계산)
                      const cumulativeForConversion = {
                        "문의": rawCounts["문의"],
                        "견적": rawCounts["견적"] + rawCounts["계약"] + rawCounts["정산"],
                        "계약": rawCounts["계약"] + rawCounts["정산"],
                        "정산": rawCounts["정산"]
                      };
                      
                      // 전체 고객 수 (전환율 계산 분모)
                      const totalCustomers = rawCounts["문의"] + rawCounts["견적"] + rawCounts["계약"] + rawCounts["정산"];
                      
                      const maxCount = Math.max(...Object.values(counts), 1);
                      
                      return (
                        <div style={{ padding: "12px 0" }}>
                          {stages.map((stage, index) => {
                            const count = counts[stage.key] || 0;
                            const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
                            const currentCumulative = cumulativeForConversion[stage.key] || 0;
                            const conversionRate = totalCustomers > 0 ? ((currentCumulative / totalCustomers) * 100).toFixed(1) : "0.0";
                            
                            return (
                              <div key={stage.key} style={{ marginBottom: index < stages.length - 1 ? "12px" : "0" }}>
                                <div style={{ 
                                  display: "flex", 
                                  justifyContent: "space-between", 
                                  alignItems: "center",
                                  marginBottom: "8px"
                                }}>
                                  <span style={{ fontSize: "13px", fontWeight: "600", color: "#495057" }}>
                                    {stage.name}
                                  </span>
                                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                    {index > 0 && (
                                      <span style={{ 
                                        fontSize: "11px", 
                                        color: "#6c757d",
                                        backgroundColor: "#f8f9fa",
                                        padding: "2px 8px",
                                        borderRadius: "4px"
                                      }}>
                                        전환율 {conversionRate}%
                                      </span>
                                    )}
                                    <span style={{ fontSize: "14px", fontWeight: "700", color: "#212529" }}>
                                      {count}건
                                    </span>
                                  </div>
                                </div>
                                <div style={{ 
                                  width: "100%", 
                                  height: "32px", 
                                  backgroundColor: "#f8f9fa",
                                  borderRadius: "4px",
                                  overflow: "hidden",
                                  position: "relative"
                                }}>
                                  <div style={{
                                    width: `${percentage}%`,
                                    height: "100%",
                                    backgroundColor: stage.color,
                                    transition: "width 0.3s ease",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center"
                                  }}>
                                    {percentage > 15 && (
                                      <span style={{ 
                                        fontSize: "12px", 
                                        fontWeight: "600",
                                        color: index === 3 ? "white" : "#1976d2"
                                      }}>
                                        {filteredCustomers.length > 0 ? ((count / filteredCustomers.length) * 100).toFixed(1) : "0.0"}%
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {index < stages.length - 1 && (
                                  <div style={{ 
                                    textAlign: "center", 
                                    margin: "6px 0",
                                    color: "#6c757d",
                                    fontSize: "14px"
                                  }}>
                                    ↓
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          
                          {/* 전체 통계 */}
                          <div style={{
                            marginTop: "16px",
                            paddingTop: "12px",
                            borderTop: "2px solid #e9ecef"
                          }}>
                            <div style={{ 
                              display: "flex", 
                              justifyContent: "space-between",
                              marginBottom: "8px"
                            }}>
                              <span style={{ fontSize: "13px", color: "#6c757d" }}>전체 고객</span>
                              <span style={{ fontSize: "14px", fontWeight: "600" }}>{filteredCustomers.length}건</span>
                            </div>
                            <div style={{ 
                              display: "flex", 
                              justifyContent: "space-between"
                            }}>
                              <span style={{ fontSize: "13px", color: "#6c757d" }}>전체 전환율</span>
                              <span style={{ fontSize: "14px", fontWeight: "600", color: "#28a745" }}>
                                {totalCustomers > 0 
                                  ? ((rawCounts["정산"] / totalCustomers) * 100).toFixed(1)
                                  : "0.0"}%
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* 2. 계약/정산 총금액 카드 (상단으로 이동) */}
                  <CloudAmountSummaryCard cloudCustomers={cloudCustomers} resourceMap={resourceMap} />

                  {/* 2-1. 사용기간 타임라인 */}
                  <CloudTimelineChart cloudCustomers={cloudCustomers} resourceMap={resourceMap} />

                  {/* 3~4. CRM 관련 차트 묶음 */}
                  <CloudCrmChartsSection crmCustomers={crmCustomers} />

                  {/* 5. 도입 자원 유형 (도넛 차트) */}
                  <div style={{
                    backgroundColor: "#fff",
                    border: "1px solid #dee2e6",
                    borderRadius: "8px",
                    padding: "12px",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.05)"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                      <h3 style={{ fontSize: "14px", color: "#495057", fontWeight: "600", margin: 0 }}>
                        도입 자원 유형
                      </h3>
                      <button
                        onClick={() => setShowResourceDetail(!showResourceDetail)}
                        style={{
                          padding: "6px 12px",
                          fontSize: "12px",
                          backgroundColor: showResourceDetail ? "#007bff" : "#f8f9fa",
                          color: showResourceDetail ? "white" : "#495057",
                          border: "1px solid #dee2e6",
                          borderRadius: "4px",
                          cursor: "pointer",
                          transition: "all 0.2s"
                        }}
                      >
                        {showResourceDetail ? "간단히 보기" : "상세히 보기"}
                      </button>
                    </div>
                    {(() => {
                      // 자원 코드에서 타입 추출 함수
                      const getResourceType = (resourceCode) => {
                        if (resourceCode.includes('NBTHS')) return 'B200';
                        if (resourceCode.includes('NHHS')) return 'H100';
                        if (resourceCode.includes('NAHP')) return 'A100';
                        return 'Other';
                      };

                      // 자원별 집계
                      const resourceCount = {};
                      const detailedResourceCount = {};
                      
                      cloudCustomers.forEach(customer => {
                        if (Array.isArray(customer.사용자원)) {
                          customer.사용자원.forEach(item => {
                            const resourceType = getResourceType(item.resource);
                            const quantity = parseInt(item.quantity) || 1;
                            
                            // 타입별 집계
                            resourceCount[resourceType] = (resourceCount[resourceType] || 0) + quantity;
                            
                            // 상세 자원별 집계
                            const detailedName = resourceMap[item.resource] || item.resource;
                            if (!detailedResourceCount[resourceType]) {
                              detailedResourceCount[resourceType] = {};
                            }
                            detailedResourceCount[resourceType][detailedName] = 
                              (detailedResourceCount[resourceType][detailedName] || 0) + quantity;
                          });
                        } else if (customer.사용자원) {
                          const resourceType = getResourceType(customer.사용자원);
                          const quantity = parseInt(customer.사용자원수량) || 1;
                          
                          resourceCount[resourceType] = (resourceCount[resourceType] || 0) + quantity;
                          
                          const detailedName = resourceMap[customer.사용자원] || customer.사용자원;
                          if (!detailedResourceCount[resourceType]) {
                            detailedResourceCount[resourceType] = {};
                          }
                          detailedResourceCount[resourceType][detailedName] = 
                            (detailedResourceCount[resourceType][detailedName] || 0) + quantity;
                        }
                      });

                      const pieData = Object.entries(resourceCount).map(([name, value]) => ({
                        name,
                        value
                      }));

                      const COLORS = {
                        'B200': '#0088FE',
                        'H100': '#00C49F',
                        'A100': '#FFBB28',
                        'Other': '#FF8042'
                      };
                      
                      const total = pieData.reduce((sum, item) => sum + item.value, 0);

                      return pieData.length > 0 ? (
                        <div>
                          <div style={{ position: "relative", width: "100%", height: "160px" }}>
                            <ResponsiveContainer width="100%" height={160}>
                              <PieChart>
                                <Pie
                                  data={pieData}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={60}
                                  outerRadius={80}
                                  fill="#8884d8"
                                  paddingAngle={2}
                                  dataKey="value"
                                  label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                                >
                                  {pieData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[entry.name] || '#8884d8'} />
                                  ))}
                                </Pie>
                                <Tooltip />
                              </PieChart>
                            </ResponsiveContainer>
                            <div style={{ 
                              position: "absolute", 
                              top: "50%", 
                              left: "50%", 
                              transform: "translate(-50%, -50%)",
                              fontSize: "28px", 
                              fontWeight: "700", 
                              color: "#212529",
                              pointerEvents: "none"
                            }}>
                              {total}
                            </div>
                          </div>
                          
                          {/* 간단히 보기 */}
                          {!showResourceDetail && (
                            <div style={{ fontSize: "12px", marginTop: "16px" }}>
                              {pieData.map((item, index) => (
                                <div key={index} style={{ display: "flex", alignItems: "center", marginBottom: "8px" }}>
                                  <div style={{
                                    width: "12px",
                                    height: "12px",
                                    backgroundColor: COLORS[item.name] || '#8884d8',
                                    marginRight: "8px",
                                    borderRadius: "2px"
                                  }}></div>
                                  <span style={{ fontSize: "12px", color: "#6c757d", flex: 1 }}>{item.name}</span>
                                  <span style={{ fontSize: "12px", fontWeight: "600" }}>{item.value}개</span>
                                </div>
                              ))}
                            </div>
                          )}
                          
                          {/* 상세히 보기 */}
                          {showResourceDetail && (
                            <div style={{ fontSize: "11px", marginTop: "10px", maxHeight: "200px", overflowY: "auto" }}>
                              {Object.entries(detailedResourceCount).map(([type, resources]) => (
                                <div key={type} style={{ marginBottom: "12px" }}>
                                  <div style={{ 
                                    display: "flex", 
                                    alignItems: "center", 
                                    marginBottom: "6px",
                                    fontWeight: "600",
                                    color: "#495057"
                                  }}>
                                    <div style={{
                                      width: "12px",
                                      height: "12px",
                                      backgroundColor: COLORS[type] || '#8884d8',
                                      marginRight: "8px",
                                      borderRadius: "2px"
                                    }}></div>
                                    <span>{type}</span>
                                  </div>
                                  {Object.entries(resources).map(([name, count], idx) => (
                                    <div key={idx} style={{ 
                                      paddingLeft: "20px", 
                                      marginBottom: "4px",
                                      color: "#6c757d",
                                      fontSize: "10px"
                                    }}>
                                      • {name}: {count}개
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ textAlign: "center", color: "#6c757d", padding: "40px 0" }}>
                          데이터가 없습니다
                        </div>
                      );
                    })()}
                  </div>

                  {/* 3. 환불 통계 카드 */}
                  <div style={{
                    backgroundColor: "#fff",
                    border: "1px solid #dee2e6",
                    borderRadius: "8px",
                    padding: "12px",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.05)"
                  }}>
                    <h3 style={{ fontSize: "14px", marginBottom: "8px", color: "#495057", fontWeight: "600" }}>
                      환불 통계
                    </h3>
                    {(() => {
                      const formatAmount = (amount) => {
                        if (amount >= 100000000) {
                          const 억 = Math.floor(amount / 100000000);
                          const 만 = Math.floor((amount % 100000000) / 10000);
                          if (만 > 0) {
                            return `${억}억 ${만}만원`;
                          } else {
                            return `${억}억원`;
                          }
                        } else if (amount >= 10000) {
                          return `${Math.floor(amount / 10000)}만원`;
                        } else {
                          return `${amount.toLocaleString()}원`;
                        }
                      };

                      // 환불 데이터 계산
                      const refundCount = refundCustomers.length;
                      const refundTotalAmount = refundCustomers.reduce((sum, customer) => {
                        const amt = customer.환불금액;
                        if (amt) {
                          const numericAmount = parseInt(amt.toString().replace(/[^0-9]/g, '')) || 0;
                          return sum + numericAmount;
                        }
                        return sum;
                      }, 0);

                      const reasonCounts = refundCustomers.reduce((acc, customer) => {
                        const rawReason = customer?.환불사유;
                        const normalized = typeof rawReason === "string" && rawReason.trim()
                          ? rawReason.trim()
                          : "기타";
                        acc[normalized] = (acc[normalized] || 0) + 1;
                        return acc;
                      }, {});

                      const reasonChartData = Object.entries(reasonCounts)
                        .map(([name, value]) => ({ name, value }))
                        .sort((a, b) => b.value - a.value);

                      const reasonColors = [
                        "#f87171",
                        "#fb923c",
                        "#facc15",
                        "#4ade80",
                        "#60a5fa",
                        "#c084fc",
                        "#f472b6",
                        "#a855f7"
                      ];

                      return (
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                          {/* 환불 건수 */}
                          <div style={{ 
                            textAlign: "center", 
                            padding: "8px",
                            backgroundColor: "#fff5f5",
                            borderRadius: "6px",
                            border: "1px solid #fecaca"
                          }}>
                            <div style={{ fontSize: "9px", color: "#991b1b", marginBottom: "3px", fontWeight: "500" }}>
                              환불 건수
                            </div>
                            <div style={{ fontSize: "18px", fontWeight: "700", color: "#dc2626" }}>
                              {refundCount}건
                            </div>
                          </div>

                          {/* 환불 총액 */}
                          <div style={{ 
                            textAlign: "center", 
                            padding: "8px",
                            backgroundColor: "#fef2f2",
                            borderRadius: "6px",
                            border: "1px solid #fca5a5"
                          }}>
                            <div style={{ fontSize: "9px", color: "#991b1b", marginBottom: "3px", fontWeight: "500" }}>
                              환불 총액
                            </div>
                            <div style={{ fontSize: "16px", fontWeight: "700", color: "#dc2626" }}>
                              {formatAmount(refundTotalAmount)}
                            </div>
                          </div>

                          {/* 환불 사유 도넛 차트 */}
                          {refundCount > 0 && reasonChartData.length > 0 ? (
                            <div style={{
                              borderTop: "1px solid #dee2e6",
                              marginTop: "4px",
                              paddingTop: "12px"
                            }}>
                              <div style={{
                                fontSize: "10px",
                                color: "#6c757d",
                                marginBottom: "8px",
                                textAlign: "center"
                              }}>
                                환불 사유 분포
                              </div>
                              <div style={{ height: "160px" }}>
                                <ResponsiveContainer width="100%" height="100%">
                                  <PieChart>
                                    <Pie
                                      data={reasonChartData}
                                      dataKey="value"
                                      nameKey="name"
                                      innerRadius={45}
                                      outerRadius={70}
                                      paddingAngle={2}
                                      cornerRadius={4}
                                    >
                                      {reasonChartData.map((entry, idx) => (
                                        <Cell
                                          key={`refund-reason-${entry.name}`}
                                          fill={reasonColors[idx % reasonColors.length]}
                                        />
                                      ))}
                                    </Pie>
                                    <Tooltip
                                      formatter={(value, name) => [`${value}건`, name]}
                                    />
                                  </PieChart>
                                </ResponsiveContainer>
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: "8px",
                                  justifyContent: "center",
                                  marginTop: "10px",
                                  fontSize: "10px",
                                  color: "#6c757d"
                                }}
                              >
                                {reasonChartData.map((entry, idx) => (
                                  <span
                                    key={`legend-${entry.name}`}
                                    style={{ display: "flex", alignItems: "center", gap: "4px" }}
                                  >
                                    <span
                                      style={{
                                        width: "8px",
                                        height: "8px",
                                        borderRadius: "50%",
                                        backgroundColor: reasonColors[idx % reasonColors.length]
                                      }}
                                    />
                                    {entry.name} ({entry.value}건)
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div style={{
                              textAlign: "center",
                              borderTop: "1px solid #dee2e6",
                              marginTop: "4px",
                              paddingTop: "12px",
                              fontSize: "10px",
                              color: "#6c757d"
                            }}>
                              환불 사유 데이터가 없습니다.
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* 4. 일자별 기관 생성 / 카드 등록 추이 (환불 카드 오른쪽, 2칸 사용) */}
                  <div style={{
                    backgroundColor: "#fff",
                    border: "1px solid #dee2e6",
                    borderRadius: "8px",
                    padding: "12px",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
                    gridColumn: "span 2"
                  }}>
                    <h3 style={{ fontSize: "14px", marginBottom: "12px", color: "#495057", fontWeight: "600" }}>
                      일자별 기관 생성 / 카드 등록 추이
                    </h3>
                    {(() => {
                      const dateCounts = {};

                      crmCustomers.forEach((c) => {
                        if (c.기관생성일) {
                          const key = c.기관생성일;
                          if (!dateCounts[key]) dateCounts[key] = { date: key, created: 0, registered: 0 };
                          dateCounts[key].created += 1;
                        }
                        if (c.카드등록일) {
                          const key = c.카드등록일;
                          if (!dateCounts[key]) dateCounts[key] = { date: key, created: 0, registered: 0 };
                          dateCounts[key].registered += 1;
                        }
                      });

                      const lineData = Object.values(dateCounts).sort((a, b) =>
                        (a.date || "").localeCompare(b.date || "")
                      );

                      return lineData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={220}>
                          <LineChart data={lineData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Line
                              type="monotone"
                              dataKey="created"
                              stroke="#0d6efd"
                              strokeWidth={2}
                              dot={{ r: 3 }}
                              name="기관 생성"
                            />
                            <Line
                              type="monotone"
                              dataKey="registered"
                              stroke="#20c997"
                              strokeWidth={2}
                              dot={{ r: 3 }}
                              name="카드 등록"
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div style={{ textAlign: "center", color: "#6c757d", padding: "24px 0", fontSize: "13px" }}>
                          기관 생성일/카드등록일 데이터가 없습니다.
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* 하단: 주차별 도입/정산 추이 */}
                <div style={{
                  backgroundColor: "#fff",
                  border: "1px solid #dee2e6",
                  borderRadius: "8px",
                  padding: "20px",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.05)"
                }}>
                    <h3 style={{ fontSize: "16px", marginBottom: "16px", color: "#495057", fontWeight: "600" }}>
                      주차별 도입/정산 추이
                    </h3>
                  {(() => {
                    // 주차별 데이터 집계 (문의날짜 기준, 9월부터)
                    const weeklyData = {};
                    
                    // 주차 계산 함수 (해당 날짜가 속한 연도의 몇 번째 주인지)
                    const getWeekLabel = (dateStr) => {
                      if (!dateStr) return null;
                      const date = new Date(dateStr);
                      if (isNaN(date.getTime())) return null;
                      
                      // 9월 16일 이전 데이터 제외 (시작 연도: 2025)
                      const year = date.getFullYear();
                      const month = date.getMonth() + 1; // 0-based
                      const day = date.getDate();
                      if (year < 2025 || (year === 2025 && month < 9) || (year === 2025 && month === 9 && day < 16)) {
                        return null;
                      }
                      
                      // 해당 월의 첫날
                      const firstDayOfMonth = new Date(year, month - 1, 1);
                      // 해당 날짜가 월의 몇 번째 날인지
                      const dayOfMonth = date.getDate();
                      // 주차 계산 (1일~7일: 1주차, 8일~14일: 2주차 등)
                      const weekOfMonth = Math.ceil(dayOfMonth / 7);
                      
                      return `${year}-${String(month).padStart(2, '0')}-${weekOfMonth}`;
                    };
                    
                    const formatWeekLabel = (weekKey) => {
                      const [year, month, week] = weekKey.split('-');
                      return `${parseInt(month)}월 ${week}주차`;
                    };
                    
                    // 9월 16일부터 현재까지 모든 주차 생성
                    const generateAllWeeks = () => {
                      const weeks = [];
                      const startDate = new Date(2025, 8, 16); // 2025년 9월 16일
                      const today = new Date();
                      
                      let currentDate = new Date(startDate);
                      
                      while (currentDate <= today) {
                        const year = currentDate.getFullYear();
                        const month = currentDate.getMonth() + 1;
                        const dayOfMonth = currentDate.getDate();
                        const weekOfMonth = Math.ceil(dayOfMonth / 7);
                        const weekKey = `${year}-${String(month).padStart(2, '0')}-${weekOfMonth}`;
                        
                        if (!weeklyData[weekKey]) {
                          weeklyData[weekKey] = { week: weekKey, 도입: 0, 정산: 0 };
                        }
                        
                        // 다음 주로 이동 (7일 추가)
                        currentDate.setDate(currentDate.getDate() + 7);
                      }
                    };
                    
                    // 먼저 모든 주차 초기화
                    generateAllWeeks();
                    
                    // 실제 데이터로 채우기
                    cloudCustomers.forEach(customer => {
                      // 문의날짜 기준으로 처리
                      if (customer.문의날짜) {
                        const weekKey = getWeekLabel(customer.문의날짜);
                        if (weekKey && weeklyData[weekKey]) {
                          // 모든 세일즈단계를 도입으로 카운트
                          weeklyData[weekKey].도입 += 1;
                          
                          // 정산 단계만 따로 카운트
                          if (customer.세일즈단계 === "정산") {
                            weeklyData[weekKey].정산 += 1;
                          }
                        }
                      }
                    });

                    const lineData = Object.values(weeklyData)
                      .sort((a, b) => a.week.localeCompare(b.week))
                      .map(item => ({
                        ...item,
                        weekLabel: formatWeekLabel(item.week)
                      }));

                    return lineData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={lineData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis 
                            dataKey="weekLabel" 
                            angle={-45}
                            textAnchor="end"
                            height={80}
                            tick={{ fontSize: 12 }}
                          />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Line type="monotone" dataKey="도입" stroke="#0088FE" strokeWidth={2} dot={{ r: 4 }} name="도입 (전체)" />
                          <Line type="monotone" dataKey="정산" stroke="#00C49F" strokeWidth={2} dot={{ r: 4 }} name="정산" />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div style={{ textAlign: "center", color: "#6c757d", padding: "40px 0" }}>
                        데이터가 없습니다 (2025년 9월 16일 이후 문의날짜가 있는 데이터만 표시됩니다)
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* 테이블 탭 */}
            {cloudSubTab === "테이블" && (
              <div>
            {/* 입력 폼 */}
            <div style={{
              backgroundColor: "#f8f9fa",
              padding: "20px",
              borderRadius: "8px",
              marginBottom: "24px",
              border: "1px solid #dee2e6"
            }}>
              <h3 style={{ fontSize: "18px", marginBottom: "16px", color: "#495057" }}>
                {cloudEditingIndex !== null ? "고객 정보 수정" : "신규 고객 등록"}
              </h3>
              
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "12px",
                marginBottom: "16px"
              }}>
                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    사업유형 <span style={{ color: "red" }}>*</span>
                  </label>
                  <select
                    value={cloudFormData.사업유형}
                    onChange={(e) => setCloudFormData({ ...cloudFormData, 사업유형: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px",
                      border: "1px solid #ced4da",
                      borderRadius: "4px",
                      fontSize: "14px",
                      backgroundColor: "white"
                    }}
                  >
                    <option value="">선택해주세요</option>
                    <option value="B2B">B2B (Business to Business)</option>
                    <option value="B2C">B2C (Business to Consumer)</option>
                    <option value="B2E">B2E (Business to Education)</option>
                    <option value="B2G">B2G (Business to Government)</option>
                  </select>
                </div>
                
                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    이름 <span style={{ color: "red" }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={cloudFormData.이름}
                    onChange={(e) => setCloudFormData({ ...cloudFormData, 이름: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px",
                      border: "1px solid #ced4da",
                      borderRadius: "4px",
                      fontSize: "14px"
                    }}
                  />
                </div>
                
                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    소속
                  </label>
                  <input
                    type="text"
                    value={cloudFormData.기관}
                    onChange={(e) => setCloudFormData({ ...cloudFormData, 기관: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px",
                      border: "1px solid #ced4da",
                      borderRadius: "4px",
                      fontSize: "14px"
                    }}
                  />
                </div>
                
                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    기관페이지링크
                  </label>
                  <input
                    type="url"
                    placeholder="https://example.com"
                    value={cloudFormData.기관페이지링크}
                    onChange={(e) => setCloudFormData({ ...cloudFormData, 기관페이지링크: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px",
                      border: "1px solid #ced4da",
                      borderRadius: "4px",
                      fontSize: "14px"
                    }}
                  />
                </div>
                
                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    이메일
                  </label>
                  <input
                    type="email"
                    value={cloudFormData.이메일}
                    onChange={(e) => setCloudFormData({ ...cloudFormData, 이메일: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px",
                      border: "1px solid #ced4da",
                      borderRadius: "4px",
                      fontSize: "14px"
                    }}
                  />
                </div>
                
                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    문의날짜
                  </label>
                  <input
                    type="date"
                    value={cloudFormData.문의날짜}
                    onChange={(e) => setCloudFormData({ ...cloudFormData, 문의날짜: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px",
                      border: "1px solid #ced4da",
                      borderRadius: "4px",
                      fontSize: "14px"
                    }}
                  />
                </div>
                
                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    계약날짜
                  </label>
                  <input
                    type="date"
                    value={cloudFormData.계약날짜}
                    onChange={(e) => setCloudFormData({ ...cloudFormData, 계약날짜: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px",
                      border: "1px solid #ced4da",
                      borderRadius: "4px",
                      fontSize: "14px"
                    }}
                  />
                </div>
                
                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    세일즈 단계
                  </label>
                  <select
                    value={cloudFormData.세일즈단계}
                    onChange={(e) => setCloudFormData({ ...cloudFormData, 세일즈단계: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px",
                      border: "1px solid #ced4da",
                      borderRadius: "4px",
                      fontSize: "14px",
                      backgroundColor: "white"
                    }}
                  >
                    <option value="">선택해주세요</option>
                    <option value="문의">문의</option>
                    <option value="견적">견적</option>
                    <option value="계약">계약</option>
                    <option value="정산">정산</option>
                  </select>
                </div>
                
                <div style={{ position: "relative" }}>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    사용자원 (복수 선택 가능)
                  </label>
                  
                  {/* 드롭다운 토글 버튼 */}
                  <div
                    onClick={() => setResourceDropdownOpen(!resourceDropdownOpen)}
                    style={{
                      width: "100%",
                      padding: "8px",
                      border: "1px solid #ced4da",
                      borderRadius: "4px",
                      fontSize: "14px",
                      backgroundColor: "white",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      minHeight: "38px"
                    }}
                  >
                    <span style={{ color: (cloudFormData.사용자원 || []).length > 0 ? "#000" : "#6c757d" }}>
                      {(cloudFormData.사용자원 || []).length > 0 
                        ? `${(cloudFormData.사용자원 || []).length}개 선택됨` 
                        : "자원 선택"}
                    </span>
                    <span style={{ fontSize: "12px" }}>
                      {resourceDropdownOpen ? "▲" : "▼"}
                    </span>
                  </div>
                  
                  {/* 선택된 항목 미리보기 */}
                  {(cloudFormData.사용자원 || []).length > 0 && (
                    <div style={{ 
                      marginTop: "8px", 
                      padding: "8px", 
                      backgroundColor: "#f8f9fa", 
                      borderRadius: "4px",
                      fontSize: "12px"
                    }}>
                      {(cloudFormData.사용자원 || []).map((item, idx) => (
                        <div key={idx} style={{ marginBottom: idx < cloudFormData.사용자원.length - 1 ? "4px" : "0" }}>
                          • {resourceMap[item.resource] || item.resource} ({item.quantity}개)
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* 드롭다운 메뉴 */}
                  {resourceDropdownOpen && (
                    <div style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      marginTop: "4px",
                      maxHeight: "400px",
                      overflowY: "auto",
                      border: "1px solid #ced4da",
                      borderRadius: "4px",
                      padding: "12px",
                      backgroundColor: "white",
                      boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
                      zIndex: 1000
                    }}>
                      {Object.entries(resourceGroups).map(([groupName, resources]) => (
                        <div key={groupName} style={{ marginBottom: "16px" }}>
                          <div style={{ 
                            fontWeight: "600", 
                            fontSize: "13px", 
                            color: "#495057",
                            marginBottom: "8px",
                            borderBottom: "1px solid #e9ecef",
                            paddingBottom: "4px"
                          }}>
                            {groupName}
                          </div>
                          {resources.map(({ code, label }) => {
                            const selectedResource = (cloudFormData.사용자원 || []).find(r => r.resource === code);
                            const isChecked = !!selectedResource;
                            const quantity = selectedResource?.quantity || "";
                            
                            return (
                              <div key={code} style={{ 
                                display: "flex", 
                                alignItems: "center", 
                                marginBottom: "8px",
                                padding: "4px",
                                backgroundColor: isChecked ? "#f0f8ff" : "transparent",
                                borderRadius: "4px"
                              }}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    const currentResources = cloudFormData.사용자원 || [];
                                    
                                    if (checked) {
                                      // 추가
                                      setCloudFormData({
                                        ...cloudFormData,
                                        사용자원: [...currentResources, { resource: code, quantity: 1 }]
                                      });
                                    } else {
                                      // 제거
                                      setCloudFormData({
                                        ...cloudFormData,
                                        사용자원: currentResources.filter(r => r.resource !== code)
                                      });
                                    }
                                  }}
                                  style={{ marginRight: "8px", cursor: "pointer" }}
                                />
                                <label style={{ 
                                  flex: 1, 
                                  fontSize: "13px", 
                                  cursor: "pointer",
                                  userSelect: "none"
                                }}
                                onClick={(e) => {
                                  e.preventDefault();
                                  const currentResources = cloudFormData.사용자원 || [];
                                  const isCurrentlyChecked = currentResources.some(r => r.resource === code);
                                  
                                  if (isCurrentlyChecked) {
                                    setCloudFormData({
                                      ...cloudFormData,
                                      사용자원: currentResources.filter(r => r.resource !== code)
                                    });
                                  } else {
                                    setCloudFormData({
                                      ...cloudFormData,
                                      사용자원: [...currentResources, { resource: code, quantity: 1 }]
                                    });
                                  }
                                }}
                                >
                                  {label}
                                </label>
                                {isChecked && (
                  <input
                    type="number"
                    placeholder="수량"
                                    value={quantity}
                                    onChange={(e) => {
                                      const newQuantity = parseInt(e.target.value) || "";
                                      const currentResources = cloudFormData.사용자원 || [];
                                      setCloudFormData({
                                        ...cloudFormData,
                                        사용자원: currentResources.map(r => 
                                          r.resource === code 
                                            ? { ...r, quantity: newQuantity }
                                            : r
                                        )
                                      });
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                    min="1"
                    style={{
                                      width: "70px",
                                      padding: "4px 8px",
                      border: "1px solid #ced4da",
                      borderRadius: "4px",
                                      fontSize: "13px",
                                      marginLeft: "8px"
                                    }}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    사용유형
                  </label>
                  <select
                    value={cloudFormData.사용유형}
                    onChange={(e) => setCloudFormData({ ...cloudFormData, 사용유형: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px",
                      border: "1px solid #ced4da",
                      borderRadius: "4px",
                      fontSize: "14px",
                      backgroundColor: "white"
                    }}
                  >
                    <option value="">선택해주세요</option>
                    <option value="온디맨드">온디맨드</option>
                    <option value="약정형">약정형</option>
                    <option value="ECI">ECI</option>
                  </select>
                </div>
                
                <div style={{ gridColumn: "span 2" }}>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    사용기간
                  </label>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input
                      type="date"
                      placeholder="시작일"
                      value={cloudFormData.사용기간시작일}
                      onChange={(e) => setCloudFormData({ ...cloudFormData, 사용기간시작일: e.target.value })}
                      style={{
                        flex: 1,
                        padding: "8px",
                        border: "1px solid #ced4da",
                        borderRadius: "4px",
                        fontSize: "14px"
                      }}
                    />
                    <span style={{ color: "#666" }}>~</span>
                    <input
                      type="date"
                      placeholder="종료일"
                      value={cloudFormData.사용기간종료일}
                      onChange={(e) => setCloudFormData({ ...cloudFormData, 사용기간종료일: e.target.value })}
                      disabled={cloudFormData.종료일없음}
                      style={{
                        flex: 1,
                        padding: "8px",
                        border: "1px solid #ced4da",
                        borderRadius: "4px",
                        fontSize: "14px",
                        backgroundColor: cloudFormData.종료일없음 ? "#f5f5f5" : "white",
                        cursor: cloudFormData.종료일없음 ? "not-allowed" : "text"
                      }}
                    />
                    <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "14px", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={cloudFormData.종료일없음}
                        onChange={(e) => {
                          setCloudFormData({
                            ...cloudFormData,
                            종료일없음: e.target.checked,
                            사용기간종료일: e.target.checked ? "" : cloudFormData.사용기간종료일
                          });
                        }}
                        style={{ cursor: "pointer" }}
                      />
                      <span>종료일 없음</span>
                    </label>
                  </div>
                </div>
                
                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    견적/정산금액
                  </label>
                  <input
                    type="text"
                    value={cloudFormData["견적/정산금액"]}
                    onChange={(e) => setCloudFormData({ ...cloudFormData, "견적/정산금액": e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px",
                      border: "1px solid #ced4da",
                      borderRadius: "4px",
                      fontSize: "14px"
                    }}
                  />
                </div>
                
                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                    비고
                  </label>
                  <input
                    type="text"
                    value={cloudFormData.비고}
                    onChange={(e) => setCloudFormData({ ...cloudFormData, 비고: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px",
                      border: "1px solid #ced4da",
                      borderRadius: "4px",
                      fontSize: "14px"
                    }}
                  />
                </div>
              </div>
              
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={async () => {
                    if (!cloudFormData.사업유형 || !cloudFormData.이름) {
                      alert("사업유형과 이름은 필수 입력 항목입니다.");
                      return;
                    }
                    
                    try {
                      // 사용기간 문자열로 변환 (DB에 저장용)
                      const 사용기간 = cloudFormData.종료일없음
                        ? `${cloudFormData.사용기간시작일} ~ 현재`
                        : cloudFormData.사용기간시작일 && cloudFormData.사용기간종료일
                        ? `${cloudFormData.사용기간시작일} ~ ${cloudFormData.사용기간종료일}`
                        : cloudFormData.사용기간시작일 || cloudFormData.사용기간종료일
                        ? cloudFormData.사용기간시작일 || cloudFormData.사용기간종료일
                        : "";
                      
                      const dataToSave = {
                        ...cloudFormData,
                        사용기간: 사용기간
                      };
                      
                      if (cloudEditingIndex !== null) {
                        // 수정 - DB에 저장 (cloudEditingIndex에는 id를 저장)
                        const idx = cloudCustomers.findIndex((c) => c.id === cloudEditingIndex);
                        if (idx === -1) {
                          throw new Error("수정 대상 고객을 찾을 수 없습니다.");
                        }
                        const customerToUpdate = cloudCustomers[idx];
                        await updateCloudCustomer(customerToUpdate.id, dataToSave);
                        
                        // 로컬 상태 업데이트
                        const updated = [...cloudCustomers];
                        updated[idx] = { ...dataToSave, id: customerToUpdate.id };
                        setCloudCustomers(updated);
                        setCloudEditingIndex(null);
                        
                        // 서버에서 최신 데이터 다시 가져오기 (선택사항)
                        try {
                          const refreshedCustomers = await fetchCloudCustomers();
                          setCloudCustomers(refreshedCustomers);
                        } catch (err) {
                          console.warn("고객 목록 새로고침 실패:", err);
                          // 로컬 상태는 이미 업데이트되었으므로 계속 진행
                        }
                      } else {
                        // 추가 - DB에 저장
                        const newCustomer = await createCloudCustomer(dataToSave);
                        setCloudCustomers([...cloudCustomers, newCustomer]);
                      }
                      
                      // 폼 초기화
                      setCloudFormData({
                        사업유형: "",
                        이름: "",
                        기관: "",
                        기관페이지링크: "",
                        이메일: "",
                        문의날짜: "",
                        계약날짜: "",
                        세일즈단계: "",
                        사용자원: [],
                        사용유형: "",
                        사용기간시작일: "",
                        사용기간종료일: "",
                        종료일없음: false,
                        "견적/정산금액": "",
                        비고: ""
                      });
                      setResourceDropdownOpen(false); // 드롭다운 닫기
                      
                      alert(cloudEditingIndex !== null ? "고객 정보가 수정되었습니다." : "고객이 등록되었습니다.");
                    } catch (err) {
                      console.error("고객 저장 실패:", err);
                      alert("저장에 실패했습니다. 다시 시도해주세요.");
                    }
                  }}
                  style={{
                    padding: "10px 20px",
                    backgroundColor: "#28a745",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: "500"
                  }}
                >
                  {cloudEditingIndex !== null ? "수정 완료" : "등록"}
                </button>
                
                {cloudEditingIndex !== null && (
                  <button
                    onClick={() => {
                      setCloudEditingIndex(null);
                      setCloudFormData({
                        사업유형: "",
                        이름: "",
                        기관: "",
                        기관페이지링크: "",
                        이메일: "",
                        문의날짜: "",
                        계약날짜: "",
                        세일즈단계: "",
                        사용자원: [],
                        사용유형: "",
                        사용기간시작일: "",
                        사용기간종료일: "",
                        종료일없음: false,
                        "견적/정산금액": "",
                        비고: ""
                      });
                      setResourceDropdownOpen(false); // 드롭다운 닫기
                    }}
                    style={{
                      padding: "10px 20px",
                      backgroundColor: "#6c757d",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "14px"
                    }}
                  >
                    취소
                  </button>
                )}
              </div>
            </div>

            {/* 고객 목록 테이블 */}
            <div>
              {(() => {
                // 필터 옵션 생성
                const 사업유형Options = ["전체", ...new Set(cloudCustomers.map(c => c.사업유형).filter(Boolean))];
                const 세일즈단계Options = ["전체", ...new Set(cloudCustomers.map(c => c.세일즈단계).filter(Boolean))];
                const 사용유형Options = ["전체", ...new Set(cloudCustomers.map(c => c.사용유형).filter(Boolean))];

                // 필터링된 고객 데이터 계산
                const search = (tableSearch || "").trim().toLowerCase();
                const filteredCustomers = cloudCustomers.filter(customer => {
                  const 사업유형Match = tableFilters.사업유형 === "전체" || customer.사업유형 === tableFilters.사업유형;
                  const 세일즈단계Match = tableFilters.세일즈단계 === "전체" || customer.세일즈단계 === tableFilters.세일즈단계;
                  const 사용유형Match = tableFilters.사용유형 === "전체" || customer.사용유형 === tableFilters.사용유형;
                  // 선택된 컬럼만 검색
                  const fieldKey = tableSearchField; // "이름" | "이메일" | "기관"
                  const fieldValue = ((customer?.[fieldKey]) || "").toString().toLowerCase();
                  const searchMatch = !search || fieldValue.includes(search);
                  
                  return 사업유형Match && 세일즈단계Match && 사용유형Match && searchMatch;
                })
                .sort((a, b) => {
                  // 업데이트 날짜 기준 최신순 (내림차순)
                  const dateA = a.업데이트날짜 ? new Date(a.업데이트날짜) : new Date(0);
                  const dateB = b.업데이트날짜 ? new Date(b.업데이트날짜) : new Date(0);
                  
                  // 업데이트 날짜가 같으면 문의 날짜로 정렬
                  if (dateA.getTime() === dateB.getTime()) {
                    const inquiryDateA = a.문의날짜 ? new Date(a.문의날짜) : new Date(0);
                    const inquiryDateB = b.문의날짜 ? new Date(b.문의날짜) : new Date(0);
                    return inquiryDateB - inquiryDateA; // 문의 날짜 최신순
                  }
                  
                  return dateB - dateA; // 최신날짜가 위로
                });

                return (
                  <>
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                      marginBottom: "16px"
                    }}>
                      <h3 style={{ fontSize: "18px", margin: 0, color: "#495057" }}>
                        고객 목록 ({filteredCustomers.length}건 / 전체 {cloudCustomers.length}건)
                      </h3>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <button
                          onClick={() => {
                            const headers = [
                              { key: "사업유형", label: "사업유형" },
                              { key: "이름", label: "이름" },
                              { key: "기관", label: "소속" },
                              { key: "기관페이지링크", label: "기관페이지링크" },
                              { key: "이메일", label: "이메일" },
                              { key: "문의날짜", label: "문의날짜" },
                              { key: "계약날짜", label: "계약날짜" },
                              { key: "세일즈단계", label: "세일즈단계" },
                              { key: "사용자원", label: "사용자원" },
                              { key: "사용유형", label: "사용유형" },
                              { key: "사용기간", label: "사용기간" },
                              { key: "견적/정산금액", label: "견적/정산금액" },
                              { key: "비고", label: "비고" },
                              { key: "업데이트날짜", label: "업데이트날짜" }
                            ];
                            const csv = convertToCSV(filteredCustomers, headers);
                            const filename = `cloud_customers_${new Date().toISOString().split('T')[0]}.csv`;
                            downloadCSV(csv, filename);
                          }}
                          style={{
                            padding: "8px 16px",
                            backgroundColor: "#28a745",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "13px",
                            fontWeight: "500",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px"
                          }}
                        >
                          📥 CSV 다운로드
                        </button>
                        <select
                          value={tableSearchField}
                          onChange={(e) => setTableSearchField(e.target.value)}
                          style={{
                            padding: "8px 10px",
                            border: "1px solid #ced4da",
                            borderRadius: "6px",
                            fontSize: "13px",
                            backgroundColor: "white"
                          }}
                        >
                          <option value="이름">이름</option>
                          <option value="이메일">이메일</option>
                          <option value="기관">소속</option>
                        </select>
                        <input
                          type="text"
                          placeholder={`${tableSearchField === "기관" ? "소속" : tableSearchField} 검색`}
                          value={tableSearch}
                          onChange={(e) => setTableSearch(e.target.value)}
                          style={{
                            width: "240px",
                            padding: "8px 10px",
                            border: "1px solid #ced4da",
                            borderRadius: "6px",
                            fontSize: "13px"
                          }}
                        />
                      </div>
                    </div>
            
            {/* 사용기간 타임라인 */}
            <div style={{ marginBottom: "32px" }}>
              <CloudTimelineChart cloudCustomers={cloudCustomers} resourceMap={resourceMap} />
            </div>
              
                    {filteredCustomers.length === 0 ? (
                <div style={{
                  padding: "40px",
                  textAlign: "center",
                  color: "#6c757d",
                  backgroundColor: "#f8f9fa",
                  borderRadius: "8px"
                }}>
                  등록된 고객이 없습니다. 위 폼을 사용하여 고객을 등록해주세요.
                </div>
              ) : (
                <div style={{ width: "100%" }}>
                  <table style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "11px",
                    backgroundColor: "white"
                  }}>
                    <thead>
                      <tr style={{ backgroundColor: "#f8f9fa" }}>
                        <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "11px", width: "75px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span>사업유형</span>
                            <select 
                              value={tableFilters.사업유형}
                              onChange={(e) => setTableFilters({...tableFilters, 사업유형: e.target.value})}
                              style={{ 
                                fontSize: "9px", 
                                padding: "1px 2px", 
                                border: "1px solid #ccc", 
                                borderRadius: "3px",
                                backgroundColor: "white"
                              }}
                            >
                              {사업유형Options.map(option => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                          </div>
                        </th>
                        <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "11px", whiteSpace: "nowrap", width: "70px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span>담당자</span>
                          </div>
                        </th>
                        <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "11px", whiteSpace: "nowrap", width: "100px" }}>이름</th>
                        <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "11px", width: "120px" }}>소속</th>
                        <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "11px", width: "80px" }}>기관페이지</th>
                        <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "11px", width: "150px" }}>이메일</th>
                        <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "11px", width: "100px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span>세일즈 단계</span>
                            <select 
                              value={tableFilters.세일즈단계}
                              onChange={(e) => setTableFilters({...tableFilters, 세일즈단계: e.target.value})}
                              style={{ 
                                fontSize: "9px", 
                                padding: "1px 2px", 
                                border: "1px solid #ccc", 
                                borderRadius: "3px",
                                backgroundColor: "white"
                              }}
                            >
                              {세일즈단계Options.map(option => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                          </div>
                        </th>
                        <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "11px", width: "100px" }}>문의날짜</th>
                        <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "11px", width: "100px" }}>계약날짜</th>
                        <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "11px", width: "150px" }}>사용기간</th>
                        <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "11px", width: "200px" }}>사용자원</th>
                        <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "11px", whiteSpace: "nowrap", width: "100px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span>사용유형</span>
                            <select 
                              value={tableFilters.사용유형}
                              onChange={(e) => setTableFilters({...tableFilters, 사용유형: e.target.value})}
                              style={{ 
                                fontSize: "9px", 
                                padding: "1px 2px", 
                                border: "1px solid #ccc", 
                                borderRadius: "3px",
                                backgroundColor: "white"
                              }}
                            >
                              {사용유형Options.map(option => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                          </div>
                        </th>
                        <th style={{ padding: "6px 8px", textAlign: "right", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "11px", width: "105px" }}>견적/정산금액</th>
                        <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "11px", width: "200px" }}>비고</th>
                        <th style={{ padding: "6px 8px", textAlign: "center", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "11px", width: "120px" }}>업데이트 날짜</th>
                        <th style={{ padding: "6px 8px", textAlign: "center", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "11px", width: "70px" }}>작업</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCustomers.map((customer, index) => (
                        <tr key={index} style={{
                          borderBottom: "1px solid #e9ecef",
                          backgroundColor: index % 2 === 0 ? "#ffffff" : "#f8f9fa"
                        }}>
                          <td style={{ padding: "6px 8px", fontSize: "11px" }}>{customer.사업유형 || "-"}</td>
                          <td style={{ padding: "6px 8px", fontSize: "11px" }}>{customer.담당자 || "-"}</td>
                          <td style={{ padding: "6px 8px", fontSize: "11px", whiteSpace: "nowrap" }}>{customer.이름 || "-"}</td>
                          <td style={{ padding: "6px 8px", fontSize: "11px" }}>{customer.기관 || "-"}</td>
                          <td style={{ padding: "6px 8px", fontSize: "11px" }}>
                            {customer.기관페이지링크 ? (
                              <a href={customer.기관페이지링크} target="_blank" rel="noopener noreferrer" style={{ color: "#007bff", textDecoration: "none", fontSize: "11px" }}>
                                링크
                              </a>
                            ) : "-"}
                          </td>
                          <td style={{ padding: "6px 8px", fontSize: "11px" }}>{customer.이메일 || "-"}</td>
                          <td style={{ padding: "6px 8px", fontSize: "11px" }}>{customer.세일즈단계 || "-"}</td>
                          <td style={{ padding: "6px 8px", fontSize: "11px" }}>{customer.문의날짜 || "-"}</td>
                          <td style={{ padding: "6px 8px", fontSize: "11px" }}>{customer.계약날짜 || "-"}</td>
                          <td style={{ padding: "6px 8px", fontSize: "11px" }}>{customer.사용기간 || "-"}</td>
                          <td style={{ padding: "6px 8px", fontSize: "11px" }}>
                            {customer.사용자원 && Array.isArray(customer.사용자원) && customer.사용자원.length > 0 ? (
                              <div style={{ fontSize: "10px" }}>
                                {customer.사용자원.map((item, idx) => (
                                  <div key={idx} style={{ marginBottom: idx < customer.사용자원.length - 1 ? "2px" : "0" }}>
                                    {resourceMap[item.resource] || item.resource}
                                    {item.quantity && ` (${item.quantity}개)`}
                                  </div>
                                ))}
                              </div>
                            ) : (customer.사용자원 && typeof customer.사용자원 === 'string') ? (
                              // 이전 데이터 호환성 (문자열로 저장된 경우)
                              <span style={{ fontSize: "11px" }}>
                                {resourceMap[customer.사용자원] || customer.사용자원}
                                {customer.사용자원수량 && ` (${customer.사용자원수량}개)`}
                              </span>
                            ) : "-"}
                          </td>
                          <td style={{ padding: "6px 8px", fontSize: "11px", whiteSpace: "nowrap" }}>{customer.사용유형 || "-"}</td>
                          <td style={{ padding: "6px 8px", fontSize: "11px", textAlign: "right" }}>{customer["견적/정산금액"] || "-"}</td>
                          <td style={{ padding: "6px 8px", fontSize: "11px" }}>{customer.비고 || "-"}</td>
                          <td style={{ padding: "6px 8px", fontSize: "11px", textAlign: "center" }}>{customer.업데이트날짜 || "-"}</td>
                          <td style={{ padding: "6px 8px", textAlign: "center" }}>
                            <div style={{ display: "flex", gap: "3px", justifyContent: "center" }}>
                              <button
                                onClick={() => {
                                  // 사용기간 문자열 파싱
                                  const 사용기간 = customer.사용기간 || "";
                                  const 종료일없음 = 사용기간.includes("~ 현재");
                                  let 사용기간시작일 = "";
                                  let 사용기간종료일 = "";
                                  
                                  if (종료일없음) {
                                    사용기간시작일 = 사용기간.replace("~ 현재", "").trim();
                                  } else if (사용기간.includes("~")) {
                                    const parts = 사용기간.split("~");
                                    사용기간시작일 = parts[0].trim();
                                    사용기간종료일 = parts[1].trim();
                                  } else {
                                    사용기간시작일 = 사용기간;
                                  }
                                  
                                  // 사용자원 호환성 처리
                                  let 사용자원 = customer.사용자원 || [];
                                  if (typeof 사용자원 === 'string') {
                                    // 이전 문자열 형식을 배열로 변환
                                    사용자원 = 사용자원 ? [{
                                      resource: 사용자원,
                                      quantity: customer.사용자원수량 || 1
                                    }] : [];
                                  } else if (!Array.isArray(사용자원)) {
                                    사용자원 = [];
                                  }
                                  
                                  setCloudFormData({
                                    ...customer,
                                    사용자원,
                                    사용기간시작일,
                                    사용기간종료일,
                                    종료일없음
                                  });
                                  // 테이블은 정렬/필터가 적용되므로 index 대신 id를 저장
                                  setCloudEditingIndex(customer.id);
                                  setResourceDropdownOpen(false); // 드롭다운 닫기
                                  window.scrollTo({ top: 0, behavior: "smooth" });
                                }}
                                style={{
                                  padding: "4px 8px",
                                  backgroundColor: "#007bff",
                                  color: "white",
                                  border: "none",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  fontSize: "10px"
                                }}
                              >
                                수정
                              </button>
                              <button
                                onClick={async () => {
                                  if (window.confirm("정말 삭제하시겠습니까?")) {
                                    try {
                                      // DB에서 삭제
                                      await deleteCloudCustomer(customer.id);
                                      // 로컬 상태에서도 제거 (id 기준)
                                      setCloudCustomers(cloudCustomers.filter((c) => c.id !== customer.id));
                                      alert("고객이 삭제되었습니다.");
                                    } catch (err) {
                                      console.error("고객 삭제 실패:", err);
                                      alert("삭제에 실패했습니다. 다시 시도해주세요.");
                                    }
                                  }
                                }}
                                style={{
                                  padding: "4px 8px",
                                  backgroundColor: "#dc3545",
                                  color: "white",
                                  border: "none",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  fontSize: "10px"
                                }}
                              >
                                삭제
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
                  </>
                );
              })()}
            </div>
              </div>
            )}

            {/* 환불 탭 */}
            {cloudSubTab === "환불" && (
              <div>
                {/* 환불 고객 입력 폼 */}
                <div style={{
                  backgroundColor: "#f8f9fa",
                  padding: "20px",
                  borderRadius: "8px",
                  marginBottom: "24px",
                  border: "1px solid #dee2e6"
                }}>
                  <h3 style={{ fontSize: "18px", marginBottom: "16px", color: "#495057" }}>
                    {refundEditingIndex !== null ? "환불 정보 수정" : "신규 환불 등록"}
                  </h3>
                  
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: "12px",
                    marginBottom: "16px"
                  }}>
                    <div>
                      <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                        이름 <span style={{ color: "red" }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={refundFormData.이름}
                        onChange={(e) => setRefundFormData({ ...refundFormData, 이름: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "8px",
                          border: "1px solid #ced4da",
                          borderRadius: "4px",
                          fontSize: "14px"
                        }}
                      />
                    </div>
                    
                    <div>
                      <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                        기관명
                      </label>
                      <input
                        type="text"
                        value={refundFormData.기관}
                        onChange={(e) => setRefundFormData({ ...refundFormData, 기관: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "8px",
                          border: "1px solid #ced4da",
                          borderRadius: "4px",
                          fontSize: "14px"
                        }}
                      />
                    </div>
                    
                    <div>
                      <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                        기관 링크
                      </label>
                      <input
                        type="url"
                        placeholder="https://example.com"
                        value={refundFormData.기관링크}
                        onChange={(e) => setRefundFormData({ ...refundFormData, 기관링크: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "8px",
                          border: "1px solid #ced4da",
                          borderRadius: "4px",
                          fontSize: "14px"
                        }}
                      />
                    </div>
                    
                    <div>
                      <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                        크레딧 충전 금액
                      </label>
                      <input
                        type="text"
                        placeholder="예: 100만원"
                        value={refundFormData.크레딧충전금액}
                        onChange={(e) => setRefundFormData({ ...refundFormData, 크레딧충전금액: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "8px",
                          border: "1px solid #ced4da",
                          borderRadius: "4px",
                          fontSize: "14px"
                        }}
                      />
                    </div>
                    
                    <div>
                      <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                        환불금액 <span style={{ color: "red" }}>*</span>
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        placeholder="예: 500000"
                        value={refundFormData.환불금액}
                        onChange={(e) => setRefundFormData({ ...refundFormData, 환불금액: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "8px",
                          border: "1px solid #ced4da",
                          borderRadius: "4px",
                          fontSize: "14px"
                        }}
                      />
                    </div>
                    
                    <div>
                      <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                        환불날짜 <span style={{ color: "red" }}>*</span>
                      </label>
                      <input
                        type="date"
                        value={refundFormData.환불날짜}
                        onChange={(e) => setRefundFormData({ ...refundFormData, 환불날짜: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "8px",
                          border: "1px solid #ced4da",
                          borderRadius: "4px",
                          fontSize: "14px"
                        }}
                      />
                    </div>
                    
                    <div>
                      <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                        환불사유
                      </label>
                      <select
                        value={refundReasonOption}
                        onChange={(e) => {
                          const value = e.target.value;
                          setRefundReasonOption(value);
                          if (!value || value !== "기타") {
                            setRefundFormData({ ...refundFormData, 환불사유: value || "" });
                          }
                        }}
                        style={{
                          width: "100%",
                          padding: "8px",
                          border: "1px solid #ced4da",
                          borderRadius: "4px",
                          fontSize: "14px",
                          backgroundColor: "white"
                        }}
                      >
                        <option value="">환불 사유를 선택하세요</option>
                        {refundReasonOptions.map(option => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                      {refundReasonOption === "기타" && (
                        <input
                          type="text"
                          placeholder="환불 사유를 입력하세요"
                          value={refundFormData.환불사유}
                          onChange={(e) => setRefundFormData({ ...refundFormData, 환불사유: e.target.value })}
                          style={{
                            width: "100%",
                            marginTop: "8px",
                            padding: "8px",
                            border: "1px solid #ced4da",
                            borderRadius: "4px",
                            fontSize: "14px"
                          }}
                        />
                      )}
                    </div>
                  </div>
                  
                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                    {refundEditingIndex !== null && (
                      <button
                        onClick={handleRefundCancel}
                        style={{
                          padding: "10px 20px",
                          backgroundColor: "#6c757d",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "14px",
                          fontWeight: "500"
                        }}
                      >
                        취소
                      </button>
                    )}
                    <button
                      onClick={handleRefundSubmit}
                      style={{
                        padding: "10px 20px",
                        backgroundColor: "#dc3545",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "14px",
                        fontWeight: "500"
                      }}
                    >
                      {refundEditingIndex !== null ? "수정 완료" : "등록"}
                    </button>
                  </div>
                </div>

                {/* 환불 고객 목록 테이블 */}
                <div style={{
                  backgroundColor: "#fff",
                  border: "1px solid #dee2e6",
                  borderRadius: "8px",
                  overflow: "hidden"
                }}>
                  <div style={{ 
                    padding: "16px", 
                    borderBottom: "2px solid #dee2e6",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}>
                    <h3 style={{ fontSize: "16px", margin: 0, color: "#495057", fontWeight: "600" }}>
                      환불 고객 목록 ({refundCustomers.length}건)
                    </h3>
                    <button
                      onClick={() => {
                        // 환불 고객 데이터를 CSV 형식으로 변환하기 전에 기관링크 필드 통합
                        const processedData = refundCustomers.map(customer => ({
                          ...customer,
                          기관링크: customer.기관링크 || customer.기관페이지링크 || ""
                        }));
                        const headers = [
                          { key: "이름", label: "이름" },
                          { key: "기관", label: "기관명" },
                          { key: "기관링크", label: "기관링크" },
                          { key: "크레딧충전금액", label: "크레딧 충전 금액" },
                          { key: "환불금액", label: "환불금액" },
                          { key: "환불날짜", label: "환불날짜" },
                          { key: "환불사유", label: "환불사유" }
                        ];
                        const csv = convertToCSV(processedData, headers);
                        const filename = `refund_customers_${new Date().toISOString().split('T')[0]}.csv`;
                        downloadCSV(csv, filename);
                      }}
                      style={{
                        padding: "8px 16px",
                        backgroundColor: "#dc3545",
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "13px",
                        fontWeight: "500",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px"
                      }}
                    >
                      📥 CSV 다운로드
                    </button>
                  </div>
                  
                  {refundCustomers.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "40px", color: "#6c757d" }}>
                      등록된 환불 고객이 없습니다.
                    </div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ backgroundColor: "#f8f9fa" }}>
                          <th style={{ padding: "12px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "12px" }}>이름</th>
                          <th style={{ padding: "12px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "12px" }}>기관명</th>
                          <th style={{ padding: "12px", textAlign: "right", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "12px" }}>크레딧 충전 금액</th>
                          <th style={{ padding: "12px", textAlign: "right", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "12px" }}>환불금액</th>
                          <th style={{ padding: "12px", textAlign: "center", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "12px" }}>환불날짜</th>
                          <th style={{ padding: "12px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "12px" }}>환불사유</th>
                          <th style={{ padding: "12px", textAlign: "center", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "12px" }}>작업</th>
                        </tr>
                      </thead>
                      <tbody>
                        {refundCustomers.map((customer, index) => (
                          <tr key={customer?.id ?? index} style={{
                            borderBottom: "1px solid #e9ecef",
                            backgroundColor: index % 2 === 0 ? "#ffffff" : "#f8f9fa"
                          }}>
                            <td style={{ padding: "12px" }}>{customer.이름 || "-"}</td>
                            <td style={{ padding: "12px" }}>
                              {customer.기관 || "-"}
                              {(customer.기관링크 || customer.기관페이지링크) && (
                                <span style={{ marginLeft: "8px" }}>
                                  <a 
                                    href={customer.기관링크 || customer.기관페이지링크} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    style={{ 
                                      color: "#007bff", 
                                      textDecoration: "none",
                                      fontSize: "11px"
                                    }}
                                  >
                                    🔗
                                  </a>
                                </span>
                              )}
                            </td>
                            <td style={{ padding: "12px", textAlign: "right" }}>{customer.크레딧충전금액 || customer.원계약금액 || "-"}</td>
                            <td style={{ padding: "12px", textAlign: "right", fontWeight: "600", color: "#dc2626" }}>
                              {customer.환불금액 || "-"}
                            </td>
                            <td style={{ padding: "12px", textAlign: "center" }}>{customer.환불날짜 || "-"}</td>
                            <td style={{ padding: "12px" }}>{customer.환불사유 || "-"}</td>
                            <td style={{ padding: "12px", textAlign: "center" }}>
                              <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
                                <button
                                  onClick={() => handleRefundEdit(customer, index)}
                                  style={{
                                    padding: "6px 12px",
                                    backgroundColor: "#007bff",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                    fontSize: "12px"
                                  }}
                                >
                                  수정
                                </button>
                                <button
                                  onClick={() => {
                                    if (customer?.id != null) {
                                      handleRefundDelete(customer.id);
                                    } else {
                                      alert("삭제할 환불 정보를 찾을 수 없습니다.");
                                    }
                                  }}
                                  style={{
                                    padding: "6px 12px",
                                    backgroundColor: "#dc3545",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                    fontSize: "12px"
                                  }}
                                >
                                  삭제
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* CRM 탭 */}
            {cloudSubTab === "CRM" && (
              <div>
                {/* CRM 고객 입력 폼 */}
                <div style={{
                  backgroundColor: "#f8f9fa",
                  padding: "20px",
                  borderRadius: "8px",
                  marginBottom: "24px",
                  border: "1px solid #dee2e6"
                }}>
                  <h3 style={{ fontSize: "18px", marginBottom: "16px", color: "#495057" }}>
                    {crmEditingIndex !== null ? "CRM 정보 수정" : "신규 CRM 등록"}
                  </h3>

                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: "12px",
                    marginBottom: "16px"
                  }}>
                    <div>
                      <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                        기관 생성일
                      </label>
                      <input
                        type="date"
                        value={crmFormData.기관생성일}
                        onChange={(e) => setCrmFormData({ ...crmFormData, 기관생성일: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "8px",
                          border: "1px solid #ced4da",
                          borderRadius: "4px",
                          fontSize: "14px"
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                        성함 <span style={{ color: "red" }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={crmFormData.성함}
                        onChange={(e) => setCrmFormData({ ...crmFormData, 성함: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "8px",
                          border: "1px solid #ced4da",
                          borderRadius: "4px",
                          fontSize: "14px"
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                        이메일 <span style={{ color: "red" }}>*</span>
                      </label>
                      <input
                        type="email"
                        value={crmFormData.이메일}
                        onChange={(e) => setCrmFormData({ ...crmFormData, 이메일: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "8px",
                          border: "1px solid #ced4da",
                          borderRadius: "4px",
                          fontSize: "14px"
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                        카드미등록 발송일자
                      </label>
                      <input
                        type="date"
                        value={crmFormData.카드미등록발송일자}
                        onChange={(e) => setCrmFormData({ ...crmFormData, 카드미등록발송일자: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "8px",
                          border: "1px solid #ced4da",
                          borderRadius: "4px",
                          fontSize: "14px"
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                        카드등록일
                      </label>
                      <input
                        type="date"
                        value={crmFormData.카드등록일}
                        onChange={(e) => setCrmFormData({ ...crmFormData, 카드등록일: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "8px",
                          border: "1px solid #ced4da",
                          borderRadius: "4px",
                          fontSize: "14px"
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                        크레딧 충전일
                      </label>
                      <input
                        type="date"
                        value={crmFormData.크레딧충전일}
                        onChange={(e) => setCrmFormData({ ...crmFormData, 크레딧충전일: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "8px",
                          border: "1px solid #ced4da",
                          borderRadius: "4px",
                          fontSize: "14px"
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                        기관 링크
                      </label>
                      <input
                        type="url"
                        placeholder="https://example.com"
                        value={crmFormData.기관링크}
                        onChange={(e) => setCrmFormData({ ...crmFormData, 기관링크: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "8px",
                          border: "1px solid #ced4da",
                          borderRadius: "4px",
                          fontSize: "14px"
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
                        기관 어드민 링크
                      </label>
                      <input
                        type="url"
                        placeholder="https://admin.example.com"
                        value={crmFormData.기관어드민링크}
                        onChange={(e) => setCrmFormData({ ...crmFormData, 기관어드민링크: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "8px",
                          border: "1px solid #ced4da",
                          borderRadius: "4px",
                          fontSize: "14px"
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                    {crmEditingIndex !== null && (
                      <button
                        onClick={resetCrmForm}
                        style={{
                          padding: "10px 20px",
                          backgroundColor: "#6c757d",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "14px",
                          fontWeight: "500"
                        }}
                      >
                        취소
                      </button>
                    )}
                    <button
                      onClick={handleCrmSubmit}
                      style={{
                        padding: "10px 20px",
                        backgroundColor: "#198754",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "14px",
                        fontWeight: "500"
                      }}
                    >
                      {crmEditingIndex !== null ? "수정 완료" : "등록"}
                    </button>
                  </div>
                </div>

                {/* CRM 고객 목록 테이블 */}
                <div style={{
                  backgroundColor: "#fff",
                  border: "1px solid #dee2e6",
                  borderRadius: "8px",
                  overflow: "hidden"
                }}>
                  <div style={{ 
                    padding: "16px", 
                    borderBottom: "2px solid #dee2e6",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}>
                    <h3 style={{ fontSize: "16px", margin: 0, color: "#495057", fontWeight: "600" }}>
                      CRM 고객 목록 ({filteredCrmCustomers.length}건)
                    </h3>
                    <button
                      onClick={() => {
                        const headers = [
                          { key: "기관생성일", label: "기관생성일" },
                          { key: "성함", label: "성함" },
                          { key: "이메일", label: "이메일" },
                          { key: "카드미등록발송일자", label: "카드미등록발송일자" },
                          { key: "카드등록일", label: "카드등록일" },
                          { key: "크레딧충전일", label: "크레딧충전일" },
                          { key: "기관링크", label: "기관링크" },
                          { key: "기관어드민링크", label: "기관어드민링크" }
                        ];
                        const csv = convertToCSV(filteredCrmCustomers, headers);
                        const filename = `crm_customers_${new Date().toISOString().split('T')[0]}.csv`;
                        downloadCSV(csv, filename);
                      }}
                      style={{
                        padding: "8px 16px",
                        backgroundColor: "#198754",
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "13px",
                        fontWeight: "500",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px"
                      }}
                    >
                      📥 CSV 다운로드
                    </button>
                  </div>

                  {filteredCrmCustomers.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "40px", color: "#6c757d" }}>
                      등록된 CRM 고객이 없습니다.
                    </div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ backgroundColor: "#f8f9fa" }}>
                          <th style={{ padding: "8px 12px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "12px" }}>
                            <select
                              value={crmFilters.기관생성일}
                              onChange={(e) => setCrmFilters((prev) => ({ ...prev, 기관생성일: e.target.value }))}
                              style={{
                                width: "100%",
                                padding: "4px 6px",
                                borderRadius: "4px",
                                border: "1px solid #ced4da",
                                fontSize: "11px",
                                backgroundColor: "transparent",
                              }}
                            >
                              <option value="전체">기관생성일: 전체</option>
                              {crmDateOptions.기관생성일.map((v) => (
                                <option key={v} value={v}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          </th>
                          <th style={{ padding: "12px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "12px" }}>성함</th>
                          <th style={{ padding: "12px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "12px" }}>이메일</th>
                          <th style={{ padding: "8px 12px", textAlign: "center", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "12px" }}>
                            <select
                              value={crmFilters.카드미등록발송일자}
                              onChange={(e) => setCrmFilters((prev) => ({ ...prev, 카드미등록발송일자: e.target.value }))}
                              style={{
                                width: "100%",
                                padding: "4px 6px",
                                borderRadius: "4px",
                                border: "1px solid #ced4da",
                                fontSize: "11px",
                                backgroundColor: "transparent",
                              }}
                            >
                              <option value="전체">카드미등록 발송일자: 전체</option>
                              {crmDateOptions.카드미등록발송일자.map((v) => (
                                <option key={v} value={v}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          </th>
                          <th style={{ padding: "8px 12px", textAlign: "center", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "12px" }}>
                            <select
                              value={crmFilters.카드등록일}
                              onChange={(e) => setCrmFilters((prev) => ({ ...prev, 카드등록일: e.target.value }))}
                              style={{
                                width: "100%",
                                padding: "4px 6px",
                                borderRadius: "4px",
                                border: "1px solid #ced4da",
                                fontSize: "11px",
                                backgroundColor: "transparent",
                              }}
                            >
                              <option value="전체">카드등록일: 전체</option>
                              {crmDateOptions.카드등록일.map((v) => (
                                <option key={v} value={v}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          </th>
                          <th style={{ padding: "8px 12px", textAlign: "center", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "12px" }}>
                            <select
                              value={crmFilters.크레딧충전일}
                              onChange={(e) => setCrmFilters((prev) => ({ ...prev, 크레딧충전일: e.target.value }))}
                              style={{
                                width: "100%",
                                padding: "4px 6px",
                                borderRadius: "4px",
                                border: "1px solid #ced4da",
                                fontSize: "11px",
                                backgroundColor: "transparent",
                              }}
                            >
                              <option value="전체">크레딧 충전일: 전체</option>
                              {crmDateOptions.크레딧충전일.map((v) => (
                                <option key={v} value={v}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          </th>
                          <th style={{ padding: "12px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "12px" }}>기관 링크</th>
                          <th style={{ padding: "12px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "12px" }}>기관 어드민 링크</th>
                          <th style={{ padding: "12px", textAlign: "center", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "12px" }}>작업</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCrmCustomers.map((customer, index) => (
                          <tr key={customer?.id ?? index} style={{
                            borderBottom: "1px solid #e9ecef",
                            backgroundColor: index % 2 === 0 ? "#ffffff" : "#f8f9fa"
                          }}>
                            <td style={{ padding: "12px" }}>{customer.기관생성일 || "-"}</td>
                            <td style={{ padding: "12px" }}>{customer.성함 || "-"}</td>
                            <td style={{ padding: "12px" }}>{customer.이메일 || "-"}</td>
                            <td style={{ padding: "12px", textAlign: "center" }}>{customer.카드미등록발송일자 || "-"}</td>
                            <td style={{ padding: "12px", textAlign: "center" }}>{customer.카드등록일 || "-"}</td>
                            <td style={{ padding: "12px", textAlign: "center" }}>{customer.크레딧충전일 || "-"}</td>
                            <td style={{ padding: "12px" }}>
                              {customer.기관링크 ? (
                                <a
                                  href={customer.기관링크}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    color: "#007bff",
                                    textDecoration: "none",
                                    fontSize: "12px"
                                  }}
                                >
                                  {customer.기관링크}
                                </a>
                              ) : (
                                "-"
                              )}
                            </td>
                            <td style={{ padding: "12px" }}>
                              {customer.기관어드민링크 ? (
                                <a
                                  href={customer.기관어드민링크}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    color: "#007bff",
                                    textDecoration: "none",
                                    fontSize: "12px"
                                  }}
                                >
                                  {customer.기관어드민링크}
                                </a>
                              ) : (
                                "-"
                              )}
                            </td>
                            <td style={{ padding: "12px", textAlign: "center" }}>
                              <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
                                <button
                                  onClick={() => handleCrmEdit(customer, index)}
                                  style={{
                                    padding: "6px 12px",
                                    backgroundColor: "#0d6efd",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                    fontSize: "12px"
                                  }}
                                >
                                  수정
                                </button>
                                <button
                                  onClick={() => handleCrmDelete(customer.id)}
                                  style={{
                                    padding: "6px 12px",
                                    backgroundColor: "#dc3545",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                    fontSize: "12px"
                                  }}
                                >
                                  삭제
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
