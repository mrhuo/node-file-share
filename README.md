# node-file-share - 文件共享平台

简单的文件分享服务，直接上传，直接下载，支持 JSON 文件存储（默认，无需编译）和 SQLite 存储两种模式。

基于 Node.js，运行在 Linux 平台，支持后台运行。

## 功能特性

- ✨ **直接上传**：无需先生成上传链接，POST 文件直接返回下载链接
- 💾 **可选存储**：默认 JSON 文件存储（无需编译，零依赖），可选 SQLite
- 💻 **上传记录**：记录文件类型、原名称、文件大小、上传时间、上传 IP
- 📊 **下载统计**：记录下载次数、每次下载的 IP 和 User-Agent
- 📋 **文件列表**：API 获取所有上传文件列表
- 🚀 **后台运行**：支持 daemon 模式后台运行
- 🔒 **安全简单**：无复杂功能，简单易用

## 安装

### 环境要求

- Node.js >= 14

### 使用 JSON 存储（推荐，无需编译，零依赖问题）

默认使用 JSON 存储，只需要安装核心依赖：

```bash
git clone https://github.com/mrhuo/node-file-share.git
cd node-file-share
npm install
```

> JSON 存储完全使用 Node.js 原生功能，不需要编译任何原生模块，任何环境都能一次安装成功。

### 使用 SQLite 存储（需要编译）

如果你想用 SQLite，CentOS 7 需要先升级 GCC：

```bash
# CentOS 7 需要升级 GCC
yum install -y centos-release-scl
yum install -y devtoolset-9-gcc devtoolset-9-gcc-c++ make
source /opt/rh/devtoolset-9/enable

# 然后安装
npm install
```

## 使用方法

### 启动服务

前台运行（调试用），默认 JSON 存储：

```bash
node index.js start --port 3000 --host 0.0.0.0
```

后台运行（生产环境）：

```bash
node index.js start --port 3000 --host 0.0.0.0 --base-url "http://your-domain.com" --daemon
```

使用 SQLite 存储：

```bash
node index.js start --port 3000 --storage sqlite --daemon
```

查看状态：

```bash
node index.js status
```

停止服务：

```bash
node index.js stop
```

### CLI 参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `-p, --port` | 监听端口 | 3000 |
| `-h, --host` | 绑定地址 | 0.0.0.0 |
| `-b, --base-url` | 下载链接的基础URL (比如你的域名) | `http://host:port` |
| `-d, --upload-dir` | 文件存储目录 | `./uploads` |
| `--db-path` | 数据库文件路径 | `./data/files.json` (JSON), `./data/files.db` (SQLite) |
| `-s, --storage` | 存储类型: `json` 或 `sqlite` | `json` |
| `--daemon` | 后台运行 | false |

## API 文档

### 1. 上传文件

**端点**: `POST /api/upload`

**要求**: `multipart/form-data`，文件字段名为 `file`

**响应示例**:
```json
{
  "success": true,
  "message": "File uploaded successfully",
  "file_token": "uuid-download-token",
  "original_name": "example.jpg",
  "file_size": 1234567,
  "file_size_human": "1.18 MB",
  "file_type": "jpg",
  "content_type": "image/jpeg",
  "download_url": "http://your-domain.com/api/download/uuid-download-token",
  "info_url": "http://your-domain.com/api/info/uuid-download-token"
}
```

### 2. 下载文件

**端点**: `GET /api/download/:fileToken`

直接访问该链接即可下载文件，浏览器会自动触发下载。每次下载都会：
- 下载计数 +1
- 记录下载 IP 和 User-Agent

### 3. 获取文件信息

**端点**: `GET /api/info/:fileToken`

**响应示例**:
```json
{
  "success": true,
  "file_token": "uuid-download-token",
  "original_name": "example.jpg",
  "file_size": 1234567,
  "file_size_human": "1.18 MB",
  "file_type": "jpg",
  "download_count": 42,
  "upload_time": 1234567890000,
  "upload_time_human": "2024-01-01 12:00:00",
  "upload_ip": "192.168.1.100",
  "download_url": "http://your-domain.com/api/download/uuid-download-token"
}
```

