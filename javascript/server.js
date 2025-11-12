const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
const PORT = 3000;

// ========== 中间件 ==========
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// ========== 数据库配置（人大金仓） ==========
const pool = new Pool({
    host: 'localhost',
    port: 54321,
    user: 'SYSTEM',
    password: '123456',
    database: 'DACHUANG'
});

// 测试数据库连接并初始化表
(async () => {
    try {
        const client = await pool.connect();
        console.log('✅ 成功连接人大金仓数据库');
        
        // 创建用户表 - 移除用户名的唯一约束，只保留邮箱的唯一约束
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                usage_count INTEGER DEFAULT 0,
                last_used TIMESTAMP,
                registration_date TIMESTAMP DEFAULT NOW(),
                settings JSONB DEFAULT '{"notifications": true, "autoSave": true}',
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // 创建用户图片表
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_images (
                id SERIAL PRIMARY KEY,
                user_email VARCHAR(255) NOT NULL,
                filename VARCHAR(255) NOT NULL,
                image_data BYTEA,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        console.log('✅ 数据库表初始化完成');
        client.release();
    } catch (err) {
        console.error('❌ 数据库连接失败:', err);
    }
})();

// 文件上传配置
const storage = multer.memoryStorage();
const upload = multer({ 
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    }
});

// ========== 用户注册 ==========
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    
    console.log('注册请求:', { username, email, password: '***' });
    
    // 基本验证
    if (!username || !email || !password) {
        return res.status(400).json({ 
            success: false,
            msg: '请填写所有必填字段' 
        });
    }

    if (username.length < 3) {
        return res.status(400).json({
            success: false,
            msg: '用户名至少需要3个字符'
        });
    }

    if (password.length < 6) {
        return res.status(400).json({
            success: false,
            msg: '密码至少需要6个字符'
        });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({
            success: false,
            msg: '请输入有效的邮箱地址'
        });
    }

    try {
        const client = await pool.connect();

        // 只检查邮箱是否已存在（用户名可以重复）
        const emailCheck = await client.query(
            'SELECT email FROM users WHERE email = $1',
            [email]
        );
        
        if (emailCheck.rows.length > 0) {
            client.release();
            return res.status(400).json({
                success: false,
                msg: '邮箱已注册，请使用其他邮箱'
            });
        }

        // 创建新用户 - 用户名可以重复
        const result = await client.query(
            `INSERT INTO users (username, email, password, usage_count, last_used, registration_date) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, username, email, registration_date`,
            [username, email, password, 0, null, new Date()]
        );

        const newUser = result.rows[0];
        client.release();
        
        console.log(`✅ 新用户注册成功: ${username} (${email})`);
        
        res.json({ 
            success: true,
            msg: '注册成功',
            user: {
                id: newUser.id,
                username: newUser.username,
                email: newUser.email,
                registrationDate: newUser.registration_date
            }
        });
    } catch (err) {
        console.error('注册错误:', err);
        
        // 处理唯一约束冲突 - 现在只有邮箱可能冲突
        if (err.code === '23505') { // PostgreSQL 唯一约束违反错误码
            if (err.constraint === 'users_email_key') {
                return res.status(400).json({
                    success: false,
                    msg: '邮箱已注册，请使用其他邮箱'
                });
            }
        }
        
        res.status(500).json({ 
            success: false,
            msg: '注册失败，请稍后重试' 
        });
    }
});

// ========== 用户登录 ==========
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    console.log('登录请求:', { username, password: '***' });
    
    if (!username || !password) {
        return res.status(400).json({
            success: false,
            msg: '请输入用户名/邮箱和密码'
        });
    }

    try {
        const client = await pool.connect();
        
        // 查找用户 - 支持用户名或邮箱登录
        // 由于用户名可以重复，我们需要找到匹配密码的用户
        const result = await client.query(
            `SELECT id, username, email, usage_count, last_used, registration_date, settings 
             FROM users WHERE (username = $1 OR email = $1) AND password = $2`,
            [username, password]
        );
        
        if (result.rows.length === 0) {
            client.release();
            return res.status(401).json({
                success: false,
                msg: '用户名/邮箱或密码错误'
            });
        }

        // 如果有多个用户使用相同的用户名和密码，取第一个
        const user = result.rows[0];
        
        // 更新最后使用时间
        await client.query(
            'UPDATE users SET last_used = NOW() WHERE id = $1',
            [user.id]
        );

        client.release();
        
        console.log(`✅ 用户登录成功: ${user.username} (${user.email})`);
        
        res.json({
            success: true,
            msg: '登录成功',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                usageCount: user.usage_count,
                lastUsed: user.last_used,
                registrationDate: user.registration_date,
                settings: user.settings || { notifications: true, autoSave: true }
            }
        });
    } catch (err) {
        console.error('登录错误:', err);
        res.status(500).json({
            success: false,
            msg: '登录失败，请稍后重试'
        });
    }
});

