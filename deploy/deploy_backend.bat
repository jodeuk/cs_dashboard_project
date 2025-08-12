@echo off
REM CS Dashboard 전체 배포 스크립트 (Windows)

echo 🚀 CS Dashboard 전체 배포 시작...

REM 1. 환경변수 파일 확인
if not exist .env (
    echo ❌ .env 파일이 없습니다. config/env.example을 복사해서 .env 파일을 생성하세요.
    echo copy config/env.example .env
    pause
    exit /b 1
)

REM 2. 기존 컨테이너 중지 및 제거
echo 🛑 기존 컨테이너 중지...
docker-compose -f deploy/docker-compose.yml down

REM 3. 이미지 빌드
echo 🔨 Docker 이미지 빌드...
docker-compose -f deploy/docker-compose.yml build --no-cache

REM 4. 컨테이너 시작
echo ▶️ 컨테이너 시작...
docker-compose -f deploy/docker-compose.yml up -d

REM 5. 상태 확인
echo 📊 컨테이너 상태 확인...
docker-compose -f deploy/docker-compose.yml ps

REM 6. 상태 확인
echo 📊 컨테이너 상태 확인...
docker-compose -f deploy/docker-compose.yml ps

REM 7. 테스트 실행
echo 🧪 전체 스택 테스트 실행...
python tests/test_full_stack.py

REM 8. 프론트엔드 확인
echo 🌐 프론트엔드 확인: http://localhost:3000

REM 9. 로그 확인
echo 📋 로그 확인 (Ctrl+C로 종료):
docker-compose -f deploy/docker-compose.yml logs -f

pause 