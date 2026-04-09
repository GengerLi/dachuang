const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');
const fs = require('fs');
const fsp = fs.promises;
const { spawn } = require('child_process');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PYTHON_BIN = process.env.PYTHON_BIN || 'python';
const REID_TIMEOUT_MS = Number(process.env.REID_TIMEOUT_MS || 120000);
const MAX_PYTHON_OUTPUT_BYTES = Number(process.env.MAX_PYTHON_OUTPUT_BYTES || 262144);
const AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || 'change-this-auth-token-secret';
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || 'admin123456';
const USER_TOKEN_TTL_MS = Number(process.env.USER_TOKEN_TTL_MS || 7 * 24 * 60 * 60 * 1000);
const ADMIN_TOKEN_TTL_MS = Number(process.env.ADMIN_TOKEN_TTL_MS || 8 * 60 * 60 * 1000);
const EMAIL_CODE_SECRET = process.env.EMAIL_CODE_SECRET || AUTH_TOKEN_SECRET;
const EMAIL_CODE_TTL_MINUTES = Number(process.env.EMAIL_CODE_TTL_MINUTES || 10);
const EMAIL_CODE_RESEND_SECONDS = Number(process.env.EMAIL_CODE_RESEND_SECONDS || 60);
const EMAIL_CODE_MAX_ATTEMPTS = Number(process.env.EMAIL_CODE_MAX_ATTEMPTS || 5);
const EMAIL_CODE_MAX_PER_HOUR = Number(process.env.EMAIL_CODE_MAX_PER_HOUR || 5);
const EMAIL_CODE_LENGTH = 6;
const EMAIL_SCENES = Object.freeze({
    REGISTER: 'register',
    RESET_PASSWORD: 'reset_password'
});
const PASSWORD_PREFIX = 'scrypt';
const DEFAULT_USER_SETTINGS = Object.freeze({ notifications: true, autoSave: true });
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === 'true'
    : SMTP_PORT === 465;
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || '';
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const CROPS_DIR = path.join(__dirname, 'dataset', 'crops');
const OUTPUT_DIR = path.join(__dirname, 'dataset', 'output');
const PUBLIC_DIR = path.join(__dirname, 'public');
const ROOT_DIR = path.resolve(__dirname, '..');
const HTML_DIR = path.join(ROOT_DIR, 'html');
const CSS_DIR = path.join(ROOT_DIR, 'css');
const XR_HTML_FILE = path.join(HTML_DIR, 'xr.html');
const ADMIN_HTML_FILE = path.join(HTML_DIR, 'admin.html');
const CLIENT_APP_FILE = path.join(__dirname, 'app.js');
const CLIENT_ADMIN_FILE = path.join(__dirname, 'admin.js');
let emailTransporter = null;

if (!process.env.AUTH_TOKEN_SECRET) {
    console.warn('[auth] AUTH_TOKEN_SECRET 未配置，当前正在使用默认值。');
}

if (!process.env.ADMIN_SECRET_KEY) {
    console.warn('[auth] ADMIN_SECRET_KEY 未配置，当前正在使用默认值。');
}

if (!process.env.EMAIL_CODE_SECRET) {
    console.warn('[auth] EMAIL_CODE_SECRET 未配置，当前将复用 AUTH_TOKEN_SECRET。');
}

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    console.warn('[mail] SMTP 未完整配置，邮箱验证码功能当前不可用。');
}

app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '1mb' }));

if (fs.existsSync(PUBLIC_DIR)) {
    app.use(express.static(PUBLIC_DIR));
}

if (fs.existsSync(CSS_DIR)) {
    app.use('/css', express.static(CSS_DIR));
}

app.get('/javascript/app.js', (req, res) => {
    res.sendFile(CLIENT_APP_FILE);
});

app.get('/javascript/admin.js', (req, res) => {
    res.sendFile(CLIENT_ADMIN_FILE);
});

function serveXrPage(req, res, next) {
    res.sendFile(XR_HTML_FILE, (err) => {
        if (err) {
            next(err);
        }
    });
}

function serveAdminPage(req, res, next) {
    res.sendFile(ADMIN_HTML_FILE, (err) => {
        if (err) {
            next(err);
        }
    });
}

app.get('/', serveXrPage);
app.get('/index.html', serveXrPage);
app.get('/xr.html', serveXrPage);
app.get('/admin', serveAdminPage);
app.get('/admin.html', serveAdminPage);

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 54321),
    user: process.env.DB_USER || 'SYSTEM',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_NAME || 'DACHUANG',
    max: Number(process.env.DB_POOL_MAX || 10),
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 5000)
});

pool.on('error', (err) => {
    console.error('[db] 连接池发生异常:', err);
});

const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1
    },
    fileFilter: (req, file, cb) => {
        if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
            cb(createHttpError(400, '仅支持 JPG、PNG、WEBP 图片'));
            return;
        }
        cb(null, true);
    }
});

function createHttpError(statusCode, message, extra = {}) {
    const err = new Error(message);
    err.statusCode = statusCode;
    Object.assign(err, extra);
    return err;
}

function asyncHandler(handler) {
    return (req, res, next) => {
        Promise.resolve(handler(req, res, next)).catch(next);
    };
}

function trimString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value) {
    return trimString(value).toLowerCase();
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeVerificationCode(value) {
    return trimString(value).replace(/\D/g, '').slice(0, EMAIL_CODE_LENGTH);
}

function getClientIp(req) {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
        return forwardedFor.split(',')[0].trim();
    }

    return req.socket && req.socket.remoteAddress
        ? req.socket.remoteAddress
        : '';
}

