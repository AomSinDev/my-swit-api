/**
 * ========================================================
 * api-gateway.js — API Gateway + Google OAuth Handler
 * ========================================================
 * หน้าที่หลัก:
 *   1. รับ request จาก browser ที่ port 10000
 *   2. จัดการ Google OAuth 2.0 login/logout
 *   3. เก็บ session ไว้ใน signed cookie (user_session)
 *   4. ส่งต่อ (proxy) request ไปหา database-service ที่ port 3000
 *      พร้อมแนบ user_email ไปด้วยทุกครั้ง เพื่อ filter ข้อมูลเฉพาะของ user นั้น
 *
 * โครงสร้างโฟลเดอร์:
 *   swit-project/
 *   ├── api-gateway/
 *   │   └── api-gateway.js     ← ไฟล์นี้
 *   ├── database-service/
 *   │   └── database-service.js
 *   ├── frontend/
 *   │   ├── index.html
 *   │   └── login.html
 *   ├── Dockerfile
 *   ├── supervisord.conf
 *   └── package.json
 * ========================================================
 */

import express from 'express';
import axios from 'axios';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';

// ─── Path helpers ──────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/**
 * FRONTEND_DIR — ชี้ไปที่โฟลเดอร์ frontend/ ที่อยู่ระดับ sibling
 * /app/api-gateway/api-gateway.js → FRONTEND_DIR = /app/frontend
 */
const FRONTEND_DIR = path.resolve(__dirname, '../frontend');

// ─── App setup ────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
app.use(cookieParser(process.env.COOKIE_SECRET || 'swit-super-secret-key'));
app.use(express.static(FRONTEND_DIR));

// ─── Environment variables ────────────────────────────────────────────────────
const DB_SERVICE_URL = process.env.DB_SERVICE_URL || 'http://localhost:3000';
const PORT           = process.env.PORT            || 10000;
const REDIRECT_URI   = process.env.REDIRECT_URI    || `http://localhost:${PORT}/api/auth/cookie`;

// ─── Google OAuth2 Client ─────────────────────────────────────────────────────
const oauth2Client = new google.auth.OAuth2(
    process.env.CLEINT_ID,      // หมายเหตุ: typo เดิมใน .env คงไว้
    process.env.CLIENT_SECRET,
    REDIRECT_URI
);

const SCOPES = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'openid'
];

// ─── Retry Helper ─────────────────────────────────────────────────────────────
/**
 * fetchWithRetry — ลองเรียก database-service ซ้ำถ้าล้มเหลว
 * แก้ปัญหา Render Free tier ที่ service อาจยังตื่นไม่เต็มที่ตอนแรก
 *
 * @param {Function} fn      - async function ที่จะลองรัน
 * @param {number}   retries - จำนวนครั้งที่ลองซ้ำ (default: 5)
 * @param {number}   delay   - รอกี่ ms ระหว่างแต่ละครั้ง (default: 3000 = 3 วินาที)
 *
 * รวมแล้วรอสูงสุด 5 × 3 = 15 วินาที ก่อน throw error
 */