// ========== 检查邮箱是否已存在 ==========
app.get('/api/check-email', async (req, res) => {
    const { email } = req.query;
    
    if (!email) {
        return res.status(400).json({
            success: false,
            msg: '请输入邮箱'
        });
    }

    try {
        const client = await pool.connect();
        const result = await client.query(
            'SELECT email FROM users WHERE email = $1',
            [email]
        );
        client.release();

        if (result.rows.length > 0) {
            return res.json({ 
                exists: true, 
                msg: '邮箱已注册' 
            });
        }
        
        res.json({ 
            exists: false,
            msg: '邮箱可用'
        });
    } catch (err) {
        console.error('检查邮箱错误:', err);
        res.status(500).json({ 
            success: false,
            msg: '检查失败' 
        });
    }
});

// ========== 获取所有用户（调试用） ==========
app.get('/api/users', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query(
            'SELECT id, username, email, usage_count, last_used, registration_date FROM users ORDER BY created_at DESC'
        );
        client.release();
        
        res.json({
            success: true,
            users: result.rows,
            count: result.rows.length
        });
    } catch (err) {
        console.error('获取用户列表错误:', err);
        res.status(500).json({ success: false, msg: '获取用户列表失败' });
    }
});

// ========== 根据用户名查找用户（调试用） ==========
app.get('/api/users/by-username/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const client = await pool.connect();
        const result = await client.query(
            'SELECT id, username, email, usage_count, last_used, registration_date FROM users WHERE username = $1 ORDER BY created_at DESC',
            [username]
        );
        client.release();
        
        res.json({
            success: true,
            username: username,
            users: result.rows,
            count: result.rows.length
        });
    } catch (err) {
        console.error('根据用户名查找错误:', err);
        res.status(500).json({ success: false, msg: '查找失败' });
    }
});

// ========== 重置密码 ==========
app.post('/api/reset-password', async (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({
            success: false,
            msg: '请输入邮箱地址'
        });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({
            success: false,
            msg: '请输入有效的邮箱地址'
        });
    }

    try {
        const client = await pool.connect();
        
        // 检查邮箱是否存在
        const result = await client.query(
            'SELECT id, username FROM users WHERE email = $1',
            [email]
        );
        
        if (result.rows.length === 0) {
            client.release();
            return res.status(404).json({
                success: false,
                msg: '该邮箱未注册'
            });
        }

        const user = result.rows[0];
        client.release();
        
        // 在实际应用中，这里应该发送重置邮件
        // 现在只是模拟发送
        console.log(`📧 密码重置链接已发送到: ${email} (用户: ${user.username})`);
        
        res.json({
            success: true,
            msg: '重置链接已发送到您的邮箱，请查收'
        });
    } catch (err) {
        console.error('重置密码错误:', err);
        res.status(500).json({
            success: false,
            msg: '发送失败，请稍后重试'
        });
    }
});

// ========== 行人重识别接口（真实识别） ==========
app.post('/api/reid', upload.single('image'), async (req, res) => {
    try {
        const { email } = req.body;
        const file = req.file;
        
        if (!file) return res.status(400).json({ success: false, msg: '请上传图片' });
        if (!email) return res.status(400).json({ success: false, msg: '缺少用户信息' });

        // 临时保存上传图片到本地
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
        const queryPath = path.join(uploadDir, `query_${Date.now()}.jpg`);
        fs.writeFileSync(queryPath, file.buffer);

        // 数据集路径
        const cropsDir = path.join(__dirname, 'dataset/crops');
        const outputDir = path.join(__dirname, 'dataset/output');
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

        // 调用 Python 脚本 - 添加缓冲区限制
        const py = spawn('python', [
            path.join(__dirname, 'reid_infer.py'),
            queryPath,
            cropsDir,
            outputDir
        ], {
            stdio: ['pipe', 'pipe', 'pipe'], // 明确指定 stdio
            maxBuffer: 1024 * 1024 * 10 // 10MB 缓冲区限制
        });

        let resultData = '';
        let errorData = '';

        py.stdout.on('data', (data) => {
            // 只收集前 100KB 数据，避免内存溢出
            if (resultData.length < 1024 * 100) {
                resultData += data.toString();
            }
        });
        
        py.stderr.on('data', (data) => {
            errorData += data.toString();
            console.error('Python错误:', data.toString());
        });
        
        py.on('close', (code) => {
            // 清理临时文件
            try {
                if (fs.existsSync(queryPath)) {
                    fs.unlinkSync(queryPath);
                }
            } catch (e) {
                console.log('清理临时文件失败:', e);
            }

            if (code !== 0) {
                console.error('Python进程退出代码:', code);
                console.error('Python错误详情:', errorData);
                return res.status(500).json({ 
                    success: false, 
                    msg: '识别失败：Python脚本执行错误',
                    error: errorData.substring(0, 500) // 只返回前500字符
                });
            }

            try {
                // 清理 resultData，只保留最后一个有效 JSON
                const lines = resultData.split('\n').filter(line => line.trim());
                let lastValidJson = '';
                
                for (let i = lines.length - 1; i >= 0; i--) {
                    try {
                        JSON.parse(lines[i]);
                        lastValidJson = lines[i];
                        break;
                    } catch (e) {
                        // 继续寻找有效的 JSON
                    }
                }

                if (!lastValidJson) {
                    throw new Error('未找到有效的JSON输出');
                }

                const result = JSON.parse(lastValidJson.trim());
                if (!result) {
                    return res.status(404).json({ 
                        success: false, 
                        msg: '未找到匹配图片' 
                    });
                }

                // 计算相似度
                const similarity = (1 / (1 + result.distance)).toFixed(3);

                // 返回前端
                res.json({
                    success: true,
                    msg: '识别完成',
                    match: {
                        filename: result.filename,
                        distance: result.distance,
                        similarity: similarity,
                        imageUrl: `/api/result-image/${result.filename}`
                    }
                });
            } catch (e) {
                console.error('解析Python输出失败:', e);
                console.error('原始输出:', resultData.substring(0, 1000));
                res.status(500).json({ 
                    success: false, 
                    msg: '解析Python结果失败',
                    debug: resultData.substring(0, 500) 
                });
            }
        });

    } catch (err) {
        console.error('识别错误:', err);
        res.status(500).json({ success: false, msg: '识别失败，请稍后重试' });
    }
});

