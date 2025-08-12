# CS Dashboard Project

Channel Talk API를 활용한 CS 대시보드 프로젝트

## 📁 프로젝트 구조

```
cs_dashboard_project/
├── backend/                 # 백엔드 (FastAPI)
│   ├── app/
│   │   ├── main.py         # FastAPI 애플리케이션
│   │   └── cs_utils.py     # Channel Talk API 유틸리티
│   └── requirements.txt    # Python 의존성
├── frontend/               # 프론트엔드 (React)
├── deploy/                 # 배포 관련 파일들
│   ├── Dockerfile         # Docker 이미지 설정
│   ├── docker-compose.yml # Docker Compose 설정
│   ├── deploy_backend.sh  # 백엔드 배포 스크립트 (Linux/Mac)
│   └── deploy_backend.bat # 백엔드 배포 스크립트 (Windows)
├── docs/                   # 문서
│   ├── README.md          # 이 파일
│   ├── BACKEND_DEPLOY.md  # 백엔드 배포 가이드
│   └── SETUP_ENV.md       # 환경 설정 가이드
├── scripts/                # 유틸리티 스크립트
│   ├── create_env.py      # 환경변수 생성 스크립트
│   └── check_env.py       # 환경변수 확인 스크립트
├── tests/                  # 테스트 파일들
│   ├── test_docker_backend.py # Docker 백엔드 테스트
│   └── quick_api_test.py  # API 테스트
├── config/                 # 설정 파일들
│   ├── env.example        # 환경변수 예시
│   └── .dockerignore      # Docker 제외 파일
├── cache/                  # 캐시 데이터 (로컬)
└── .gitignore             # Git 제외 파일
```

## 🚀 빠른 시작

### 1. 환경 설정
```bash
# 환경변수 설정
cp config/env.example .env
# .env 파일에 실제 API 키 입력
```

### 2. 백엔드 배포
```bash
# Linux/Mac
chmod +x deploy/deploy_backend.sh
./deploy/deploy_backend.sh

# Windows
deploy/deploy_backend.bat
```

### 3. 서비스 확인
- **API 상태**: http://localhost:8000/health
- **API 문서**: http://localhost:8000/docs

## 📚 상세 문서

- [백엔드 배포 가이드](docs/BACKEND_DEPLOY.md)
- [환경 설정 가이드](docs/SETUP_ENV.md)

## 🔧 개발 환경

- **백엔드**: Python 3.11, FastAPI, Pandas
- **프론트엔드**: React
- **배포**: Docker, Docker Compose
- **캐시**: 파일 기반 캐시 시스템

## 📊 데이터 필드

추출되는 주요 필드:
- `userId`: 사용자 ID
- `mediumType`: 매체 타입
- `workflowId`: 워크플로우 ID
- `tags`: 태그 정보
- `firstAskedAt`: 첫 문의 시간
- `operationWaitingTime`: 대기 시간
- `operationAvgReplyTime`: 평균 응답 시간
- `operationTotalReplyTime`: 총 응답 시간
- `operationResolutionTime`: 해결 시간 