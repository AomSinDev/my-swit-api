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

// ✅ คุยกับ database-service ที่รันอยู่ใน container เดียวกัน
const DB_SERVICE_URL = process.env.DB_SERVICE_URL || 'http://localhost:3000';

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/save', async (req, res) => {
    try {
        console.log("📨 Gateway → DB Service: save", req.body);
        const response = await axios.post(`${DB_SERVICE_URL}/db/save`, req.body);
        res.json(response.data);
    } catch (err) {
        console.error("Gateway Save Error:", err.message);
        res.status(502).json({ error: "Database Service is Offline" });
    }
});

app.get('/api/history', async (req, res) => {
    try {
        console.log("📨 Gateway → DB Service: history");
        const response = await axios.get(`${DB_SERVICE_URL}/db/history`);
        res.json(response.data);
    } catch (err) {
        console.error("Gateway History Error:", err.message);
        res.status(502).json([]);
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API Gateway running on port ${PORT}`);
    console.log(`🔗 DB Service: ${DB_SERVICE_URL}`);
});