function assertMailerConfigured() {
    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
        throw createHttpError(
            500,
            '邮件服务未配置，请先在 javascript/.env 中设置 SMTP_HOST、SMTP_PORT、SMTP_USER、SMTP_PASS 和 SMTP_FROM'
        );
    }
}

function getEmailTransporter() {
    assertMailerConfigured();

    if (!emailTransporter) {
        emailTransporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: SMTP_PORT,
            secure: SMTP_SECURE,
            auth: {
                user: SMTP_USER,
                pass: SMTP_PASS
            }
        });
    }

    return emailTransporter;
}

function getEmailSceneContent(scene) {
    if (scene === EMAIL_SCENES.REGISTER) {
        return {
            subject: '注册验证码',
            title: '邮箱注册验证码',
            actionText: '完成注册'
        };
    }

    return {
        subject: '重置密码验证码',
        title: '密码重置验证码',
        actionText: '重置密码'
    };
}

function generateEmailVerificationCode() {
    return String(Math.floor(Math.random() * 900000) + 100000);
}

function hashEmailVerificationCode(scene, email, code) {
    return crypto
        .createHmac('sha256', EMAIL_CODE_SECRET)
        .update([scene, normalizeEmail(email), normalizeVerificationCode(code)].join(':'))
        .digest('hex');
}

