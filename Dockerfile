FROM node:20-alpine

# ติดตั้ง supervisor สำหรับรัน 2 process พร้อมกัน
RUN apk add --no-cache supervisor

WORKDIR /app

# ── Copy package.json และติดตั้ง dependencies ก่อน ──
# แยก step นี้ออกมาเพื่อใช้ Docker layer cache
# ถ้าไม่แก้ package.json จะไม่ต้อง npm install ใหม่ทุกครั้ง
COPY package.json ./
RUN npm install

# ── Copy แต่ละโฟลเดอร์เข้าสู่ /app ──
# โครงสร้างใน container จะเป็น:
#   /app/api-gateway/api-gateway.js
#   /app/database-service/database-service.js
#   /app/frontend/index.html
#   /app/frontend/login.html
COPY api-gateway/     ./api-gateway/
COPY database-service/ ./database-service/
COPY frontend/        ./frontend/

# ── Config supervisor ──
RUN mkdir -p /etc/supervisor/conf.d
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# เปิด port ของ api-gateway
EXPOSE 10000

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
