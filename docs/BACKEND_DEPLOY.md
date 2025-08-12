# CS Dashboard Docker 배포 가이드

## 사전 요구사항

- Docker 설치
- Docker Compose 설치
- Channel Talk API 키

## 1. 환경변수 설정

```bash
# env.example을 복사해서 .env 파일 생성
cp config/env.example .env

# .env 파일 편집하여 실제 API 키 입력
nano .env  # 또는 원하는 텍스트 에디터
```

`.env` 파일 내용:
```env
CHANNEL_ACCESS_KEY=your_actual_channel_access_key
CHANNEL_ACCESS_SECRET=your_actual_channel_access_secret
CACHE_DIR=/data/cache
PORT=8000
HOST=0.0.0.0
DOCKER_ENV=true
```

## 2. 배포 실행

### Linux/Mac
```bash
chmod +x deploy/deploy_backend.sh
./deploy/deploy_backend.sh
```

### Windows
```cmd
deploy/deploy_backend.bat
```

### 수동 배포
```bash
# 1. 기존 컨테이너 중지
docker-compose -f deploy/docker-compose.yml down

# 2. 이미지 빌드
docker-compose -f deploy/docker-compose.yml build --no-cache

# 3. 컨테이너 시작
docker-compose -f deploy/docker-compose.yml up -d

# 4. 상태 확인
docker-compose -f deploy/docker-compose.yml ps

# 5. 로그 확인
docker-compose -f deploy/docker-compose.yml logs -f backend
```

## 3. 서비스 확인

- **프론트엔드**: http://localhost:3000
- **백엔드 API**: http://localhost:8000
- **API 문서**: http://localhost:8000/docs
- **API 상태**: http://localhost:8000/health

### Docker 환경 설정
- `DOCKER_ENV=true`: Docker 환경임을 감지하여 `/data/cache` 디렉토리 사용
- 캐시 데이터는 Docker 볼륨에 영속적으로 저장됨
- 컨테이너 재시작 시에도 캐시 데이터 유지

### 데이터 필드 변경
- `workflow` → `workflowId`: 워크플로우 ID로 변경
- 추출되는 필드: `userId`, `mediumType`, `workflowId`, `tags`, `page`, `firstAskedAt`, `operationWaitingTime`, `operationAvgReplyTime`, `operationTotalReplyTime`, `operationResolutionTime`

### 자동 테스트
배포 스크립트는 자동으로 다음 테스트를 실행합니다:
- 백엔드 헬스체크
- 주요 API 엔드포인트 테스트
- 캐시 시스템 테스트

수동 테스트:
```bash
python tests/test_full_stack.py
```

## 4. 유용한 명령어

```bash
# 컨테이너 상태 확인
docker-compose -f deploy/docker-compose.yml ps

# 로그 확인
docker-compose -f deploy/docker-compose.yml logs backend

# 실시간 로그 확인
docker-compose -f deploy/docker-compose.yml logs -f backend

# 컨테이너 중지
docker-compose -f deploy/docker-compose.yml down

# 컨테이너 재시작
docker-compose -f deploy/docker-compose.yml restart backend

# 캐시 볼륨 확인
docker volume ls

# 캐시 데이터 삭제
docker-compose -f deploy/docker-compose.yml down -v
```

## 5. 문제 해결

### 포트 충돌
```bash
# 8000번 포트 사용 중인 프로세스 확인
lsof -i :8000

# 다른 포트 사용
docker-compose -f deploy/docker-compose.yml up -d -p 8001:8000
```

### 캐시 문제
```bash
# 캐시 볼륨 삭제 후 재시작
docker-compose -f deploy/docker-compose.yml down -v
docker-compose -f deploy/docker-compose.yml up -d
```

### API 키 문제
```bash
# 환경변수 확인
docker-compose -f deploy/docker-compose.yml exec backend env | grep CHANNEL
```

## 6. 프로덕션 배포

### 보안 설정
- 방화벽에서 8000번 포트만 허용
- HTTPS 프록시 설정 (nginx 등)
- API 키 보안 관리

### 모니터링
```bash
# 리소스 사용량 확인
docker stats

# 로그 모니터링
docker-compose -f deploy/docker-compose.yml logs -f --tail=100 backend
``` 