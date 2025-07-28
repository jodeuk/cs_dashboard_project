FROM python:3.10

# 한글 폰트 설치
RUN apt-get update && apt-get install -y fonts-nanum wget && \
    fc-cache -fv

# (필수) JAVA 설치 (konlpy 용)
RUN apt-get install -y openjdk-11-jdk

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# 폰트 경로 환경변수 (워드클라우드)
ENV FONT_PATH=/usr/share/fonts/truetype/nanum/NanumGothic.ttf

COPY app/ ./
COPY ../data/ ./data/

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
