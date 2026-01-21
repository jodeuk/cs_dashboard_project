import React from 'react';

const CrmCustomerTable = ({ 
  customers,
  filters,
  onFiltersChange,
  dateOptions,
  onEdit,
  onDelete,
  onCsvUpload,
  convertToCSV,
  downloadCSV,
  loading
}) => {
  const handleDownload = () => {
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
    const csv = convertToCSV(customers, headers);
    const filename = `crm_customers_${new Date().toISOString().split('T')[0]}.csv`;
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
          CRM 고객 목록 ({customers.length}건)
        </h3>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label
            style={{
              padding: "8px 16px",
              backgroundColor: "#0d6efd",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "13px",
              fontWeight: "500",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              opacity: loading ? 0.6 : 1
            }}
          >
            📤 CSV 업로드
            <input
              type="file"
              accept=".csv"
              onChange={onCsvUpload}
              style={{ display: "none" }}
              disabled={loading}
            />
          </label>
          <button
            onClick={handleDownload}
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
      </div>

      {customers.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#6c757d" }}>
          등록된 CRM 고객이 없습니다.
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ backgroundColor: "#f8f9fa" }}>
              <th style={{ padding: "8px 12px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "12px" }}>
                <select
                  value={filters.기관생성일}
                  onChange={(e) => onFiltersChange((prev) => ({ ...prev, 기관생성일: e.target.value }))}
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
                  {dateOptions.기관생성일.map((v) => (
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
                  value={filters.카드미등록발송일자}
                  onChange={(e) => onFiltersChange((prev) => ({ ...prev, 카드미등록발송일자: e.target.value }))}
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
                  {dateOptions.카드미등록발송일자.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </th>
              <th style={{ padding: "8px 12px", textAlign: "center", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "12px" }}>
                <select
                  value={filters.카드등록일}
                  onChange={(e) => onFiltersChange((prev) => ({ ...prev, 카드등록일: e.target.value }))}
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
                  {dateOptions.카드등록일.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </th>
              <th style={{ padding: "8px 12px", textAlign: "center", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "12px" }}>
                <select
                  value={filters.크레딧충전일}
                  onChange={(e) => onFiltersChange((prev) => ({ ...prev, 크레딧충전일: e.target.value }))}
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
                  {dateOptions.크레딧충전일.map((v) => (
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
            {customers.map((customer, index) => (
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
                      onClick={() => onEdit(customer, index)}
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
                      onClick={() => onDelete(customer.id)}
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

export default CrmCustomerTable;
