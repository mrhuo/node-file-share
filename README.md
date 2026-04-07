# 文件共享平台 File Share Platform

基于 Node.js + SQLite 的命令行文件共享平台，可以在 Linux 后台运行，支持生成不同平台的上传代码，记录下载次数和IP。

## 功能特性

- ✨ **两个核心 API**: 生成上传链接 + 文件下载
- ⏱️ **上传链接超时**: 默认 5 分钟未上传自动失效，上传后链接立即失效
- 💻 **多平台上传代码**: 根据平台生成 curl (Linux/macOS) 或 PowerShell (Windows) 代码
- 📊 **下载统计**: 记录下载次数、下载IP、User-Agent
- 🚀 **后台运行**: 支持 daemon 模式后台运行
- 🗄️ **SQLite 数据库**: 无需额外数据库服务，单文件存储
- 🔒 **安全机制**: 上传链接一次性使用，过期自动清理

## 安装

### 环境要求

- Node.js >= 14
- 如果是 CentOS 7，需要升级 GCC 才能编译 sqlite3：

```bash
# 升级 GCC（CentOS 7 需要）
yum install -y centos-release-scl
yum install -y devtoolset-9-gcc devtoolset-9-gcc-c++
scl enable devtoolset-9 bash

# 然后再安装依赖
source /opt/rh/devtoolset-9/enable
npm install
```

```bash
# 克隆项目
git clone https://github.com/mrhuo/node-file-share.git
cd node-file-share

# 安装依赖
npm install
```

## 使用方法

### 启动服务

前台运行（调试用）：
```bash
node index.js start --port 3000 --host 0.0.0.0
```

后台运行（生产环境）：
```bash
node index.js start --port 3000 --host 0.0.0.0 --base-url "http://your-domain.com" --daemon
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
| `--db-path` | SQLite 数据库路径 | `./data/files.db` |
| `-e, --expiration` | 上传链接过期时间(分钟) | 5 |
| `--daemon` | 后台运行 | false |

## API 文档

### 1. 生成上传链接

**端点**: `POST /api/generate-upload`

**请求体**:
```json
{
  "platform": "linux"  // 可选: linux, macos, windows
}
```

**响应示例**:
```json
{
  "success": true,
  "upload_token": "uuid-token",
  "upload_url": "http://your-domain.com/api/upload/uuid-token",
  "upload_code": "# For Linux/macOS\ncurl -X POST -F \"file=@/path/to/your/file\" \"http://your-domain.com/api/upload/uuid-token\"",
  "expires_at": 1234567890000,
  "expires_at_human": "2024-01-01 12:00:00"
}
```

### 2. 上传文件

使用生成好的上传代码直接执行即可。

**端点**: `POST /api/upload/:token`

**响应示例**:
```json
{
  "success": true,
  "message": "File uploaded successfully",
  "file_token": "download-uuid",
  "original_name": "example.jpg",
  "file_size": 1234567,
  "file_size_human": "1.18 MB",
  "download_url": "http://your-domain.com/api/download/download-uuid",
  "info_url": "http://your-domain.com/api/info/download-uuid"
}
```

### 3. 下载文件

**端点**: `GET /api/download/:fileToken`

直接访问该链接即可下载文件，浏览器会自动触发下载。每次下载都会记录：
- 下载次数 +1
- 下载 IP 地址
- User-Agent

### 4. 获取文件信息

**端点**: `GET /api/info/:fileToken`

**响应示例**:
```json
{
  "success": true,
  "file_token": "download-uuid",
  "original_name": "example.jpg",
  "file_size": 1234567,
  "file_size_human": "1.18 MB",
  "download_count": 42,
  "upload_time": 1234567890000,
  "upload_time_human": "2024-01-01 12:00:00",
  "download_url": "http://your-domain.com/api/download/download-uuid"
}
```

### 5. 健康检查

**端点**: `GET /health`

## 使用示例

### 示例 1: 命令行生成上传链接

```bash
# 1. 启动服务
node index.js start --port 8080 --base-url "http://192.168.1.100:8080" --daemon

