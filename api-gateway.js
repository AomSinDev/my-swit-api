import express from 'express';
import axios from 'axios';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ✅ แก้ไข: ชี้ไปหา Database Service ที่รันบน port 3000 (localhost)
const DB_SERVICE_URL = process.env.DB_SERVICE_URL || 'http://localhost:3000';

// 1. หน้าแรก: ส่งไฟล์ index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. รับข้อมูลจากหน้าเว็บ -> ส่งต่อให้ Database Service บันทึกลง Supabase
app.post('/api/save', async (req, res) => {
    try {
        console.log("Gateway received data:", req.body);
        const response = await axios.post(`${DB_SERVICE_URL}/db/save`, req.body);
        res.json(response.data);
    } catch (err) {
        console.error("Gateway Save Error:", err.message);
        res.status(502).json({ error: "Database Service is Offline" });
    }
});

// 3. ดึงประวัติจาก Database Service -> ส่งกลับไปแสดงที่หน้าเว็บ
app.get('/api/history', async (req, res) => {
    try {
        const response = await axios.get(`${DB_SERVICE_URL}/db/history`);
        res.json(response.data);
    } catch (err) {
        console.error("Gateway History Error:", err.message);
        res.status(502).json({ error: "Database Service is Offline" });
    }
});

// ✅ Render ต้องใช้ PORT จาก environment variable
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API Gateway Online at port ${PORT}`);
    console.log(`🔗 Connecting to DB Service at ${DB_SERVICE_URL}`);
});