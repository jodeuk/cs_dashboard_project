// [Unity 1기] 챕터 1~24 강의만족도 (컨텐츠/프로젝트 평균 vs 코치 평균)
// 엑셀값 직접 하드코딩 버전

export const unity1Satisfaction = {
  course: "Unity 1기",
  chapters: Array.from({ length: 24 }, (_, i) => i + 1),

  // 주차 타입 (이론주간/프로젝트주간)
  weekTypes: [
    "이론", "이론", "이론", "프로젝트", "프로젝트",
    "이론", "이론", "이론", "이론", "프로젝트",
    "프로젝트", "프로젝트", "프로젝트", "프로젝트", "이론",
    "이론", "이론", "이론", "이론", "프로젝트",
    "프로젝트", "프로젝트", "프로젝트", "프로젝트"
  ],

  // 컨텐츠/프로젝트 만족도 평균
  content_or_project_avg: [
    4.20, 4.28, 4.42, 4.23, 4.29,
    4.52, 4.30, 4.30, 4.37, 4.44,
    4.25, 4.13, 4.33, 4.25, 4.33,
    4.48, 4.44, 4.33, 4.50, 4.29,
    4.29, 4.25, 4.25, 4.75
  ],

  // 코치 만족도 평균
  coach_avg: [
    4.25, 4.33, 4.36, 4.71, 4.69,
    4.48, 4.47, 4.30, 4.37, 4.63,
    4.56, 4.63, 4.78, 4.67, 4.33,
    4.46, 4.39, 4.22, 4.56, 4.46,
    4.39, 4.32, 4.20, 4.75
  ]
};

export const unity1Detail = {
  chapters: Array.from({ length: 24 }, (_, i) => i + 1),
  theory: {
    content: {
      "커리큘럼 만족도": [4.25, 4.33, 4.33, null, null, 4.56, 4.30, 4.50, 4.40, null, null, null, null, null, 4.50, 4.57, 4.50, 4.33, 4.50, null, null, null, null, null],
      "커리큘럼 난이도 만족도": [4.17, 4.25, 4.42, null, null, 4.33, 4.10, 4.10, 4.20, null, null, null, null, null, 4.25, 4.29, 4.33, 4.33, 4.50, null, null, null, null, null],
      "퀴즈/실습 자료 만족도": [4.17, 4.25, 4.50, null, null, 4.67, 4.50, 4.50, 4.50, null, null, null, null, null, 4.25, 4.57, 4.50, 4.00, 4.50, null, null, null, null, null],
    },
    coach: {
      "코치님의 강의력 만족도": [4.25, 4.25, 4.33, null, null, 4.44, 4.50, 4.30, 4.30, null, null, null, null, null, 4.25, 4.29, 4.33, 4.17, 4.50, null, null, null, null, null],
      "코치님의 상호작용 만족도": [4.33, 4.42, 4.50, null, null, 4.44, 4.50, 4.10, 4.40, null, null, null, null, null, 4.38, 4.67, 4.50, 4.00, 4.50, null, null, null, null, null],
      "코치님의 강의준비 만족도": [4.17, 4.33, 4.25, null, null, 4.56, 4.40, 4.50, 4.40, null, null, null, null, null, 4.38, 4.67, 4.50, 4.67, 4.67, null, null, null, null, null],
    },
  },
  project: {
    content: {
      "목표한 결과물 달성 만족도": [null, null, null, 4.09, 4.25, null, null, null, null, 4.25, 4.13, 4.00, 3.89, 4.22, null, null, null, null, null, 4.29, 4.29, 4.14, 4.20, 4.67],
      "스크럼 필요성 만족도": [null, null, null, 4.18, 4.42, null, null, null, null, 4.50, 4.38, 4.25, 4.44, 4.33, null, null, null, null, null, 4.43, 4.29, 4.43, 4.20, 4.78],
      "개발 역량 향상에 대한 자기평가": [null, null, null, 4.27, 4.58, null, null, null, null, 4.50, 4.13, 4.11, 4.33, 4.11, null, null, null, null, null, 4.43, 4.29, 4.29, 4.20, 4.78],
      "가이드 만족도": [null, null, null, 4.36, 3.92, null, null, null, null, 4.50, 4.50, 4.11, 4.44, 4.33, null, null, null, null, null, 4.43, 4.29, 4.29, 4.20, 4.78],
    },
    coach: {
      "코치님의 전반적 만족도": [null, null, null, 4.73, 4.58, null, null, null, null, 4.63, 4.63, 4.78, 4.63, 4.67, null, null, null, null, null, 4.33, 4.29, 4.29, 4.00, 4.78],
      "참여도 만족도": [null, null, null, 4.73, 4.79, null, null, null, null, 4.75, 4.63, 4.78, 4.50, 4.67, null, null, null, null, null, 4.50, 4.43, 4.43, 4.40, 4.78],
      "질의응답 적극성 만족도": [null, null, null, 4.73, 4.75, null, null, null, null, 4.63, 4.78, 4.78, 4.78, 4.67, null, null, null, null, null, 4.50, 4.49, 4.49, 4.40, 4.78],
      "코치님의 도움이 충분했는지": [null, null, null, 4.64, 4.83, null, null, null, null, 4.50, 4.63, 4.78, 4.67, 4.67, null, null, null, null, null, 4.43, 4.49, 4.29, 4.40, 4.67],
      "개발 지식의 전문성은 충분했나요?": [null, null, null, null, 4.50, null, null, null, null, 4.63, 4.63, 4.78, 4.67, 4.67, null, null, null, null, null, 4.46, 4.32, 4.32, 4.67, 4.67],
    },
  },
};