// 静态路由返回识别结果图片
app.get('/api/result-image/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'dataset/output', req.params.filename);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).json({ success: false, msg: '图片不存在' });
    }
});

// ========== 获取图片接口 ==========
app.get('/api/image/:id', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query(
            'SELECT image_data, filename FROM user_images WHERE id = $1',
            [req.params.id]
        );
        client.release();

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                msg: '图片不存在' 
            });
        }

        const { image_data, filename } = result.rows[0];
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.send(image_data);
    } catch (err) {
        console.error('获取图片失败:', err);
        res.status(500).json({ 
            success: false,
            msg: '获取图片失败' 
        });
    }
});

// ========== 获取用户设置 ==========
app.get('/api/user/settings', async (req, res) => {
    try {
        const { email } = req.query;
        
        if (!email) {
            return res.status(400).json({
                success: false,
                msg: '用户信息缺失'
            });
        }

        const client = await pool.connect();
        const result = await client.query(
            'SELECT settings FROM users WHERE email = $1',
            [email]
        );
        client.release();

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                msg: '用户不存在'
            });
        }

        res.json({
            success: true,
            settings: result.rows[0].settings || { notifications: true, autoSave: true }
        });
    } catch (err) {
        console.error('获取用户设置错误:', err);
        res.status(500).json({
            success: false,
            msg: '获取设置失败'
        });
    }
});

// ========== 更新用户设置 ==========
app.put('/api/user/settings', async (req, res) => {
    try {
        const { email, settings } = req.body;
        
        if (!email || !settings) {
            return res.status(400).json({
                success: false,
                msg: '参数不完整'
            });
        }

        const client = await pool.connect();
        await client.query(
            'UPDATE users SET settings = $1 WHERE email = $2',
            [settings, email]
        );
        client.release();

        res.json({
            success: true,
            msg: '设置更新成功'
        });
    } catch (err) {
        console.error('更新用户设置错误:', err);
        res.status(500).json({
            success: false,
            msg: '更新设置失败'
        });
    }
});

// ========== 健康检查和数据库状态 ==========
app.get('/api/health', async (req, res) => {
    try {
        const client = await pool.connect();
        const userCount = await client.query('SELECT COUNT(*) as count FROM users');
        const uniqueUsernames = await client.query('SELECT COUNT(DISTINCT username) as count FROM users');
        client.release();

        res.json({ 
            status: 'OK', 
            message: '服务器运行正常',
            database: {
                userCount: parseInt(userCount.rows[0].count),
                uniqueUsernames: parseInt(uniqueUsernames.rows[0].count),
                allowDuplicateUsernames: true
            },
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({
            status: 'ERROR',
            message: '数据库连接失败',
            error: err.message
        });
    }
});

// ========== 启动服务器 ==========
app.listen(PORT, () => {
    console.log(`🌐 服务器运行中：http://localhost:${PORT}`);
    console.log(`📊 健康检查：http://localhost:${PORT}/api/health`);
    console.log(`👥 用户列表：http://localhost:${PORT}/api/users`);

});