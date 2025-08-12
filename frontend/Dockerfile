# Build stage
FROM node:18-alpine as build

# 작업 디렉토리 설정
WORKDIR /app

# package.json과 package-lock.json 복사
COPY package*.json ./

# 의존성 설치
RUN npm install

# 소스 코드 복사
COPY . .

# 환경변수 설정 (빌드 시점)
ARG REACT_APP_API_BASE
ENV REACT_APP_API_BASE=${REACT_APP_API_BASE:-http://localhost:8000/api}

# 프로덕션 빌드
RUN npm run build

# Production stage
FROM nginx:alpine

# nginx 설정 파일 복사
COPY nginx.conf /etc/nginx/nginx.conf

# 빌드된 파일들을 nginx로 복사
COPY --from=build /app/build /usr/share/nginx/html

# 포트 노출
EXPOSE 3000

# nginx 시작
CMD ["nginx", "-g", "daemon off;"] 