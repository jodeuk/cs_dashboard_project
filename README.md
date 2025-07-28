# CS Dashboard Project

Channel Talk Open API를 사용한 CS 대시보드 프로젝트입니다.

## 프로젝트 구조

```
cs_dashboard_project/
├── backend/                 # FastAPI 백엔드
│   ├── app/
│   │   ├── main.py         # API 엔드포인트
│   │   ├── cs_utils.py     # Channel Talk API 클라이언트
│   │   └── models.py       # 데이터 모델
│   ├── requirements.txt    # Python 의존성
│   ├── Dockerfile         # 컨테이너 설정
│   └── env.example        # 환경변수 예시
├── frontend/               # React 프론트엔드
│   ├── src/
│   │   ├── App.jsx        # 메인 앱
│   │   ├── api.js         # API 클라이언트
│   │   └── components/    # 차트 컴포넌트들
│   └── package.json       # Node.js 의존성
└── data/                  # 데이터 파일
    └── cs_chat_4-7.jsonl  # 샘플 데이터
```

## 설정 방법

### 1. Channel Talk Open API 설정

1. [Channel Talk 개발자 콘솔](https://developers.channel.io/)에서 앱을 생성
2. Open API 액세스 토큰을 발급받기
3. 백엔드 디렉토리에 `.env` 파일 생성:

```bash
cd backend
cp env.example .env
```

4. `.env` 파일에서 액세스 토큰 설정:

```env
CHANNEL_ACCESS_TOKEN=your_channel_talk_access_token_here
```

### 2. 백엔드 설정

```bash
cd backend

# Python 가상환경 생성 (선택사항)
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 의존성 설치
pip install -r requirements.txt

# 서버 실행
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. 프론트엔드 설정

```bash
cd frontend

# 의존성 설치
npm install

# 개발 서버 실행
npm start
```

## API 엔드포인트

### 기본 정보
- **Base URL**: `http://localhost:8000`
- **API 문서**: `http://localhost:8000/docs` (Swagger UI)

### 주요 엔드포인트

1. **필터 옵션 조회**
   - `GET /api/filter-options?start=2024-01-01&end=2024-12-31`

2. **기간별 문의량**
   - `GET /api/period-counts?start=2024-01-01&end=2024-12-31&date_group=월간`

3. **평균 응답 시간**
   - `GET /api/avg-times?start=2024-01-01&end=2024-12-31`

4. **고객유형별 문의량**
   - `GET /api/customer-type-cs?start=2024-01-01&end=2024-12-31`

5. **워드클라우드**
   - `GET /api/wordcloud?start=2024-01-01&end=2024-12-31`

6. **CSAT 분석**
   - `GET /api/csat-analysis?start=2024-01-01&end=2024-12-31`

7. **통계 정보**
   - `GET /api/statistics?start=2024-01-01&end=2024-12-31`

## 데이터 필드

Channel Talk API에서 추출하는 주요 필드:

- `userId`: 사용자 ID
- `mediumType`: 채널 타입 (web, mobile, etc.)
- `workflow`: 워크플로우 정보
- `tags`: 태그 정보 (서비스유형, 고객유형, 문의유형 등)
- `chats`: 채팅 메시지
- `createdAt`: 생성 시간
- `firstAskedAt`: 첫 문의 시간
- `operationWaitingTime`: 첫 응답 대기 시간
- `operationAvgReplyTime`: 평균 응답 시간
- `operationTotalReplyTime`: 총 응답 시간
- `operationResolutionTime`: 해결 시간

## 개발 참고사항

### 백엔드
- FastAPI 기반 REST API
- Channel Talk Open API 연동
- 데이터 캐싱 (5분)
- 비동기 처리

### 프론트엔드
- React 기반 SPA
- Chart.js를 사용한 데이터 시각화
- 반응형 디자인

### 데이터 처리
- 한국어 자연어 처리 (KoNLPy)
- 워드클라우드 생성
- 시간 데이터 변환 (HH:MM:SS → 초)

## 문제 해결

### API 연결 오류
1. `.env` 파일의 액세스 토큰 확인
2. Channel Talk 앱 설정 확인
3. 네트워크 연결 상태 확인

### 데이터 로딩 오류
1. 날짜 형식 확인 (YYYY-MM-DD)
2. API 응답 상태 확인
3. 백엔드 로그 확인

### 워드클라우드 오류
1. 폰트 파일 경로 확인
2. 한국어 텍스트 데이터 확인
3. 메모리 사용량 확인

## 라이선스

이 프로젝트는 내부 사용을 위한 것입니다. 