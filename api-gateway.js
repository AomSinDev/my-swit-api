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

// DB_URL ต้องเป็น localhost เพราะรันอยู่ใน Docker กล่องเดียวกัน
const DB_URL = "http://localhost:3000";

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.post('/api/save', async (req, res) => {
    try {
        const response = await axios.post(`${DB_URL}/db/save`, req.body);
        res.json(response.data);
    } catch (err) {
        res.status(502).json({ error: "DB Service Offline" });
    }
});

app.get('/api/history', async (req, res) => {
    try {
        const response = await axios.get(`${DB_URL}/db/history`);
        res.json(response.data);
    } catch (err) {
        res.status(502).json({ error: "DB Service Offline" });
    }
});

const PORT = process.env.PORT || 10000; // Render มักใช้พอร์ต 10000
app.listen(PORT, '0.0.0.0', () => console.log(`Gateway running on port ${PORT}`));