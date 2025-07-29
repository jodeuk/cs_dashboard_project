# 환경변수 설정 가이드

## 🔐 보안 주의사항

⚠️ **중요**: 이 프로젝트는 public GitHub 저장소입니다. 절대로 실제 API 키를 코드에 직접 입력하지 마세요!

## 📋 필요한 환경변수

### Channel.io API 설정

다음 환경변수들을 설정해야 합니다:

```bash
# Channel.io API 인증 정보
CHANNEL_ACCESS_KEY=your_actual_access_key_here
CHANNEL_ACCESS_SECRET=your_actual_access_secret_here

# 기타 설정
FONT_PATH=/usr/share/fonts/truetype/nanum/NanumGothic.ttf
```

## 🛠️ 환경변수 설정 방법

### 1. 로컬 개발 환경

1. `backend/` 디렉토리에 `.env` 파일을 생성하세요:
   ```bash
   cd backend
   touch .env
   ```

2. `.env` 파일에 다음 내용을 추가하세요:
   ```env
   CHANNEL_ACCESS_KEY=68883a95c1c0f08306f3
   CHANNEL_ACCESS_SECRET=7c7fc51ce244238c23c6fb86c0d7583a
   FONT_PATH=/usr/share/fonts/truetype/nanum/NanumGothic.ttf
   ```

### 2. 배포 환경 (Render, Railway, Vercel 등)

배포 플랫폼의 환경변수 설정에서 다음을 추가하세요:

- `CHANNEL_ACCESS_KEY`: 68883a95c1c0f08306f3
- `CHANNEL_ACCESS_SECRET`: 7c7fc51ce244238c23c6fb86c0d7583a
- `FONT_PATH`: /usr/share/fonts/truetype/nanum/NanumGothic.ttf

### 3. Docker 환경

Docker Compose를 사용하는 경우:

```yaml
version: '3.8'
services:
  backend:
    build: ./backend
    environment:
      - CHANNEL_ACCESS_KEY=68883a95c1c0f08306f3
      - CHANNEL_ACCESS_SECRET=7c7fc51ce244238c23c6fb86c0d7583a
      - FONT_PATH=/usr/share/fonts/truetype/nanum/NanumGothic.ttf
```

## 🔍 환경변수 확인

환경변수가 제대로 설정되었는지 확인하려면:

```bash
# 로컬에서 확인
echo $CHANNEL_ACCESS_KEY
echo $CHANNEL_ACCESS_SECRET

# 또는 Python에서 확인
python -c "import os; print('ACCESS_KEY:', os.getenv('CHANNEL_ACCESS_KEY')[:10] + '...' if os.getenv('CHANNEL_ACCESS_KEY') else 'Not set')"
```

## 🚨 보안 체크리스트

- [ ] `.env` 파일이 `.gitignore`에 포함되어 있는지 확인
- [ ] 실제 API 키가 코드에 하드코딩되지 않았는지 확인
- [ ] 배포 환경에서 환경변수가 올바르게 설정되었는지 확인
- [ ] API 키가 공개 저장소에 커밋되지 않았는지 확인

## 🆘 문제 해결

### 환경변수가 인식되지 않는 경우

1. 서버를 재시작하세요
2. `.env` 파일이 올바른 위치에 있는지 확인하세요
3. 환경변수 이름이 정확한지 확인하세요 (대소문자 구분)

### API 인증 오류가 발생하는 경우

1. API 키와 시크릿이 올바른지 확인하세요
2. Channel.io 관리자 페이지에서 API 권한을 확인하세요
3. 네트워크 연결을 확인하세요 