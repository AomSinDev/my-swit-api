import express from 'express';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// ฟังก์ชันดึง Credentials
async function getAuth() {
    let creds;
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
        creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    } else {
        // สำหรับรันในเครื่อง (Local)
        const { default: localCreds } = await import('./swit-project-493904-bbdf1bffa80a.json', { assert: { type: 'json' } });
        creds = localCreds;
    }

    return new JWT({
        email: creds.client_email,
        key: creds.private_key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
}

const auth = await getAuth();
const doc = new GoogleSpreadsheet('1lCSVFtuio6I6LgXuHs1K6YNEzkUW8KOX3vwxuP2FLgU', auth);

app.post('/db/save', async (req, res) => {
    try {
        const { name, score } = req.body;
        await doc.loadInfo();
        const sheet = doc.sheetsByTitle['SWIT1'] || doc.sheetsByIndex[0];
        const rows = await sheet.getRows();
        let nextId = 1;
        if (rows.length > 0) {
            const lastId = parseInt(rows[rows.length - 1].toObject()['ลำดับ']);
            if (!isNaN(lastId)) nextId = lastId + 1;
        }
        await sheet.addRow({ 'ลำดับ': nextId.toString(), 'ชื่อ': name, 'คะแนน': score });
        res.json({ success: true, id: nextId });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/db/history', async (req, res) => {
    try {
        await doc.loadInfo();
        const sheet = doc.sheetsByTitle['SWIT1'] || doc.sheetsByIndex[0];
        const rows = await sheet.getRows();
        res.json(rows.map(r => r.toObject()));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(3000, () => console.log('Database Service running on port 3000'));