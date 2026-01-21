import React from 'react';
import MultiSelectDropdown from './MultiSelectDropdown';

const ServiceInquiryTable = ({ 
  data, 
  tableFilterOptions, 
  filters, 
  onFiltersChange, 
  sort, 
  onSortChange 
}) => {
  if (data.length === 0) return null;

  const totalInquiries = data.reduce((sum, item) => sum + (item.문의량 || 0), 0);

  return (
    <div
      style={{
        backgroundColor: "white",
        padding: "20px",
        borderRadius: "12px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        marginBottom: "20px",
      }}
    >
      <h3 style={{ marginBottom: "16px", color: "#333", fontWeight: "600" }}>
        서비스유형/문의유형별 문의량 ({totalInquiries.toLocaleString()}건)
      </h3>
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "14px",
          }}
        >
          <thead>
            <tr style={{ backgroundColor: "#f8f9fa", borderBottom: "2px solid #dee2e6" }}>
              <th
                style={{
                  padding: "12px",
                  textAlign: "left",
                  fontWeight: "600",
                  color: "#495057",
                  borderBottom: "2px solid #dee2e6",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <span>서비스유형</span>
                  <MultiSelectDropdown
                    options={tableFilterOptions.서비스유형}
                    value={filters.서비스유형}
                    onChange={(vals) => onFiltersChange(prev => ({ ...prev, 서비스유형: vals }))}
                    placeholder="전체"
                    width="100%"
                    maxTagCount={1}
                  />
                </div>
              </th>
              <th
                style={{
                  padding: "12px",
                  textAlign: "left",
                  fontWeight: "600",
                  color: "#495057",
                  borderBottom: "2px solid #dee2e6",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <span>문의유형</span>
                  <MultiSelectDropdown
                    options={tableFilterOptions.문의유형}
                    value={filters.문의유형}
                    onChange={(vals) => onFiltersChange(prev => ({ ...prev, 문의유형: vals }))}
                    placeholder="전체"
                    width="100%"
                    maxTagCount={1}
                  />
                </div>
              </th>
              <th
                style={{
                  padding: "12px",
                  textAlign: "left",
                  fontWeight: "600",
                  color: "#495057",
                  borderBottom: "2px solid #dee2e6",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <span>문의유형(세부)</span>
                  <MultiSelectDropdown
                    options={tableFilterOptions.문의유형_2차}
                    value={filters.문의유형_2차}
                    onChange={(vals) => onFiltersChange(prev => ({ ...prev, 문의유형_2차: vals }))}
                    placeholder="전체"
                    width="100%"
                    maxTagCount={1}
                  />
                </div>
              </th>
              <th
                style={{
                  padding: "12px",
                  textAlign: "right",
                  fontWeight: "600",
                  color: "#495057",
                  borderBottom: "2px solid #dee2e6",
                  cursor: "pointer",
                  userSelect: "none",
                }}
                onClick={() => {
                  onSortChange(prev => ({
                    column: "문의량",
                    direction: prev.column === "문의량" && prev.direction === "desc" ? "asc" : "desc",
                  }));
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "4px" }}>
                  문의량
                  <span style={{ fontSize: "12px" }}>
                    {sort.column === "문의량" ? (sort.direction === "desc" ? "↓" : "↑") : "⇅"}
                  </span>
                </div>
              </th>
              <th
                style={{
                  padding: "12px",
                  textAlign: "right",
                  fontWeight: "600",
                  color: "#495057",
                  borderBottom: "2px solid #dee2e6",
                }}
              >
                비율
              </th>
              <th
                style={{
                  padding: "12px",
                  textAlign: "right",
                  fontWeight: "600",
                  color: "#495057",
                  borderBottom: "2px solid #dee2e6",
                  cursor: "pointer",
                  userSelect: "none",
                }}
                onClick={() => {
                  onSortChange(prev => ({
                    column: "평균응답시간",
                    direction: prev.column === "평균응답시간" && prev.direction === "desc" ? "asc" : "desc",
                  }));
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "4px" }}>
                  평균응답시간
                  <span style={{ fontSize: "12px" }}>
                    {sort.column === "평균응답시간" ? (sort.direction === "desc" ? "↓" : "↑") : "⇅"}
                  </span>
                </div>
              </th>
              <th
                style={{
                  padding: "12px",
                  textAlign: "right",
                  fontWeight: "600",
                  color: "#495057",
                  borderBottom: "2px solid #dee2e6",
                  cursor: "pointer",
                  userSelect: "none",
                }}
                onClick={() => {
                  onSortChange(prev => ({
                    column: "총응답시간",
                    direction: prev.column === "총응답시간" && prev.direction === "desc" ? "asc" : "desc",
                  }));
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "4px" }}>
                  총응답시간
                  <span style={{ fontSize: "12px" }}>
                    {sort.column === "총응답시간" ? (sort.direction === "desc" ? "↓" : "↑") : "⇅"}
                  </span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr
                key={index}
                style={{
                  borderBottom: "1px solid #e9ecef",
                  backgroundColor: index % 2 === 0 ? "white" : "#f8f9fa",
                }}
              >
                <td style={{ padding: "12px", color: "#495057" }}>
                  {item.서비스유형}
                </td>
                <td style={{ padding: "12px", color: "#495057" }}>
                  {item.문의유형}
                </td>
                <td style={{ padding: "12px", color: "#495057" }}>
                  {item.문의유형_2차}
                </td>
                <td style={{ padding: "12px", textAlign: "right", fontWeight: "500", color: "#495057" }}>
                  {item.문의량.toLocaleString()}
                </td>
                <td style={{ padding: "12px", textAlign: "right", fontWeight: "500", color: "#495057" }}>
                  {item.비율}%
                </td>
                <td style={{ padding: "12px", textAlign: "right", fontWeight: "500", color: "#495057" }}>
                  {item.평균응답시간 > 0 ? `${item.평균응답시간.toFixed(1)}분` : "-"}
                </td>
                <td style={{ padding: "12px", textAlign: "right", fontWeight: "500", color: "#495057" }}>
                  {item.총응답시간 > 0 ? `${item.총응답시간.toFixed(1)}분` : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ServiceInquiryTable;
