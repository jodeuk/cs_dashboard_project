import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

/**
 * Cloud 탭 > 차트 탭에서 CRM 관련 3개 차트 묶음
 * 1) 메일 발송 후 N일 이내 카드 등록 전환율
 * 2) 메일 발송일 기준 당일/다음날 카드 등록
 */
function CloudCrmChartsSection({ crmCustomers }) {
  // 1. 메일 발송 후 N일 이내 카드 등록 전환율
  const buildConversionByDaysSeries = () => {
    const buckets = [
      { label: "1일 이내", days: 1 },
      { label: "3일 이내", days: 3 },
      { label: "7일 이내", days: 7 },
      { label: "14일 이내", days: 14 },
    ];

    const isValidDate = (s) => {
      if (!s) return false;
      const d = new Date(s);
      return !isNaN(d.getTime());
    };

    const crmWithBothDates = (crmCustomers || []).filter(
      (c) => isValidDate(c.카드미등록발송일자) && isValidDate(c.카드등록일)
    );

    const total = crmWithBothDates.length;
    const data = buckets.map((b) => {
      const count = crmWithBothDates.filter((c) => {
        const sent = new Date(c.카드미등록발송일자);
        const reg = new Date(c.카드등록일);
        const diffMs = reg.getTime() - sent.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        return diffDays >= 0 && diffDays <= b.days;
      }).length;
      return {
        label: b.label,
        count,
        rate: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0,
      };
    });

    return { data, total };
  };

  // 2. 메일 발송일 기준 당일/다음날 카드 등록
  const buildSameNextDaySeries = () => {
    const isValidDate = (s) => {
      if (!s) return false;
      const d = new Date(s);
      return !isNaN(d.getTime());
    };

    const bySentDate = {};
    (crmCustomers || []).forEach((c) => {
      if (!isValidDate(c.카드미등록발송일자)) return;
      const sent = new Date(c.카드미등록발송일자);
      const sentKey = sent.toISOString().slice(0, 10);
      if (!bySentDate[sentKey]) {
        bySentDate[sentKey] = {
          date: sentKey,
          sentCount: 0,
          sameDay: 0,
          nextDay: 0,
        };
      }
      bySentDate[sentKey].sentCount += 1;

      if (isValidDate(c.카드등록일)) {
        const reg = new Date(c.카드등록일);
        const diffMs = reg.getTime() - sent.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (diffDays >= 0 && diffDays < 1) {
          bySentDate[sentKey].sameDay += 1;
        } else if (diffDays >= 1 && diffDays < 2) {
          bySentDate[sentKey].nextDay += 1;
        }
      }
    });

    return Object.values(bySentDate).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  };

  const { data: conversionData, total: conversionTotal } = buildConversionByDaysSeries();
  const sameNextDayData = buildSameNextDaySeries();

  return (
    <>
      {/* 1. 메일 발송 후 N일 이내 카드 등록 전환율 */}
      <div
        style={{
          backgroundColor: "#fff",
          border: "1px solid #dee2e6",
          borderRadius: "8px",
          padding: "12px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
        }}
      >
        <h3
          style={{
            fontSize: "14px",
            marginBottom: "12px",
            color: "#495057",
            fontWeight: "600",
          }}
        >
          메일 발송 후 N일 이내 카드 등록 전환율
        </h3>
        {conversionTotal > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={conversionData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis
                type="category"
                dataKey="label"
                tick={{ fontSize: 11 }}
                width={80}
              />
              <Tooltip formatter={(value, name) => (name === "전환율" ? `${value}%` : `${value}건`)} />
              <Legend />
              <Bar dataKey="count" fill="#adb5bd" name="등록 기관 수" />
              <Bar dataKey="rate" fill="#20c997" name="전환율" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div
            style={{
              textAlign: "center",
              color: "#6c757d",
              padding: "24px 0",
              fontSize: "13px",
            }}
          >
            메일 발송일자와 카드등록일이 모두 있는 데이터가 없습니다.
          </div>
        )}
      </div>

      {/* 2. 메일 발송일 기준 당일·다음날 카드 등록 */}
      <div
        style={{
          backgroundColor: "#fff",
          border: "1px solid #dee2e6",
          borderRadius: "8px",
          padding: "12px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
        }}
      >
        <h3
          style={{
            fontSize: "14px",
            marginBottom: "12px",
            color: "#495057",
            fontWeight: "600",
          }}
        >
          메일 발송일 기준 당일·다음날 카드 등록
        </h3>
        {sameNextDayData.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={sameNextDayData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis
                type="category"
                dataKey="date"
                tick={{ fontSize: 11 }}
                width={100}
              />
              <Tooltip />
              <Legend />
              <Bar dataKey="sentCount" fill="#6c757d" name="발송 기관 수" />
              <Bar dataKey="sameDay" fill="#0d6efd" name="당일 등록" />
              <Bar dataKey="nextDay" fill="#20c997" name="다음날 등록" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div
            style={{
              textAlign: "center",
              color: "#6c757d",
              padding: "24px 0",
              fontSize: "13px",
            }}
          >
            메일 발송일 기준 집계할 데이터가 없습니다.
          </div>
        )}
      </div>
    </>
  );
}

export default CloudCrmChartsSection;