async function sendEmailVerificationCode(options) {
    const { email, scene, code } = options;
    const transporter = getEmailTransporter();
    const sceneContent = getEmailSceneContent(scene);

    try {
        await transporter.sendMail({
            from: SMTP_FROM,
            to: email,
            subject: sceneContent.subject,
            text: [
                `${sceneContent.title}`,
                '',
                `验证码：${code}`,
                `有效期：${EMAIL_CODE_TTL_MINUTES} 分钟`,
                `用途：用于${sceneContent.actionText}`,
                '',
                '如果不是您本人操作，请忽略此邮件。'
            ].join('\n'),
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
                    <h2 style="margin-bottom: 12px;">${sceneContent.title}</h2>
                    <p>您好，您本次用于${sceneContent.actionText}的验证码如下：</p>
                    <div style="margin: 20px 0; font-size: 28px; font-weight: 700; letter-spacing: 6px; color: #2563eb;">
                        ${code}
                    </div>
                    <p>验证码在 <strong>${EMAIL_CODE_TTL_MINUTES} 分钟</strong> 内有效，重新发送后旧验证码会自动失效。</p>
                    <p style="color: #6b7280;">如果不是您本人操作，请忽略此邮件。</p>
                </div>
            `
        });
    } catch (err) {
        throw createHttpError(500, '验证码发送失败，请检查 SMTP 配置是否正确', {
            detail: err.message
        });
    }
}

function parsePositiveInteger(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function getImageContentType(filename) {
    switch (path.extname(filename).toLowerCase()) {
        case '.png':
            return 'image/png';
        case '.webp':
            return 'image/webp';
        default:
            return 'image/jpeg';
    }
}

function encodeToken(payload, ttlMs) {
    const fullPayload = { ...payload, exp: Date.now() + ttlMs };
    const encodedPayload = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
    const signature = crypto
        .createHmac('sha256', AUTH_TOKEN_SECRET)
        .update(encodedPayload)
        .digest('base64url');

    return `${encodedPayload}.${signature}`;
}

function decodeToken(token) {
    if (!token || typeof token !== 'string') {
        return null;
    }

    const parts = token.split('.');
    if (parts.length !== 2) {
        return null;
    }

    const [encodedPayload, signature] = parts;
    const expectedSignature = crypto
        .createHmac('sha256', AUTH_TOKEN_SECRET)
        .update(encodedPayload)
        .digest('base64url');

    const expectedBuffer = Buffer.from(expectedSignature);
    const signatureBuffer = Buffer.from(signature);

    if (
        expectedBuffer.length !== signatureBuffer.length ||
        !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
    ) {
        return null;
    }

    try {
        const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
        if (!payload.exp || payload.exp < Date.now()) {
            return null;
        }
        return payload;
    } catch (err) {
        return null;
    }
}

function getBearerToken(req) {
    const authorization = req.headers.authorization || '';
    if (!authorization.startsWith('Bearer ')) {
        return '';
    }
    return authorization.slice('Bearer '.length).trim();
}

function requireRole(role) {
    return (req, res, next) => {
        const payload = decodeToken(getBearerToken(req));
        if (!payload || payload.role !== role) {
            res.status(401).json({
                success: false,
                msg: '未授权或登录已过期'
            });
            return;
        }

        req.auth = payload;
        next();
    };
}

function isScryptHash(value) {
    if (typeof value !== 'string') {
        return false;
    }

    const parts = value.split('$');
    return parts.length === 3 && parts[0] === PASSWORD_PREFIX;
}

function scryptAsync(password, salt) {
    return new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, 64, (err, derivedKey) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(derivedKey.toString('hex'));
        });
    });
}

async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await scryptAsync(password, salt);
    return `${PASSWORD_PREFIX}$${salt}$${hash}`;
}

async function verifyPassword(password, storedPassword) {
    if (!storedPassword) {
        return false;
    }

    if (!isScryptHash(storedPassword)) {
        return password === storedPassword;
    }

    const [, salt, expectedHash] = storedPassword.split('$');
    const actualHash = await scryptAsync(password, salt);
    const expectedBuffer = Buffer.from(expectedHash, 'hex');
    const actualBuffer = Buffer.from(actualHash, 'hex');

    return (
        expectedBuffer.length === actualBuffer.length &&
        crypto.timingSafeEqual(expectedBuffer, actualBuffer)
    );
}

function toUserResponse(user) {
    const normalizedUser = normalizeRow(user);
    return {
        id: normalizedUser.id,
        username: normalizedUser.username,
        email: normalizedUser.email,
        usageCount: Number(normalizedUser.usage_count || 0),
        lastUsed: normalizedUser.last_used,
        registrationDate: normalizedUser.registration_date,
        settings: normalizedUser.settings || DEFAULT_USER_SETTINGS
    };
}

function normalizeRow(row) {
    if (!row || typeof row !== 'object') {
        return row;
    }

    const normalized = {};
    for (const [key, value] of Object.entries(row)) {
        normalized[key.toLowerCase()] = value;
    }

    return normalized;
}

function normalizeRows(rows) {
    return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

function firstNormalizedRow(result) {
    if (!result || !Array.isArray(result.rows) || result.rows.length === 0) {
        return null;
    }

    return normalizeRow(result.rows[0]);
}

async function withClient(callback) {
    const client = await pool.connect();
    try {
        return await callback(client);
    } finally {
        client.release();
    }
}

async function createPendingEmailCode(client, options) {
    const { email, scene, sendIp, userAgent } = options;
    const latestResult = await client.query(
        `SELECT id, created_at
         FROM email_verification_codes
         WHERE email = $1 AND scene = $2
         ORDER BY created_at DESC, id DESC
         LIMIT 1
         FOR UPDATE`,
        [email, scene]
    );
    const latest = firstNormalizedRow(latestResult);

    if (latest && latest.created_at) {
        const elapsedMs = Date.now() - new Date(latest.created_at).getTime();
        if (elapsedMs < EMAIL_CODE_RESEND_SECONDS * 1000) {
            throw createHttpError(429, '发送过于频繁，请稍后再试', {
                retryAfterSec: Math.max(1, Math.ceil((EMAIL_CODE_RESEND_SECONDS * 1000 - elapsedMs) / 1000))
            });
        }
    }

    const emailCountResult = await client.query(
        `SELECT COUNT(*) AS count
         FROM email_verification_codes
         WHERE email = $1
           AND scene = $2
           AND created_at >= NOW() - INTERVAL '1 hour'`,
        [email, scene]
    );
    const emailCount = Number((firstNormalizedRow(emailCountResult) || {}).count || 0);
    if (emailCount >= EMAIL_CODE_MAX_PER_HOUR) {
        throw createHttpError(429, '该邮箱发送次数过多，请 1 小时后再试', {
            retryAfterSec: 3600
        });
    }

    if (sendIp) {
        const ipCountResult = await client.query(
            `SELECT COUNT(*) AS count
             FROM email_verification_codes
             WHERE send_ip = $1
               AND scene = $2
               AND created_at >= NOW() - INTERVAL '1 hour'`,
            [sendIp, scene]
        );
        const ipCount = Number((firstNormalizedRow(ipCountResult) || {}).count || 0);
        if (ipCount >= EMAIL_CODE_MAX_PER_HOUR) {
            throw createHttpError(429, '当前网络发送次数过多，请 1 小时后再试', {
                retryAfterSec: 3600
            });
        }
    }

    await client.query(
        `UPDATE email_verification_codes
         SET status = 'invalidated', invalidated_at = NOW()
         WHERE email = $1 AND scene = $2 AND status = 'pending'`,
        [email, scene]
    );

    const code = generateEmailVerificationCode();
    const expiresAt = new Date(Date.now() + EMAIL_CODE_TTL_MINUTES * 60 * 1000);
    const insertResult = await client.query(
        `INSERT INTO email_verification_codes (
            email,
            scene,
            code_hash,
            status,
            attempt_count,
            max_attempts,
            expires_at,
            send_ip,
            user_agent
        )
        VALUES ($1, $2, $3, 'pending', 0, $4, $5, $6, $7)
        RETURNING id, expires_at`,
        [
            email,
            scene,
            hashEmailVerificationCode(scene, email, code),
            EMAIL_CODE_MAX_ATTEMPTS,
            expiresAt,
            sendIp || null,
            userAgent || null
        ]
    );
    const record = firstNormalizedRow(insertResult);

    return {
        id: record.id,
        code,
        expiresAt: record.expires_at
    };
}

async function consumePendingEmailCode(client, options) {
    const { email, scene, code, verifyIp } = options;
    const codeResult = await client.query(
        `SELECT id, code_hash, attempt_count, max_attempts, expires_at
         FROM email_verification_codes
         WHERE email = $1 AND scene = $2 AND status = 'pending'
         ORDER BY created_at DESC, id DESC
         LIMIT 1
         FOR UPDATE`,
        [email, scene]
    );
    const record = firstNormalizedRow(codeResult);

    if (!record) {
        throw createHttpError(400, '请先获取验证码');
    }

    const expiresAt = record.expires_at ? new Date(record.expires_at).getTime() : 0;
    if (expiresAt && expiresAt < Date.now()) {
        await client.query(
            `UPDATE email_verification_codes
             SET status = 'expired', invalidated_at = NOW()
             WHERE id = $1`,
            [record.id]
        );
        throw createHttpError(400, '验证码已过期，请重新获取');
    }

    const currentAttempts = Number(record.attempt_count || 0);
    const maxAttempts = Number(record.max_attempts || EMAIL_CODE_MAX_ATTEMPTS);
    if (currentAttempts >= maxAttempts) {
        await client.query(
            `UPDATE email_verification_codes
             SET status = 'locked', invalidated_at = NOW()
             WHERE id = $1`,
            [record.id]
        );
        throw createHttpError(400, '验证码已失效，请重新获取');
    }

    const expectedHash = Buffer.from(record.code_hash, 'hex');
    const actualHash = Buffer.from(hashEmailVerificationCode(scene, email, code), 'hex');
    const matched = expectedHash.length === actualHash.length
        && crypto.timingSafeEqual(expectedHash, actualHash);

    if (!matched) {
        const nextAttempts = currentAttempts + 1;
        const nextStatus = nextAttempts >= maxAttempts ? 'locked' : 'pending';
        await client.query(
            `UPDATE email_verification_codes
             SET attempt_count = $1,
                 status = $2,
                 invalidated_at = CASE WHEN $2 = 'pending' THEN invalidated_at ELSE NOW() END
             WHERE id = $3`,
            [nextAttempts, nextStatus, record.id]
        );
        throw createHttpError(
            400,
            nextStatus === 'locked' ? '验证码错误次数过多，请重新获取' : '验证码错误'
        );
    }

    await client.query(
        `UPDATE email_verification_codes
         SET status = 'used', consumed_at = NOW(), verify_ip = $2
         WHERE id = $1`,
        [record.id, verifyIp || null]
    );
}

async function ensureDirectory(dirPath) {
    await fsp.mkdir(dirPath, { recursive: true });
}

async function safeUnlink(filePath) {
    try {
        await fsp.unlink(filePath);
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.error('[fs] 删除临时文件失败:', filePath, err);
        }
    }
}

function extractLastJson(stdout) {
    const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

    for (let index = lines.length - 1; index >= 0; index -= 1) {
        try {
            return JSON.parse(lines[index]);
        } catch (err) {
            // Skip non-JSON log lines.
        }
    }

    return null;
}

function runReidInference(queryPath) {
    return new Promise((resolve, reject) => {
        const child = spawn(
            PYTHON_BIN,
            [path.join(__dirname, 'reid_infer.py'), queryPath, CROPS_DIR, OUTPUT_DIR],
            {
                cwd: __dirname,
                stdio: ['ignore', 'pipe', 'pipe']
            }
        );

        let stdout = '';
        let stderr = '';
        let stdoutBytes = 0;
        let stderrBytes = 0;
        let timedOut = false;

        const timer = setTimeout(() => {
            timedOut = true;
            child.kill();
        }, REID_TIMEOUT_MS);

        child.stdout.on('data', (chunk) => {
            stdoutBytes += chunk.length;
            if (stdoutBytes <= MAX_PYTHON_OUTPUT_BYTES) {
                stdout += chunk.toString();
            }
        });

        child.stderr.on('data', (chunk) => {
            stderrBytes += chunk.length;
            if (stderrBytes <= MAX_PYTHON_OUTPUT_BYTES) {
                stderr += chunk.toString();
            }
        });

        child.on('error', (err) => {
            clearTimeout(timer);
            reject(createHttpError(500, `无法启动 Python 进程: ${err.message}`));
        });

        child.on('close', (code) => {
            clearTimeout(timer);

            if (timedOut) {
                reject(createHttpError(504, '识别超时，请稍后重试'));
                return;
            }

            if (code !== 0) {
                const detail = stderr.trim() || `Python 进程退出码 ${code}`;
                reject(createHttpError(500, '识别失败，推理脚本执行异常', { detail }));
                return;
            }

            const result = extractLastJson(stdout);
            if (!result) {
                reject(createHttpError(500, '识别失败，无法解析推理结果', {
                    detail: stdout.slice(0, 500)
                }));
                return;
            }

            resolve(result);
        });
    });
}

async function initialize() {
    await Promise.all([ensureDirectory(UPLOAD_DIR), ensureDirectory(OUTPUT_DIR)]);

    await withClient(async (client) => {
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                email_verified BOOLEAN NOT NULL DEFAULT FALSE,
                email_verified_at TIMESTAMP,
                usage_count INTEGER DEFAULT 0,
                last_used TIMESTAMP,
                registration_date TIMESTAMP DEFAULT NOW(),
                settings JSONB DEFAULT '{"notifications": true, "autoSave": true}'::jsonb,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        await client.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE
        `);
        await client.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS user_images (
                id SERIAL PRIMARY KEY,
                user_email VARCHAR(255) NOT NULL,
                filename VARCHAR(255) NOT NULL,
                image_data BYTEA,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS email_verification_codes (
                id BIGSERIAL PRIMARY KEY,
                email VARCHAR(255) NOT NULL,
                scene VARCHAR(32) NOT NULL,
                code_hash CHAR(64) NOT NULL,
                status VARCHAR(16) NOT NULL DEFAULT 'pending',
                attempt_count INTEGER NOT NULL DEFAULT 0,
                max_attempts INTEGER NOT NULL DEFAULT 5,
                expires_at TIMESTAMP NOT NULL,
                consumed_at TIMESTAMP,
                invalidated_at TIMESTAMP,
                send_ip VARCHAR(64),
                verify_ip VARCHAR(64),
                user_agent TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        `);

        await client.query('CREATE INDEX IF NOT EXISTS idx_users_username ON users (username)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_users_last_used ON users (last_used)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_user_images_user_email ON user_images (user_email)');
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_email_codes_lookup
            ON email_verification_codes (email, scene, status, created_at DESC)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_email_codes_send_ip
            ON email_verification_codes (send_ip, scene, created_at DESC)
        `);
    });

    console.log('[init] 数据库与目录初始化完成');
}

app.post('/api/register', asyncHandler(async (req, res) => {
    const username = trimString(req.body.username);
    const email = normalizeEmail(req.body.email);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const emailCode = normalizeVerificationCode(req.body.emailCode);
    const verifyIp = getClientIp(req);

    if (!username || !email || !password || !emailCode) {
        throw createHttpError(400, '请填写所有必填字段');
    }

    if (username.length < 3) {
        throw createHttpError(400, '用户名至少需要 3 个字符');
    }

    if (password.length < 6) {
        throw createHttpError(400, '密码至少需要 6 个字符');
    }

    if (!isValidEmail(email)) {
        throw createHttpError(400, '请输入有效的邮箱地址');
    }

    if (emailCode.length !== EMAIL_CODE_LENGTH) {
        throw createHttpError(400, '请输入 6 位邮箱验证码');
    }

    const hashedPassword = await hashPassword(password);
    const user = await withClient(async (client) => {
        await client.query('BEGIN');
        try {
            const existing = await client.query('SELECT 1 FROM users WHERE email = $1', [email]);
            if (existing.rowCount > 0) {
                throw createHttpError(400, '邮箱已注册，请使用其他邮箱');
            }

            await consumePendingEmailCode(client, {
                email,
                scene: EMAIL_SCENES.REGISTER,
                code: emailCode,
                verifyIp
            });

            const result = await client.query(
                `INSERT INTO users (
                    username,
                    email,
                    password,
                    email_verified,
                    email_verified_at,
                    usage_count,
                    last_used,
                    registration_date
                )
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 RETURNING id, username, email, registration_date`,
                [username, email, hashedPassword, true, new Date(), 0, null, new Date()]
            );

            await client.query('COMMIT');
            return firstNormalizedRow(result);
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
    });

    res.json({
        success: true,
        msg: '注册成功',
        user: {
            id: user.id,
            username: user.username,
            email: user.email,
            registrationDate: user.registration_date
        }
    });
}));

app.post('/api/register/email-code/send', asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const sendIp = getClientIp(req);
    const userAgent = trimString(req.headers['user-agent']);

    if (!email) {
        throw createHttpError(400, '请输入邮箱地址');
    }

    if (!isValidEmail(email)) {
        throw createHttpError(400, '请输入有效的邮箱地址');
    }

    assertMailerConfigured();

    const existingResult = await pool.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (existingResult.rowCount > 0) {
        res.json({
            success: true,
            msg: '如果该邮箱尚未注册，验证码已发送，请查收邮箱',
            retryAfterSec: EMAIL_CODE_RESEND_SECONDS,
            expireInSec: EMAIL_CODE_TTL_MINUTES * 60
        });
        return;
    }

    const issuedCode = await withClient(async (client) => {
        await client.query('BEGIN');
        try {
            const created = await createPendingEmailCode(client, {
                email,
                scene: EMAIL_SCENES.REGISTER,
                sendIp,
                userAgent
            });
            await client.query('COMMIT');
            return created;
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
    });

    try {
        await sendEmailVerificationCode({
            email,
            scene: EMAIL_SCENES.REGISTER,
            code: issuedCode.code
        });
    } catch (err) {
        await pool.query(
            `UPDATE email_verification_codes
             SET status = 'invalidated', invalidated_at = NOW()
             WHERE id = $1 AND status = 'pending'`,
            [issuedCode.id]
        );
        throw err;
    }

    res.json({
        success: true,
        msg: '验证码已发送，请查收邮箱',
        retryAfterSec: EMAIL_CODE_RESEND_SECONDS,
        expireInSec: EMAIL_CODE_TTL_MINUTES * 60
    });
}));

app.post('/api/login', asyncHandler(async (req, res) => {
    const loginName = trimString(req.body.username);
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!loginName || !password) {
        throw createHttpError(400, '请输入用户名/邮箱和密码');
    }

    const user = await withClient(async (client) => {
        const result = await client.query(
            `SELECT id, username, email, password, usage_count, last_used, registration_date, settings
             FROM users
             WHERE username = $1 OR LOWER(email) = $2
             ORDER BY created_at DESC, id DESC`,
            [loginName, loginName.toLowerCase()]
        );

        const users = normalizeRows(result.rows);
        let matchedUser = null;
        for (const row of users) {
            // eslint-disable-next-line no-await-in-loop
            if (await verifyPassword(password, row.password)) {
                matchedUser = row;
                break;
            }
        }

        if (!matchedUser) {
            return null;
        }

        await client.query('UPDATE users SET last_used = NOW() WHERE id = $1', [matchedUser.id]);

        if (!isScryptHash(matchedUser.password)) {
            const migratedPassword = await hashPassword(password);
            await client.query('UPDATE users SET password = $1 WHERE id = $2', [migratedPassword, matchedUser.id]);
        }

        const refreshed = await client.query(
            `SELECT id, username, email, usage_count, last_used, registration_date, settings
             FROM users WHERE id = $1`,
            [matchedUser.id]
        );

        return firstNormalizedRow(refreshed);
    });

    if (!user) {
        throw createHttpError(401, '用户名/邮箱或密码错误');
    }

    const token = encodeToken(
        {
            role: 'user',
            userId: user.id,
            email: user.email,
            username: user.username
        },
        USER_TOKEN_TTL_MS
    );

    res.json({
        success: true,
        msg: '登录成功',
        token,
        user: toUserResponse(user)
    });
}));

