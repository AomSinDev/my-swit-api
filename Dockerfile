FROM node:18-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# ติดตั้ง pm2 เพื่อรัน 2 process พร้อมกัน
RUN npm install pm2 -g

# เปิดพอร์ตสำหรับ Gateway
EXPOSE 10000

# รันทั้งสองไฟล์พร้อมกัน
CMD ["pm2-runtime", "start", "api-gateway.js", "--name", "gateway", "&&", "pm2-runtime", "start", "database-service.js", "--name", "db-service"]