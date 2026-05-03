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
// ESM ไม่มี __dirname ต้องสร้างเอง
// __dirname จะชี้ไปที่ /app/api-gateway/ (ใน Docker)
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/**
 * FRONTEND_DIR — ชี้ไปที่โฟลเดอร์ frontend/ ที่อยู่ระดับ sibling
 * โครงสร้างใน Docker:
 *   /app/api-gateway/api-gateway.js  ← __dirname = /app/api-gateway
 *   /app/frontend/index.html         ← FRONTEND_DIR = /app/frontend
 */
const FRONTEND_DIR = path.resolve(__dirname, '../frontend');

// ─── App setup ────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

/**
 * cookieParser(SECRET) — ใช้ SECRET เพื่อ "sign" cookie
 * cookie ที่ถูก sign จะมี prefix "s:" และตรวจสอบได้ว่าไม่ถูกแก้ไข
 */
app.use(cookieParser(process.env.COOKIE_SECRET || 'swit-super-secret-key'));

/**
 * express.static(FRONTEND_DIR)
 * เสิร์ฟไฟล์ static ทั้งหมดจากโฟลเดอร์ frontend/
 * เช่น /index.html, /login.html, รวมถึง css/js ที่อาจเพิ่มทีหลัง
 */
app.use(express.static(FRONTEND_DIR));

// ─── Environment variables ────────────────────────────────────────────────────
const DB_SERVICE_URL = process.env.DB_SERVICE_URL || 'http://localhost:3000';
const PORT           = process.env.PORT            || 10000;
const REDIRECT_URI   = process.env.REDIRECT_URI    || `http://localhost:${PORT}/api/auth/cookie`;

// ─── Google OAuth2 Client ─────────────────────────────────────────────────────
/**
 * สร้าง OAuth2 client จาก googleapis
 * CLIENT_ID และ CLIENT_SECRET ได้จาก Google Cloud Console
 * หมายเหตุ: ใน .env สะกดว่า CLEINT_ID (typo เดิม) ไม่ได้แก้เพื่อไม่ให้ต้องแก้ Google Console
 */
const oauth2Client = new google.auth.OAuth2(
    process.env.CLEINT_ID,
    process.env.CLIENT_SECRET,
    REDIRECT_URI
);

// Scope ที่ขอจาก Google: email, ชื่อ, รูปโปรไฟล์
const SCOPES = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'openid'
];

// ─── Middleware: ตรวจสอบ session ─────────────────────────────────────────────
/**
 * requireAuth — ป้องกัน routes ที่ต้องการ login
 * อ่าน signed cookie "user_session" และ parse เป็น object user
 * ถ้าไม่มี หรือ invalid → redirect ไปหน้า login
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
 * สร้าง Google login URL แล้ว redirect browser ไปหา Google
 */
app.get('/api/auth/login', (req, res) => {
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'select_account'  // บังคับเลือก account ทุกครั้ง
    });
    console.log('🔐 Redirecting to Google login...');
    res.redirect(authUrl);
});

/**
 * GET /api/auth/cookie  ← ชื่อนี้ตรงกับที่ตั้งไว้ใน Google Cloud Console
 * Google redirect กลับมาพร้อม ?code=...
 * แลก code → token → ดึง profile → เก็บใน signed cookie → redirect หน้าหลัก
 */
app.get('/api/auth/cookie', async (req, res) => {
    const { code, error } = req.query;

    // กรณี user กด Cancel ที่หน้า Google
    if (error || !code) {
        console.error('❌ OAuth error:', error);
        return res.redirect('/login.html?error=access_denied');
    }

    try {
        // แลก authorization code → access_token
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        // ดึงข้อมูล profile จาก Google
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const { data: profile } = await oauth2.userinfo.get();

        console.log(`✅ Google login: ${profile.email}`);

        // เก็บเฉพาะข้อมูลที่จำเป็นลงใน session cookie
        const sessionData = JSON.stringify({
            email:   profile.email,
            name:    profile.name,
            picture: profile.picture
        });

        /**
         * Signed cookie "user_session"
         * - httpOnly: true  → JS ฝั่ง browser อ่านไม่ได้ (ป้องกัน XSS)
         * - secure: true    → HTTPS เท่านั้น (production)
         * - maxAge: 7 วัน
         * - sameSite: lax   → ป้องกัน CSRF เบื้องต้น
         */
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
 * ลบ cookie แล้ว redirect ไปหน้า login
 */
app.get('/api/auth/logout', (req, res) => {
    res.clearCookie('user_session');
    console.log('👋 User logged out');
    res.redirect('/login.html');
});

/**
 * GET /api/auth/me
 * Frontend เรียกเพื่อเช็คว่า login อยู่ไหม และดึงข้อมูล user
 * ถ้าไม่ได้ login → 401
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
 * inject user_email จาก session ก่อนส่งไป database-service
 * → browser ปลอม email ไม่ได้เพราะอ่านจาก httpOnly cookie ฝั่ง server
 */
app.post('/api/save', requireAuth, async (req, res) => {
    try {
        const payload = {
            ...req.body,
            user_email: req.user.email
        };
        console.log(`📨 Gateway → DB: save [${req.user.email}]`, payload);
        const response = await axios.post(`${DB_SERVICE_URL}/db/save`, payload);
        res.json(response.data);
    } catch (err) {
        console.error('Gateway Save Error:', err.message);
        res.status(502).json({ error: 'Database Service is Offline' });
    }
});

/**
 * GET /api/history
 * ส่ง user_email ใน query string ไปให้ database-service filter
 * → แต่ละ user เห็นเฉพาะข้อมูลของตัวเอง
 */
app.get('/api/history', requireAuth, async (req, res) => {
    try {
        console.log(`📨 Gateway → DB: history [${req.user.email}]`);
        const response = await axios.get(`${DB_SERVICE_URL}/db/history`, {
            params: { user_email: req.user.email }
        });
        res.json(response.data);
    } catch (err) {
        console.error('Gateway History Error:', err.message);
        res.status(502).json([]);
    }
});

// ════════════════════════════════════════════════════════
//  PAGE ROUTES
// ════════════════════════════════════════════════════════

/**
 * GET /
 * หน้าหลัก — ต้อง login ก่อน
 * sendFile ชี้ไปที่ frontend/index.html
 */
app.get('/', requireAuth, (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

/**
 * GET /login.html
 * หน้า login — ไม่ต้อง auth
 * sendFile ชี้ไปที่ frontend/login.html
 */
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
