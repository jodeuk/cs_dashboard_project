import React from 'react';

const SalesFunnelWidget = ({ cloudCustomers, dateFilter, onDateFilterChange }) => {
  const stages = [
    { name: "문의", key: "문의", color: "#e3f2fd" },
    { name: "견적", key: "견적", color: "#bbdefb" },
    { name: "계약", key: "계약", color: "#64b5f6" },
    { name: "정산", key: "정산", color: "#1976d2" },
    { name: "수주실패", key: "수주실패", color: "#ffcdd2" }
  ];

  // 날짜 필터링 함수
  const filterByDate = (customer) => {
    if (dateFilter === "전체") return true;
    if (!customer.문의날짜) return false;
    
    const inquiryDate = new Date(customer.문의날짜);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    if (dateFilter === "오늘") {
      const today = new Date(now);
      inquiryDate.setHours(0, 0, 0, 0);
      return inquiryDate.getTime() === today.getTime();
    } else if (dateFilter === "1주") {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      inquiryDate.setHours(0, 0, 0, 0);
      return inquiryDate >= weekAgo && inquiryDate <= now;
    } else if (dateFilter === "1개월") {
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
  // 수주실패는 전환율 계산에서 제외
  const cumulativeForConversion = {
    "문의": rawCounts["문의"],
    "견적": rawCounts["견적"] + rawCounts["계약"] + rawCounts["정산"],
    "계약": rawCounts["계약"] + rawCounts["정산"],
    "정산": rawCounts["정산"],
    "수주실패": 0
  };
  
  const totalCustomers = rawCounts["문의"] + rawCounts["견적"] + rawCounts["계약"] + rawCounts["정산"];
  const maxCount = Math.max(...Object.values(counts), 1);

  return (
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
              onClick={() => onDateFilterChange(filter)}
              style={{
                padding: "6px 10px",
                fontSize: 12,
                border: "none",
                background: dateFilter === filter ? "#111827" : "#fff",
                color: dateFilter === filter ? "#fff" : "#374151",
                cursor: "pointer"
              }}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>
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
    </div>
  );
};

export default SalesFunnelWidget;