app.get('/api/check-email', asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.query.email);

    if (!email) {
        throw createHttpError(400, '请输入邮箱');
    }

    const result = await pool.query('SELECT 1 FROM users WHERE email = $1', [email]);
    res.json({
        exists: result.rowCount > 0,
        msg: result.rowCount > 0 ? '邮箱已注册' : '邮箱可用'
    });
}));

app.get('/api/users', requireRole('admin'), asyncHandler(async (req, res) => {
    const result = await pool.query(
        'SELECT id, username, email, usage_count, last_used, registration_date FROM users ORDER BY created_at DESC'
    );

    res.json({
        success: true,
        users: normalizeRows(result.rows),
        count: result.rowCount
    });
}));

app.get('/api/users/by-username/:username', requireRole('admin'), asyncHandler(async (req, res) => {
    const username = trimString(req.params.username);
    const result = await pool.query(
        'SELECT id, username, email, usage_count, last_used, registration_date FROM users WHERE username = $1 ORDER BY created_at DESC',
        [username]
    );

    res.json({
        success: true,
        username,
        users: normalizeRows(result.rows),
        count: result.rowCount
    });
}));

app.post('/api/reset-password', asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const emailCode = normalizeVerificationCode(req.body.emailCode);
    const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';
    const verifyIp = getClientIp(req);

    if (!email || !emailCode || !newPassword) {
        throw createHttpError(400, '请填写所有必填字段');
    }

    if (!isValidEmail(email)) {
        throw createHttpError(400, '请输入有效的邮箱地址');
    }

    if (emailCode.length !== EMAIL_CODE_LENGTH) {
        throw createHttpError(400, '请输入 6 位邮箱验证码');
    }

    if (newPassword.length < 6) {
        throw createHttpError(400, '新密码至少需要 6 个字符');
    }

    const hashedPassword = await hashPassword(newPassword);

    await withClient(async (client) => {
        await client.query('BEGIN');
        try {
            const userResult = await client.query(
                'SELECT id FROM users WHERE email = $1 ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE',
                [email]
            );

            if (userResult.rowCount === 0) {
                throw createHttpError(400, '验证码无效或邮箱不存在');
            }

            await consumePendingEmailCode(client, {
                email,
                scene: EMAIL_SCENES.RESET_PASSWORD,
                code: emailCode,
                verifyIp
            });

            await client.query(
                'UPDATE users SET password = $1 WHERE email = $2',
                [hashedPassword, email]
            );

            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
    });

    res.json({
        success: true,
        msg: '密码重置成功，请使用新密码登录'
    });
}));

