import React, { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const ResourceUsageChart = ({ cloudCustomers, resourceMap }) => {
  const [showResourceDetail, setShowResourceDetail] = useState(false);

  // 자원 코드에서 타입 추출 함수
  const getResourceType = (resourceCode) => {
    if (resourceCode.includes('NBTHS')) return 'B200';
    if (resourceCode.includes('NHHS')) return 'H100';
    if (resourceCode.includes('NAHP')) return 'A100';
    return 'Other';
  };

  // 자원별 집계
  const resourceCount = {};
  const detailedResourceCount = {};
  
  cloudCustomers.forEach(customer => {
    if (Array.isArray(customer.사용자원)) {
      customer.사용자원.forEach(item => {
        const resourceType = getResourceType(item.resource);
        const quantity = parseInt(item.quantity) || 1;
        
        // 타입별 집계
        resourceCount[resourceType] = (resourceCount[resourceType] || 0) + quantity;
        
        // 상세 자원별 집계
        const detailedName = resourceMap[item.resource] || item.resource;
        if (!detailedResourceCount[resourceType]) {
          detailedResourceCount[resourceType] = {};
        }
        detailedResourceCount[resourceType][detailedName] = 
          (detailedResourceCount[resourceType][detailedName] || 0) + quantity;
      });
    } else if (customer.사용자원) {
      const resourceType = getResourceType(customer.사용자원);
      const quantity = parseInt(customer.사용자원수량) || 1;
      
      resourceCount[resourceType] = (resourceCount[resourceType] || 0) + quantity;
      
      const detailedName = resourceMap[customer.사용자원] || customer.사용자원;
      if (!detailedResourceCount[resourceType]) {
        detailedResourceCount[resourceType] = {};
      }
      detailedResourceCount[resourceType][detailedName] = 
        (detailedResourceCount[resourceType][detailedName] || 0) + quantity;
    }
  });

  const pieData = Object.entries(resourceCount).map(([name, value]) => ({
    name,
    value
  }));

  const COLORS = {
    'B200': '#0088FE',
    'H100': '#00C49F',
    'A100': '#FFBB28',
    'Other': '#FF8042'
  };
  
  const total = pieData.reduce((sum, item) => sum + item.value, 0);

  if (pieData.length === 0) {
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
            도입 자원 유형
          </h3>
        </div>
        <div style={{ textAlign: "center", color: "#6c757d", padding: "40px 0" }}>
          데이터가 없습니다
        </div>
      </div>
    );
  }

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
          도입 자원 유형
        </h3>
        <button
          onClick={() => setShowResourceDetail(!showResourceDetail)}
          style={{
            padding: "6px 12px",
            fontSize: "12px",
            backgroundColor: showResourceDetail ? "#007bff" : "#f8f9fa",
            color: showResourceDetail ? "white" : "#495057",
            border: "1px solid #dee2e6",
            borderRadius: "4px",
            cursor: "pointer",
            transition: "all 0.2s"
          }}
        >
          {showResourceDetail ? "간단히 보기" : "상세히 보기"}
        </button>
      </div>
      <div>
        <div style={{ position: "relative", width: "100%", height: "160px" }}>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                fill="#8884d8"
                paddingAngle={2}
                dataKey="value"
                label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[entry.name] || '#8884d8'} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ 
            position: "absolute", 
            top: "50%", 
            left: "50%", 
            transform: "translate(-50%, -50%)",
            fontSize: "28px", 
            fontWeight: "700", 
            color: "#212529",
            pointerEvents: "none"
          }}>
            {total}
          </div>
        </div>
        
        {/* 간단히 보기 */}
        {!showResourceDetail && (
          <div style={{ fontSize: "12px", marginTop: "16px" }}>
            {pieData.map((item, index) => (
              <div key={index} style={{ display: "flex", alignItems: "center", marginBottom: "8px" }}>
                <div style={{
                  width: "12px",
                  height: "12px",
                  backgroundColor: COLORS[item.name] || '#8884d8',
                  marginRight: "8px",
                  borderRadius: "2px"
                }}></div>
                <span style={{ fontSize: "12px", color: "#6c757d", flex: 1 }}>{item.name}</span>
                <span style={{ fontSize: "12px", fontWeight: "600" }}>{item.value}개</span>
              </div>
            ))}
          </div>
        )}
        
        {/* 상세히 보기 */}
        {showResourceDetail && (
          <div style={{ fontSize: "11px", marginTop: "10px", maxHeight: "200px", overflowY: "auto" }}>
            {Object.entries(detailedResourceCount).map(([type, resources]) => (
              <div key={type} style={{ marginBottom: "12px" }}>
                <div style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  marginBottom: "6px",
                  fontWeight: "600",
                  color: "#495057"
                }}>
                  <div style={{
                    width: "12px",
                    height: "12px",
                    backgroundColor: COLORS[type] || '#8884d8',
                    marginRight: "8px",
                    borderRadius: "2px"
                  }}></div>
                  <span>{type}</span>
                </div>
                {Object.entries(resources).map(([name, count], idx) => (
                  <div key={idx} style={{ 
                    paddingLeft: "20px", 
                    marginBottom: "4px",
                    color: "#6c757d",
                    fontSize: "10px"
                  }}>
                    • {name}: {count}개
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ResourceUsageChart;
