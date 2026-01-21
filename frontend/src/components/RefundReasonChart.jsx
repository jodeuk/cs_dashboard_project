import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const RefundReasonChart = ({ refundCustomers }) => {
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
    </div>
  );
};

export default RefundReasonChart;
