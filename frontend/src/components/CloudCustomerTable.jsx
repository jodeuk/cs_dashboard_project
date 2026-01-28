import React from 'react';
import { deleteCloudCustomer } from '../api';

const CloudCustomerTable = ({ 
  cloudCustomers,
  tableFilters,
  onTableFiltersChange,
  tableSearch,
  onTableSearchChange,
  tableSearchField,
  onTableSearchFieldChange,
  resourceMap,
  convertToCSV,
  downloadCSV,
  onEditCustomer,
  onCustomersChange
}) => {
  // 필터 옵션 생성
  const 사업유형Options = ["전체", ...new Set(cloudCustomers.map(c => c.사업유형).filter(Boolean))];
  const 세일즈단계Options = ["전체", ...new Set(cloudCustomers.map(c => c.세일즈단계).filter(Boolean))];
  const 사용유형Options = ["전체", ...new Set(cloudCustomers.map(c => c.사용유형).filter(Boolean))];
  const 담당자Options = ["전체", "우지훈", "조용준", "안예은", "없음"];
  const 서비스유형Options = ["전체", ...new Set(cloudCustomers.map(c => c.서비스유형).filter(Boolean))];
  const 사용자원Options = ["전체", "A100", "H100", "B200"];

  // 필터링된 고객 데이터 계산
  const search = (tableSearch || "").trim().toLowerCase();
  const filteredCustomers = cloudCustomers.filter(customer => {
    const 사업유형Match = tableFilters.사업유형 === "전체" || customer.사업유형 === tableFilters.사업유형;
    const 세일즈단계Match = tableFilters.세일즈단계 === "전체" || customer.세일즈단계 === tableFilters.세일즈단계;
    const 사용유형Match = tableFilters.사용유형 === "전체" || customer.사용유형 === tableFilters.사용유형;
    const 담당자Match = tableFilters.담당자 === "전체" || 
      (tableFilters.담당자 === "없음" ? (!customer.담당자 || customer.담당자.trim() === "") : customer.담당자 === tableFilters.담당자);
    const 서비스유형Match = tableFilters.서비스유형 === "전체" || customer.서비스유형 === tableFilters.서비스유형;
    
    // 사용자원 필터링
    const 사용자원Match = tableFilters.사용자원 === "전체" || (() => {
      if (!customer.사용자원) return false;
      let resources = [];
      if (Array.isArray(customer.사용자원) && customer.사용자원.length > 0) {
        resources = customer.사용자원.map(item => item.resource);
      } else if (typeof customer.사용자원 === 'string') {
        resources = [customer.사용자원];
      }
      return resources.includes(tableFilters.사용자원);
    })();
    
    const fieldValue = ((customer?.[tableSearchField]) || "").toString().toLowerCase();
    const searchMatch = !search || fieldValue.includes(search);
    
    return 사업유형Match && 세일즈단계Match && 사용유형Match && 담당자Match && 서비스유형Match && 사용자원Match && searchMatch;
  })
  .sort((a, b) => {
    const dateA = a.업데이트날짜 ? new Date(a.업데이트날짜) : new Date(0);
    const dateB = b.업데이트날짜 ? new Date(b.업데이트날짜) : new Date(0);
    
    if (dateA.getTime() === dateB.getTime()) {
      const inquiryDateA = a.문의날짜 ? new Date(a.문의날짜) : new Date(0);
      const inquiryDateB = b.문의날짜 ? new Date(b.문의날짜) : new Date(0);
      return inquiryDateB - inquiryDateA;
    }
    
    return dateB - dateA;
  });

  const handleDelete = async (customerId) => {
    if (window.confirm("정말 삭제하시겠습니까?")) {
      try {
        await deleteCloudCustomer(customerId);
        onCustomersChange(cloudCustomers.filter((c) => c.id !== customerId));
        alert("고객이 삭제되었습니다.");
      } catch (err) {
        console.error("고객 삭제 실패:", err);
        alert("삭제에 실패했습니다. 다시 시도해주세요.");
      }
    }
  };

  return (
    <div>
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
            onChange={(e) => onTableSearchFieldChange(e.target.value)}
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
            onChange={(e) => onTableSearchChange(e.target.value)}
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
        <div style={{ width: "100%", overflowX: "auto" }}>
          <table style={{
            width: "100%",
            minWidth: "1400px",
            borderCollapse: "collapse",
            fontSize: "12px",
            backgroundColor: "white",
            tableLayout: "fixed"
          }}>
            <thead>
              <tr style={{ backgroundColor: "#f8f9fa" }}>
                <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "11px", width: "50px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span>사업유형</span>
                    <select 
                      value={tableFilters.사업유형}
                      onChange={(e) => onTableFiltersChange({...tableFilters, 사업유형: e.target.value})}
                      style={{ 
                        fontSize: "9px", 
                        padding: "1px 2px", 
                        border: "1px solid #ccc", 
                        borderRadius: "2px",
                        backgroundColor: "white",
                        width: "100%"
                      }}
                    >
                      {사업유형Options.map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                </th>
                <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "11px", whiteSpace: "nowrap", width: "50px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span>담당자</span>
                    <select 
                      value={tableFilters.담당자}
                      onChange={(e) => onTableFiltersChange({...tableFilters, 담당자: e.target.value})}
                      style={{ 
                        fontSize: "9px", 
                        padding: "1px 2px", 
                        border: "1px solid #ccc", 
                        borderRadius: "2px",
                        backgroundColor: "white",
                        width: "100%"
                      }}
                    >
                      {담당자Options.map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                </th>
                <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "11px", width: "60px" }}>이름</th>
                <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "11px", width: "80px" }}>소속</th>
                <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "11px", width: "65px" }}>기관페이지</th>
                <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "11px", width: "100px" }}>이메일</th>
                <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "11px", width: "60px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span>세일즈 단계</span>
                    <select 
                      value={tableFilters.세일즈단계}
                      onChange={(e) => onTableFiltersChange({...tableFilters, 세일즈단계: e.target.value})}
                      style={{ 
                        fontSize: "9px", 
                        padding: "1px 2px", 
                        border: "1px solid #ccc", 
                        borderRadius: "2px",
                        backgroundColor: "white",
                        width: "100%"
                      }}
                    >
                      {세일즈단계Options.map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                </th>
                <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "11px", width: "60px" }}>문의날짜</th>
                <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "11px", width: "60px" }}>계약날짜</th>
                <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "11px", width: "130px" }}>사용기간</th>
                <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "11px", width: "80px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span>사용자원</span>
                    <select 
                      value={tableFilters.사용자원}
                      onChange={(e) => onTableFiltersChange({...tableFilters, 사용자원: e.target.value})}
                      style={{ 
                        fontSize: "9px", 
                        padding: "1px 2px", 
                        border: "1px solid #ccc", 
                        borderRadius: "2px",
                        backgroundColor: "white",
                        width: "100%"
                      }}
                    >
                      {사용자원Options.map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                </th>
                <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "11px", whiteSpace: "nowrap", width: "75px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span>사용유형</span>
                    <select 
                      value={tableFilters.사용유형}
                      onChange={(e) => onTableFiltersChange({...tableFilters, 사용유형: e.target.value})}
                      style={{ 
                        fontSize: "9px", 
                        padding: "1px 2px", 
                        border: "1px solid #ccc", 
                        borderRadius: "2px",
                        backgroundColor: "white",
                        width: "100%"
                      }}
                    >
                      {사용유형Options.map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                </th>
                <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "11px", width: "80px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span>서비스유형</span>
                    <select 
                      value={tableFilters.서비스유형}
                      onChange={(e) => onTableFiltersChange({...tableFilters, 서비스유형: e.target.value})}
                      style={{ 
                        fontSize: "9px", 
                        padding: "1px 2px", 
                        border: "1px solid #ccc", 
                        borderRadius: "2px",
                        backgroundColor: "white",
                        width: "100%"
                      }}
                    >
                      {서비스유형Options.map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                </th>
                <th style={{ padding: "6px 8px", textAlign: "right", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "11px", width: "70px" }}>견적/정산금액</th>
                <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "11px", width: "120px" }}>비고</th>
                <th style={{ padding: "6px 8px", textAlign: "center", borderBottom: "2px solid #dee2e6", fontWeight: "600", fontSize: "11px", width: "50px" }}>업데이트 날짜</th>
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
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap", fontSize: "11px" }}>{customer.담당자 || "-"}</td>
                  <td style={{ 
                    padding: "6px 8px", 
                    fontSize: "11px",
                    width: "60px",
                    maxWidth: "60px",
                    wordBreak: customer.이름 && customer.이름.length > 3 ? "break-word" : "normal",
                    whiteSpace: customer.이름 && customer.이름.length > 3 ? "normal" : "nowrap",
                    lineHeight: "1.4"
                  }}>{customer.이름 || "-"}</td>
                  <td style={{ padding: "6px 8px", maxWidth: "80px", fontSize: "11px" }}>
                    {customer.기관 ? (
                      <div
                        style={{
                          fontSize: "12px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          cursor: "help",
                          position: "relative"
                        }}
                        title={customer.기관}
                        onMouseEnter={(e) => {
                          const tooltip = document.createElement('div');
                          tooltip.id = 'institution-tooltip';
                          tooltip.style.cssText = `
                            position: absolute;
                            background: #333;
                            color: white;
                            padding: 8px 12px;
                            border-radius: 4px;
                            font-size: 12px;
                            white-space: pre-line;
                            z-index: 10000;
                            pointer-events: none;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                            max-width: 300px;
                          `;
                          tooltip.textContent = customer.기관;
                          document.body.appendChild(tooltip);
                          
                          const rect = e.currentTarget.getBoundingClientRect();
                          tooltip.style.left = `${rect.left + rect.width / 2}px`;
                          tooltip.style.top = `${rect.bottom + 8}px`;
                          tooltip.style.transform = 'translateX(-50%)';
                        }}
                        onMouseLeave={() => {
                          const tooltip = document.getElementById('institution-tooltip');
                          if (tooltip) tooltip.remove();
                        }}
                        onMouseMove={(e) => {
                          const tooltip = document.getElementById('institution-tooltip');
                          if (tooltip) {
                            const rect = e.currentTarget.getBoundingClientRect();
                            tooltip.style.left = `${rect.left + rect.width / 2}px`;
                            tooltip.style.top = `${rect.bottom + 8}px`;
                          }
                        }}
                      >
                        {customer.기관}
                      </div>
                    ) : "-"}
                  </td>
                  <td style={{ padding: "6px 8px", fontSize: "11px" }}>
                    {customer.기관페이지링크 ? (
                      <a href={customer.기관페이지링크} target="_blank" rel="noopener noreferrer" style={{ color: "#007bff", textDecoration: "none" }}>
                        링크
                      </a>
                    ) : "-"}
                  </td>
                  <td style={{ padding: "6px 8px", fontSize: "11px" }}>
                    {customer.이메일 ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <span style={{ 
                          overflow: "hidden", 
                          textOverflow: "ellipsis", 
                          whiteSpace: "nowrap",
                          flex: 1,
                          minWidth: 0
                        }}>
                          {customer.이메일}
                        </span>
                        <button
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(customer.이메일);
                              alert("이메일이 클립보드에 복사되었습니다.");
                            } catch (err) {
                              console.error("복사 실패:", err);
                              alert("복사에 실패했습니다.");
                            }
                          }}
                          style={{
                            padding: "2px 6px",
                            backgroundColor: "#6c757d",
                            color: "white",
                            border: "none",
                            borderRadius: "3px",
                            cursor: "pointer",
                            fontSize: "9px",
                            whiteSpace: "nowrap",
                            flexShrink: 0
                          }}
                          title="이메일 복사"
                        >
                          복사
                        </button>
                      </div>
                    ) : "-"}
                  </td>
                  <td style={{ padding: "6px 8px", fontSize: "11px" }}>{customer.세일즈단계 || "-"}</td>
                  <td style={{ padding: "6px 8px", fontSize: "11px" }}>{customer.문의날짜 || "-"}</td>
                  <td style={{ padding: "6px 8px", fontSize: "11px" }}>{customer.계약날짜 || "-"}</td>
                  <td style={{ padding: "6px 8px", fontSize: "11px" }}>{customer.사용기간 || "-"}</td>
                  <td style={{ padding: "6px 8px", maxWidth: "80px", fontSize: "11px" }}>
                    {(() => {
                      let resources = [];
                      if (customer.사용자원 && Array.isArray(customer.사용자원) && customer.사용자원.length > 0) {
                        resources = customer.사용자원.map((item) => ({
                          name: resourceMap[item.resource] || item.resource,
                          quantity: item.quantity || 1,
                          fullText: `${resourceMap[item.resource] || item.resource}${item.quantity ? ` (${item.quantity}개)` : ''}`
                        }));
                      } else if (customer.사용자원 && typeof customer.사용자원 === 'string') {
                        resources = [{
                          name: resourceMap[customer.사용자원] || customer.사용자원,
                          quantity: customer.사용자원수량 || 1,
                          fullText: `${resourceMap[customer.사용자원] || customer.사용자원}${customer.사용자원수량 ? ` (${customer.사용자원수량}개)` : ''}`
                        }];
                      }

                      if (resources.length === 0) return "-";

                      const firstResource = resources[0];
                      const displayText = resources.length === 1 
                        ? firstResource.fullText
                        : `${firstResource.name}${firstResource.quantity > 1 ? ` (${firstResource.quantity}개)` : ''} 외 ${resources.length - 1}개`;

                      const fullText = resources.map(r => r.fullText).join('\n');

                      return (
                        <div
                          style={{
                            fontSize: "12px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            cursor: "help",
                            position: "relative"
                          }}
                          title={fullText}
                          onMouseEnter={(e) => {
                            const tooltip = document.createElement('div');
                            tooltip.id = 'resource-tooltip';
                            tooltip.style.cssText = `
                              position: absolute;
                              background: #333;
                              color: white;
                              padding: 8px 12px;
                              border-radius: 4px;
                              font-size: 12px;
                              white-space: pre-line;
                              z-index: 10000;
                              pointer-events: none;
                              box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                              max-width: 300px;
                            `;
                            tooltip.textContent = fullText;
                            document.body.appendChild(tooltip);
                            
                            const rect = e.currentTarget.getBoundingClientRect();
                            tooltip.style.left = `${rect.left + rect.width / 2}px`;
                            tooltip.style.top = `${rect.bottom + 8}px`;
                            tooltip.style.transform = 'translateX(-50%)';
                          }}
                          onMouseLeave={() => {
                            const tooltip = document.getElementById('resource-tooltip');
                            if (tooltip) tooltip.remove();
                          }}
                          onMouseMove={(e) => {
                            const tooltip = document.getElementById('resource-tooltip');
                            if (tooltip) {
                              const rect = e.currentTarget.getBoundingClientRect();
                              tooltip.style.left = `${rect.left + rect.width / 2}px`;
                              tooltip.style.top = `${rect.bottom + 8}px`;
                            }
                          }}
                        >
                          {displayText}
                        </div>
                      );
                    })()}
                  </td>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap", fontSize: "11px" }}>{customer.사용유형 || "-"}</td>
                  <td style={{ padding: "6px 8px", fontSize: "11px" }}>{customer.서비스유형 || "-"}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontSize: "11px" }}>
                    {(() => {
                      const amount = customer["견적/정산금액"];
                      if (!amount) return "-";
                      const numAmount = parseFloat(amount.toString().replace(/,/g, ''));
                      if (!isNaN(numAmount)) {
                        return numAmount.toLocaleString('ko-KR');
                      }
                      return amount;
                    })()}
                  </td>
                  <td style={{ padding: "6px 8px", maxWidth: "120px", fontSize: "11px" }}>
                    {customer.비고 ? (
                      <div
                        style={{
                          fontSize: "12px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          cursor: "help",
                          position: "relative"
                        }}
                        title={customer.비고}
                        onMouseEnter={(e) => {
                          const tooltip = document.createElement('div');
                          tooltip.id = 'remarks-tooltip';
                          tooltip.style.cssText = `
                            position: absolute;
                            background: #333;
                            color: white;
                            padding: 8px 12px;
                            border-radius: 4px;
                            font-size: 12px;
                            white-space: pre-line;
                            z-index: 10000;
                            pointer-events: none;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                            max-width: 300px;
                          `;
                          tooltip.textContent = customer.비고;
                          document.body.appendChild(tooltip);
                          
                          const rect = e.currentTarget.getBoundingClientRect();
                          tooltip.style.left = `${rect.left + rect.width / 2}px`;
                          tooltip.style.top = `${rect.bottom + 8}px`;
                          tooltip.style.transform = 'translateX(-50%)';
                        }}
                        onMouseLeave={() => {
                          const tooltip = document.getElementById('remarks-tooltip');
                          if (tooltip) tooltip.remove();
                        }}
                        onMouseMove={(e) => {
                          const tooltip = document.getElementById('remarks-tooltip');
                          if (tooltip) {
                            const rect = e.currentTarget.getBoundingClientRect();
                            tooltip.style.left = `${rect.left + rect.width / 2}px`;
                            tooltip.style.top = `${rect.bottom + 8}px`;
                          }
                        }}
                      >
                        {customer.비고}
                      </div>
                    ) : "-"}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "center", fontSize: "11px" }}>{customer.업데이트날짜 || "-"}</td>
                  <td style={{ padding: "6px 8px", textAlign: "center" }}>
                    <div style={{ display: "flex", gap: "4px", justifyContent: "center" }}>
                      <button
                        onClick={() => {
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
                          
                          let 사용자원 = customer.사용자원 || [];
                          if (typeof 사용자원 === 'string') {
                            사용자원 = 사용자원 ? [{
                              resource: 사용자원,
                              quantity: customer.사용자원수량 || 1
                            }] : [];
                          } else if (!Array.isArray(사용자원)) {
                            사용자원 = [];
                          }
                          
                          onEditCustomer({
                            ...customer,
                            사용자원,
                            사용기간시작일,
                            사용기간종료일,
                            종료일없음
                          }, customer.id);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        style={{
                          padding: "4px 8px",
                          backgroundColor: "#007bff",
                          color: "white",
                          border: "none",
                          borderRadius: "3px",
                          cursor: "pointer",
                          fontSize: "10px"
                        }}
                      >
                        수정
                      </button>
                      <button
                        onClick={() => handleDelete(customer.id)}
                        style={{
                          padding: "4px 8px",
                          backgroundColor: "#dc3545",
                          color: "white",
                          border: "none",
                          borderRadius: "3px",
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
    </div>
  );
};

export default CloudCustomerTable;
