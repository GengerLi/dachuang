# Ubuntu 22.04 部署文档

本文档用于指导你把当前项目部署到 Ubuntu 22.04 服务器，并通过公网 IP 直接访问，不依赖域名。

这个项目不是纯静态网站，运行时需要以下组件同时工作：

- Node.js 服务，入口文件为 `javascript/server.js`
- PostgreSQL 数据库
- Python 推理环境，`/api/reid` 会调用 `javascript/reid_infer.py`
- 模型文件和图库目录

推荐上线架构如下：

- Nginx 对外监听 `80` 端口
- Nginx 反向代理到 `127.0.0.1:3000`
- Node.js 作为 `systemd` 服务常驻运行
- PostgreSQL 在本机运行
- Python 使用项目内的虚拟环境

## 1. 部署完成后的访问目标

部署成功后，下面这些地址应该可以访问：

- 首页：`http://你的服务器公网IP/`
- 管理页：`http://你的服务器公网IP/admin`
- 健康检查：`http://你的服务器公网IP/api/health`

在服务器本机上调试时，也可以访问：

- `http://127.0.0.1:3000/`
- `http://127.0.0.1:3000/api/health`

## 2. 服务器配置建议

最低建议：

- Ubuntu 22.04 LTS
- 2 核 CPU
- 4 GB 内存
- 20 GB 可用磁盘

更稳妥的建议：

- 4 核 CPU
- 8 GB 内存
- 40 GB 以上磁盘

说明：

- 该项目可以使用 CPU 部署
- 如果服务器带 NVIDIA 显卡，请安装对应 CUDA 版本的 PyTorch，而不是下面文档里的 CPU 版
- 人员重识别速度和 `javascript/dataset/crops/` 中的图片数量、服务器性能直接相关

## 3. 必须上传到服务器的文件

下面这些目录和文件必须存在：

- `html/`
- `css/`
- `javascript/server.js`
- `javascript/app.js`
- `javascript/admin.js`
- `javascript/package.json`
- `javascript/package-lock.json`
- `javascript/reid_infer.py`
- `javascript/models/`
- `javascript/util/`
- `javascript/aligned/`
- `javascript/log/market1501/alignedreid/checkpoint_ep300.pth.tar`
- `javascript/dataset/crops/`

说明：

- `javascript/log/market1501/alignedreid/checkpoint_ep300.pth.tar` 是推理模型文件
- `javascript/dataset/crops/` 是待检索图库
- `javascript/uploads/` 和 `javascript/dataset/output/` 可以由程序自动创建，但提前存在也没有问题

## 4. 需要开放的端口

如果你的服务器在云平台后面，请在安全组或防火墙中放行：

- `22/tcp`，用于 SSH
- `80/tcp`，用于网页访问

可选：

- `3000/tcp`，仅在你想临时从外网直接访问 Node 服务调试时开放

如果你使用 Ubuntu 自带的 UFW，也至少要允许：

- `OpenSSH`
- `80/tcp`

## 5. 从 Windows 上传项目到 Ubuntu

推荐部署目录：

```bash
/var/www/chongshibie
```

你可以用以下两种方式之一上传。

方式一：在 Windows PowerShell 或 CMD 中使用 `scp`

```powershell
scp -r E:\chongshibie ubuntu@你的服务器IP:/var/www/
```

方式二：使用 WinSCP

- 连接到你的服务器 IP
- 把整个 `chongshibie` 文件夹上传到 `/var/www/`

上传完成后，项目应位于：

```bash
/var/www/chongshibie
```

## 6. 安装系统依赖

登录 Ubuntu 后执行：

```bash
sudo apt update
sudo apt install -y curl ca-certificates nginx postgresql postgresql-contrib \
  python3 python3-venv python3-pip build-essential libgl1 libglib2.0-0
```

安装 Node.js 20 LTS：

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

验证安装结果：

