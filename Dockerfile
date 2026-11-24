# Render を Docker で動かすとき用（Runtime: Docker）。Python（server.py）と Node.js（ゲームの計算）を入れる
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends nodejs && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
ENV PYTHONUNBUFFERED=1
CMD ["sh", "-c", "python3 server.py ${PORT:-8000}"]
