import React from "react";

/**
 * Cloud 탭 - 계약/정산 총금액 카드
 * 기존 App.jsx에 있던 금액 비교 카드를 분리한 컴포넌트
 */
function CloudAmountSummaryCard({ cloudCustomers, resourceMap }) {
  const calculateAmount = (stageKey) => {
    const customers = (cloudCustomers || []).filter((c) => c.세일즈단계 === stageKey);
    const amount = customers.reduce((sum, customer) => {
      const amt = customer["견적/정산금액"];
      if (amt) {
        const numericAmount = parseInt(amt.toString().replace(/[^0-9]/g, "")) || 0;
        return sum + numericAmount;
      }
      return sum;
    }, 0);
    return { customers, amount };
  };

  const formatAmount = (amount) => {
    if (amount >= 100000000) {
      const 억 = Math.floor(amount / 100000000);
      const 만 = Math.floor((amount % 100000000) / 10000);
      if (만 > 0) {
        return `${억}억 ${만}만원`;
      }
      return `${억}억원`;
    }
    if (amount >= 10000) {
      return `${Math.floor(amount / 10000)}만원`;
    }
    return `${amount.toLocaleString()}원`;
  };

  const settlementData = calculateAmount("정산");
  const contractData = calculateAmount("계약");

  const topCustomers = [...(cloudCustomers || [])]
    .filter((c) => c.세일즈단계 === "정산" || c.세일즈단계 === "계약")
    .map((customer) => {
      const amount = customer["견적/정산금액"];
      const numericAmount = amount ? parseInt(amount.toString().replace(/[^0-9]/g, "")) || 0 : 0;
      return {
        ...customer,
        numericAmount,
      };
    })
    .sort((a, b) => b.numericAmount - a.numericAmount)
    .slice(0, 3);

  return (
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
          marginBottom: "8px",
          color: "#495057",
          fontWeight: "600",
        }}
      >
        계약/정산 총금액
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {/* 정산완료 금액 */}
        <div
          style={{
            textAlign: "center",
            padding: "10px 8px",
            backgroundColor: "#f8f9fa",
            borderRadius: "6px",
            border: "2px solid #28a745",
          }}
        >
          <div
            style={{
              fontSize: "10px",
              color: "#6c757d",
              marginBottom: "4px",
              fontWeight: "500",
            }}
          >
            정산 완료
          </div>
          <div
            style={{
              fontSize: "22px",
              fontWeight: "700",
              color: "#28a745",
              marginBottom: "4px",
            }}
          >
            {formatAmount(settlementData.amount)}
          </div>
          <div
            style={{
              fontSize: "10px",
              color: "#495057",
              fontWeight: "500",
            }}
          >
            {settlementData.customers.length}건
          </div>
        </div>

        {/* 계약 금액 */}
        <div
          style={{
            textAlign: "center",
            padding: "10px 8px",
            backgroundColor: "#fff3cd",
            borderRadius: "6px",
            border: "2px solid #ffc107",
          }}
        >
          <div
            style={{
              fontSize: "10px",
              color: "#856404",
              marginBottom: "4px",
              fontWeight: "500",
            }}
          >
            계약 완료 (정산 대기)
          </div>
          <div
            style={{
              fontSize: "22px",
              fontWeight: "700",
              color: "#856404",
              marginBottom: "4px",
            }}
          >
            {formatAmount(contractData.amount)}
          </div>
          <div
            style={{
              fontSize: "10px",
              color: "#856404",
              fontWeight: "500",
            }}
          >
            {contractData.customers.length}건
          </div>
        </div>

        {/* 합계 */}
        <div
          style={{
            textAlign: "center",
            padding: "8px",
            borderTop: "2px solid #dee2e6",
            marginTop: "2px",
            paddingTop: "8px",
          }}
        >
          <div
            style={{
              fontSize: "10px",
              color: "#6c757d",
              marginBottom: "3px",
            }}
          >
            계약 + 정산 합계
          </div>
          <div
            style={{
              fontSize: "16px",
              fontWeight: "700",
              color: "#495057",
            }}
          >
            {formatAmount(settlementData.amount + contractData.amount)}
          </div>
        </div>

        {/* 고액 계약 TOP 3 */}
        {topCustomers.length > 0 && (
          <div
            style={{
              borderTop: "2px solid #dee2e6",
              marginTop: "6px",
              paddingTop: "8px",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                fontWeight: "600",
                color: "#495057",
                marginBottom: "6px",
                textAlign: "center",
              }}
            >
              TOP 3
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {topCustomers.map((customer, index) => {
                const resourceText =
                  customer.사용자원 &&
                  Array.isArray(customer.사용자원) &&
                  customer.사용자원.length > 0
                    ? customer.사용자원
                        .map(
                          (item) =>
                            `${resourceMap[item.resource] || item.resource}${
                              item.quantity ? `(${item.quantity}개)` : ""
                            }`
                        )
                        .join(", ")
                    : "";
                const detailParts = [
                  customer.기관 || "",
                  resourceText,
                  customer.사용유형 || "",
                  customer.사용기간 || "",
                ].filter(Boolean);
                const detailText = detailParts.join(" / ");

                return (
                  <div
                    key={index}
                    style={{
                      padding: "6px 8px",
                      backgroundColor: "#f8f9fa",
                      borderRadius: "4px",
                      border: "1px solid #dee2e6",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: "11px",
                            fontWeight: "600",
                            color: "#495057",
                            marginBottom: "2px",
                          }}
                        >
                          {index + 1}. {customer.이름 || "이름 없음"}
                        </div>
                        {detailText && (
                          <div
                            style={{
                              fontSize: "9px",
                              color: "#6c757d",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {detailText}
                          </div>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          fontWeight: "700",
                          color: "#28a745",
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                      >
                        {formatAmount(customer.numericAmount)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CloudAmountSummaryCard;


