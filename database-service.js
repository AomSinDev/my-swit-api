import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(cors());
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing SUPABASE_URL or SUPABASE_KEY!");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

app.post('/db/save', async (req, res) => {
    const { name, score } = req.body;
    if (!name || score === undefined) {
        return res.status(400).json({ success: false, error: "Missing name or score" });
    }
    try {
        const { data, error } = await supabase
            .from('swit_data')
            .insert([{ name: name, score: parseInt(score) }])
            .select();
        if (error) throw error;
        console.log("✅ Saved:", data);
        res.json({ success: true, data });
    } catch (err) {
        console.error("Save Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/db/history', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('swit_data')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data ?? []);
    } catch (err) {
        console.error("History Error:", err.message);
        res.status(500).json([]);
    }
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'database-service' }));

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Database Service running on port ${PORT}`);
});