# 2. 生成 Linux 上传链接
curl -X POST -H "Content-Type: application/json" -d '{"platform":"linux"}' http://localhost:8080/api/generate-upload
```

返回结果：
```
{
  "success": true,
  "upload_token": "a1b2c3...",
  "upload_url": "http://192.168.1.100:8080/api/upload/a1b2c3...",
  "upload_code": "# For Linux/macOS\ncurl -X POST -F \"file=@/path/to/your/file\" \"http://192.168.1.100:8080/api/upload/a1b2c3...\"",
  "expires_at_human": "2024-04-07 14:00:00"
}
```

### 示例 2: 用户上传

用户拿到 `upload_code` 后直接执行：

```bash
# 用户在自己的 Linux/macOS 上执行
curl -X POST -F "file=@/home/user/document.pdf" "http://192.168.1.100:8080/api/upload/a1b2c3..."
```

上传完成后返回：
```
{
  "success": true,
  "message": "File uploaded successfully",
  "file_token": "xyz789...",
  "original_name": "document.pdf",
  "file_size_human": "2.34 MB",
  "download_url": "http://192.168.1.100:8080/api/download/xyz789..."
}
```

### 示例 3: Windows 用户上传

生成上传链接时指定 platform 为 windows：

```bash
curl -X POST -H "Content-Type: application/json" -d '{"platform":"windows"}' http://localhost:8080/api/generate-upload
```

生成的 PowerShell 代码：
```powershell
# For Windows PowerShell
$filePath = "C:\path\to\your\file"
$url = "http://192.168.1.100:8080/api/upload/a1b2c3..."
Invoke-RestMethod -Method Post -Uri $url -InFile $filePath -ContentType "multipart/form-data"
```

## 文件结构

```
file-share-platform/
├── index.js          # CLI 入口
├── app.js            # Express 应用主文件
├── database.js       # SQLite 数据库操作
├── package.json      # 依赖配置
├── README.md         # 说明文档
├── uploads/          # 上传文件存储目录 (自动创建)
├── data/             # 数据库目录 (自动创建)
│   └── files.db      # SQLite 数据库
└── logs/             # 后台运行日志目录 (自动创建)
    ├── file-share.log
    └── file-share.error.log
```

## 数据库表结构

### upload_tokens - 上传令牌表
| 字段 | 说明 |
|------|------|
| id | 自增ID |
| token | 上传令牌 (UUID) |
| created_at | 创建时间戳 |
| expires_at | 过期时间戳 |
| used | 是否已使用 (0/1) |
| file_token | 关联的文件令牌 |
| platform | 目标平台 |
| created_by_ip | 创建者IP |

### files - 文件表
| 字段 | 说明 |
|------|------|
| id | 自增ID |
| file_token | 文件下载令牌 (UUID) |
| original_name | 原始文件名 |
| stored_path | 服务器存储路径 |
| file_size | 文件大小 (字节) |
| upload_time | 上传时间戳 |
| download_count | 下载次数 |
| upload_token | 关联的上传令牌 |

### download_logs - 下载日志表
| 字段 | 说明 |
|------|------|
| id | 自增ID |
| file_token | 文件令牌 |
| download_time | 下载时间戳 |
| ip_address | 下载IP |
| user_agent | 客户端UA |

## 定时清理

服务启动后会每分钟自动清理过期的上传令牌，也可以手动执行清理：

```bash
node index.js cleanup
```

## 设置开机自启 (systemd)

创建 `/etc/systemd/system/file-share.service`：

```ini
[Unit]
Description=File Share Platform
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/node-file-share
ExecStart=/usr/bin/node /path/to/node-file-share/index.js start --port 3000 --host 0.0.0.0 --base-url http://your-domain.com
Restart=always

[Install]
WantedBy=multi-user.target
```

启用并启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable file-share
sudo systemctl start file-share
```

## 最大文件大小

当前限制：**100 MB**，可以在 `app.js` 中修改：

```javascript
limits: {
  fileSize: 100 * 1024 * 1024  // 修改这里
}
```

## 解决 CentOS 7 编译问题

CentOS 7 默认的 GCC 4.8.5 太老，不支持 C++14，需要升级 GCC：

```bash
# 安装新的 GCC
yum install -y centos-release-scl
yum install -y devtoolset-9-gcc devtoolset-9-gcc-c++ make

# 启用新的 GCC 然后安装依赖
source /opt/rh/devtoolset-9/enable
npm install
```

升级 GCC 后就可以正常编译了。

## License

MIT
