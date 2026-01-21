import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const ChannelByDateChart = ({ data, dateGroup, onDateGroupChange }) => {
  return (
    <div
      style={{
        backgroundColor: "white",
        padding: "20px",
        borderRadius: "12px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
      }}
    >
      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between", 
        marginBottom: "16px" 
      }}>
        <h3 style={{ color: "#333", fontWeight: "600", margin: 0 }}>
          일자별 채널비율
        </h3>
        <div style={{
          display: "inline-flex",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          overflow: "hidden"
        }}>
          {["Daily", "Weekly", "Monthly"].map(g => (
            <button
              key={g}
              onClick={() => onDateGroupChange(g)}
              style={{
                padding: "6px 10px",
                fontSize: 12,
                border: "none",
                background: dateGroup === g ? "#111827" : "#fff",
                color: dateGroup === g ? "#fff" : "#374151",
                cursor: "pointer"
              }}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="x축" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Area
              type="monotone"
              dataKey="유선"
              stackId="1"
              stroke="#8884d8"
              fill="#8884d8"
              fillOpacity={0.6}
            />
            <Area
              type="monotone"
              dataKey="이메일"
              stackId="1"
              stroke="#82ca9d"
              fill="#82ca9d"
              fillOpacity={0.6}
            />
            <Area
              type="monotone"
              dataKey="카카오"
              stackId="1"
              stroke="#ffc658"
              fill="#ffc658"
              fillOpacity={0.6}
            />
            <Area
              type="monotone"
              dataKey="채널톡"
              stackId="1"
              stroke="#ff7300"
              fill="#ff7300"
              fillOpacity={0.6}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ textAlign: "center", color: "#666", padding: "40px 0" }}>
          채널 데이터가 없습니다.
        </div>
      )}
    </div>
  );
};

export default ChannelByDateChart;
