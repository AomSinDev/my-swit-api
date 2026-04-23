const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// แก้ไขจุดนี้: ถ้าอยู่บน Cloud ให้เชื่อมพอร์ต 3000 ภายในเครื่อง
const DB_URL = `http://localhost:${process.env.DB_PORT || 3000}`;

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.post('/api/save', async (req, res) => {
    try {
        const response = await axios.post(`${DB_URL}/db/save`, req.body);
        res.json(response.data);
    } catch (err) { res.status(502).json({ error: "DB Service Offline" }); }
});

app.get('/api/search/:id', async (req, res) => {
    try {
        const response = await axios.get(`${DB_URL}/db/search/${req.params.id}`);
        res.json(response.data);
    } catch (err) { res.status(502).json({ error: "DB Service Offline" }); }
});

app.get('/api/history', async (req, res) => {
    try {
        const response = await axios.get(`${DB_URL}/db/history`);
        res.json(response.data);
    } catch (err) { res.status(502).json({ error: "DB Service Offline" }); }
});

// พอร์ตหลักของหน้าเว็บ (Render จะส่งพอร์ตมาทาง process.env.PORT)
const port = process.env.PORT || 4000;
app.listen(port, '0.0.0.0', () => console.log(`🌐 Gateway running on port ${port}`));