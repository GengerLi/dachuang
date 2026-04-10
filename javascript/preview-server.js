const http = require('http');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

const PORT = Number(process.env.PREVIEW_PORT || 4180);
const ROOT_DIR = path.resolve(__dirname, '..');
const HTML_DIR = path.join(ROOT_DIR, 'html');
const CSS_DIR = path.join(ROOT_DIR, 'css');
const JS_DIR = __dirname;

const MIME_TYPES = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp'
};

function resolveRequestPath(urlPath) {
    if (urlPath === '/' || urlPath === '/index.html' || urlPath === '/xr.html') {
        return path.join(HTML_DIR, 'xr.html');
    }

    if (urlPath === '/admin' || urlPath === '/admin.html') {
        return path.join(HTML_DIR, 'admin.html');
    }

    if (urlPath.startsWith('/css/')) {
        return path.join(CSS_DIR, urlPath.slice('/css/'.length));
    }

    if (urlPath.startsWith('/html/')) {
        return path.join(HTML_DIR, urlPath.slice('/html/'.length));
    }

    if (urlPath.startsWith('/javascript/')) {
        return path.join(JS_DIR, urlPath.slice('/javascript/'.length));
    }

    return null;
}

function isInside(parentDir, filePath) {
    const relative = path.relative(parentDir, filePath);
    return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function sendFile(res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const content = await fsp.readFile(filePath);

    res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store'
    });
    res.end(content);
}

const server = http.createServer(async (req, res) => {
    try {
        const requestUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
        const filePath = resolveRequestPath(requestUrl.pathname);

        if (!filePath) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not Found');
            return;
        }

        if (
            (requestUrl.pathname.startsWith('/css/') && !isInside(CSS_DIR, filePath))
            || (requestUrl.pathname.startsWith('/html/') && !isInside(HTML_DIR, filePath))
            || (requestUrl.pathname.startsWith('/javascript/') && !isInside(JS_DIR, filePath))
        ) {
            res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Forbidden');
            return;
        }

        await sendFile(res, filePath);
    } catch (error) {
        const statusCode = error.code === 'ENOENT' ? 404 : 500;
        res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(statusCode === 404 ? 'Not Found' : 'Internal Server Error');
    }
});

server.listen(PORT, () => {
    console.log(`[preview] 本地预览服务已启动: http://127.0.0.1:${PORT}/?preview=1#/home`);
});
