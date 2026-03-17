const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { Pool } = require('pg');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
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
const PASSWORD_PREFIX = 'scrypt';
const DEFAULT_USER_SETTINGS = Object.freeze({ notifications: true, autoSave: true });
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
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

if (!process.env.AUTH_TOKEN_SECRET) {
    console.warn('[auth] AUTH_TOKEN_SECRET 未配置，当前正在使用默认值。');
}

if (!process.env.ADMIN_SECRET_KEY) {
    console.warn('[auth] ADMIN_SECRET_KEY 未配置，当前正在使用默认值。');
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
                usage_count INTEGER DEFAULT 0,
                last_used TIMESTAMP,
                registration_date TIMESTAMP DEFAULT NOW(),
                settings JSONB DEFAULT '{"notifications": true, "autoSave": true}'::jsonb,
                created_at TIMESTAMP DEFAULT NOW()
            )
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

        await client.query('CREATE INDEX IF NOT EXISTS idx_users_username ON users (username)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_users_last_used ON users (last_used)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_user_images_user_email ON user_images (user_email)');
    });

    console.log('[init] 数据库与目录初始化完成');
}

app.post('/api/register', asyncHandler(async (req, res) => {
    const username = trimString(req.body.username);
    const email = normalizeEmail(req.body.email);
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!username || !email || !password) {
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

    const hashedPassword = await hashPassword(password);
    const user = await withClient(async (client) => {
        const existing = await client.query('SELECT 1 FROM users WHERE email = $1', [email]);
        if (existing.rowCount > 0) {
            throw createHttpError(400, '邮箱已注册，请使用其他邮箱');
        }

        const result = await client.query(
            `INSERT INTO users (username, email, password, usage_count, last_used, registration_date)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, username, email, registration_date`,
            [username, email, hashedPassword, 0, null, new Date()]
        );

        return firstNormalizedRow(result);
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

    if (!email) {
        throw createHttpError(400, '请输入邮箱地址');
    }

    if (!isValidEmail(email)) {
        throw createHttpError(400, '请输入有效的邮箱地址');
    }

    const result = await pool.query('SELECT id, username FROM users WHERE email = $1', [email]);

    if (result.rowCount === 0) {
        throw createHttpError(404, '该邮箱未注册');
    }

    const user = firstNormalizedRow(result);
    console.log(`[auth] 已模拟发送密码重置链接: ${email} (${user.username})`);

    res.json({
        success: true,
        msg: '重置链接已发送到您的邮箱，请查收'
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
