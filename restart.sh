#!/bin/bash
# ============================================
# restart.sh — Build และรัน Docker ใหม่ทั้งหมด
# รันจาก root ของโปรเจกต์ (ที่มี Dockerfile อยู่)
# ใช้: chmod +x restart.sh แล้วรัน ./restart.sh
# ============================================

echo "🛑 Stopping old container..."
docker stop swit 2>/dev/null
docker rm swit 2>/dev/null

echo "🔨 Building new image..."
docker build -t swit-app . && \

echo "🚀 Starting container..." && \
docker run -d \
  --name swit \
  --env-file .env \
  -p 9001:10000 \
  swit-app && \

echo "" && \
echo "✅ Done! Running at http://localhost:9001" && \
echo "📋 Logs: docker logs -f swit"