app.post('/api/reset-password/email-code/send', asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const sendIp = getClientIp(req);
    const userAgent = trimString(req.headers['user-agent']);

    if (!email) {
        throw createHttpError(400, '请输入邮箱地址');
    }

    if (!isValidEmail(email)) {
        throw createHttpError(400, '请输入有效的邮箱地址');
    }

    assertMailerConfigured();

    const userResult = await pool.query(
        'SELECT id FROM users WHERE email = $1 ORDER BY created_at DESC, id DESC LIMIT 1',
        [email]
    );

    if (userResult.rowCount === 0) {
        res.json({
            success: true,
            msg: '如果该邮箱已注册，验证码已发送，请查收邮箱',
            retryAfterSec: EMAIL_CODE_RESEND_SECONDS,
            expireInSec: EMAIL_CODE_TTL_MINUTES * 60
        });
        return;
    }

    const issuedCode = await withClient(async (client) => {
        await client.query('BEGIN');
        try {
            const created = await createPendingEmailCode(client, {
                email,
                scene: EMAIL_SCENES.RESET_PASSWORD,
                sendIp,
                userAgent
            });
            await client.query('COMMIT');
            return created;
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
    });

    try {
        await sendEmailVerificationCode({
            email,
            scene: EMAIL_SCENES.RESET_PASSWORD,
            code: issuedCode.code
        });
    } catch (err) {
        await pool.query(
            `UPDATE email_verification_codes
             SET status = 'invalidated', invalidated_at = NOW()
             WHERE id = $1 AND status = 'pending'`,
            [issuedCode.id]
        );
        throw err;
    }

    res.json({
        success: true,
        msg: '验证码已发送，请查收邮箱',
        retryAfterSec: EMAIL_CODE_RESEND_SECONDS,
        expireInSec: EMAIL_CODE_TTL_MINUTES * 60
    });
}));

