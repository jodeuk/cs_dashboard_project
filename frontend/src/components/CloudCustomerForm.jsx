import React, { useState } from 'react';
import { createCloudCustomer, updateCloudCustomer, fetchCloudCustomers } from '../api';

const CloudCustomerForm = ({ 
  formData, 
  onFormDataChange, 
  editingIndex, 
  onEditingIndexChange,
  cloudCustomers,
  onCloudCustomersChange,
  resourceMap,
  resourceGroups 
}) => {
  const [resourceDropdownOpen, setResourceDropdownOpen] = useState(false);

  const resetForm = () => {
    onFormDataChange({
      사업유형: "",
      담당자: "",
      이름: "",
      기관: "",
      기관페이지링크: "",
      이메일: "",
      문의날짜: "",
      계약날짜: "",
      세일즈단계: "",
      사용자원: [],
      사용유형: "",
      사용기간시작일: "",
      사용기간종료일: "",
      종료일없음: false,
      "견적/정산금액": "",
      비고: ""
    });
    setResourceDropdownOpen(false);
  };

  const handleSubmit = async () => {
    if (!formData.사업유형 || !formData.이름) {
      alert("사업유형과 이름은 필수 입력 항목입니다.");
      return;
    }
    
    try {
      // 사용기간 문자열로 변환 (DB에 저장용)
      const 사용기간 = formData.종료일없음
        ? `${formData.사용기간시작일} ~ 현재`
        : formData.사용기간시작일 && formData.사용기간종료일
        ? `${formData.사용기간시작일} ~ ${formData.사용기간종료일}`
        : formData.사용기간시작일 || formData.사용기간종료일
        ? formData.사용기간시작일 || formData.사용기간종료일
        : "";
      
      const dataToSave = {
        ...formData,
        사용기간: 사용기간
      };
      
      if (editingIndex !== null) {
        // 수정 - DB에 저장 (editingIndex에는 id를 저장)
        const idx = cloudCustomers.findIndex((c) => c.id === editingIndex);
        if (idx === -1) {
          throw new Error("수정 대상 고객을 찾을 수 없습니다.");
        }
        const customerToUpdate = cloudCustomers[idx];
        await updateCloudCustomer(customerToUpdate.id, dataToSave);
        
        // 로컬 상태 업데이트
        const updated = [...cloudCustomers];
        updated[idx] = { ...dataToSave, id: customerToUpdate.id };
        onCloudCustomersChange(updated);
        onEditingIndexChange(null);
        
        // 서버에서 최신 데이터 다시 가져오기 (선택사항)
        try {
          const refreshedCustomers = await fetchCloudCustomers();
          onCloudCustomersChange(refreshedCustomers);
        } catch (err) {
          console.warn("고객 목록 새로고침 실패:", err);
          // 로컬 상태는 이미 업데이트되었으므로 계속 진행
        }
      } else {
        // 추가 - DB에 저장
        const newCustomer = await createCloudCustomer(dataToSave);
        onCloudCustomersChange([...cloudCustomers, newCustomer]);
      }
      
      resetForm();
      alert(editingIndex !== null ? "고객 정보가 수정되었습니다." : "고객이 등록되었습니다.");
    } catch (err) {
      console.error("고객 저장 실패:", err);
      alert("저장에 실패했습니다. 다시 시도해주세요.");
    }
  };

  const handleCancel = () => {
    onEditingIndexChange(null);
    resetForm();
  };

  return (
    <div style={{
      backgroundColor: "#f8f9fa",
      padding: "20px",
      borderRadius: "8px",
      marginBottom: "24px",
      border: "1px solid #dee2e6"
    }}>
      <h3 style={{ fontSize: "18px", marginBottom: "16px", color: "#495057" }}>
        {editingIndex !== null ? "고객 정보 수정" : "신규 고객 등록"}
      </h3>
      
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "12px",
        marginBottom: "16px"
      }}>
        <div>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
            사업유형 <span style={{ color: "red" }}>*</span>
          </label>
          <select
            value={formData.사업유형}
            onChange={(e) => onFormDataChange({ ...formData, 사업유형: e.target.value })}
            style={{
              width: "100%",
              padding: "8px",
              border: "1px solid #ced4da",
              borderRadius: "4px",
              fontSize: "14px",
              backgroundColor: "white"
            }}
          >
            <option value="">선택해주세요</option>
            <option value="B2B">B2B (Business to Business)</option>
            <option value="B2C">B2C (Business to Consumer)</option>
            <option value="B2E">B2E (Business to Education)</option>
            <option value="B2G">B2G (Business to Government)</option>
          </select>
        </div>
        
        <div>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
            담당자
          </label>
          <input
            type="text"
            value={formData.담당자}
            onChange={(e) => onFormDataChange({ ...formData, 담당자: e.target.value })}
            style={{
              width: "100%",
              padding: "8px",
              border: "1px solid #ced4da",
              borderRadius: "4px",
              fontSize: "14px"
            }}
          />
        </div>
        
        <div>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
            이름 <span style={{ color: "red" }}>*</span>
          </label>
          <input
            type="text"
            value={formData.이름}
            onChange={(e) => onFormDataChange({ ...formData, 이름: e.target.value })}
            style={{
              width: "100%",
              padding: "8px",
              border: "1px solid #ced4da",
              borderRadius: "4px",
              fontSize: "14px"
            }}
          />
        </div>
        
        <div>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
            소속
          </label>
          <input
            type="text"
            value={formData.기관}
            onChange={(e) => onFormDataChange({ ...formData, 기관: e.target.value })}
            style={{
              width: "100%",
              padding: "8px",
              border: "1px solid #ced4da",
              borderRadius: "4px",
              fontSize: "14px"
            }}
          />
        </div>
        
        <div>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
            기관페이지링크
          </label>
          <input
            type="url"
            placeholder="https://example.com"
            value={formData.기관페이지링크}
            onChange={(e) => onFormDataChange({ ...formData, 기관페이지링크: e.target.value })}
            style={{
              width: "100%",
              padding: "8px",
              border: "1px solid #ced4da",
              borderRadius: "4px",
              fontSize: "14px"
            }}
          />
        </div>
        
        <div>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
            이메일
          </label>
          <input
            type="email"
            value={formData.이메일}
            onChange={(e) => onFormDataChange({ ...formData, 이메일: e.target.value })}
            style={{
              width: "100%",
              padding: "8px",
              border: "1px solid #ced4da",
              borderRadius: "4px",
              fontSize: "14px"
            }}
          />
        </div>
        
        <div>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
            문의날짜
          </label>
          <input
            type="text"
            placeholder="YYYY-MM-DD 형식으로 입력"
            value={formData.문의날짜}
            onChange={(e) => onFormDataChange({ ...formData, 문의날짜: e.target.value })}
            style={{
              width: "100%",
              padding: "8px",
              border: "1px solid #ced4da",
              borderRadius: "4px",
              fontSize: "14px"
            }}
          />
        </div>
        
        <div>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
            계약날짜
          </label>
          <input
            type="date"
            value={formData.계약날짜}
            onChange={(e) => onFormDataChange({ ...formData, 계약날짜: e.target.value })}
            style={{
              width: "100%",
              padding: "8px",
              border: "1px solid #ced4da",
              borderRadius: "4px",
              fontSize: "14px"
            }}
          />
        </div>
        
        <div>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
            세일즈 단계
          </label>
          <select
            value={formData.세일즈단계}
            onChange={(e) => onFormDataChange({ ...formData, 세일즈단계: e.target.value })}
            style={{
              width: "100%",
              padding: "8px",
              border: "1px solid #ced4da",
              borderRadius: "4px",
              fontSize: "14px",
              backgroundColor: "white"
            }}
          >
            <option value="">선택해주세요</option>
            <option value="문의">문의</option>
            <option value="견적">견적</option>
            <option value="계약">계약</option>
            <option value="정산">정산</option>
            <option value="수주실패">수주실패</option>
          </select>
        </div>
        
        <div style={{ position: "relative" }}>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
            사용자원 (복수 선택 가능)
          </label>
          
          {/* 드롭다운 토글 버튼 */}
          <div
            onClick={() => setResourceDropdownOpen(!resourceDropdownOpen)}
            style={{
              width: "100%",
              padding: "8px",
              border: "1px solid #ced4da",
              borderRadius: "4px",
              fontSize: "14px",
              backgroundColor: "white",
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              minHeight: "38px"
            }}
          >
            <span style={{ color: (formData.사용자원 || []).length > 0 ? "#000" : "#6c757d" }}>
              {(formData.사용자원 || []).length > 0 
                ? `${(formData.사용자원 || []).length}개 선택됨` 
                : "자원 선택"}
            </span>
            <span style={{ fontSize: "12px" }}>
              {resourceDropdownOpen ? "▲" : "▼"}
            </span>
          </div>
          
          {/* 선택된 항목 미리보기 */}
          {(formData.사용자원 || []).length > 0 && (
            <div style={{ 
              marginTop: "8px", 
              padding: "8px", 
              backgroundColor: "#f8f9fa", 
              borderRadius: "4px",
              fontSize: "12px"
            }}>
              {(formData.사용자원 || []).map((item, idx) => (
                <div key={idx} style={{ marginBottom: idx < formData.사용자원.length - 1 ? "4px" : "0" }}>
                  • {resourceMap[item.resource] || item.resource} ({item.quantity}개)
                </div>
              ))}
            </div>
          )}
          
          {/* 드롭다운 메뉴 */}
          {resourceDropdownOpen && (
            <div style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              marginTop: "4px",
              maxHeight: "400px",
              overflowY: "auto",
              border: "1px solid #ced4da",
              borderRadius: "4px",
              padding: "12px",
              backgroundColor: "white",
              boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
              zIndex: 1000
            }}>
              {Object.entries(resourceGroups).map(([groupName, resources]) => (
                <div key={groupName} style={{ marginBottom: "16px" }}>
                  <div style={{ 
                    fontWeight: "600", 
                    fontSize: "13px", 
                    color: "#495057",
                    marginBottom: "8px",
                    borderBottom: "1px solid #e9ecef",
                    paddingBottom: "4px"
                  }}>
                    {groupName}
                  </div>
                  {resources.map(({ code, label }) => {
                    const selectedResource = (formData.사용자원 || []).find(r => r.resource === code);
                    const isChecked = !!selectedResource;
                    const quantity = selectedResource?.quantity || "";
                    
                    return (
                      <div key={code} style={{ 
                        display: "flex", 
                        alignItems: "center", 
                        marginBottom: "8px",
                        padding: "4px",
                        backgroundColor: isChecked ? "#f0f8ff" : "transparent",
                        borderRadius: "4px"
                      }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            const currentResources = formData.사용자원 || [];
                            
                            if (checked) {
                              onFormDataChange({
                                ...formData,
                                사용자원: [...currentResources, { resource: code, quantity: 1 }]
                              });
                            } else {
                              onFormDataChange({
                                ...formData,
                                사용자원: currentResources.filter(r => r.resource !== code)
                              });
                            }
                          }}
                          style={{ marginRight: "8px", cursor: "pointer" }}
                        />
                        <label style={{ 
                          flex: 1, 
                          fontSize: "13px", 
                          cursor: "pointer",
                          userSelect: "none"
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          const currentResources = formData.사용자원 || [];
                          const isCurrentlyChecked = currentResources.some(r => r.resource === code);
                          
                          if (isCurrentlyChecked) {
                            onFormDataChange({
                              ...formData,
                              사용자원: currentResources.filter(r => r.resource !== code)
                            });
                          } else {
                            onFormDataChange({
                              ...formData,
                              사용자원: [...currentResources, { resource: code, quantity: 1 }]
                            });
                          }
                        }}
                        >
                          {label}
                        </label>
                        {isChecked && (
                          <input
                            type="number"
                            placeholder="수량"
                            value={quantity}
                            onChange={(e) => {
                              const newQuantity = parseInt(e.target.value) || "";
                              const currentResources = formData.사용자원 || [];
                              onFormDataChange({
                                ...formData,
                                사용자원: currentResources.map(r => 
                                  r.resource === code 
                                    ? { ...r, quantity: newQuantity }
                                    : r
                                )
                              });
                            }}
                            onClick={(e) => e.stopPropagation()}
                            min="1"
                            style={{
                              width: "70px",
                              padding: "4px 8px",
                              border: "1px solid #ced4da",
                              borderRadius: "4px",
                              fontSize: "13px",
                              marginLeft: "8px"
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
            사용유형
          </label>
          <select
            value={formData.사용유형}
            onChange={(e) => onFormDataChange({ ...formData, 사용유형: e.target.value })}
            style={{
              width: "100%",
              padding: "8px",
              border: "1px solid #ced4da",
              borderRadius: "4px",
              fontSize: "14px",
              backgroundColor: "white"
            }}
          >
            <option value="">선택해주세요</option>
            <option value="온디맨드">온디맨드</option>
            <option value="약정형">약정형</option>
            <option value="ECI">ECI</option>
          </select>
        </div>
        
        <div style={{ gridColumn: "span 2" }}>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
            사용기간
          </label>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              type="date"
              placeholder="시작일"
              value={formData.사용기간시작일}
              onChange={(e) => onFormDataChange({ ...formData, 사용기간시작일: e.target.value })}
              style={{
                flex: 1,
                padding: "8px",
                border: "1px solid #ced4da",
                borderRadius: "4px",
                fontSize: "14px"
              }}
            />
            <span style={{ color: "#666" }}>~</span>
            <input
              type="date"
              placeholder="종료일"
              value={formData.사용기간종료일}
              onChange={(e) => onFormDataChange({ ...formData, 사용기간종료일: e.target.value })}
              disabled={formData.종료일없음}
              style={{
                flex: 1,
                padding: "8px",
                border: "1px solid #ced4da",
                borderRadius: "4px",
                fontSize: "14px",
                backgroundColor: formData.종료일없음 ? "#f5f5f5" : "white",
                cursor: formData.종료일없음 ? "not-allowed" : "text"
              }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "14px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={formData.종료일없음}
                onChange={(e) => {
                  onFormDataChange({
                    ...formData,
                    종료일없음: e.target.checked,
                    사용기간종료일: e.target.checked ? "" : formData.사용기간종료일
                  });
                }}
                style={{ cursor: "pointer" }}
              />
              <span>종료일 없음</span>
            </label>
          </div>
        </div>
        
        <div>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
            견적/정산금액
          </label>
          <input
            type="text"
            value={formData["견적/정산금액"]}
            onChange={(e) => onFormDataChange({ ...formData, "견적/정산금액": e.target.value })}
            style={{
              width: "100%",
              padding: "8px",
              border: "1px solid #ced4da",
              borderRadius: "4px",
              fontSize: "14px"
            }}
          />
        </div>
        
        <div>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
            비고
          </label>
          <input
            type="text"
            value={formData.비고}
            onChange={(e) => onFormDataChange({ ...formData, 비고: e.target.value })}
            style={{
              width: "100%",
              padding: "8px",
              border: "1px solid #ced4da",
              borderRadius: "4px",
              fontSize: "14px"
            }}
          />
        </div>
      </div>
      
      <div style={{ display: "flex", gap: "8px" }}>
        <button
          onClick={handleSubmit}
          style={{
            padding: "10px 20px",
            backgroundColor: "#28a745",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: "500"
          }}
        >
          {editingIndex !== null ? "수정 완료" : "등록"}
        </button>
        
        {editingIndex !== null && (
          <button
            onClick={handleCancel}
            style={{
              padding: "10px 20px",
              backgroundColor: "#6c757d",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "14px"
            }}
          >
            취소
          </button>
        )}
      </div>
    </div>
  );
};

export default CloudCustomerForm;
