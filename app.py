#!/usr/bin/env python3
"""
CS Dashboard Project - App Entry Point
Render 배포를 위한 앱 진입점
"""

import os
import sys

# backend 디렉토리를 Python 경로에 추가
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

# 실제 API 앱을 import (올바른 경로 사용)
from backend.app.main import app

# 이 파일이 직접 실행될 때만 실행
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 10000))
    uvicorn.run(app, host="0.0.0.0", port=port) 