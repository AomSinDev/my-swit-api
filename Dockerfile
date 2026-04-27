FROM node:20-alpine

# ติดตั้ง supervisor สำหรับรัน 2 process พร้อมกัน
RUN apk add --no-cache supervisor

WORKDIR /app

# Copy และติดตั้ง dependencies
COPY package.json ./
RUN npm install

# Copy ไฟล์ทั้งหมด
COPY api-gateway.js .
COPY database-service.js .
COPY index.html .

# Config supervisor ให้รัน 2 service
RUN mkdir -p /etc/supervisor/conf.d
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

EXPOSE 10000

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]