async function fetchWithRetry(fn, retries = 5, delay = 3000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err) {
            if (i === retries - 1) throw err;
            console.log(`⏳ DB not ready, retry ${i + 1}/${retries} in ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
}

// ─── Middleware: ตรวจสอบ session ─────────────────────────────────────────────
/**
 * requireAuth — ป้องกัน routes ที่ต้องการ login
 * ถ้าไม่มี cookie หรือ invalid → redirect ไปหน้า login
 */
function requireAuth(req, res, next) {
    try {
        const sessionCookie = req.signedCookies?.user_session;
        if (!sessionCookie) {
            return res.redirect('/login.html');
        }
        req.user = JSON.parse(sessionCookie);
        next();
    } catch {
        res.clearCookie('user_session');
        return res.redirect('/login.html');
    }
}

// ════════════════════════════════════════════════════════
//  AUTH ROUTES
// ════════════════════════════════════════════════════════

/**
 * GET /api/auth/login
 * สร้าง Google login URL แล้ว redirect ไปหา Google
 */
app.get('/api/auth/login', (req, res) => {
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'select_account'
    });
    console.log('🔐 Redirecting to Google login...');
    res.redirect(authUrl);
});

/**
 * GET /api/auth/cookie
 * Google redirect กลับมาพร้อม ?code=...
 * แลก code → token → ดึง profile → เก็บใน cookie → redirect หน้าหลัก
 */
app.get('/api/auth/cookie', async (req, res) => {
    const { code, error } = req.query;

    if (error || !code) {
        console.error('❌ OAuth error:', error);
        return res.redirect('/login.html?error=access_denied');
    }

    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const { data: profile } = await oauth2.userinfo.get();

        console.log(`✅ Google login: ${profile.email}`);

        const sessionData = JSON.stringify({
            email:   profile.email,
            name:    profile.name,
            picture: profile.picture
        });

        const isProduction = process.env.NODE_ENV === 'production';
        res.cookie('user_session', sessionData, {
            signed:   true,
            httpOnly: true,
            secure:   isProduction,
            maxAge:   7 * 24 * 60 * 60 * 1000,
            sameSite: 'lax'
        });

        res.redirect('/');
    } catch (err) {
        console.error('❌ OAuth callback error:', err.message);
        res.redirect('/login.html?error=server_error');
    }
});

/**
 * GET /api/auth/logout
 * ลบ cookie → redirect ไปหน้า login
 */
app.get('/api/auth/logout', (req, res) => {
    res.clearCookie('user_session');
    console.log('👋 User logged out');
    res.redirect('/login.html');
});

/**
 * GET /api/auth/me
 * Frontend เช็คว่า login อยู่ไหม
 */
app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({ loggedIn: true, user: req.user });
});

// ════════════════════════════════════════════════════════
//  DATA ROUTES (ต้อง login ก่อน)
// ════════════════════════════════════════════════════════

/**
 * POST /api/save
 * รับ { name, score } จาก frontend
 * inject user_email จาก session → ส่งไป database-service
 * ใช้ fetchWithRetry เพื่อรองรับ Render Free ที่ DB อาจยังตื่นไม่เต็มที่
 */
app.post('/api/save', requireAuth, async (req, res) => {
    try {
        const payload = {
            ...req.body,
            user_email: req.user.email
        };
        console.log(`📨 Gateway → DB: save [${req.user.email}]`);
        const response = await fetchWithRetry(() =>
            axios.post(`${DB_SERVICE_URL}/db/save`, payload)
        );
        res.json(response.data);
    } catch (err) {
        console.error('Gateway Save Error:', err.message);
        res.status(502).json({ error: 'Database Service is Offline' });
    }
});

/**
 * GET /api/history
 * ส่ง user_email ไปให้ database-service filter
 * ใช้ fetchWithRetry เพื่อรองรับ Render Free ที่ DB อาจยังตื่นไม่เต็มที่
 */
app.get('/api/history', requireAuth, async (req, res) => {
    try {
        console.log(`📨 Gateway → DB: history [${req.user.email}]`);
        const response = await fetchWithRetry(() =>
            axios.get(`${DB_SERVICE_URL}/db/history`, {
                params: { user_email: req.user.email }
            })
        );
        res.json(response.data);
    } catch (err) {
        console.error('Gateway History Error:', err.message);
        res.status(502).json([]);
    }
});

// ════════════════════════════════════════════════════════
//  PAGE ROUTES
// ════════════════════════════════════════════════════════

app.get('/', requireAuth, (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'login.html'));
});

// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API Gateway running on port ${PORT}`);
    console.log(`🔗 DB Service: ${DB_SERVICE_URL}`);
    console.log(`🔐 OAuth Redirect URI: ${REDIRECT_URI}`);
    console.log(`📁 Frontend dir: ${FRONTEND_DIR}`);
});