app.get('/api/user/profile', requireRole('user'), asyncHandler(async (req, res) => {
    const result = await pool.query(
        `SELECT id, username, email, usage_count, last_used, registration_date, settings
         FROM users WHERE id = $1 AND email = $2`,
        [req.auth.userId, req.auth.email]
    );

    if (result.rowCount === 0) {
        throw createHttpError(404, '用户不存在');
    }

    res.json({
        success: true,
        user: toUserResponse(firstNormalizedRow(result))
    });
}));

app.post('/api/reid', requireRole('user'), upload.single('image'), asyncHandler(async (req, res) => {
    if (!req.file) {
        throw createHttpError(400, '请上传图片');
    }

    const userResult = await pool.query(
        'SELECT id, email FROM users WHERE id = $1 AND email = $2',
        [req.auth.userId, req.auth.email]
    );

    if (userResult.rowCount === 0) {
        throw createHttpError(404, '用户不存在');
    }

    const ext = path.extname(req.file.originalname || '').toLowerCase();
    const safeExt = ext && ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
    const queryPath = path.join(UPLOAD_DIR, `query_${Date.now()}_${crypto.randomUUID()}${safeExt}`);

    await fsp.writeFile(queryPath, req.file.buffer);

    try {
        const result = await runReidInference(queryPath);
        if (!result || !result.filename) {
            throw createHttpError(404, '未找到匹配图片');
        }

        const usageResult = await pool.query(
            `UPDATE users
             SET usage_count = usage_count + 1, last_used = NOW()
             WHERE id = $1
             RETURNING usage_count, last_used`,
            [req.auth.userId]
        );

        const usage = firstNormalizedRow(usageResult);
        const similarity = typeof result.similarity === 'number'
            ? result.similarity.toFixed(3)
            : (1 / (1 + Number(result.distance || 0))).toFixed(3);

        res.json({
            success: true,
            msg: '识别完成',
            match: {
                filename: result.filename,
                distance: result.distance,
                similarity,
                imageUrl: `/api/result-image/${encodeURIComponent(result.filename)}`
            },
            usage: usage ? {
                usageCount: Number(usage.usage_count || 0),
                lastUsed: usage.last_used
            } : null
        });
    } finally {
        await safeUnlink(queryPath);
    }
}));

