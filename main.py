#!/usr/bin/env python3
"""
CS Dashboard Project - Main Entry Point
Railway 배포를 위한 메인 진입점
"""

import os
import sys

# backend 디렉토리를 Python 경로에 추가
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

# backend의 main.py 실행
if __name__ == "__main__":
    import uvicorn
    from backend.app.main import app
    
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port) 