# 🔐 환경변수 설정 가이드

## ⚠️ 보안 주의사항

이 파일은 **로컬 개발용**으로만 사용하세요. 절대로 GitHub에 커밋하지 마세요!

## 🚀 빠른 설정

### 1. .env 파일 생성

프로젝트 루트 디렉토리에 `.env` 파일을 생성하고 다음 내용을 추가하세요:

```env
# Channel.io API 인증 정보
CHANNEL_ACCESS_KEY=68883a95c1c0f08306f3
CHANNEL_ACCESS_SECRET=7c7fc51ce244238c23c6fb86c0d7583a

# 기타 설정
FONT_PATH=/usr/share/fonts/truetype/nanum/NanumGothic.ttf

# 테스트용 ID (선택사항)
TEST_USER_ID=674523ee339f9bd5feb9
TEST_USERCHAT_ID=6888615a04ae7d5fab51
```

### 2. 환경변수 확인

```bash
python check_env.py
```

### 3. API 테스트

```bash
python test_userchat_api.py
```

## 📁 파일 구조

```
cs_dashboard_project/
├── .env                    # 🔒 환경변수 (gitignore됨)
├── .gitignore             # .env 파일이 포함됨
├── check_env.py           # 환경변수 확인 스크립트
├── test_userchat_api.py   # API 테스트
├── get_specific_userchat.py # 특정 UserChat 조회
└── README_ENV_SETUP.md    # 상세 설정 가이드
```

## 🔒 보안 체크리스트

- [x] `.env` 파일이 `.gitignore`에 포함됨
- [x] 실제 API 키가 코드에서 제거됨
- [x] 환경변수 템플릿 제공
- [x] 보안 확인 스크립트 제공

## 🛠️ 문제 해결

### 환경변수가 인식되지 않는 경우

1. **Python-dotenv 설치 확인**
   ```bash
   pip install python-dotenv
   ```

2. **.env 파일 위치 확인**
   - 프로젝트 루트 디렉토리에 있어야 함
   - 파일명이 정확히 `.env`여야 함

3. **환경변수 확인**
   ```bash
   python check_env.py
   ```

### API 인증 오류가 발생하는 경우

1. **API 키 확인**
   - Channel.io 관리자 페이지에서 API 키 재확인
   - 키와 시크릿이 올바른지 확인

2. **권한 확인**
   - API 키에 필요한 권한이 부여되었는지 확인
   - 채널 접근 권한 확인

## 📞 지원

문제가 발생하면 다음을 확인하세요:

1. `check_env.py` 실행 결과
2. API 테스트 결과
3. Channel.io 관리자 페이지 설정 