app.get('/api/result-image/:filename', asyncHandler(async (req, res) => {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(OUTPUT_DIR, filename);

    try {
        await fsp.access(filePath, fs.constants.R_OK);
    } catch (err) {
        throw createHttpError(404, '图片不存在');
    }

    res.sendFile(filePath);
}));

app.get('/api/image/:id', requireRole('admin'), asyncHandler(async (req, res) => {
    const imageId = parsePositiveInteger(req.params.id);
    if (!imageId) {
        throw createHttpError(400, '无效的图片 ID');
    }

    const result = await pool.query(
        'SELECT image_data, filename FROM user_images WHERE id = $1',
        [imageId]
    );

    if (result.rowCount === 0) {
        throw createHttpError(404, '图片不存在');
    }

    const { image_data: imageData, filename } = firstNormalizedRow(result);
    res.setHeader('Content-Type', getImageContentType(filename));
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(imageData);
}));

app.get('/api/user/settings', requireRole('user'), asyncHandler(async (req, res) => {
    const result = await pool.query(
        'SELECT settings FROM users WHERE id = $1 AND email = $2',
        [req.auth.userId, req.auth.email]
    );

    if (result.rowCount === 0) {
        throw createHttpError(404, '用户不存在');
    }

    res.json({
        success: true,
        settings: (firstNormalizedRow(result) || {}).settings || DEFAULT_USER_SETTINGS
    });
}));

app.put('/api/user/settings', requireRole('user'), asyncHandler(async (req, res) => {
    const { settings } = req.body;

    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
        throw createHttpError(400, '参数不完整');
    }

    const result = await pool.query(
        'UPDATE users SET settings = $1 WHERE id = $2 AND email = $3 RETURNING settings',
        [settings, req.auth.userId, req.auth.email]
    );

    if (result.rowCount === 0) {
        throw createHttpError(404, '用户不存在');
    }

    res.json({
        success: true,
        msg: '设置更新成功',
        settings: (firstNormalizedRow(result) || {}).settings || DEFAULT_USER_SETTINGS
    });
}));

app.get('/api/health', asyncHandler(async (req, res) => {
    const [userCount, uniqueUsernames] = await Promise.all([
        pool.query('SELECT COUNT(*) AS count FROM users'),
        pool.query('SELECT COUNT(DISTINCT username) AS count FROM users')
    ]);

    res.json({
        status: 'OK',
        message: '服务器运行正常',
        database: {
            userCount: Number((firstNormalizedRow(userCount) || {}).count || 0),
            uniqueUsernames: Number((firstNormalizedRow(uniqueUsernames) || {}).count || 0),
            allowDuplicateUsernames: true
        },
        timestamp: new Date().toISOString()
    });
}));

app.post('/api/admin/login', asyncHandler(async (req, res) => {
    const secretKey = trimString(req.body.secretKey);

    if (!secretKey) {
        throw createHttpError(400, '请输入管理员密钥');
    }

    if (secretKey !== ADMIN_SECRET_KEY) {
        throw createHttpError(401, '管理员密钥错误');
    }

    const token = encodeToken(
        {
            role: 'admin',
            username: 'admin'
        },
        ADMIN_TOKEN_TTL_MS
    );

    res.json({
        success: true,
        msg: '管理员登录成功',
        token
    });
}));

app.get('/api/admin/users', requireRole('admin'), asyncHandler(async (req, res) => {
    const result = await pool.query(`
        SELECT
            id,
            username,
            email,
            usage_count,
            last_used,
            registration_date,
            created_at,
            settings
        FROM users
        ORDER BY created_at DESC
    `);

    res.json({
        success: true,
        users: normalizeRows(result.rows),
        count: result.rowCount
    });
}));