```bash
node -v
npm -v
python3 --version
psql --version
nginx -v
```

## 7. 调整项目权限

推荐使用 `www-data` 作为运行用户：

```bash
sudo chown -R www-data:www-data /var/www/chongshibie
sudo find /var/www/chongshibie -type d -exec chmod 755 {} \;
sudo find /var/www/chongshibie -type f -exec chmod 644 {} \;
```

## 8. 配置 PostgreSQL

启动 PostgreSQL 并设置开机自启：

```bash
sudo systemctl enable --now postgresql
sudo systemctl status postgresql
```

进入 PostgreSQL：

```bash
sudo -u postgres psql
```

创建数据库和用户：

```sql
CREATE DATABASE dachuang;
CREATE USER dachuang_user WITH PASSWORD '请替换成强密码';
GRANT ALL PRIVILEGES ON DATABASE dachuang TO dachuang_user;
\q
```

说明：

- 应用启动时会自动创建 `users` 和 `user_images` 表
- 应用不会自动创建 PostgreSQL 数据库本身
- 代码里默认 `DB_PORT` 是 `54321`，但 Ubuntu 上 PostgreSQL 通常是 `5432`，所以你必须在 `.env` 中显式写成 `5432`

## 9. 安装 Node 依赖

进入服务目录：

```bash
cd /var/www/chongshibie/javascript
```

安装依赖：

```bash
sudo -u www-data npm ci
```

如果 `npm ci` 因锁文件问题失败，可以改用：

```bash
sudo -u www-data npm install
```

## 10. 创建 Python 虚拟环境

仍然在 `javascript` 目录下执行：

```bash
cd /var/www/chongshibie/javascript
sudo -u www-data python3 -m venv .venv
```

激活虚拟环境：

```bash
source /var/www/chongshibie/javascript/.venv/bin/activate
python -m pip install --upgrade pip
```

## 11. 安装 Python 依赖

如果你的服务器只使用 CPU，执行：

```bash
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install numpy scipy scikit-learn pillow matplotlib opencv-python ipython h5py
```

如果服务器有 NVIDIA GPU：

- 不要使用上面的 CPU 版 PyTorch 安装命令
- 改为使用 PyTorch 官网对应 CUDA 版本的安装方式

快速验证：

```bash
python - <<'PY'
import torch
import cv2
import sklearn
import scipy
from PIL import Image
print("torch:", torch.__version__)
print("cuda:", torch.cuda.is_available())
print("opencv:", cv2.__version__)
PY
```

## 12. 创建运行环境变量文件

服务会自动读取：

```bash
/var/www/chongshibie/javascript/.env
```

可以从示例文件复制：

```bash
cd /var/www/chongshibie/javascript
sudo -u www-data cp .env.example .env
sudo -u www-data nano .env
```

推荐内容如下：

```env
PORT=3000
PYTHON_BIN=/var/www/chongshibie/javascript/.venv/bin/python
REID_TIMEOUT_MS=120000
MAX_PYTHON_OUTPUT_BYTES=262144

AUTH_TOKEN_SECRET=换成足够长的随机字符串
ADMIN_SECRET_KEY=换成管理员密钥

DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=dachuang_user
DB_PASSWORD=你的数据库密码
DB_NAME=dachuang
DB_POOL_MAX=10
DB_IDLE_TIMEOUT_MS=30000
DB_CONNECT_TIMEOUT_MS=5000
```

必须注意：

- `AUTH_TOKEN_SECRET` 不能继续使用代码里的默认值
- `ADMIN_SECRET_KEY` 不能继续使用代码里的默认值
- `PYTHON_BIN` 应该明确指向 `.venv` 里的 Python

## 13. 检查模型文件和图库目录

执行：

```bash
ls -lah /var/www/chongshibie/javascript/log/market1501/alignedreid/checkpoint_ep300.pth.tar
ls -lah /var/www/chongshibie/javascript/dataset/crops | head
```

