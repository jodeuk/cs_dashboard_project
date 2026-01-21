import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const WeeklyAdoptionChart = ({ cloudCustomers }) => {
  const weeklyData = {};

  const getWeekLabel = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    
    // 9월 16일 이전 데이터 제외 (시작 연도: 2025)
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // 0-based
    const day = date.getDate();
    if (year < 2025 || (year === 2025 && month < 9) || (year === 2025 && month === 9 && day < 16)) {
      return null;
    }
    
    // 해당 월의 첫날
    const firstDayOfMonth = new Date(year, month - 1, 1);
    // 해당 날짜가 월의 몇 번째 날인지
    const dayOfMonth = date.getDate();
    // 주차 계산 (1일~7일: 1주차, 8일~14일: 2주차 등)
    const weekOfMonth = Math.ceil(dayOfMonth / 7);
    
    return `${year}-${String(month).padStart(2, '0')}-${weekOfMonth}`;
  };
  
  const formatWeekLabel = (weekKey) => {
    const [year, month, week] = weekKey.split('-');
    return `${parseInt(month)}월 ${week}주차`;
  };
  
  // 9월 16일부터 현재까지 모든 주차 생성
  const generateAllWeeks = () => {
    const weeks = [];
    const startDate = new Date(2025, 8, 16); // 2025년 9월 16일
    const today = new Date();
    
    let currentDate = new Date(startDate);
    
    while (currentDate <= today) {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;
      const dayOfMonth = currentDate.getDate();
      const weekOfMonth = Math.ceil(dayOfMonth / 7);
      const weekKey = `${year}-${String(month).padStart(2, '0')}-${weekOfMonth}`;
      
      if (!weeklyData[weekKey]) {
        weeklyData[weekKey] = { week: weekKey, 도입: 0, 정산: 0 };
      }
      
      // 다음 주로 이동 (7일 추가)
      currentDate.setDate(currentDate.getDate() + 7);
    }
  };
  
  // 먼저 모든 주차 초기화
  generateAllWeeks();
  
  // 실제 데이터로 채우기
  cloudCustomers.forEach(customer => {
    // 문의날짜 기준으로 처리
    if (customer.문의날짜) {
      const weekKey = getWeekLabel(customer.문의날짜);
      if (weekKey && weeklyData[weekKey]) {
        // 모든 세일즈단계를 도입으로 카운트
        weeklyData[weekKey].도입 += 1;
        
        // 정산 단계만 따로 카운트
        if (customer.세일즈단계 === "정산") {
          weeklyData[weekKey].정산 += 1;
        }
      }
    }
  });

  const lineData = Object.values(weeklyData)
    .sort((a, b) => a.week.localeCompare(b.week))
    .map(item => ({
      ...item,
      weekLabel: formatWeekLabel(item.week)
    }));

  if (lineData.length === 0) {
    return (
      <div style={{
        backgroundColor: "#fff",
        border: "1px solid #dee2e6",
        borderRadius: "8px",
        padding: "12px",
        boxShadow: "0 2px 4px rgba(0,0,0,0.05)"
      }}>
        <h3 style={{ fontSize: "14px", marginBottom: "12px", color: "#495057", fontWeight: "600" }}>
          주차별 도입/정산 추이
        </h3>
        <div style={{ textAlign: "center", color: "#6c757d", padding: "40px 0" }}>
          데이터가 없습니다 (2025년 9월 16일 이후 문의날짜가 있는 데이터만 표시됩니다)
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
      <h3 style={{ fontSize: "14px", marginBottom: "12px", color: "#495057", fontWeight: "600" }}>
        주차별 도입/정산 추이
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={lineData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis 
            dataKey="weekLabel" 
            angle={-45}
            textAnchor="end"
            height={80}
            tick={{ fontSize: 12 }}
          />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="도입" stroke="#0088FE" strokeWidth={2} dot={{ r: 4 }} name="도입 (전체)" />
          <Line type="monotone" dataKey="정산" stroke="#00C49F" strokeWidth={2} dot={{ r: 4 }} name="정산" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default WeeklyAdoptionChart;
