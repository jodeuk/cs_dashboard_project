import React, { lazy, Suspense, useState, useEffect, useMemo, useRef, useCallback } from "react";
import { fetchUserchats, checkApiHealth, refreshCache, fetchCloudCustomers, createCloudCustomer, updateCloudCustomer, deleteCloudCustomer, fetchRefundCustomers, createRefundCustomer, updateRefundCustomer, deleteRefundCustomer, fetchManagerStats, fetchCrmCustomers, createCrmCustomer, updateCrmCustomer, deleteCrmCustomer, uploadCrmCustomersCSV, apiCall } from "./api";
import FilterPanel from "./components/FilterPanel";
import ChartSection from "./components/ChartSection";
import MultiLineChartSection from "./components/MultiLineChartSection";
import HandlingTypeDonut from "./components/HandlingTypeDonut";
import SLAStackBar from "./components/SLAStackBar";
// 박스플롯/비즈웜 대신 분포 커브 차트
import HandlingLeadtimeDensity from "./components/HandlingLeadtimeDensity";
import DayOfWeekTimeDistributionChart from "./components/DayOfWeekTimeDistributionChart";
import MultiSelectDropdown from "./components/MultiSelectDropdown";
import CloudCrmChartsSection from "./components/CloudCrmChartsSection";
import CloudAmountSummaryCard from "./components/CloudAmountSummaryCard";
import CloudTimelineChart from "./components/CloudTimelineChart";
import InquiryTypeByDateChart from "./components/InquiryTypeByDateChart";
import ChannelByDateChart from "./components/ChannelByDateChart";
import CustomerTypeDonutChart from "./components/CustomerTypeDonutChart";
import ResourceUsageChart from "./components/ResourceUsageChart";
import RefundReasonChart from "./components/RefundReasonChart";
import InstitutionTimelineChart from "./components/InstitutionTimelineChart";
import WeeklyAdoptionChart from "./components/WeeklyAdoptionChart";
import KpiCards from "./components/KpiCards";
import ServiceInquiryTable from "./components/ServiceInquiryTable";
import SalesFunnelWidget from "./components/SalesFunnelWidget";
import CloudCustomerForm from "./components/CloudCustomerForm";
import CloudCustomerTable from "./components/CloudCustomerTable";
import RefundCustomerForm from "./components/RefundCustomerForm";
import RefundCustomerTable from "./components/RefundCustomerTable";
import CrmCustomerForm from "./components/CrmCustomerForm";
import CrmCustomerTable from "./components/CrmCustomerTable";
import { PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const CSatChartSection = lazy(() => import("./components/CSatChartSection"));
const CSatTypeChartSection = lazy(() => import("./components/CSatTypeChartSection"));
const CSatCommentsSection = lazy(() => import("./components/CSatCommentsSection"));
// 교육만족도 관련 컴포넌트 - 주석 처리
// const EliceTrackItemTrendChart = lazy(() => import("./components/EliceTrackItemTrendChart"));
// const UnitySatisfactionChart = lazy(() => import("./components/UnitySatisfactionChart"));
// const UnitySatisfactionRadar = lazy(() => import("./components/UnitySatisfactionRadar"));
// const KdtTpm3SatisfactionChart = lazy(() => import("./components/KdtTpm3SatisfactionChart"));
// const KdtTpm3SatisfactionRadar = lazy(() => import("./components/KdtTpm3SatisfactionRadar"));

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
  const [tableDataCache, setTableDataCache] = useState([]); // 테이블용 전체 데이터 (필터 없음)
  // ✅ 서비스유형/문의유형 테이블 필터
  const [serviceInquiryTableFilters, setServiceInquiryTableFilters] = useState({
    서비스유형: [],
    문의유형: [],
    문의유형_2차: [],
  });
  // ✅ 테이블 정렬 상태
  const [tableSort, setTableSort] = useState({
    column: "문의량", // "문의량", "평균응답시간", "총응답시간"
    direction: "desc", // "asc" or "desc"
  });
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
  const [csDateGroup, setCsDateGroup] = useState("Monthly");       // CS 문의량 차트용
  const [mlDateGroup, setMlDateGroup] = useState("Monthly");       // 평균 응답/해결 시간 차트용
  const [managerDateGroup, setManagerDateGroup] = useState("Monthly"); // 담당자별 문의량 차트용
  const [inquiryTypeDateGroup, setInquiryTypeDateGroup] = useState("Monthly"); // 일자별 문의유형비율 차트용
  const [channelDateGroup, setChannelDateGroup] = useState("Monthly"); // 일자별 채널비율 차트용
  const [start, setStart] = useState(oneMonthAgoStr);
  const [end, setEnd] = useState(todayStr);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [apiConnected, setApiConnected] = useState(null);
  const [csatData, setCsatData] = useState(null);
  const [managerStats, setManagerStats] = useState(null);
  const [activeTab, setActiveTab] = useState("CS");
  // 교육만족도 관련 state - 주석 처리 (false 조건으로 실행 안되지만 변수 참조를 위해 유지)
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
  const [timelineViewMode, setTimelineViewMode] = useState("개월"); // 타임라인 뷰 모드: 오늘/주/개월/분기
  
  // 테이블 필터링 상태
  const [tableFilters, setTableFilters] = useState({
    사업유형: "전체",
    세일즈단계: "전체", 
    사용유형: "전체",
    담당자: "전체",
    서비스유형: "전체",
    사용자원: "전체"
  });
  const [tableSearch, setTableSearch] = useState("");
  const [tableSearchField, setTableSearchField] = useState("이름");
  const [cloudFormData, setCloudFormData] = useState({
    사업유형: "",
    담당자: "",
    이름: "",
    기관: "",
    기관페이지링크: "",
    이메일: "",
    문의날짜: "",
    계약날짜: "",
    세일즈단계: "",
    서비스유형: "",
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
    if (!apiConnected || apiConnected.ok !== true) return;
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
    if (!apiConnected || apiConnected.ok !== true) return;
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

  const handleCrmCsvUpload = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // CSV 파일인지 확인
    if (!file.name.toLowerCase().endsWith('.csv')) {
      alert("CSV 파일만 업로드 가능합니다.");
      event.target.value = ''; // 파일 선택 초기화
      return;
    }

    try {
      setLoading(true);
      const result = await uploadCrmCustomersCSV(file);
      
      if (result.success) {
        const uploadedCount = result.uploaded || 0;
        const errorCount = result.errors?.length || 0;
        
        let message = `✅ ${uploadedCount}건의 CRM 데이터가 업로드되었습니다.`;
        if (errorCount > 0) {
          message += `\n⚠️ ${errorCount}건의 오류가 발생했습니다.`;
          if (result.errors && result.errors.length > 0) {
            message += '\n\n오류 내용:\n' + result.errors.slice(0, 5).join('\n');
            if (result.errors.length > 5) {
              message += `\n... 외 ${result.errors.length - 5}건`;
            }
          }
        }
        
        alert(message);
        await loadCrmCustomers();
        setSuccess(`✅ ${uploadedCount}건 업로드 완료`);
        setTimeout(() => setSuccess(null), 3000);
      } else {
        throw new Error("업로드 실패");
      }
    } catch (err) {
      console.error("CSV 업로드 실패:", err);
      const errorMessage = err?.response?.data?.detail || err?.message || "CSV 업로드에 실패했습니다.";
      alert(`CSV 업로드 실패: ${errorMessage}`);
    } finally {
      setLoading(false);
      event.target.value = ''; // 파일 선택 초기화
    }
  }, [loadCrmCustomers]);

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

  // 교육만족도 - 샘플 코치 데이터 로드 (주석 처리)
  // useEffect(() => {
  //   // 임시 샘플 데이터 - 실제로는 API 호출로 DB에서 가져와야 함
  //   const sampleCoachData = [
  //     {
  //       코치명: "김코치",
  //       강의과목: "React 기초",
  //       평균점수: 4.7,
  //       강의내용: 4.8,
  //       강의방식: 4.6,
  //       소통: 4.5,
  //       피드백: 4.9
  //     },
  //     {
  //       코치명: "이코치",
  //       강의과목: "JavaScript 심화",
  //       평균점수: 4.2,
  //       강의내용: 4.3,
  //       강의방식: 4.1,
  //       소통: 4.0,
  //       피드백: 4.4
  //     },
  //     {
  //       코치명: "박코치",
  //       강의과목: "Node.js",
  //       평균점수: 3.8,
  //       강의내용: 3.9,
  //       강의방식: 3.7,
  //       소통: 3.6,
  //       피드백: 4.0
  //     },
  //     {
  //       코치명: "최코치",
  //       강의과목: "Python 기초",
  //       평균점수: 4.9,
  //       강의내용: 4.9,
  //       강의방식: 4.8,
  //       소통: 5.0,
  //       피드백: 4.9
  //     },
  //     {
  //       코치명: "정코치",
  //       강의과목: "데이터베이스",
  //       평균점수: 4.1,
  //       강의내용: 4.2,
  //       강의방식: 4.0,
  //       소통: 4.1,
  //       피드백: 4.0
  //     }
  //   ];
  //   
  //   setCoachData(sampleCoachData);
  // }, []);

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
      .catch(() => setApiConnected({ ok: false }));
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


  // 테이블용 전체 데이터 로드 (필터 없이, 한 번만) - 현재 존재하는 전체 캐시 데이터
  // apiCall을 직접 사용하여 periodController와 독립적으로 실행 (다른 요청 취소 방지)
  const loadTableData = useCallback(async () => {
    if (!apiConnected || apiConnected.ok !== true) return;
    try {
      // 넓은 범위로 요청하되 refresh_mode: "cache"로 하면 백엔드에서 캐시에 있는 것만 반환
      // 현재 존재하는 전체 캐시 데이터를 가져옴 (예: 4월~12월)
      const params = {
        start: "2020-01-01", // 넓은 시작 범위
        end: "2099-12-31",   // 넓은 종료 범위
        refresh_mode: "cache", // 캐시만 사용, API 호출 없음 - 존재하는 캐시만 반환
        고객유형: "전체",
        고객유형_2차: "전체",
        문의유형: "전체",
        문의유형_2차: "전체",
        서비스유형: "전체",
        서비스유형_2차: "전체"
      };
      // apiCall을 직접 사용하여 periodController와 독립적으로 실행
      const resp = await apiCall("get", "/period-data", params);
      const rows = Array.isArray(resp) ? resp : (Array.isArray(resp?.data) ? resp.data : []);
      setTableDataCache(rows);
    } catch (err) {
      console.error("테이블 데이터 로드 실패:", err);
    }
  }, [apiConnected]);

  // 최초 연결 후, 현재 필터로 로드
  useEffect(() => {
    if (apiConnected && apiConnected.ok === true) {
      fetchRowsWithParams("cache");
      loadCsatAnalysis();
      loadManagerStats();
      // 테이블용 전체 데이터는 약간 지연시켜서 다른 요청과 충돌 방지
      setTimeout(() => {
        loadTableData();
      }, 500);
    }
  }, [apiConnected, start, end, filterVals, fetchRowsWithParams, loadTableData]);


  // Cloud 고객 데이터 로드
  useEffect(() => {
    const loadCloudCustomers = async () => {
      if (apiConnected && apiConnected.ok === true && activeTab === "Cloud") {
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
    if (apiConnected && apiConnected.ok === true && activeTab === "Cloud") {
      loadRefundCustomers();
    }
  }, [apiConnected, activeTab, loadRefundCustomers]);

  useEffect(() => {
    if (apiConnected && apiConnected.ok === true && activeTab === "Cloud") {
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
    
    if (csDateGroup === "Daily") {
      // 일간 집계
      const map = {};
      filteredRows.forEach((item) => {
        const d = parseTsKST(item.firstAskedAt || item.createdAt);
        if (!d) return;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (!map[key]) {
          map[key] = {
            x축: `${d.getMonth() + 1}/${d.getDate()}`,
            문의량: 0,
            year: d.getFullYear(),
            month: d.getMonth() + 1,
            date: d.getDate()
          };
        }
        map[key].문의량 += 1;
      });
      
      // start부터 end까지 모든 일 생성
      const allDays = [];
      const current = new Date(startDate);
      while (current <= endDate) {
        const year = current.getFullYear();
        const month = current.getMonth() + 1;
        const date = current.getDate();
        const key = `${year}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
        allDays.push({
          key,
          x축: `${month}/${date}`,
          문의량: map[key]?.문의량 || 0,
          year,
          month,
          date
        });
        // 다음 날로 이동
        current.setDate(current.getDate() + 1);
      }
      
      const data = allDays.map(item => ({
        label: item.x축,
        value: item.문의량
      }));
      return data;
    } else if (csDateGroup === "Monthly") {
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
        // 월요일 기준으로 주 시작일 계산
        const weekStart = new Date(d);
        const day = weekStart.getDay(); // 0(일)~6(토)
        const diffToMon = (day + 6) % 7; // 월요일까지의 차이 (월=0, 화=1, ..., 일=6)
        weekStart.setDate(d.getDate() - diffToMon);
        weekStart.setHours(0, 0, 0, 0);
        const weekKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}-${String(
          weekStart.getDate()
        ).padStart(2, "0")}`;
        if (!map[weekKey]) {
          const isFirstWeekOfMonth = weekStart.getDate() <= 7;
          map[weekKey] = {
            x축: `WB${weekStart.getMonth() + 1}/${weekStart.getDate()}`,
            문의량: 0,
            월레이블: isFirstWeekOfMonth ? `${weekStart.getMonth() + 1}월` : null,
            month: weekStart.getMonth() + 1,
            weekStartDate: new Date(weekStart),
          };
        }
        map[weekKey].문의량 += 1;
      });
      
      // start부터 end까지 모든 주 생성 (월요일 기준)
      const allWeeks = [];
      const current = new Date(startDate);
      // 시작일이 속한 주의 월요일로 이동
      const startDay = current.getDay(); // 0(일)~6(토)
      const diffToMon = (startDay + 6) % 7; // 월요일까지의 차이
      current.setDate(current.getDate() - diffToMon);
      current.setHours(0, 0, 0, 0);
      
      while (current <= endDate) {
        const weekKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(
          current.getDate()
        ).padStart(2, "0")}`;
        const isFirstWeekOfMonth = current.getDate() <= 7;
        const existing = map[weekKey];
        
        allWeeks.push({
          key: weekKey,
          x축: `WB${current.getMonth() + 1}/${current.getDate()}`,
          문의량: existing?.문의량 || 0,
          월레이블: isFirstWeekOfMonth ? `${current.getMonth() + 1}월` : null,
          month: current.getMonth() + 1,
          weekStartDate: new Date(current),
        });
        
        // 다음 주로 이동 (7일 후)
        current.setDate(current.getDate() + 7);
      }

      // 11주 이상이면 WB 접두사 제거
      const shouldRemoveWB = allWeeks.length >= 11;
      const data = allWeeks.map((item, index) => {
        let 월레이블 = item.월레이블;
        if (!월레이블 && index > 0) {
          const prevItem = allWeeks[index - 1];
          if (prevItem && prevItem.month !== item.month) {
            월레이블 = `${item.month}월`;
          }
        }
        if (index === 0 && !월레이블) 월레이블 = `${item.month}월`;
        let label = item.x축;
        if (shouldRemoveWB && label.startsWith('WB')) {
          label = label.substring(2); // 'WB' 제거
        }
        return { label, value: item.문의량, 월레이블 };
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
      
      if (csDateGroup === "Daily") {
        // 일간 집계
        const map = {};
        serviceRows.forEach((item) => {
          const d = parseTsKST(item.firstAskedAt || item.createdAt);
          if (!d) return;
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          if (!map[key]) {
            map[key] = {
              x축: `${d.getMonth() + 1}/${d.getDate()}`,
              문의량: 0,
              year: d.getFullYear(),
              month: d.getMonth() + 1,
              date: d.getDate()
            };
          }
          map[key].문의량 += 1;
        });
        
        // start부터 end까지 모든 일 생성
        const allDays = [];
        const current = new Date(startDate);
        while (current <= endDate) {
          const year = current.getFullYear();
          const month = current.getMonth() + 1;
          const date = current.getDate();
          const key = `${year}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
          allDays.push({
            key,
            x축: `${month}/${date}`,
            문의량: map[key]?.문의량 || 0,
            year,
            month,
            date
          });
          current.setDate(current.getDate() + 1);
        }
        
        result[serviceType] = allDays.map(item => ({
          label: item.x축,
          value: item.문의량
        }));
      } else if (csDateGroup === "Monthly") {
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
          // 월요일 기준으로 주 시작일 계산
          const weekStart = new Date(d);
          const day = weekStart.getDay(); // 0(일)~6(토)
          const diffToMon = (day + 6) % 7; // 월요일까지의 차이
          weekStart.setDate(d.getDate() - diffToMon);
          weekStart.setHours(0, 0, 0, 0);
          const weekKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}-${String(
            weekStart.getDate()
          ).padStart(2, "0")}`;
          if (!map[weekKey]) {
            const isFirstWeekOfMonth = weekStart.getDate() <= 7;
            map[weekKey] = {
              x축: `WB${weekStart.getMonth() + 1}/${weekStart.getDate()}`,
              문의량: 0,
              월레이블: isFirstWeekOfMonth ? `${weekStart.getMonth() + 1}월` : null,
              month: weekStart.getMonth() + 1,
              weekStartDate: new Date(weekStart),
            };
          }
          map[weekKey].문의량 += 1;
        });
        
        // start부터 end까지 모든 주 생성 (월요일 기준)
        const allWeeks = [];
        const current = new Date(startDate);
        const startDay = current.getDay(); // 0(일)~6(토)
        const diffToMon = (startDay + 6) % 7; // 월요일까지의 차이
        current.setDate(current.getDate() - diffToMon);
        current.setHours(0, 0, 0, 0);
        
        while (current <= endDate) {
          const weekKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(
            current.getDate()
          ).padStart(2, "0")}`;
          const isFirstWeekOfMonth = current.getDate() <= 7;
          const existing = map[weekKey];
          
          allWeeks.push({
            key: weekKey,
            x축: `WB${current.getMonth() + 1}/${current.getDate()}`,
            문의량: existing?.문의량 || 0,
            월레이블: isFirstWeekOfMonth ? `${current.getMonth() + 1}월` : null,
            month: current.getMonth() + 1,
            weekStartDate: new Date(current),
          });
          
          current.setDate(current.getDate() + 7);
        }

        // 11주 이상이면 WB 접두사 제거
        const shouldRemoveWB = allWeeks.length >= 11;
        result[serviceType] = allWeeks.map((item, index) => {
          let 월레이블 = item.월레이블;
          if (!월레이블 && index > 0) {
            const prevItem = allWeeks[index - 1];
            if (prevItem && prevItem.month !== item.month) {
              월레이블 = `${item.month}월`;
            }
          }
          if (index === 0 && !월레이블) 월레이블 = `${item.month}월`;
          let label = item.x축;
          if (shouldRemoveWB && label.startsWith('WB')) {
            label = label.substring(2); // 'WB' 제거
          }
          return { label, value: item.문의량, 월레이블 };
        });
      }
    });
    
    return result;
  }, [filteredRows, csDateGroup, start, end, filterVals.서비스유형]);

  // ✅ 평균 응답/해결 시간 차트: Daily/Weekly/Monthly 각각 집계
  const avgTimeDaily = useMemo(() => {
    if (filteredRows.length === 0) return [];
    const startDate = new Date(start);
    const endDate = new Date(end);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
    
    const map = {};
    for (const item of filteredRows) {
      const d = parseTsKST(item.firstAskedAt);
      if (!d) continue;
      const dayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!map[dayKey]) {
        map[dayKey] = {
          x축: `${d.getMonth()+1}/${d.getDate()}`,
          operationWaitingTime: [], operationAvgReplyTime: [],
          operationTotalReplyTime: [], operationResolutionTime: []
        };
      }
      const pushIf = (arr, v) => { const n = timeToSec(v); if (n > 0) arr.push(n); };
      pushIf(map[dayKey].operationWaitingTime, item.operationWaitingTime);
      pushIf(map[dayKey].operationAvgReplyTime, item.operationAvgReplyTime);
      pushIf(map[dayKey].operationTotalReplyTime, item.operationTotalReplyTime);
      pushIf(map[dayKey].operationResolutionTime, item.operationResolutionTime);
    }
    
    // start부터 end까지 모든 일 생성
    const allDays = [];
    const current = new Date(startDate);
    while (current <= endDate) {
      const year = current.getFullYear();
      const month = current.getMonth() + 1;
      const date = current.getDate();
      const dayKey = `${year}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
      const existing = map[dayKey];
      allDays.push({
        x축: `${month}/${date}`,
        operationWaitingTime: existing ? (avg(existing.operationWaitingTime) || null) : null,
        operationAvgReplyTime: existing ? (avg(existing.operationAvgReplyTime) || null) : null,
        operationTotalReplyTime: existing ? (avg(existing.operationTotalReplyTime) || null) : null,
        operationResolutionTime: existing ? (avg(existing.operationResolutionTime) || null) : null,
      });
      current.setDate(current.getDate() + 1);
    }
    
    return allDays;
  }, [filteredRows, start, end]);

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
    
    const filteredWeekRows = Array.from(map.values())
      .filter(b => b.__wStart >= filterStartDate) // 시작 날짜 이전의 주 제외
      .sort((a,b) => a.__wStart - b.__wStart);
    
    // 11주 이상이면 WB 접두사 제거
    const shouldRemoveWB = filteredWeekRows.length >= 11;
    
    const rows = filteredWeekRows.map(b => {
      const wEnd = new Date(b.__wStart); wEnd.setDate(wEnd.getDate()+6);
      const x축Base = `${b.__wStart.getMonth() + 1}/${b.__wStart.getDate()}`;
      const x축 = shouldRemoveWB ? x축Base : `WB${x축Base}`;
      return {
        x축,
        주레이블: x축,
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

  // ✅ 일자별 문의유형비율 데이터 (면적 차트용)
  const inquiryTypeByDateData = useMemo(() => {
    if (filteredRows.length === 0) return [];
    const startDate = new Date(start);
    const endDate = new Date(end);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    if (inquiryTypeDateGroup === "Daily") {
      // 일자별로 문의유형별 집계
      const dateMap = {};
      
      filteredRows.forEach((item) => {
        const d = parseTsKST(item.firstAskedAt || item.createdAt);
        if (!d) return;
        const dayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        
        if (!dateMap[dayKey]) {
          dateMap[dayKey] = {
            x축: `${d.getMonth()+1}/${d.getDate()}`,
            date: dayKey,
          };
        }
        
        // 문의유형 추출 (1차만 사용)
        let inquiryType = item.문의유형 || "";
        if (inquiryType && inquiryType.includes("/")) {
          inquiryType = inquiryType.split("/")[0].trim();
        }
        if (!inquiryType || inquiryType.trim() === "") {
          inquiryType = "기타";
        }
        
        if (!dateMap[dayKey][inquiryType]) {
          dateMap[dayKey][inquiryType] = 0;
        }
        dateMap[dayKey][inquiryType] += 1;
      });

      // start부터 end까지 모든 일 생성
      const allDays = [];
      const current = new Date(startDate);
      while (current <= endDate) {
        const year = current.getFullYear();
        const month = current.getMonth() + 1;
        const date = current.getDate();
        const dayKey = `${year}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
        const existing = dateMap[dayKey] || { x축: `${month}/${date}`, date: dayKey };
        allDays.push(existing);
        current.setDate(current.getDate() + 1);
      }

      return allDays;
    } else if (inquiryTypeDateGroup === "Monthly") {
      // 월별로 문의유형별 집계
      const dateMap = {};
      
      filteredRows.forEach((item) => {
        const d = parseTsKST(item.firstAskedAt || item.createdAt);
        if (!d) return;
        const monthKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, "0")}`;
        
        if (!dateMap[monthKey]) {
          dateMap[monthKey] = {
            x축: `${d.getMonth()+1}월`,
          };
        }
        
        // 문의유형 추출 (1차만 사용)
        let inquiryType = item.문의유형 || "";
        if (inquiryType && inquiryType.includes("/")) {
          inquiryType = inquiryType.split("/")[0].trim();
        }
        if (!inquiryType || inquiryType.trim() === "") {
          inquiryType = "기타";
        }
        
        if (!dateMap[monthKey][inquiryType]) {
          dateMap[monthKey][inquiryType] = 0;
        }
        dateMap[monthKey][inquiryType] += 1;
      });

      // start부터 end까지 모든 월 생성
      const allMonths = [];
      const current = new Date(startDate);
      while (current <= endDate) {
        const year = current.getFullYear();
        const month = current.getMonth() + 1;
        const monthKey = `${year}-${String(month).padStart(2, "0")}`;
        const existing = dateMap[monthKey] || { x축: `${month}월` };
        allMonths.push(existing);
        current.setMonth(current.getMonth() + 1);
        current.setDate(1);
      }

      return allMonths;
    } else {
      // 주별로 문의유형별 집계 (Weekly)
      const dateMap = {};
      
      filteredRows.forEach((item) => {
        const d = parseTsKST(item.firstAskedAt || item.createdAt);
        if (!d) return;
        // 월요일 기준으로 주 시작일 계산
        const weekStart = new Date(d);
        const day = weekStart.getDay(); // 0(일)~6(토)
        const diffToMon = (day + 6) % 7; // 월요일까지의 차이
        weekStart.setDate(d.getDate() - diffToMon);
        weekStart.setHours(0, 0, 0, 0);
        const weekKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}-${String(weekStart.getDate()).padStart(2, "0")}`;
        
        if (!dateMap[weekKey]) {
          dateMap[weekKey] = {
            x축: `WB${weekStart.getMonth() + 1}/${weekStart.getDate()}`,
          };
        }
        
        // 문의유형 추출 (1차만 사용)
        let inquiryType = item.문의유형 || "";
        if (inquiryType && inquiryType.includes("/")) {
          inquiryType = inquiryType.split("/")[0].trim();
        }
        if (!inquiryType || inquiryType.trim() === "") {
          inquiryType = "기타";
        }
        
        if (!dateMap[weekKey][inquiryType]) {
          dateMap[weekKey][inquiryType] = 0;
        }
        dateMap[weekKey][inquiryType] += 1;
      });

      // start부터 end까지 모든 주 생성 (월요일 기준)
      const allWeeks = [];
      const current = new Date(startDate);
      const startDay = current.getDay();
      const diffToMon = (startDay + 6) % 7;
      current.setDate(current.getDate() - diffToMon);
      current.setHours(0, 0, 0, 0);
      
      while (current <= endDate) {
        const weekKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`;
        const existing = dateMap[weekKey] || { x축: `WB${current.getMonth() + 1}/${current.getDate()}` };
        allWeeks.push(existing);
        current.setDate(current.getDate() + 7);
      }

      // 11주 이상이면 WB 접두사 제거
      const shouldRemoveWB = allWeeks.length >= 11;
      return allWeeks.map(item => {
        let label = item.x축;
        if (shouldRemoveWB && label.startsWith('WB')) {
          label = label.substring(2);
        }
        return { ...item, x축: label };
      });
    }
  }, [filteredRows, start, end, inquiryTypeDateGroup]);

  // ✅ 일자별 채널비율 데이터 (면적 차트용)
  const channelByDateData = useMemo(() => {
    if (filteredRows.length === 0) return [];
    const startDate = new Date(start);
    const endDate = new Date(end);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    if (channelDateGroup === "Daily") {
      // 일자별로 채널별 집계
      const dateMap = {};
      
      filteredRows.forEach((item) => {
        const d = parseTsKST(item.firstAskedAt || item.createdAt);
        if (!d) return;
        const dayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        
        if (!dateMap[dayKey]) {
          dateMap[dayKey] = {
            x축: `${d.getMonth()+1}/${d.getDate()}`,
            date: dayKey,
          };
        }
        
        // mediumType 기반 채널 분류 (mediumName이 없을 수 있으므로 mediumType 사용)
        const mediumType = item.mediumType || null;
        const mediumName = item.mediumName || null;
        let channel = "채널톡"; // 기본값
        
        // mediumType 우선 분류
        if (mediumType === "phone") {
          channel = "유선";
        } else if (mediumType === "email") {
          channel = "이메일";
        } else if (mediumType === "app") {
          // mediumType이 "app"이면 카카오
          channel = "카카오";
        } else if (mediumName === "appKakao") {
          // mediumType이 위의 값이 아니고 mediumName이 "appKakao"면 카카오
          channel = "카카오";
        }
        // 그 외는 "채널톡"
        
        if (!dateMap[dayKey][channel]) {
          dateMap[dayKey][channel] = 0;
        }
        dateMap[dayKey][channel] += 1;
      });

      // start부터 end까지 모든 일 생성
      const allDays = [];
      const current = new Date(startDate);
      while (current <= endDate) {
        const year = current.getFullYear();
        const month = current.getMonth() + 1;
        const date = current.getDate();
        const dayKey = `${year}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
        const existing = dateMap[dayKey] || { x축: `${month}/${date}`, date: dayKey };
        allDays.push(existing);
        current.setDate(current.getDate() + 1);
      }

      return allDays;
    } else if (channelDateGroup === "Monthly") {
      // 월별로 채널별 집계
      const dateMap = {};
      
      filteredRows.forEach((item) => {
        const d = parseTsKST(item.firstAskedAt || item.createdAt);
        if (!d) return;
        const monthKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, "0")}`;
        
        if (!dateMap[monthKey]) {
          dateMap[monthKey] = {
            x축: `${d.getMonth()+1}월`,
          };
        }
        
        // mediumType 기반 채널 분류 (mediumName이 없을 수 있으므로 mediumType 사용)
        const mediumType = item.mediumType || null;
        const mediumName = item.mediumName || null;
        let channel = "채널톡"; // 기본값
        
        // mediumType 우선 분류
        if (mediumType === "phone") {
          channel = "유선";
        } else if (mediumType === "email") {
          channel = "이메일";
        } else if (mediumType === "app") {
          // mediumType이 "app"이면 카카오
          channel = "카카오";
        } else if (mediumName === "appKakao") {
          // mediumType이 위의 값이 아니고 mediumName이 "appKakao"면 카카오
          channel = "카카오";
        }
        // 그 외는 "채널톡"
        
        if (!dateMap[monthKey][channel]) {
          dateMap[monthKey][channel] = 0;
        }
        dateMap[monthKey][channel] += 1;
      });

      // start부터 end까지 모든 월 생성
      const allMonths = [];
      const current = new Date(startDate);
      while (current <= endDate) {
        const year = current.getFullYear();
        const month = current.getMonth() + 1;
        const monthKey = `${year}-${String(month).padStart(2, "0")}`;
        const existing = dateMap[monthKey] || { x축: `${month}월` };
        allMonths.push(existing);
        current.setMonth(current.getMonth() + 1);
        current.setDate(1);
      }

      return allMonths;
    } else {
      // 주별로 채널별 집계 (Weekly)
      const dateMap = {};
      
      filteredRows.forEach((item) => {
        const d = parseTsKST(item.firstAskedAt || item.createdAt);
        if (!d) return;
        // 월요일 기준으로 주 시작일 계산
        const weekStart = new Date(d);
        const day = weekStart.getDay(); // 0(일)~6(토)
        const diffToMon = (day + 6) % 7; // 월요일까지의 차이
        weekStart.setDate(d.getDate() - diffToMon);
        weekStart.setHours(0, 0, 0, 0);
        const weekKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}-${String(weekStart.getDate()).padStart(2, "0")}`;
        
        if (!dateMap[weekKey]) {
          dateMap[weekKey] = {
            x축: `WB${weekStart.getMonth() + 1}/${weekStart.getDate()}`,
          };
        }
        
        // mediumType 기반 채널 분류 (mediumName이 없을 수 있으므로 mediumType 사용)
        const mediumType = item.mediumType || null;
        const mediumName = item.mediumName || null;
        let channel = "채널톡"; // 기본값
        
        // mediumType 우선 분류
        if (mediumType === "phone") {
          channel = "유선";
        } else if (mediumType === "email") {
          channel = "이메일";
        } else if (mediumType === "app") {
          // mediumType이 "app"이면 카카오
          channel = "카카오";
        } else if (mediumName === "appKakao") {
          // mediumType이 위의 값이 아니고 mediumName이 "appKakao"면 카카오
          channel = "카카오";
        }
        // 그 외는 "채널톡"
        
        if (!dateMap[weekKey][channel]) {
          dateMap[weekKey][channel] = 0;
        }
        dateMap[weekKey][channel] += 1;
      });

      // start부터 end까지 모든 주 생성 (월요일 기준)
      const allWeeks = [];
      const current = new Date(startDate);
      const startDay = current.getDay();
      const diffToMon = (startDay + 6) % 7;
      current.setDate(current.getDate() - diffToMon);
      current.setHours(0, 0, 0, 0);
      
      while (current <= endDate) {
        const weekKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`;
        const existing = dateMap[weekKey] || { x축: `WB${current.getMonth() + 1}/${current.getDate()}` };
        allWeeks.push(existing);
        current.setDate(current.getDate() + 7);
      }

      // 11주 이상이면 WB 접두사 제거
      const shouldRemoveWB = allWeeks.length >= 11;
      return allWeeks.map(item => {
        let label = item.x축;
        if (shouldRemoveWB && label.startsWith('WB')) {
          label = label.substring(2);
        }
        return { ...item, x축: label };
      });
    }
  }, [filteredRows, start, end, channelDateGroup]);

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

    if (managerDateGroup === "Monthly") {
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

  // ✅ 서비스유형/문의유형/문의유형(세부) 테이블 데이터 (기간·패널 필터 적용된 filteredRows 사용)
  const serviceInquiryTableData = useMemo(() => {
    const allData = Array.isArray(filteredRows) ? filteredRows : [];
    if (allData.length === 0) return [];

    const counts = {};
    const responseTimeData = {}; // 응답시간 데이터 수집용
    
    allData.forEach((item) => {
      const tags = pickTagsFromRow(item);
      const 서비스유형 = tags.서비스유형 || "미분류";
      
      // 엘리스트랙 제외
      if (서비스유형 === "엘리스트랙" || 서비스유형.includes("엘리스트랙")) {
        return;
      }
      
      const 문의유형 = tags.문의유형 || "미분류";
      const 문의유형_2차 = tags.문의유형_2차 || "미분류";
      
      const key = `${서비스유형}|${문의유형}|${문의유형_2차}`;
      counts[key] = (counts[key] || 0) + 1;
      
      // 응답시간 데이터 수집
      if (!responseTimeData[key]) {
        responseTimeData[key] = {
          avgReplyTimes: [], // 평균 응답시간
          totalReplyTimes: [], // 총 응답시간
        };
      }
      
      // 평균 응답시간 (operationAvgReplyTime)
      const avgReplyTime = timeToSec(item.operationAvgReplyTime);
      if (avgReplyTime > 0) {
        responseTimeData[key].avgReplyTimes.push(avgReplyTime);
      }
      
      // 총 응답시간 (operationTotalReplyTime)
      const totalReplyTime = timeToSec(item.operationTotalReplyTime);
      if (totalReplyTime > 0) {
        responseTimeData[key].totalReplyTimes.push(totalReplyTime);
      }
    });

    const result = Object.entries(counts).map(([key, count]) => {
      const [서비스유형, 문의유형, 문의유형_2차] = key.split("|");
      const timeData = responseTimeData[key] || { avgReplyTimes: [], totalReplyTimes: [] };
      
      // 평균 응답시간 계산 (분 단위)
      const avgResponseTime = timeData.avgReplyTimes.length > 0
        ? Math.round((timeData.avgReplyTimes.reduce((s, t) => s + t, 0) / timeData.avgReplyTimes.length) * 100) / 100
        : 0;
      
      // 총 응답시간 평균 계산 (분 단위)
      const avgTotalResponseTime = timeData.totalReplyTimes.length > 0
        ? Math.round((timeData.totalReplyTimes.reduce((s, t) => s + t, 0) / timeData.totalReplyTimes.length) * 100) / 100
        : 0;
      
      return {
        서비스유형,
        문의유형,
        문의유형_2차,
        문의량: count,
        평균응답시간: avgResponseTime,
        총응답시간: avgTotalResponseTime,
      };
    });

    // 문의량 내림차순 정렬
    result.sort((a, b) => b.문의량 - a.문의량);
    
    // 전체 문의량 계산 (비율 계산용)
    const total = result.reduce((sum, item) => sum + item.문의량, 0);
    
    // 비율 추가
    return result.map(item => ({
      ...item,
      비율: total > 0 ? ((item.문의량 / total) * 100).toFixed(2) : "0.00",
    }));
  }, [filteredRows]);

  // ✅ 테이블 필터 옵션 생성
  const tableFilterOptions = useMemo(() => {
    const 서비스유형Set = new Set();
    const 문의유형Set = new Set();
    const 문의유형_2차Set = new Set();
    
    serviceInquiryTableData.forEach(item => {
      if (item.서비스유형) 서비스유형Set.add(item.서비스유형);
      if (item.문의유형) 문의유형Set.add(item.문의유형);
      if (item.문의유형_2차) 문의유형_2차Set.add(item.문의유형_2차);
    });
    
    return {
      서비스유형: Array.from(서비스유형Set).sort(),
      문의유형: Array.from(문의유형Set).sort(),
      문의유형_2차: Array.from(문의유형_2차Set).sort(),
    };
  }, [serviceInquiryTableData]);

  // ✅ 필터링된 테이블 데이터
  const filteredServiceInquiryTableData = useMemo(() => {
    let filtered = [...serviceInquiryTableData];
    
    // 서비스유형 필터
    if (serviceInquiryTableFilters.서비스유형.length > 0 && !serviceInquiryTableFilters.서비스유형.includes("전체")) {
      filtered = filtered.filter(item => serviceInquiryTableFilters.서비스유형.includes(item.서비스유형));
    }
    
    // 문의유형 필터
    if (serviceInquiryTableFilters.문의유형.length > 0 && !serviceInquiryTableFilters.문의유형.includes("전체")) {
      filtered = filtered.filter(item => serviceInquiryTableFilters.문의유형.includes(item.문의유형));
    }
    
    // 문의유형_2차 필터
    if (serviceInquiryTableFilters.문의유형_2차.length > 0 && !serviceInquiryTableFilters.문의유형_2차.includes("전체")) {
      filtered = filtered.filter(item => serviceInquiryTableFilters.문의유형_2차.includes(item.문의유형_2차));
    }
    
    // 정렬 적용
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      let aVal, bVal;
      switch (tableSort.column) {
        case "문의량":
          aVal = a.문의량 || 0;
          bVal = b.문의량 || 0;
          break;
        case "평균응답시간":
          aVal = a.평균응답시간 || 0;
          bVal = b.평균응답시간 || 0;
          break;
        case "총응답시간":
          aVal = a.총응답시간 || 0;
          bVal = b.총응답시간 || 0;
          break;
        default:
          return 0;
      }
      if (tableSort.direction === "asc") {
        return aVal - bVal;
      } else {
        return bVal - aVal;
      }
    });
    
    return sorted;
  }, [serviceInquiryTableData, serviceInquiryTableFilters, tableSort]);

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
  if (!apiConnected || apiConnected.ok !== true) {
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
          {["CS", "CSAT", "Cloud"].map((t) => (
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
            {/* 인바운드/아웃바운드 필터 */}
            <div style={{ marginLeft: "16px", display: "flex", alignItems: "center", gap: 16 }}>
              <label style={{ fontWeight: "bold" }}>문의 유형:</label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={direction.includes("IB")}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setDirection([...direction, "IB"]);
                    } else {
                      setDirection(direction.filter(d => d !== "IB"));
                    }
                  }}
                />
                <span>인바운드 (IB)</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={direction.includes("OB")}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setDirection([...direction, "OB"]);
                    } else {
                      setDirection(direction.filter(d => d !== "OB"));
                    }
                  }}
                />
                <span>아웃바운드 (OB)</span>
              </label>
            </div>
          </div>
        )}

        {/* CS 탭 */}
        {activeTab === "CS" && (
          <>
            {/* KPI 카드 */}
            <KpiCards statistics={statistics} />

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
                    {["Daily", "Weekly", "Monthly"].map(g => (
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
                {(mlDateGroup === "Daily" ? avgTimeDaily : mlDateGroup === "Weekly" ? avgTimeWeekly : avgTimeMonthly).length > 0 ? (
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
                        {["Daily", "Weekly", "Monthly"].map(g => (
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
                      data={mlDateGroup === "Daily" ? avgTimeDaily : mlDateGroup === "Weekly" ? avgTimeWeekly : avgTimeMonthly}
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

            {/* 일자별 문의유형비율 및 일자별 채널비율 차트 */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                marginBottom: "20px",
              }}
            >
              {/* 일자별 문의유형비율 */}
              <InquiryTypeByDateChart 
                data={inquiryTypeByDateData}
                dateGroup={inquiryTypeDateGroup}
                onDateGroupChange={setInquiryTypeDateGroup}
              />

              {/* 일자별 채널비율 */}
              <ChannelByDateChart 
                data={channelByDateData}
                dateGroup={channelDateGroup}
                onDateGroupChange={setChannelDateGroup}
              />
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
                  <CustomerTypeDonutChart 
                    data={customerDonutData}
                    tooltip={tooltip}
                    onTooltipChange={setTooltip}
                    onHoverIndexChange={setHoverIndex}
                  />
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

            {/* 서비스유형/문의유형/문의유형(세부) 테이블 */}
            <ServiceInquiryTable 
              data={filteredServiceInquiryTableData}
              tableFilterOptions={tableFilterOptions}
              filters={serviceInquiryTableFilters}
              onFiltersChange={setServiceInquiryTableFilters}
              sort={tableSort}
              onSortChange={setTableSort}
            />

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

        {/* 교육만족도 탭 - 주석 처리 */}
        {false && activeTab === "교육만족도" && (
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
                    onClick={() => {/* setLectureSatisfactionTab(t) */}}
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
                      {/* <Suspense fallback={<div>차트 로딩 중...</div>}>
                        <UnitySatisfactionChart />
                      </Suspense>
                      
                      <Suspense fallback={<div>레이더 차트 로딩 중...</div>}>
                        <UnitySatisfactionRadar />
                      </Suspense> */}
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
                    
                    {/* <Suspense fallback={<div>차트 로딩 중...</div>}>
                      <KdtTpm3SatisfactionChart />
                    </Suspense>
                    
                    <Suspense fallback={<div>세부 차트 로딩 중...</div>}>
                      <KdtTpm3SatisfactionRadar />
                    </Suspense> */}
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
                  <SalesFunnelWidget 
                    cloudCustomers={cloudCustomers}
                    dateFilter={salesFunnelDateFilter}
                    onDateFilterChange={setSalesFunnelDateFilter}
                  />

                  {/* 2. 계약/정산 총금액 카드 (상단으로 이동) */}
                  <CloudAmountSummaryCard cloudCustomers={cloudCustomers} resourceMap={resourceMap} />

                  {/* 3~4. CRM 관련 차트 묶음 */}
                  <CloudCrmChartsSection crmCustomers={crmCustomers} />

                  {/* 5. 도입 자원 유형 (도넛 차트) */}
                  <ResourceUsageChart 
                    cloudCustomers={cloudCustomers}
                    resourceMap={resourceMap}
                  />

                  {/* 3. 환불 통계 카드 */}
                  <RefundReasonChart refundCustomers={refundCustomers} />

                  {/* 4. 일자별 기관 생성 / 카드 등록 추이 (환불 카드 오른쪽, 2칸 사용) */}
                  <InstitutionTimelineChart crmCustomers={crmCustomers} />
                </div>

                {/* 하단: 주차별 도입/정산 추이 */}
                <WeeklyAdoptionChart cloudCustomers={cloudCustomers} />
              </div>
            )}

            {/* 테이블 탭 */}
            {cloudSubTab === "테이블" && (
              <div>
            {/* 입력 폼 */}
            <CloudCustomerForm
              formData={cloudFormData}
              onFormDataChange={setCloudFormData}
              editingIndex={cloudEditingIndex}
              onEditingIndexChange={setCloudEditingIndex}
              cloudCustomers={cloudCustomers}
              onCloudCustomersChange={setCloudCustomers}
              resourceMap={resourceMap}
              resourceGroups={resourceGroups}
            />
            {/* 타임라인 차트 */}
            <CloudTimelineChart
              cloudCustomers={cloudCustomers}
              resourceMap={resourceMap}
            />

            {/* 고객 목록 테이블 */}
            <CloudCustomerTable 
              cloudCustomers={cloudCustomers}
              tableFilters={tableFilters}
              onTableFiltersChange={setTableFilters}
              tableSearch={tableSearch}
              onTableSearchChange={setTableSearch}
              tableSearchField={tableSearchField}
              onTableSearchFieldChange={setTableSearchField}
              resourceMap={resourceMap}
              convertToCSV={convertToCSV}
              downloadCSV={downloadCSV}
              onEditCustomer={(customer, id) => {
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
                  종료일없음,
                  서비스유형: customer.서비스유형 || ""
                });
                setCloudEditingIndex(id);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              onCustomersChange={setCloudCustomers}
            />
          </div>
        )}


            {/* 환불 탭 */}
            {cloudSubTab === "환불" && (
              <div>
                <RefundCustomerForm
                  formData={refundFormData}
                  onFormDataChange={setRefundFormData}
                  editingIndex={refundEditingIndex}
                  onCancel={handleRefundCancel}
                  onSubmit={handleRefundSubmit}
                  reasonOption={refundReasonOption}
                  onReasonOptionChange={setRefundReasonOption}
                  reasonOptions={refundReasonOptions}
                />
                <RefundCustomerTable
                  refundCustomers={refundCustomers}
                  onEdit={handleRefundEdit}
                  onDelete={handleRefundDelete}
                  convertToCSV={convertToCSV}
                  downloadCSV={downloadCSV}
                />
              </div>
            )}

            {/* CRM 탭 */}
            {cloudSubTab === "CRM" && (
              <div>
                <CrmCustomerForm
                  formData={crmFormData}
                  onFormDataChange={setCrmFormData}
                  editingIndex={crmEditingIndex}
                  onCancel={resetCrmForm}
                  onSubmit={handleCrmSubmit}
                  loading={loading}
                />
                <CrmCustomerTable
                  customers={filteredCrmCustomers}
                  filters={crmFilters}
                  onFiltersChange={setCrmFilters}
                  dateOptions={crmDateOptions}
                  onEdit={handleCrmEdit}
                  onDelete={handleCrmDelete}
                  onCsvUpload={handleCrmCsvUpload}
                  convertToCSV={convertToCSV}
                  downloadCSV={downloadCSV}
                  loading={loading}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
