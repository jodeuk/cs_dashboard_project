import React from 'react';

const RefundCustomerTable = ({ 
  refundCustomers, 
  onEdit, 
  onDelete,
  convertToCSV,
  downloadCSV
}) => {
  const handleDownload = () => {
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
  };

  return (
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
          onClick={handleDownload}
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
                      onClick={() => onEdit(customer, index)}
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
                          onDelete(customer.id);
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
  );
};

export default RefundCustomerTable;
