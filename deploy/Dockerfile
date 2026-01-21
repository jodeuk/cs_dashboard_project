FROM python:3.11

# 작업 디렉토리 설정
WORKDIR /app

# 시스템 패키지 업데이트 및 필요한 패키지 설치
RUN apt-get update && apt-get install -y \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Python 의존성 파일 복사 및 설치
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 백엔드 코드 복사
COPY backend/ .

# 캐시 및 데이터 디렉토리 생성
RUN mkdir -p /data/cache
RUN mkdir -p /data/cloud_customers

# 포트 노출
EXPOSE 8000

# 환경변수 설정
ENV PYTHONPATH=/app
ENV CACHE_DIR=/data/cache
ENV CLOUD_CUSTOMERS_FILE=/data/cloud_customers/cloud_customers.json
ENV DOCKER_ENV=true

# 애플리케이션 실행
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"] 