import React, { useMemo, useState } from "react";

/**
 * Cloud 탭 - 정산/계약 단계 고객 사용기간 타임라인 차트
 * Gantt 차트 형태로 고객별 사용기간을 시각화
 */
function CloudTimelineChart({ cloudCustomers, resourceMap }) {
  const [usageTypeFilter, setUsageTypeFilter] = useState("전체"); // 사용유형 필터

  // 정산/계약 단계 고객 필터링 및 데이터 파싱
  const timelineData = useMemo(() => {
    if (!cloudCustomers || !Array.isArray(cloudCustomers)) return [];

    return cloudCustomers
      .filter((customer) => {
        // 세일즈단계 필터
        const stageMatch = customer.세일즈단계 === "정산" || customer.세일즈단계 === "계약";
        // 사용유형 필터
        const usageTypeMatch = usageTypeFilter === "전체" || customer.사용유형 === usageTypeFilter;
        return stageMatch && usageTypeMatch;
      })
      .map((customer) => {
        const 사용기간 = customer.사용기간 || "";
        let startDate = null;
        let endDate = null;
        let isOngoing = false;

        // 사용기간 파싱
        if (사용기간.includes("~ 현재")) {
          const startStr = 사용기간.replace("~ 현재", "").trim();
          startDate = parseDate(startStr);
          const now = new Date();
          now.setHours(23, 59, 59, 999); // 오늘 끝까지 포함
          endDate = now; // 현재 날짜 (오늘 끝까지)
          isOngoing = true;
        } else if (사용기간.includes("~")) {
          const parts = 사용기간.split("~");
          const startStr = parts[0].trim();
          const endStr = parts[1].trim();
          startDate = parseDate(startStr);
          endDate = parseDate(endStr);
          // 종료일도 하루 끝까지 포함되도록 설정
          if (endDate) {
            endDate.setHours(23, 59, 59, 999);
          }
        } else if (사용기간.trim()) {
          startDate = parseDate(사용기간.trim());
          endDate = startDate ? new Date(startDate) : null; // 종료일 없으면 시작일로
          if (endDate) {
            endDate.setHours(23, 59, 59, 999);
          }
        }

        // 고객 식별자 생성 (이름, 기관 등)
        const customerId = customer.id || customer.이름 || "";
        const titleParts = [
          customer.세일즈단계 === "정산" ? "[정산" : "[계약",
          customer.기관 || customer.이름 || "",
        ];
        if (customer.사용자원 && Array.isArray(customer.사용자원) && customer.사용자원.length > 0) {
          const resourceText = customer.사용자원
            .map((item) => {
              const resourceName = resourceMap[item.resource] || item.resource;
              const quantity = item.quantity ? `${item.quantity}x` : "";
              return quantity ? `${quantity} ${resourceName}` : resourceName;
            })
            .join(", ");
          titleParts.push(resourceText);
        }
        const title = titleParts.filter(Boolean).join(" / ") + "]";

        return {
          id: customerId,
          title,
          customer,
          startDate,
          endDate,
          isOngoing,
          stage: customer.세일즈단계,
        };
      })
      .filter((item) => item.startDate); // 시작일이 있는 것만
  }, [cloudCustomers, resourceMap, usageTypeFilter]);

  // 날짜 파싱 헬퍼
  function parseDate(dateStr) {
    if (!dateStr) return null;
    
    // YYYY-MM-DD 형식 명시적으로 처리
    const yyyymmddPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
    const match = dateStr.trim().match(yyyymmddPattern);
    
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1; // 월은 0부터 시작
      const day = parseInt(match[3], 10);
      const date = new Date(year, month, day, 0, 0, 0, 0);
      
      // 유효성 검사
      if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) {
        return date;
      }
    }
    
    // 일반적인 날짜 파싱 시도
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  }

  // 타임라인 범위 계산
  const timelineRange = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999); // 오늘 끝까지 포함
    
    if (timelineData.length === 0) {
      const start = new Date(today.getFullYear(), today.getMonth() - 3, 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 3, 0);
      return { start, end };
    }

    const dates = timelineData
      .flatMap((item) => [item.startDate, item.endDate])
      .filter(Boolean);
    const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
    const allDates = dates.map((d) => d.getTime());
    allDates.push(today.getTime()); // 현재 날짜도 포함
    const maxDate = new Date(Math.max(...allDates));

    // 여유 공간 추가 (최소한 현재 날짜까지는 포함)
    const start = new Date(minDate.getFullYear(), minDate.getMonth() - 1, 1);
    const calculatedEnd = new Date(maxDate.getFullYear(), maxDate.getMonth() + 2, 0);
    const end = calculatedEnd > today ? calculatedEnd : today;

    return { start, end };
  }, [timelineData]);

  // 월별 헤더 생성
  const monthHeaders = useMemo(() => {
    const headers = [];
    const current = new Date(timelineRange.start);
    const end = new Date(timelineRange.end);
    let prevYear = null;

    while (current <= end) {
      const year = current.getFullYear();
      const month = current.getMonth();
      const monthLabel = `${month + 1}월`;
      
      // 이전 달과 연도가 다르고, 현재 연도가 아닐 때만 연도 표시
      let label = monthLabel;
      if (prevYear !== null && prevYear !== year) {
        const currentYear = new Date().getFullYear();
        if (year !== currentYear) {
          label = `${monthLabel} '${String(year).slice(-2)}`;
        }
      }
      
      headers.push({
        date: new Date(current),
        label,
        year,
        month,
      });
      
      prevYear = year;
      current.setMonth(current.getMonth() + 1);
    }

    return headers;
  }, [timelineRange]);


  // 날짜를 픽셀 위치로 변환
  function dateToX(date, timelineWidth) {
    if (!date) return 0;
    const totalDays = (timelineRange.end - timelineRange.start) / (1000 * 60 * 60 * 24);
    const daysFromStart = (date - timelineRange.start) / (1000 * 60 * 60 * 24);
    return (daysFromStart / totalDays) * timelineWidth;
  }

  const currentDate = new Date();
  const rowHeight = 40;
  const leftPanelWidth = 280;
  const headerHeight = 60;
  const timelineWidth = 1200;
  const totalHeight = Math.max(400, timelineData.length * rowHeight + headerHeight);

  if (timelineData.length === 0) {
    return (
      <div
        style={{
          backgroundColor: "#f8f9fa",
          padding: "40px",
          textAlign: "center",
          borderRadius: "8px",
          border: "1px solid #dee2e6",
        }}
      >
        <div style={{ color: "#6c757d", fontSize: "14px" }}>
          정산 또는 계약 단계의 고객이 없거나 사용기간 정보가 없습니다.
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundColor: "#fff",
        borderRadius: "8px",
        border: "1px solid #dee2e6",
        overflow: "hidden",
        marginBottom: "24px",
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 20px",
          borderBottom: "2px solid #dee2e6",
          backgroundColor: "#f8f9fa",
        }}
      >
        <h3 style={{ fontSize: "18px", margin: 0, color: "#495057", fontWeight: "600" }}>
          사용기간 타임라인 ({timelineData.length}건)
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <label style={{ fontSize: "14px", color: "#495057", fontWeight: "500" }}>
            사용유형:
          </label>
          <select
            value={usageTypeFilter}
            onChange={(e) => setUsageTypeFilter(e.target.value)}
            style={{
              padding: "6px 12px",
              border: "1px solid #dee2e6",
              borderRadius: "4px",
              fontSize: "14px",
              backgroundColor: "white",
              color: "#495057",
              cursor: "pointer",
            }}
          >
            <option value="전체">전체</option>
            <option value="ECI">ECI</option>
            <option value="온디맨드">온디맨드</option>
            <option value="약정형">약정형</option>
          </select>
        </div>
      </div>

      {/* 타임라인 뷰 */}
      <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "600px" }}>
        <div style={{ position: "relative", width: leftPanelWidth + timelineWidth, height: totalHeight }}>
          {/* 월별 헤더 */}
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 10,
              display: "flex",
              backgroundColor: "#fff",
              borderBottom: "2px solid #dee2e6",
              height: headerHeight,
            }}
          >
            {/* 왼쪽 여백 */}
            <div style={{ width: leftPanelWidth, borderRight: "1px solid #dee2e6" }}></div>
            {/* 월 헤더 */}
            <div style={{ position: "relative", flex: 1, minWidth: timelineWidth }}>
              {monthHeaders.map((header, idx) => {
                const nextHeader = monthHeaders[idx + 1];
                const x = dateToX(header.date, timelineWidth);
                const nextX = nextHeader
                  ? dateToX(new Date(nextHeader.year, nextHeader.month, 1), timelineWidth)
                  : timelineWidth;
                const width = nextX - x;

                return (
                  <div
                    key={`${header.year}-${header.month}`}
                    style={{
                      position: "absolute",
                      left: x,
                      width: width,
                      height: "100%",
                      borderRight: "1px solid #e9ecef",
                      padding: "8px 4px",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ fontSize: "13px", fontWeight: "600", color: "#495057" }}>
                      {header.label}
                    </div>
                  </div>
                );
              })}
              {/* 현재 날짜 표시선 */}
              {currentDate >= timelineRange.start && currentDate <= timelineRange.end && (
                <div
                  style={{
                    position: "absolute",
                    left: dateToX(currentDate, timelineWidth),
                    top: 0,
                    bottom: 0,
                    width: "2px",
                    backgroundColor: "#007bff",
                    zIndex: 15,
                  }}
                />
              )}
            </div>
          </div>

          {/* 타임라인 바디 */}
          <div style={{ display: "flex" }}>
            {/* 왼쪽: 고객 목록 */}
            <div
              style={{
                width: leftPanelWidth,
                borderRight: "1px solid #dee2e6",
                backgroundColor: "#f8f9fa",
              }}
            >
              {timelineData.map((item, idx) => (
                <div
                  key={item.id || idx}
                  style={{
                    height: rowHeight,
                    padding: "8px 12px",
                    display: "flex",
                    alignItems: "center",
                    borderBottom: "1px solid #e9ecef",
                    fontSize: "12px",
                    color: "#495057",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      width: "100%",
                    }}
                  >
                    <span style={{ fontSize: "14px" }}>🔗</span>
                    <span
                      style={{
                        fontWeight: "500",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.title}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* 오른쪽: 타임라인 바 */}
            <div style={{ position: "relative", flex: 1, minWidth: timelineWidth }}>
              {timelineData.map((item, idx) => {
                if (!item.startDate || !item.endDate) return null;

                const startX = dateToX(item.startDate, timelineWidth);
                const endX = dateToX(item.endDate, timelineWidth);
                const barWidth = Math.max(4, endX - startX);
                const barColor = item.stage === "정산" ? "#1976d2" : "#64b5f6";

                return (
                  <div
                    key={item.id || idx}
                    style={{
                      position: "absolute",
                      top: idx * rowHeight,
                      left: startX,
                      width: barWidth,
                      height: rowHeight - 4,
                      margin: "2px 0",
                    }}
                  >
                    {/* 타임라인 바 */}
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        backgroundColor: barColor,
                        borderRadius: "4px",
                        display: "flex",
                        alignItems: "center",
                        padding: "0 8px",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                      }}
                    >
                      {barWidth > 60 && (
                        <span
                          style={{
                            fontSize: "11px",
                            color: "white",
                            fontWeight: "500",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {formatDateRange(item.startDate, item.endDate, item.isOngoing)}
                        </span>
                      )}
                    </div>
                    {/* 진행중 표시 (원형 아이콘) */}
                    {item.isOngoing && (
                      <div
                        style={{
                          position: "absolute",
                          right: -8,
                          top: "50%",
                          transform: "translateY(-50%)",
                          width: "16px",
                          height: "16px",
                          borderRadius: "50%",
                          backgroundColor: "#495057",
                          border: "2px solid white",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                        }}
                      />
                    )}
                  </div>
                );
              })}
              {/* 현재 날짜 표시선 (바디에도) */}
              {currentDate >= timelineRange.start && currentDate <= timelineRange.end && (
                <div
                  style={{
                    position: "absolute",
                    left: dateToX(currentDate, timelineWidth),
                    top: 0,
                    bottom: 0,
                    width: "2px",
                    backgroundColor: "#007bff",
                    zIndex: 5,
                    pointerEvents: "none",
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 날짜 범위 포맷팅
function formatDateRange(start, end, isOngoing) {
  if (!start) return "";
  const formatDate = (date) => {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${month}/${day}`;
  };
  if (isOngoing) {
    return `${formatDate(start)} ~ 현재`;
  }
  return `${formatDate(start)} ~ ${formatDate(end)}`;
}

export default CloudTimelineChart;