app.delete('/api/admin/users/:id', requireRole('admin'), asyncHandler(async (req, res) => {
    const userId = parsePositiveInteger(req.params.id);
    if (!userId) {
        throw createHttpError(400, '无效的用户 ID');
    }

    await withClient(async (client) => {
        const userCheck = await client.query(
            'SELECT id, username, email FROM users WHERE id = $1',
            [userId]
        );

        if (userCheck.rowCount === 0) {
            throw createHttpError(404, '用户不存在');
        }

        const user = firstNormalizedRow(userCheck);
        await client.query('DELETE FROM user_images WHERE user_email = $1', [user.email]);
        await client.query('DELETE FROM users WHERE id = $1', [userId]);
    });

    res.json({
        success: true,
        msg: '用户删除成功'
    });
}));

app.post('/api/admin/users/:id/reset-password', requireRole('admin'), asyncHandler(async (req, res) => {
    const userId = parsePositiveInteger(req.params.id);
    const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';

    if (!userId) {
        throw createHttpError(400, '无效的用户 ID');
    }

    if (!newPassword || newPassword.length < 6) {
        throw createHttpError(400, '新密码不能为空且至少需要 6 个字符');
    }

    const hashedPassword = await hashPassword(newPassword);
    const result = await pool.query(
        'UPDATE users SET password = $1 WHERE id = $2 RETURNING id',
        [hashedPassword, userId]
    );

    if (result.rowCount === 0) {
        throw createHttpError(404, '用户不存在');
    }

    res.json({
        success: true,
        msg: '密码重置成功'
    });
}));

app.get('/api/admin/stats', requireRole('admin'), asyncHandler(async (req, res) => {
    const [userCountResult, usageResult, activeUsersResult, todayUsersResult] = await Promise.all([
        pool.query('SELECT COUNT(*) AS total_users FROM users'),
        pool.query('SELECT COALESCE(SUM(usage_count), 0) AS total_usage FROM users'),
        pool.query(`
            SELECT COUNT(*) AS active_users
            FROM users
            WHERE last_used >= NOW() - INTERVAL '30 days'
        `),
        pool.query(`
            SELECT COUNT(*) AS today_users
            FROM users
            WHERE created_at::date = CURRENT_DATE
        `)
    ]);

    res.json({
        success: true,
        stats: {
            totalUsers: Number((firstNormalizedRow(userCountResult) || {}).total_users || 0),
            totalUsage: Number((firstNormalizedRow(usageResult) || {}).total_usage || 0),
            activeUsers: Number((firstNormalizedRow(activeUsersResult) || {}).active_users || 0),
            todayUsers: Number((firstNormalizedRow(todayUsersResult) || {}).today_users || 0)
        }
    });
}));

app.put('/api/admin/users/:id', requireRole('admin'), asyncHandler(async (req, res) => {
    const userId = parsePositiveInteger(req.params.id);
    const username = trimString(req.body.username);
    const email = normalizeEmail(req.body.email);
    const usageCount = Number.isFinite(Number(req.body.usage_count))
        ? Number(req.body.usage_count)
        : 0;
    const lastUsed = req.body.last_used ? new Date(req.body.last_used) : null;

    if (!userId) {
        throw createHttpError(400, '无效的用户 ID');
    }

    if (!username || !email) {
        throw createHttpError(400, '用户名和邮箱不能为空');
    }

    if (!isValidEmail(email)) {
        throw createHttpError(400, '请输入有效的邮箱地址');
    }

    if (lastUsed && Number.isNaN(lastUsed.getTime())) {
        throw createHttpError(400, '最后使用时间格式错误');
    }

    const result = await pool.query(
        `UPDATE users
         SET username = $1, email = $2, usage_count = $3, last_used = $4
         WHERE id = $5
         RETURNING id`,
        [username, email, Math.max(0, usageCount), lastUsed, userId]
    );

    if (result.rowCount === 0) {
        throw createHttpError(404, '用户不存在');
    }

    res.json({
        success: true,
        msg: '用户信息更新成功'
    });
}));

app.use((err, req, res, next) => {
    if (res.headersSent) {
        next(err);
        return;
    }

    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            res.status(400).json({ success: false, msg: '图片大小不能超过 5MB' });
            return;
        }

        res.status(400).json({ success: false, msg: '上传失败，请检查上传内容' });
        return;
    }

    if (err.code === '23505' && err.constraint === 'users_email_key') {
        res.status(400).json({ success: false, msg: '邮箱已注册，请使用其他邮箱' });
        return;
    }

    const statusCode = err.statusCode || 500;
    const response = {
        success: false,
        msg: err.message || '服务器内部错误'
    };

    if (err.retryAfterSec) {
        response.retryAfterSec = err.retryAfterSec;
        res.setHeader('Retry-After', String(err.retryAfterSec));
    }

    if (err.detail) {
        response.detail = err.detail;
    }

    if (statusCode >= 500) {
        console.error('[server] 请求处理失败:', err);
    }

    res.status(statusCode).json(response);
});

const server = app.listen(PORT, async () => {
    try {
        await initialize();
    } catch (err) {
        console.error('[init] 初始化失败:', err);
    }

    console.log(`[server] 服务运行中: http://localhost:${PORT}`);
    console.log(`[server] 健康检查: http://localhost:${PORT}/api/health`);
});

async function shutdown(signal) {
    console.log(`[server] 收到 ${signal}，开始关闭服务...`);

    server.close(async () => {
        try {
            await pool.end();
        } catch (err) {
            console.error('[server] 关闭数据库连接池失败:', err);
        } finally {
            process.exit(0);
        }
    });
}

process.on('SIGINT', () => {
    shutdown('SIGINT');
});

process.on('SIGTERM', () => {
    shutdown('SIGTERM');
});
