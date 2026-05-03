/**
 * ========================================================
 * database-service.js — Database Service (Internal Only)
 * ========================================================
 * หน้าที่หลัก:
 *   - รับ request จาก api-gateway เท่านั้น (ไม่ expose ออก internet)
 *   - คุยกับ Supabase โดยตรง
 *   - ทุก query จะ filter ด้วย user_email เสมอ
 *     → แต่ละ Google account เห็นและแก้ไขข้อมูลของตัวเองเท่านั้น
 *
 * หมายเหตุสถาปัตยกรรม:
 *   Service นี้รันที่ port 3000 ภายใน Docker container
 *   ไม่ถูก expose ออกข้างนอก (EXPOSE ใน Dockerfile เปิดแค่ 10000)
 * ========================================================
 */

import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(cors());
app.use(express.json());

// ─── Supabase Client ──────────────────────────────────────────────────────────
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_KEY!');
    process.exit(1);
}

/**
 * createClient — สร้าง Supabase client
 * ใช้ anon key (SUPABASE_KEY) เพราะเราจัดการ auth ของตัวเองผ่าน Google OAuth
 * แทนที่จะใช้ Supabase Auth
 */
const supabase = createClient(supabaseUrl, supabaseKey);

// ════════════════════════════════════════════════════════
//  ROUTES
// ════════════════════════════════════════════════════════

/**
 * POST /db/save
 * รับ: { name, score, user_email }
 * บันทึกข้อมูลลง Supabase table "swit_data"
 *
 * ⚠️  SQL สำหรับสร้าง table:
 *   CREATE TABLE swit_data (
 *     id         bigserial PRIMARY KEY,
 *     created_at timestamptz DEFAULT now(),
 *     name       text        NOT NULL,
 *     score      int         NOT NULL,
 *     user_email text        NOT NULL   ← คอลัมน์ใหม่ที่ต้องเพิ่ม
 *   );
 *   -- Index เพื่อให้ query by email เร็วขึ้น
 *   CREATE INDEX ON swit_data (user_email);
 */
app.post('/db/save', async (req, res) => {
    const { name, score, user_email } = req.body;

    // Validate: ต้องมีทุก field
    if (!name || score === undefined || !user_email) {
        return res.status(400).json({
            success: false,
            error: 'Missing name, score, or user_email'
        });
    }

    try {
        const { data, error } = await supabase
            .from('swit_data')
            .insert([{
                name:       name,
                score:      parseInt(score),
                user_email: user_email   // ← บันทึกเจ้าของข้อมูล
            }])
            .select();

        if (error) throw error;

        console.log(`✅ Saved [${user_email}]:`, data);
        res.json({ success: true, data });
    } catch (err) {
        console.error('Save Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /db/history?user_email=xxx@gmail.com
 * ดึงข้อมูลเฉพาะของ user คนนั้น เรียงจากใหม่ไปเก่า
 * user_email มาจาก query parameter ที่ api-gateway ส่งมา
 */
app.get('/db/history', async (req, res) => {
    const { user_email } = req.query;

    if (!user_email) {
        return res.status(400).json({ error: 'Missing user_email' });
    }

    try {
        const { data, error } = await supabase
            .from('swit_data')
            .select('*')
            .eq('user_email', user_email)          // ← filter เฉพาะข้อมูลของ user นี้
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json(data ?? []);
    } catch (err) {
        console.error('History Error:', err.message);
        res.status(500).json([]);
    }
});

/**
 * GET /health
 * Health check endpoint สำหรับ supervisor / monitoring
 */
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'database-service' });
});

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Database Service running on port ${PORT}`);
});
