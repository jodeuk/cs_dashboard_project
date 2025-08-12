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
│   ├── src/
│   │   ├── App.jsx         # 메인 React 컴포넌트
│   │   ├── api.js          # API 호출 로직
│   │   └── components/     # React 컴포넌트들
│   ├── Dockerfile          # 프론트엔드 Docker 설정
│   ├── nginx.conf          # nginx 설정
│   └── package.json        # Node.js 의존성
├── deploy/                 # 배포 관련 파일들
│   ├── Dockerfile          # 백엔드 Docker 설정
│   ├── docker-compose.yml  # 전체 스택 Docker Compose
│   ├── deploy_backend.sh   # 전체 배포 스크립트 (Linux/Mac)
│   └── deploy_backend.bat  # 전체 배포 스크립트 (Windows)
├── docs/                   # 문서
│   ├── README.md           # 상세 문서
│   └── BACKEND_DEPLOY.md   # Docker 배포 가이드
├── scripts/                # 유틸리티 스크립트
│   ├── create_env.py       # 환경변수 생성 스크립트
│   └── check_env.py        # 환경변수 확인 스크립트
├── tests/                  # 테스트 파일들
│   ├── test_full_stack.py  # 전체 스택 테스트
│   ├── test_docker_backend.py # 백엔드 테스트
│   └── quick_api_test.py   # API 테스트
├── config/                 # 설정 파일들
│   ├── env.example         # 환경변수 예시
│   └── .dockerignore       # Docker 제외 파일
├── cache/                  # 캐시 데이터 (로컬)
├── README.md               # 프로젝트 메인 README
└── .gitignore              # Git 제외 파일
```

## 🚀 빠른 시작

### 1. 환경 설정
```bash
# 환경변수 설정
cp config/env.example .env
# .env 파일에 실제 API 키 입력
```

### 2. 전체 스택 배포
```bash
# Linux/Mac
chmod +x deploy/deploy_backend.sh
./deploy/deploy_backend.sh

# Windows
deploy/deploy_backend.bat
```

### 3. 서비스 확인
- **프론트엔드**: http://localhost:3000
- **백엔드 API**: http://localhost:8000
- **API 문서**: http://localhost:8000/docs

## 📚 상세 문서

- [상세 문서](docs/README.md)
- [Docker 배포 가이드](docs/BACKEND_DEPLOY.md)

## 🔧 개발 환경

- **백엔드**: Python 3.11, FastAPI, Pandas
- **프론트엔드**: React 18.2.0, nginx
- **배포**: Docker, Docker Compose
- **캐시**: 파일 기반 캐시 시스템
- **네트워크**: Docker 네트워크로 서비스 간 통신

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

## 🛠️ 유틸리티 스크립트

```bash
# 환경변수 생성
python scripts/create_env.py

# 환경변수 확인
python scripts/check_env.py

# 전체 스택 테스트
python tests/test_full_stack.py

# 백엔드만 테스트
python tests/test_docker_backend.py

# API 테스트
python tests/quick_api_test.py
```

## 🐳 Docker 서비스

- **백엔드**: FastAPI 서버 (포트 8000)
- **프론트엔드**: React + nginx (포트 3000)
- **API 프록시**: nginx를 통한 백엔드 API 프록시
- **캐시 볼륨**: 영속적 데이터 저장 