如果模型文件或图库缺失，`/api/reid` 将无法正常工作。

## 14. 首次手动启动测试

在配置 `systemd` 之前，先手动试跑一次。

执行：

```bash
cd /var/www/chongshibie/javascript
sudo -u www-data npm start
```

再开一个终端测试：

```bash
curl http://127.0.0.1:3000/api/health
```

理想结果：

- 能返回 JSON
- 没有 `MODULE_NOT_FOUND`
- 没有数据库认证失败
- 没有 Python 路径错误

如果要结束手动启动的前台进程：

- 按 `Ctrl + C`

## 15. 配置 systemd 常驻运行

创建服务文件：

```bash
sudo nano /etc/systemd/system/chongshibie.service
```

写入：

```ini
[Unit]
Description=Chongshibie Node Service
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/chongshibie/javascript
EnvironmentFile=/var/www/chongshibie/javascript/.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
```

启用并启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now chongshibie
sudo systemctl status chongshibie
```

查看实时日志：

```bash
journalctl -u chongshibie -f
```

## 16. 验证 Node 服务

执行：

```bash
curl http://127.0.0.1:3000/api/health
ss -ltnp | grep 3000
```

预期：

- `3000` 端口处于监听状态
- `/api/health` 可以正常返回 JSON

## 17. 配置 Nginx 以公网 IP 访问

创建 Nginx 站点配置：

```bash
sudo nano /etc/nginx/sites-available/chongshibie
```

写入：

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用配置：

```bash
sudo ln -sf /etc/nginx/sites-available/chongshibie /etc/nginx/sites-enabled/chongshibie
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

## 18. 配置 UFW 防火墙

如果你使用 UFW，执行：

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw enable
sudo ufw status
```

如果你还想临时从外网直接访问 `3000` 调试：

```bash
sudo ufw allow 3000/tcp
```

正式环境更推荐只开放 `80`，由 Nginx 转发到 `3000`。

## 19. 最终访问测试

使用你的公网 IP 测试：

- `http://你的服务器公网IP/`
- `http://你的服务器公网IP/admin`
- `http://你的服务器公网IP/api/health`

预期：

- 首页能打开
- 管理页能打开
- 用户注册和登录可用
- 管理员密钥登录可用
- 上传图片后能正常请求 `/api/reid`

## 20. 推荐检查清单

按顺序执行：

```bash
systemctl status postgresql
systemctl status chongshibie
systemctl status nginx
curl http://127.0.0.1:3000/api/health
curl http://127.0.0.1/api/health
```

浏览器检查：

- 打开 `/`
- 打开 `/admin`
- 注册一个新用户
- 使用新用户登录
- 上传一张图片
- 检查是否返回匹配结果

## 21. 后续更新部署流程

发布新版本时，建议这样做：

```bash
cd /var/www/chongshibie/javascript
sudo systemctl stop chongshibie
```

上传新文件后执行：

```bash
cd /var/www/chongshibie/javascript
sudo -u www-data npm ci
source /var/www/chongshibie/javascript/.venv/bin/activate
python -m pip install --upgrade pip
sudo systemctl start chongshibie
sudo systemctl status chongshibie
```

如果 Python 依赖有变化，需要在 `.venv` 里重新安装。

## 22. 备份建议

至少备份以下内容：

- `/var/www/chongshibie/javascript/.env`
- PostgreSQL 数据库 `dachuang`
- `javascript/dataset/crops/`
- `javascript/log/market1501/alignedreid/checkpoint_ep300.pth.tar`

数据库备份示例：

```bash
pg_dump -U dachuang_user -h 127.0.0.1 dachuang > dachuang.sql
```

## 23. 常见问题与处理方法

### 1. `Cannot find module 'dotenv'`

原因：

- 没有安装 Node 依赖

处理：

```bash
cd /var/www/chongshibie/javascript
sudo -u www-data npm ci
```