### 4. 列出所有文件

**端点**: `GET /api/list`

**响应示例**:
```json
{
  "success": true,
  "total": 10,
  "files": [
    {
      "file_token": "uuid-download-token",
      "original_name": "example.jpg",
      "file_size": 1234567,
      "file_size_human": "1.18 MB",
      "file_type": "jpg",
      "download_count": 42,
      "upload_time": 1234567890000,
      "upload_time_human": "2024-01-01 12:00:00",
      "download_url": "http://your-domain.com/api/download/uuid-download-token"
    }
  ]
}
```

文件按上传时间倒序排列，最新的在前面。

### 5. 健康检查

**端点**: `GET /health`

## 使用示例

### 使用 curl 上传

```bash
# 直接上传文件
curl -X POST -F "file=@/path/to/your/file.jpg" http://your-server:3000/api/upload
```

返回下载链接，直接分享给别人即可下载。

### 使用 PowerShell 上传 (Windows)

```powershell
$filePath = "C:\path\to\your\file.jpg"
$uri = "http://your-server:3000/api/upload"
$multipartContent = [System.Net.Http.MultipartFormDataContent]::new()
$fileStream = [System.IO.FileStream]::new($filePath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read)
$fileContent = [System.Net.Http.StreamContent]::new($fileStream)
$multipartContent.Add($fileContent, "file", (Split-Path $filePath -Leaf))
$response = Invoke-RestMethod -Method Post -Uri $uri -Body $multipartContent
$response.download_url
```

## 文件结构

```
node-file-share/
├── index.js              # CLI 入口 (可执行)
├── app.js                # Express 应用主文件
├── database.js           # SQLite 数据库操作
├── database-json.js      # JSON 文件数据库操作
├── package.json          # 依赖配置
├── README.md             # 说明文档
├── start.sh              # 快捷启动脚本
├── stop.sh               # 快捷停止脚本
├── uploads/              # 上传文件存储目录 (自动创建)
├── data/                 # 数据库目录 (自动创建)
│   └── files.json        # JSON 数据库 (默认)
└── logs/                 # 后台运行日志目录 (自动创建)
    ├── file-share.log
    └── file-share.error.log
```

## 存储格式

### JSON 存储 (files.json)

```json
{
  "files": [
    {
      "id": 1,
      "file_token": "uuid",
      "original_name": "example.jpg",
      "stored_path": "/path/to/upload/uuid.jpg",
      "file_size": 123456,
      "file_type": "jpg",
      "upload_time": 1234567890000,
      "download_count": 0,
      "upload_ip": "192.168.1.1"
    }
  ],
  "downloadLogs": [
    {
      "id": 1,
      "file_token": "uuid",
      "download_time": 1234567890000,
      "ip_address": "192.168.1.100",
      "user_agent": "Mozilla/5.0..."
    }
  ]
}
```

### SQLite 数据库表结构 和 JSON 存储结构一致：

- `files` - 文件记录表
- `download_logs` - 下载日志表

## 最大文件大小

当前限制：**100 MB**，可以在 `app.js` 中修改：

```javascript
this.upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024  // 修改这里，单位字节
  }
});
```

## 设置开机自启 (systemd)

创建 `/etc/systemd/system/node-file-share.service`：

```ini
[Unit]
Description=Node File Share Platform
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/node-file-share
ExecStart=/usr/bin/node /path/to/node-file-share/index.js start --port 3000 --host 0.0.0.0 --base-url http://your-domain.com --storage json
Restart=always

[Install]
WantedBy=multi-user.target
```

启用并启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable node-file-share
sudo systemctl start node-file-share
```

## 快捷脚本

启动：
```bash
./start.sh 3000 0.0.0.0 http://your-domain.com
```

停止：
```bash
./stop.sh
```

## License

MIT
