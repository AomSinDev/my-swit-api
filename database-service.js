const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// แก้ไขจุดนี้: รองรับทั้งไฟล์จริงและ ENV สำหรับ Cloud
let creds;
try {
    creds = require('./swit-project-493904-bbdf1bffa80a.json');
} catch (e) {
    // ถ้าขึ้น Cloud แล้วไม่มีไฟล์ จะอ่านจาก Environment Variable แทน
    creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
}

const serviceAccountAuth = new JWT({
  email: creds.client_email,
  key: creds.private_key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const doc = new GoogleSpreadsheet('1lCSVFtuio6I6LgXuHs1K6YNEzkUW8KOX3vwxuP2FLgU', serviceAccountAuth);

app.get('/db/search/:id', async (req, res) => {
    try {
        await doc.loadInfo();
        const sheet = doc.sheetsByTitle['SWIT1'] || doc.sheetsByTitle['ชีต1'];
        const rows = await sheet.getRows();
        const searchId = req.params.id.toString().trim();
        const found = rows.find(r => r.toObject()['ลำดับ'].toString().trim() === searchId);
        if (found) res.json({ success: true, data: found.toObject() });
        else res.json({ success: false, message: 'ไม่พบข้อมูล' });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/db/save', async (req, res) => {
    try {
        const { name, score } = req.body;
        await doc.loadInfo();
        const sheet = doc.sheetsByTitle['SWIT1'] || doc.sheetsByTitle['ชีต1'];
        const rows = await sheet.getRows();
        let nextId = 1;
        if (rows.length > 0) {
            const lastId = parseInt(rows[rows.length - 1].toObject()['ลำดับ']);
            if (!isNaN(lastId)) nextId = lastId + 1;
        }
        await sheet.addRow({ 'ลำดับ': nextId.toString(), 'ชื่อ': name, 'คะแนน': score });
        res.json({ success: true, id: nextId });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/db/history', async (req, res) => {
    try {
        await doc.loadInfo();
        const sheet = doc.sheetsByTitle['SWIT1'] || doc.sheetsByTitle['ชีต1'];
        const rows = await sheet.getRows();
        res.json(rows.map(r => r.toObject()));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// พอร์ตสำหรับ Database Service บน Cloud (ถ้าไม่มีให้ใช้ 3000)
const port = process.env.DB_PORT || 3000;
app.listen(port, '0.0.0.0', () => console.log(`✅ DB Service running on port ${port}`));