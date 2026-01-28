import React, { useMemo, useState } from "react";

/**
 * Cloud 탭 - 정산/계약 단계 고객 사용기간 타임라인 차트
 * Gantt 차트 형태로 고객별 사용기간을 시각화
 */
function CloudTimelineChart({ cloudCustomers, resourceMap }) {
  const [usageTypeFilter, setUsageTypeFilter] = useState("전체"); // 사용유형 필터
  const [selectedMonth, setSelectedMonth] = useState(null); // 선택된 월 {year, month}
  
  // 기간 필터 상태
  const today = new Date();
  const threeMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
  const threeMonthsLater = new Date(today.getFullYear(), today.getMonth() + 3, today.getDate());
  const formatDateForInput = (date) => date.toISOString().split("T")[0];
  const [dateFilterStart, setDateFilterStart] = useState(formatDateForInput(threeMonthsAgo));
  const [dateFilterEnd, setDateFilterEnd] = useState(formatDateForInput(threeMonthsLater));
  const [useDateFilter, setUseDateFilter] = useState(true); // 기간 필터 사용 여부 (기본 활성화)

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
      .filter((item) => item.startDate) // 시작일이 있는 것만
      .filter((item) => {
        // 기간 필터 적용
        if (!useDateFilter || !dateFilterStart || !dateFilterEnd) {
          return true;
        }
        const filterStart = new Date(dateFilterStart);
        filterStart.setHours(0, 0, 0, 0);
        const filterEnd = new Date(dateFilterEnd);
        filterEnd.setHours(23, 59, 59, 999);
        // 타임라인 바가 필터 기간과 겹치는지 확인
        return item.startDate <= filterEnd && item.endDate >= filterStart;
      });
  }, [cloudCustomers, resourceMap, usageTypeFilter, useDateFilter, dateFilterStart, dateFilterEnd]);

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
    
    // 기간 필터가 활성화된 경우 - 정확히 필터 기간만 사용 (여유 공간 없이)
    if (useDateFilter && dateFilterStart && dateFilterEnd) {
      const filterStart = new Date(dateFilterStart);
      filterStart.setHours(0, 0, 0, 0);
      const filterEnd = new Date(dateFilterEnd);
      filterEnd.setHours(23, 59, 59, 999);
      
      // 필터 기간을 정확히 사용
      return { start: filterStart, end: filterEnd, filterStart, filterEnd };
    }
    
    // 기간 필터가 없는 경우 기존 로직
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
  }, [timelineData, useDateFilter, dateFilterStart, dateFilterEnd]);

  // 월별 헤더 생성
  const monthHeaders = useMemo(() => {
    const headers = [];
    // 필터가 있으면 필터 시작일의 월부터 시작, 없으면 timelineRange 시작일의 월부터 시작
    const rangeStart = new Date(timelineRange.start);
    const rangeEnd = new Date(timelineRange.end);
    const current = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    const end = new Date(rangeEnd);
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

  // 선택된 월에 사용 중인 고객 및 자원 정보 계산
  const selectedMonthInfo = useMemo(() => {
    if (!selectedMonth) return null;

    const { year, month } = selectedMonth;
    const monthStart = new Date(year, month, 1, 0, 0, 0, 0);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

    // 해당 월에 사용 중인 고객 필터링
    const activeCustomers = timelineData.filter((item) => {
      if (!item.startDate || !item.endDate) return false;
      // 시작일이 월의 마지막일 이전이고, 종료일이 월의 첫날 이후인 경우
      return item.startDate <= monthEnd && item.endDate >= monthStart;
    });

    // 서비스유형(ECI, Runbox)과 사용유형(온디맨드, 약정형) 조합별로 집계
    const caseMap = new Map();
    
    // 4가지 케이스 초기화
    const cases = [
      { serviceType: "ECI", usageType: "온디맨드" },
      { serviceType: "ECI", usageType: "약정형" },
      { serviceType: "Runbox", usageType: "온디맨드" },
      { serviceType: "Runbox", usageType: "약정형" },
    ];
    
    cases.forEach(({ serviceType, usageType }) => {
      const key = `${serviceType}_${usageType}`;
      caseMap.set(key, {
        serviceType,
        usageType,
        A100: 0,
        H100: 0,
        B200: 0,
        total: 0,
      });
    });

    activeCustomers.forEach((item) => {
      const customer = item.customer;
      const serviceType = customer.서비스유형 || "";
      const usageType = customer.사용유형 || "";
      const resources = customer.사용자원 || [];

      // 서비스유형이 ECI 또는 Runbox이고, 사용유형이 온디맨드 또는 약정형인 경우만 집계
      if ((serviceType === "ECI" || serviceType === "Runbox") && 
          (usageType === "온디맨드" || usageType === "약정형")) {
        const key = `${serviceType}_${usageType}`;
        const caseInfo = caseMap.get(key);
        
        if (caseInfo) {
          // 자원별로 집계
          if (Array.isArray(resources) && resources.length > 0) {
            resources.forEach((resource) => {
              const resourceCode = resource.resource || "";
              const quantity = resource.quantity || 1;
              
              if (resourceCode === "A100") {
                caseInfo.A100 += quantity;
              } else if (resourceCode === "H100") {
                caseInfo.H100 += quantity;
              } else if (resourceCode === "B200") {
                caseInfo.B200 += quantity;
              }
              caseInfo.total += quantity;
            });
          } else if (typeof resources === 'string' && resources) {
            // 레거시 문자열 형식 지원
            const quantity = customer.사용자원수량 || 1;
            if (resources === "A100") {
              caseInfo.A100 += quantity;
            } else if (resources === "H100") {
              caseInfo.H100 += quantity;
            } else if (resources === "B200") {
              caseInfo.B200 += quantity;
            }
            caseInfo.total += quantity;
          }
        }
      }
    });

    return {
      month: `${year}년 ${month + 1}월`,
      cases: Array.from(caseMap.values()),
      totalCustomers: activeCustomers.length,
    };
  }, [selectedMonth, timelineData]);

  const currentDate = new Date();
  const rowHeight = 40;
  const leftPanelWidth = 280;
  const headerHeight = 60;
  
  // 기간 필터가 있으면 동적으로 타임라인 너비 계산, 없으면 고정값 사용
  const timelineWidth = useMemo(() => {
    if (useDateFilter && dateFilterStart && dateFilterEnd) {
      // 필터 기간에 맞게 칼럼 너비 계산
      const monthCount = monthHeaders.length;
      const minWidthPerMonth = 120;
      const maxWidthPerMonth = 200;
      const calculatedWidth = monthCount * minWidthPerMonth;
      // 최소 600px, 최대는 월당 200px로 제한
      return Math.max(600, Math.min(monthCount * maxWidthPerMonth, calculatedWidth));
    }
    return 1200; // 필터가 없으면 고정값
  }, [useDateFilter, dateFilterStart, dateFilterEnd, monthHeaders.length]);
  
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
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          {/* 기간 필터 */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <label style={{ fontSize: "14px", color: "#495057", fontWeight: "500" }}>
              기간:
            </label>
            <input
              type="date"
              value={dateFilterStart}
              onChange={(e) => {
                const newStart = e.target.value;
                setDateFilterStart(newStart);
                if (newStart > dateFilterEnd) setDateFilterEnd(newStart);
                setUseDateFilter(true);
              }}
              max={formatDateForInput(today)}
              style={{
                padding: "6px 12px",
                border: "1px solid #dee2e6",
                borderRadius: "4px",
                fontSize: "14px",
                backgroundColor: useDateFilter ? "#fff" : "#f8f9fa",
                color: "#495057",
                cursor: "pointer",
              }}
            />
            <span style={{ color: "#6c757d" }}>~</span>
            <input
              type="date"
              value={dateFilterEnd}
              onChange={(e) => {
                const newEnd = e.target.value;
                if (newEnd <= formatDateForInput(today)) {
                  setDateFilterEnd(newEnd);
                  if (newEnd < dateFilterStart) setDateFilterStart(newEnd);
                  setUseDateFilter(true);
                }
              }}
              max={formatDateForInput(today)}
              min={dateFilterStart}
              style={{
                padding: "6px 12px",
                border: "1px solid #dee2e6",
                borderRadius: "4px",
                fontSize: "14px",
                backgroundColor: useDateFilter ? "#fff" : "#f8f9fa",
                color: "#495057",
                cursor: "pointer",
              }}
            />
            <button
              onClick={() => {
                setUseDateFilter(true);
                setDateFilterStart(formatDateForInput(threeMonthsAgo));
                setDateFilterEnd(formatDateForInput(threeMonthsLater));
              }}
              style={{
                padding: "6px 12px",
                border: "1px solid #dee2e6",
                borderRadius: "4px",
                fontSize: "14px",
                backgroundColor: "#fff",
                color: "#495057",
                cursor: "pointer",
              }}
            >
              초기화
            </button>
          </div>
          
          {/* 사용유형 필터 */}
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
      </div>

      {/* 타임라인 뷰 */}
      <div style={{ 
        overflowX: useDateFilter && dateFilterStart && dateFilterEnd ? "hidden" : "auto", 
        overflowY: "auto", 
        maxHeight: "600px" 
      }}>
        <div style={{ 
          position: "relative", 
          width: useDateFilter && dateFilterStart && dateFilterEnd 
            ? "100%" 
            : leftPanelWidth + timelineWidth, 
          minWidth: leftPanelWidth + timelineWidth,
          height: totalHeight 
        }}>
          {/* 월별 헤더 */}
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 100,
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

                const isSelected = selectedMonth && selectedMonth.year === header.year && selectedMonth.month === header.month;

                return (
                  <div
                    key={`${header.year}-${header.month}`}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedMonth(null);
                      } else {
                        setSelectedMonth({ year: header.year, month: header.month });
                      }
                    }}
                    style={{
                      position: "absolute",
                      left: x,
                      width: width,
                      height: "100%",
                      borderRight: "1px solid #e9ecef",
                      padding: "8px 4px",
                      textAlign: "center",
                      cursor: "pointer",
                      backgroundColor: isSelected ? "#e3f2fd" : "transparent",
                      transition: "background-color 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = "#f5f5f5";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }
                    }}
                  >
                    <div style={{ fontSize: "13px", fontWeight: "600", color: isSelected ? "#1976d2" : "#495057" }}>
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
                    zIndex: 1,
                    pointerEvents: "none",
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
                    padding: "0 12px",
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

                // 필터 기간으로 클리핑
                let clippedStart = item.startDate;
                let clippedEnd = item.endDate;
                
                if (useDateFilter && dateFilterStart && dateFilterEnd) {
                  const filterStart = new Date(dateFilterStart);
                  filterStart.setHours(0, 0, 0, 0);
                  const filterEnd = new Date(dateFilterEnd);
                  filterEnd.setHours(23, 59, 59, 999);
                  
                  if (item.startDate < filterStart) {
                    clippedStart = filterStart;
                  }
                  if (item.endDate > filterEnd) {
                    clippedEnd = filterEnd;
                  }
                }

                const startX = dateToX(clippedStart, timelineWidth);
                const endX = dateToX(clippedEnd, timelineWidth);
                
                // 클리핑된 바가 타임라인 범위 밖이면 표시하지 않음
                if (endX < 0 || startX > timelineWidth) return null;
                
                const barWidth = Math.max(4, endX - startX);
                const barColor = item.stage === "정산" ? "#1976d2" : "#64b5f6";

                return (
                  <div
                    key={item.id || idx}
                    style={{
                      position: "absolute",
                      top: idx * rowHeight,
                      left: Math.max(0, startX),
                      width: barWidth,
                      height: rowHeight - 4,
                      margin: "2px 0",
                      zIndex: 0,
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
                    zIndex: 1,
                    pointerEvents: "none",
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 월 선택 정보 모달 */}
      {selectedMonthInfo && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setSelectedMonth(null)}
        >
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: "8px",
              padding: "24px",
              maxWidth: "600px",
              maxHeight: "80vh",
              overflow: "auto",
              boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ fontSize: "20px", margin: 0, color: "#495057", fontWeight: "600" }}>
                {selectedMonthInfo.month} 사용 현황
              </h3>
              <button
                onClick={() => setSelectedMonth(null)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "24px",
                  color: "#6c757d",
                  cursor: "pointer",
                  padding: "0",
                  width: "30px",
                  height: "30px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>

            <div style={{ marginBottom: "16px", padding: "12px", backgroundColor: "#f8f9fa", borderRadius: "6px" }}>
              <div style={{ fontSize: "14px", color: "#495057" }}>
                <strong>사용 고객 수:</strong> {selectedMonthInfo.totalCustomers}건
              </div>
            </div>

            <div>
              <h4 style={{ fontSize: "16px", margin: "0 0 12px 0", color: "#495057", fontWeight: "600" }}>
                서비스유형/사용유형별 자원 사용량
              </h4>
              <div style={{ maxHeight: "400px", overflowY: "auto" }}>
                {selectedMonthInfo.cases.length === 0 ? (
                  <div style={{ padding: "20px", textAlign: "center", color: "#6c757d" }}>
                    해당 월에 사용 중인 데이터가 없습니다.
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                    <thead>
                      <tr style={{ backgroundColor: "#e9ecef", borderBottom: "2px solid #dee2e6" }}>
                        <th style={{ padding: "10px", textAlign: "left", fontWeight: "600", color: "#495057" }}>서비스유형</th>
                        <th style={{ padding: "10px", textAlign: "left", fontWeight: "600", color: "#495057" }}>사용유형</th>
                        <th style={{ padding: "10px", textAlign: "right", fontWeight: "600", color: "#495057" }}>A100</th>
                        <th style={{ padding: "10px", textAlign: "right", fontWeight: "600", color: "#495057" }}>H100</th>
                        <th style={{ padding: "10px", textAlign: "right", fontWeight: "600", color: "#495057" }}>B200</th>
                        <th style={{ padding: "10px", textAlign: "right", fontWeight: "600", color: "#495057" }}>합계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedMonthInfo.cases.map((caseInfo, idx) => (
                        <tr
                          key={idx}
                          style={{
                            borderBottom: "1px solid #e9ecef",
                            backgroundColor: idx % 2 === 0 ? "#fff" : "#f8f9fa",
                          }}
                        >
                          <td style={{ padding: "10px", color: "#495057", fontWeight: "500" }}>
                            {caseInfo.serviceType || "-"}
                          </td>
                          <td style={{ padding: "10px", color: "#495057" }}>
                            {caseInfo.usageType || "-"}
                          </td>
                          <td style={{ padding: "10px", textAlign: "right", color: "#495057" }}>
                            {caseInfo.A100 > 0 ? caseInfo.A100.toLocaleString() : "-"}
                          </td>
                          <td style={{ padding: "10px", textAlign: "right", color: "#495057" }}>
                            {caseInfo.H100 > 0 ? caseInfo.H100.toLocaleString() : "-"}
                          </td>
                          <td style={{ padding: "10px", textAlign: "right", color: "#495057" }}>
                            {caseInfo.B200 > 0 ? caseInfo.B200.toLocaleString() : "-"}
                          </td>
                          <td style={{ padding: "10px", textAlign: "right", color: "#495057", fontWeight: "600" }}>
                            {caseInfo.total > 0 ? caseInfo.total.toLocaleString() : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
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

