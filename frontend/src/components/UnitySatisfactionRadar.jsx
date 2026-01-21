import React, { useMemo } from "react";
import { unity1Detail } from "../constants/unity1_satisfaction";

export default function UnitySatisfactionRadar({ cardWidth = 700, cardHeight = 700 }) {
  // 차트 자체는 600x600으로 고정
  const chartSize = 600;
  const margin = 80;
  const radius = chartSize / 2 - margin;
  const centerX = chartSize / 2;
  const centerY = chartSize / 2;

  // 각 세부 항목의 전체 평균 계산
  const radarData = useMemo(() => {
    const { theory, project } = unity1Detail;
    
    // 평균 계산 헬퍼
    const calcAvg = (arr) => {
      const valid = arr.filter(v => v != null);
      return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
    };

    const data = [];

    // 이론주간 콘텐츠
    Object.entries(theory.content).forEach(([key, values]) => {
      data.push({
        label: `[이론] ${key}`,
        value: calcAvg(values),
        category: "이론콘텐츠"
      });
    });

    // 프로젝트주간 콘텐츠
    Object.entries(project.content).forEach(([key, values]) => {
      data.push({
        label: `[프로젝트] ${key}`,
        value: calcAvg(values),
        category: "프로젝트콘텐츠"
      });
    });

    // 이론주간 코치
    Object.entries(theory.coach).forEach(([key, values]) => {
      data.push({
        label: `[이론] ${key}`,
        value: calcAvg(values),
        category: "이론코치"
      });
    });

    // 프로젝트주간 코치
    Object.entries(project.coach).forEach(([key, values]) => {
      data.push({
        label: `[프로젝트] ${key}`,
        value: calcAvg(values),
        category: "프로젝트코치"
      });
    });

    return data;
  }, []);

  const angleStep = (2 * Math.PI) / radarData.length;

  // 점수를 반지름으로 변환 (3.8~5.0 → 0~radius)
  const valueToRadius = (value) => {
    const minScore = 3.8;
    const maxScore = 5.0;
    return ((value - minScore) / (maxScore - minScore)) * radius;
  };

  // 극좌표 → 직교좌표 변환
  const polarToCartesian = (angle, r) => ({
    x: centerX + r * Math.cos(angle - Math.PI / 2),
    y: centerY + r * Math.sin(angle - Math.PI / 2)
  });

  // 레이더 차트 경로 생성
  const radarPath = radarData
    .map((d, i) => {
      const angle = i * angleStep;
      const r = valueToRadius(d.value);
      const { x, y } = polarToCartesian(angle, r);
      return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
    })
    .join(' ') + ' Z';

  // 축 선들
  const axes = radarData.map((d, i) => {
    const angle = i * angleStep;
    const { x, y } = polarToCartesian(angle, radius);
    return { label: d.label, x, y, angle, value: d.value, category: d.category };
  });

  // 동심원들 (점수 가이드라인)
  const circles = [3.8, 4.0, 4.2, 4.4, 4.6, 4.8, 5.0];

  // 카테고리별 색상 (코치/콘텐츠 기준)
  const getCategoryColor = (category) => {
    switch(category) {
      case "이론콘텐츠": return "#4dabf7"; // 파란색
      case "이론코치": return "#e64980"; // 빨간색
      case "프로젝트콘텐츠": return "#845ef7"; // 보라색
      case "프로젝트코치": return "#ff922b"; // 주황색
      default: return "#adb5bd";
    }
  };

  return (
    <div style={{ width: "100%", overflowX: "auto", marginBottom: 24 }}>
      <svg width={cardWidth} height={cardHeight} style={{ background: "#fff", borderRadius: 8, boxShadow: "0 1px 6px rgba(0,0,0,0.08)" }}>
        {/* 차트를 카드 중앙에 배치하되, 제목과 범례 공간을 위해 아래로 이동 */}
        <g transform={`translate(${(cardWidth - chartSize) / 2}, ${(cardHeight - chartSize) / 2 + 50})`}>
          {/* 동심원들 */}
          {circles.map((score, i) => {
            const r = valueToRadius(score);
            return (
              <g key={i}>
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={r}
                  fill="none"
                  stroke="#e9ecef"
                  strokeWidth="1"
                  strokeDasharray={i === circles.length - 1 ? "none" : "4 4"}
                />
                <text
                  x={centerX + 5}
                  y={centerY - r - 5}
                  fontSize="10"
                  fill="#868e96"
                  textAnchor="start"
                >
                  {score.toFixed(1)}
                </text>
              </g>
            );
          })}

          {/* 축 선들 */}
          {axes.map((axis, i) => (
            <line
              key={i}
              x1={centerX}
              y1={centerY}
              x2={axis.x}
              y2={axis.y}
              stroke="#dee2e6"
              strokeWidth="1"
            />
          ))}

          {/* 레이더 차트 영역 */}
          <path
            d={radarPath}
            fill="rgba(74, 144, 226, 0.2)"
            stroke="#4dabf7"
            strokeWidth="2"
          />

          {/* 데이터 포인트 */}
          {radarData.map((d, i) => {
            const angle = i * angleStep;
            const r = valueToRadius(d.value);
            const { x, y } = polarToCartesian(angle, r);
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={4}
                fill={getCategoryColor(d.category)}
                stroke="#fff"
                strokeWidth="2"
              />
            );
          })}

          {/* 레이블 */}
          {axes.map((axis, i) => {
            // 레이블 위치를 축 끝보다 더 바깥으로 (제목과 범례와 겹치지 않도록)
            const labelRadius = radius + 60;
            const { x, y } = polarToCartesian(axis.angle, labelRadius);
            
            // 텍스트 정렬 (각도에 따라)
            let anchor = "middle";
            if (axis.x > centerX + 10) anchor = "start";
            else if (axis.x < centerX - 10) anchor = "end";

            // 레이블 텍스트 단축
            const shortLabel = axis.label
              .replace("[이론] ", "")
              .replace("[프로젝트] ", "")
              .replace("만족도", "")
              .replace("코치님의 ", "")
              .replace("강의", "")
              .replace("상호작용", "소통")
              .replace("강의준비", "준비")
              .replace("커리큘럼 전반적", "커리큘럼")
              .replace("커리큘럼 난이도는 적절했습니다", "난이도")
              .replace("퀴즈/실습 자료", "실습자료")
              .replace("목표한 결과물 달성", "결과물달성")
              .replace("스크럼 필요성", "스크럼")
              .replace("개발 역량 향상에 대한 자기평가", "개발역량")
              .replace("가이드", "가이드")
              .replace("전반적", "전반")
              .replace("참여도", "참여")
              .replace("질의응답 적극성", "질의응답")
              .replace("도움이 충분했는지", "도움충분")
              .replace("개발 지식의 전문성은 충분했나요?", "전문성")
              .replace("강의력", "강의력")
              .replace("력", "강의력");

            return (
              <g key={i}>
                <text
                  x={x}
                  y={y}
                  fontSize="11"
                  fill={getCategoryColor(axis.category)}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  fontWeight="600"
                >
                  {shortLabel}
                </text>
                <text
                  x={x}
                  y={y + 14}
                  fontSize="10"
                  fill="#868e96"
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  fontWeight="500"
                >
                  {axis.value.toFixed(2)}
                </text>
              </g>
            );
          })}

        </g>
        
        {/* 제목 - 카드 전체 기준으로 위치 */}
        <text x={cardWidth / 2} y={30} fontSize="14" fontWeight="600" fill="#212529" textAnchor="middle">
          [Unity 1기] 세부 항목 레이더 차트
        </text>

        {/* 범례 - 카드 전체 기준으로 위치 */}
        <g transform={`translate(${cardWidth - 200}, 20)`}>
          <rect width="190" height="80" rx="6" fill="#f8f9fa" stroke="#dee2e6" />
          <text x={95} y={15} fontSize="12" fontWeight="600" fill="#495057" textAnchor="middle">
            범례
          </text>
          {[
            { label: "이론주간 컨텐츠 만족도", color: "#4dabf7" },
            { label: "프로젝트주간 컨텐츠 만족도", color: "#845ef7" },
            { label: "이론주간 코치 만족도", color: "#e64980" },
            { label: "프로젝트주간 코치 만족도", color: "#ff922b" }
          ].map((item, i) => (
            <g key={i} transform={`translate(15, ${25 + i * 12})`}>
              <circle cx={5} cy={0} r={4} fill={item.color} />
              <text x={15} y={0} fontSize="10" fill="#495057" dominantBaseline="middle">
                {item.label}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