### 2. `password authentication failed for user`

原因：

- `.env` 中的数据库账号或密码错误

处理：

- 检查 `DB_USER`
- 检查 `DB_PASSWORD`
- 检查数据库用户是否对 `dachuang` 库有权限

### 3. `/api/reid` 一调用就失败

原因通常有以下几种：

- `PYTHON_BIN` 写错了
- Python 依赖没有装全
- 模型文件缺失
- `dataset/crops/` 缺失

排查：

```bash
cat /var/www/chongshibie/javascript/.env
ls -lah /var/www/chongshibie/javascript/log/market1501/alignedreid/checkpoint_ep300.pth.tar
ls /var/www/chongshibie/javascript/dataset/crops | head
```

### 4. 服务器本机能访问 `127.0.0.1:3000`，但外部打不开公网 IP

原因：

- 云平台安全组没放行 `80`
- UFW 没放行 `80`
- Nginx 没启动

排查：

```bash
sudo ufw status
sudo systemctl status nginx
sudo nginx -t
```

同时也要检查云平台控制台里的安全组或防火墙规则。

### 5. 日志里显示 `http://localhost:3000`

原因：

- 这只是服务自身打印的本地调试地址

含义：

- 不代表外部用户必须访问 `localhost`
- 正常公网访问应该通过 `http://你的服务器公网IP/`

### 6. `3000` 端口被占用

查找占用进程：

```bash
sudo ss -ltnp | grep 3000
```

如果是旧服务未退出，可以执行：

```bash
sudo systemctl stop chongshibie
```

## 24. 这个项目的特别说明

- 前端接口现在已经改为同源请求，因此直接使用公网 IP 部署是可行的
- 后端会直接提供 `html/`、`css/`、`javascript/app.js`、`javascript/admin.js`
- 后端会自动建表，但不会自动创建 PostgreSQL 数据库本身
- 用户上传的查询图片会临时保存到 `javascript/uploads/`
- 匹配结果图会从 `javascript/dataset/output/` 提供给前端

## 25. 快速命令汇总

如果你只想快速照着跑，下面是压缩版顺序：

```bash
sudo apt update
sudo apt install -y curl ca-certificates nginx postgresql postgresql-contrib python3 python3-venv python3-pip build-essential libgl1 libglib2.0-0
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo systemctl enable --now postgresql
sudo -u postgres psql -c "CREATE DATABASE dachuang;"
sudo -u postgres psql -c "CREATE USER dachuang_user WITH PASSWORD '请改成强密码';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE dachuang TO dachuang_user;"
sudo chown -R www-data:www-data /var/www/chongshibie
cd /var/www/chongshibie/javascript
sudo -u www-data npm ci
sudo -u www-data python3 -m venv .venv
source /var/www/chongshibie/javascript/.venv/bin/activate
pip install --upgrade pip
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install numpy scipy scikit-learn pillow matplotlib opencv-python ipython h5py
sudo -u www-data cp .env.example .env
sudo -u www-data nano .env
sudo nano /etc/systemd/system/chongshibie.service
sudo systemctl daemon-reload
sudo systemctl enable --now chongshibie
sudo nano /etc/nginx/sites-available/chongshibie
sudo ln -sf /etc/nginx/sites-available/chongshibie /etc/nginx/sites-enabled/chongshibie
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw enable
```

## 26. 如果出错，建议把这些信息发回来

如果部署中遇到问题，发下面这些输出最容易定位：

```bash
systemctl status chongshibie --no-pager
journalctl -u chongshibie -n 100 --no-pager
systemctl status nginx --no-pager
systemctl status postgresql --no-pager
curl http://127.0.0.1:3000/api/health
cat /var/www/chongshibie/javascript/.env
```

注意：

- 发日志时请把真实密码和密钥替换掉
- `AUTH_TOKEN_SECRET`、`ADMIN_SECRET_KEY`、数据库密码不要原样公开
