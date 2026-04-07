const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const fs = require('fs');
const path = require('path');
const FileDatabase = require('./database');

class FileShareApp {
  constructor(options = {}) {
    this.port = options.port || 3000;
    this.host = options.host || '0.0.0.0';
    this.baseUrl = options.baseUrl || `http://${this.host}:${this.port}`;
    this.uploadDir = options.uploadDir || './uploads';
    this.dbPath = options.dbPath || './data/files.db';
    this.expirationMinutes = options.expirationMinutes || 5;

    // Ensure upload directory exists
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }

    // Initialize database
    this.db = new FileDatabase(this.dbPath);

    // Initialize express app
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();

    // Cleanup expired tokens periodically (every minute)
    this.cleanupInterval = setInterval(async () => {
      try {
        const deleted = await this.db.cleanupExpiredTokens();
        if (deleted > 0) {
          console.log(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] Cleaned up ${deleted} expired upload tokens`);
        }
      } catch (err) {
        console.error('Cleanup error:', err);
      }
    }, 60000);
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Configure multer for file uploads
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, this.uploadDir);
      },
      filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
      }
    });

    this.upload = multer({
      storage: storage,
      limits: {
        fileSize: 100 * 1024 * 1024 // 100MB max file size
      }
    });
  }

  setupRoutes() {
    // Generate upload link
    this.app.post('/api/generate-upload', this.handleGenerateUpload.bind(this));
    
    // Upload endpoint
    this.app.post('/api/upload/:token', this.upload.single('file'), this.handleUpload.bind(this));
    
    // Download endpoint
    this.app.get('/api/download/:fileToken', this.handleDownload.bind(this));
    
    // Download info endpoint (JSON)
    this.app.get('/api/info/:fileToken', this.handleInfo.bind(this));
    
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });
  }

  getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress || req.ip;
  }

  generateUploadCode(uploadUrl, platform) {
    switch (platform.toLowerCase()) {
      case 'linux':
      case 'macos':
      case 'curl':
        return `# For Linux/macOS
curl -X POST -F "file=@/path/to/your/file" "${uploadUrl}"`;
      
      case 'windows':
      case 'powershell':
        return `# For Windows PowerShell
$filePath = "C:\\path\\to\\your\\file"
$url = "${uploadUrl}"
Invoke-RestMethod -Method Post -Uri $url -InFile $filePath -ContentType "multipart/form-data"`;
      
      default:
        return `curl -X POST -F "file=@/path/to/your/file" "${uploadUrl}"`;
    }
  }

  async handleGenerateUpload(req, res) {
    try {
      const { platform = 'linux' } = req.body;
      const clientIp = this.getClientIp(req);
      const uploadToken = uuidv4();
      const expirationMs = this.expirationMinutes * 60 * 1000;

      await this.db.createUploadToken(uploadToken, platform, clientIp, expirationMs);

      const uploadUrl = `${this.baseUrl}/api/upload/${uploadToken}`;
      const uploadCode = this.generateUploadCode(uploadUrl, platform);
      const expiresAt = Date.now() + expirationMs;

      res.json({
        success: true,
        upload_token: uploadToken,
        upload_url: uploadUrl,
        upload_code: uploadCode,
        expires_at: expiresAt,
        expires_at_human: moment(expiresAt).format('YYYY-MM-DD HH:mm:ss')
      });
    } catch (error) {
      console.error('Generate upload error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleUpload(req, res) {
    try {
      const { token } = req.params;
      const clientIp = this.getClientIp(req);

      // Check if token is valid
      const uploadToken = await this.db.getValidUploadToken(token);
      if (!uploadToken) {
        return res.status(400).json({
          success: false,
          error: 'Invalid or expired upload token'
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file provided'
        });
      }

      const fileToken = uuidv4();
      const { originalname, path: storedPath, size } = req.file;

      // Insert file record and mark token as used
      await this.db.insertFile(fileToken, originalname, storedPath, size, token);
      await this.db.markUploadTokenUsed(token, fileToken);

      const downloadUrl = `${this.baseUrl}/api/download/${fileToken}`;
      const infoUrl = `${this.baseUrl}/api/info/${fileToken}`;

      res.json({
        success: true,
        message: 'File uploaded successfully',
        file_token: fileToken,
        original_name: originalname,
        file_size: size,
        file_size_human: this.formatFileSize(size),
        download_url: downloadUrl,
        info_url: infoUrl
      });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleDownload(req, res) {
    try {
      const { fileToken } = req.params;
      const clientIp = this.getClientIp(req);
      const userAgent = req.get('User-Agent') || '';

      // Get file info
      const file = await this.db.getFile(fileToken);
      if (!file) {
        return res.status(404).json({
          success: false,
          error: 'File not found'
        });
      }

      // Check if file exists on disk
      if (!fs.existsSync(file.stored_path)) {
        return res.status(404).json({
          success: false,
          error: 'File not found on server'
        });
      }

      // Log download and increment count
      await this.db.incrementDownloadCount(fileToken);
      await this.db.logDownload(fileToken, clientIp, userAgent);

      // Send file
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(file.original_name)}"`
      );
      res.setHeader('Content-Length', file.file_size);
      
      const fileStream = fs.createReadStream(file.stored_path);
      fileStream.pipe(res);
    } catch (error) {
      console.error('Download error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleInfo(req, res) {
    try {
      const { fileToken } = req.params;
      const stats = await this.db.getDownloadStats(fileToken);
      
      if (!stats) {
        return res.status(404).json({
          success: false,
          error: 'File not found'
        });
      }

      res.json({
        success: true,
        file_token: stats.file_token,
        original_name: stats.original_name,
        file_size: stats.file_size,
        file_size_human: this.formatFileSize(stats.file_size),
        download_count: stats.download_count,
        upload_time: stats.upload_time,
        upload_time_human: moment(stats.upload_time).format('YYYY-MM-DD HH:mm:ss'),
        download_url: `${this.baseUrl}/api/download/${fileToken}`
      });
    } catch (error) {
      console.error('Info error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async start() {
    await this.db.ready();
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, this.host, () => {
        console.log(`
╔════════════════════════════════════════════════════════════╗
║                     File Share Platform                     ║
╚════════════════════════════════════════════════════════════╝

Server running on: ${this.baseUrl}
Database: ${this.dbPath}
Upload directory: ${this.uploadDir}
Default upload expiration: ${this.expirationMinutes} minutes

API Endpoints:
  POST /api/generate-upload - Generate upload link
    Body: { "platform": "linux|macos|windows" }
    Returns: upload_url and upload_code

  POST /api/upload/:token - Upload file (use the generated code)
  
  GET  /api/download/:fileToken - Download file
  GET  /api/info/:fileToken - Get file info and download stats
  GET  /health - Health check

Ready to accept uploads!
`);
        resolve();
      });
    });
  }

  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.server) {
      this.server.close();
    }
    this.db.close();
  }
}

module.exports = FileShareApp;
