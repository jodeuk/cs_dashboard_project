import React, { useState, useMemo, useEffect } from 'react';
import MultiSelectDropdown from './MultiSelectDropdown';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const DEFAULT_PAGE_SIZE = 20;

const ServiceInquiryTable = ({ 
  data, 
  tableFilterOptions, 
  filters, 
  onFiltersChange, 
  sort, 
  onSortChange 
}) => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const totalCount = data.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const paginatedData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [data.length, filters.서비스유형, filters.문의유형, filters.문의유형_2차]);

  if (data.length === 0) return null;

  const totalInquiries = data.reduce((sum, item) => sum + (item.문의량 || 0), 0);
  const startRow = (page - 1) * pageSize + 1;
  const endRow = Math.min(page * pageSize, totalCount);

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
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((item, index) => (
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
                  {item.평균응답시간 > 0 ? `${item.평균응답시간.toFixed(1)}분` : "-"}
                </td>
                <td style={{ padding: "12px", textAlign: "right", fontWeight: "500", color: "#495057" }}>
                  {item.총응답시간 > 0 ? `${item.총응답시간.toFixed(1)}분` : "-"}
                </td>
                <td style={{ padding: "12px", textAlign: "right", fontWeight: "500", color: "#495057" }}>
                  {item.문의량.toLocaleString()}
                </td>
                <td style={{ padding: "12px", textAlign: "right", fontWeight: "500", color: "#495057" }}>
                  {item.비율}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalCount > pageSize && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
            marginTop: "16px",
            paddingTop: "12px",
            borderTop: "1px solid #e9ecef",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "13px", color: "#6c757d" }}>
              {startRow}-{endRow} / {totalCount.toLocaleString()}행
            </span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              style={{
                padding: "6px 10px",
                fontSize: "13px",
                borderRadius: "6px",
                border: "1px solid #dee2e6",
                backgroundColor: "white",
              }}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}개씩</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <button
              type="button"
              onClick={() => setPage(1)}
              disabled={page === 1}
              style={{
                padding: "6px 10px",
                fontSize: "13px",
                border: "1px solid #dee2e6",
                borderRadius: "6px",
                backgroundColor: page === 1 ? "#f8f9fa" : "white",
                cursor: page === 1 ? "not-allowed" : "pointer",
                color: page === 1 ? "#adb5bd" : "#495057",
              }}
            >
              처음
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{
                padding: "6px 10px",
                fontSize: "13px",
                border: "1px solid #dee2e6",
                borderRadius: "6px",
                backgroundColor: page === 1 ? "#f8f9fa" : "white",
                cursor: page === 1 ? "not-allowed" : "pointer",
                color: page === 1 ? "#adb5bd" : "#495057",
              }}
            >
              이전
            </button>
            <span style={{ padding: "0 8px", fontSize: "13px", color: "#495057" }}>
              {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              style={{
                padding: "6px 10px",
                fontSize: "13px",
                border: "1px solid #dee2e6",
                borderRadius: "6px",
                backgroundColor: page === totalPages ? "#f8f9fa" : "white",
                cursor: page === totalPages ? "not-allowed" : "pointer",
                color: page === totalPages ? "#adb5bd" : "#495057",
              }}
            >
              다음
            </button>
            <button
              type="button"
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              style={{
                padding: "6px 10px",
                fontSize: "13px",
                border: "1px solid #dee2e6",
                borderRadius: "6px",
                backgroundColor: page === totalPages ? "#f8f9fa" : "white",
                cursor: page === totalPages ? "not-allowed" : "pointer",
                color: page === totalPages ? "#adb5bd" : "#495057",
              }}
            >
              마지막
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServiceInquiryTable;
