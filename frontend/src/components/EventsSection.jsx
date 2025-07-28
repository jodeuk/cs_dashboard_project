import React, { useState, useEffect } from 'react';
import { fetchUserEventsAnalysis } from '../api';

const EventsSection = ({ userIds, loading }) => {
  const [eventsData, setEventsData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!loading && userIds && userIds.length > 0) {
      const userIdsString = userIds.join(',');
      fetchUserEventsAnalysis(userIdsString)
        .then(setEventsData)
        .catch(err => {
          setError(err.message);
          console.error("Events analysis error:", err);
        });
    }
  }, [userIds, loading]);

  if (loading) {
    return (
      <div style={{
        backgroundColor: "#f8f9fa",
        padding: "20px",
        borderRadius: "8px",
        marginBottom: "20px",
        textAlign: "center"
      }}>
        <div>이벤트 분석 중...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        backgroundColor: "#ffebee",
        color: "#c62828",
        padding: "20px",
        borderRadius: "8px",
        marginBottom: "20px",
        textAlign: "center"
      }}>
        ❌ 이벤트 분석 실패: {error}
      </div>
    );
  }

  if (!eventsData || eventsData.total_events === 0) {
    return (
      <div style={{
        backgroundColor: "#f8f9fa",
        padding: "20px",
        borderRadius: "8px",
        marginBottom: "20px",
        textAlign: "center",
        color: "#666"
      }}>
        이벤트 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: "white",
      padding: "20px",
      borderRadius: "8px",
      marginBottom: "20px",
      boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
    }}>
      <h3 style={{ marginBottom: "16px", color: "#333" }}>사용자 이벤트 분석</h3>
      
      {/* 전체 통계 */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: "16px",
        marginBottom: "20px"
      }}>
        <div style={{
          backgroundColor: "#e3f2fd",
          padding: "16px",
          borderRadius: "8px",
          textAlign: "center"
        }}>
          <div style={{ fontSize: "24px", fontWeight: "bold", color: "#1565c0" }}>
            {eventsData.total_events}
          </div>
          <div style={{ fontSize: "14px", color: "#666" }}>총 이벤트</div>
        </div>
        
        <div style={{
          backgroundColor: "#f3e5f5",
          padding: "16px",
          borderRadius: "8px",
          textAlign: "center"
        }}>
          <div style={{ fontSize: "24px", fontWeight: "bold", color: "#7b1fa2" }}>
            {Object.keys(eventsData.event_types).length}
          </div>
          <div style={{ fontSize: "14px", color: "#666" }}>이벤트 타입</div>
        </div>
        
        <div style={{
          backgroundColor: "#e8f5e8",
          padding: "16px",
          borderRadius: "8px",
          textAlign: "center"
        }}>
          <div style={{ fontSize: "24px", fontWeight: "bold", color: "#2e7d32" }}>
            {Object.keys(eventsData.events_by_user).length}
          </div>
          <div style={{ fontSize: "14px", color: "#666" }}>활성 사용자</div>
        </div>
      </div>

      {/* 상위 이벤트 타입 */}
      <div style={{ marginBottom: "20px" }}>
        <h4 style={{ marginBottom: "12px", color: "#333" }}>상위 이벤트 타입</h4>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: "8px"
        }}>
          {Object.entries(eventsData.top_events).slice(0, 10).map(([eventName, count], index) => (
            <div key={index} style={{
              backgroundColor: "#f8f9fa",
              padding: "12px",
              borderRadius: "4px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}>
              <div style={{ fontSize: "12px", fontWeight: "bold" }}>
                {eventName}
              </div>
              <div style={{
                backgroundColor: "#007bff",
                color: "white",
                padding: "4px 8px",
                borderRadius: "12px",
                fontSize: "12px",
                fontWeight: "bold"
              }}>
                {count}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 최근 이벤트 */}
      {eventsData.recent_events.length > 0 && (
        <div>
          <h4 style={{ marginBottom: "12px", color: "#333" }}>최근 이벤트</h4>
          <div style={{
            maxHeight: "200px",
            overflowY: "auto",
            border: "1px solid #ddd",
            borderRadius: "4px"
          }}>
            {eventsData.recent_events.map((event, index) => (
              <div key={index} style={{
                padding: "8px 12px",
                borderBottom: index < eventsData.recent_events.length - 1 ? "1px solid #eee" : "none",
                fontSize: "12px"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <strong>{event.eventName}</strong>
                    <div style={{ color: "#666", fontSize: "11px" }}>
                      사용자: {event.userId}
                    </div>
                  </div>
                  <div style={{ color: "#666", fontSize: "11px" }}>
                    {new Date(event.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default EventsSection; 