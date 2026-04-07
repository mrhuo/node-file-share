const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const fs = require('fs');
const path = require('path');

// Database factory
function getDatabase(storageType, dbPath) {
  if (storageType === 'sqlite') {
    const SqliteDatabase = require('./database');
    return new SqliteDatabase(dbPath);
  } else {
    const JsonDatabase = require('./database-json');
    return new JsonDatabase(dbPath);
  }
}

class FileShareApp {
  constructor(options = {}) {
    this.port = options.port || 3000;
    this.host = options.host || '0.0.0.0';
    this.baseUrl = options.baseUrl || `http://${this.host}:${this.port}`;
    this.uploadDir = options.uploadDir || './uploads';
    this.dbPath = options.dbPath || './data/files.json';
    this.storageType = options.storageType || 'json'; // 'json' or 'sqlite'

    // Ensure upload directory exists
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }

    // Initialize database
    this.db = getDatabase(this.storageType, this.dbPath);

    // Initialize express app
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
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
    // Upload file - directly upload, no token needed
    this.app.post('/api/upload', this.upload.single('file'), this.handleUpload.bind(this));
    
    // Download endpoint
    this.app.get('/api/download/:fileToken', this.handleDownload.bind(this));
    
    // Download info endpoint (JSON)
    this.app.get('/api/info/:fileToken', this.handleInfo.bind(this));
    
    // List all files
    this.app.get('/api/list', this.handleList.bind(this));
    
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        storage: this.storageType,
        timestamp: Date.now() 
      });
    });
  }

  getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress || req.ip;
  }

  async handleUpload(req, res) {
    try {
      const clientIp = this.getClientIp(req);

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file provided. Use multipart/form-data with field name "file"'
        });
      }

      const fileToken = uuidv4();
      const { originalname, path: storedPath, size, mimetype } = req.file;

      // Insert file record
      await this.db.insertFile(fileToken, originalname, storedPath, size, clientIp);

      const downloadUrl = `${this.baseUrl}/api/download/${fileToken}`;
      const infoUrl = `${this.baseUrl}/api/info/${fileToken}`;

      // Get file extension for type
      const ext = path.extname(originalname).toLowerCase().replace(/^\./, '') || 'unknown';

      res.json({
        success: true,
        message: 'File uploaded successfully',
        file_token: fileToken,
        original_name: originalname,
        file_size: size,
        file_size_human: this.formatFileSize(size),
        file_type: ext,
        content_type: mimetype,
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
        file_type: stats.file_type || 'unknown',
        download_count: stats.download_count || stats.total_downloads,
        upload_time: stats.upload_time,
        upload_time_human: moment(stats.upload_time).format('YYYY-MM-DD HH:mm:ss'),
        upload_ip: stats.upload_ip,
        download_url: `${this.baseUrl}/api/download/${fileToken}`
      });
    } catch (error) {
      console.error('Info error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleList(req, res) {
    try {
      const files = await this.db.getAllFiles();
      
      // Add human readable info
      const result = files.map(file => ({
        file_token: file.file_token,
        original_name: file.original_name,
        file_size: file.file_size,
        file_size_human: this.formatFileSize(file.file_size),
        file_type: file.file_type || 'unknown',
        download_count: file.download_count,
        upload_time: file.upload_time,
        upload_time_human: moment(file.upload_time).format('YYYY-MM-DD HH:mm:ss'),
        download_url: `${this.baseUrl}/api/download/${file.file_token}`
      }));

      res.json({
        success: true,
        total: result.length,
        files: result
      });
    } catch (error) {
      console.error('List error:', error);
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
Storage: ${this.storageType}
Database: ${this.dbPath}
Upload directory: ${this.uploadDir}
Max file size: 100 MB

API Endpoints:
  POST /api/upload      - Upload file directly (multipart/form-data, field: file)
  GET  /api/download/:fileToken - Download file
  GET  /api/info/:fileToken     - Get file info and download stats
  GET  /api/list         - List all uploaded files
  GET  /health           - Health check

Ready to accept uploads!
`);
        resolve();
      });
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
    }
    this.db.close();
  }
}

module.exports = FileShareApp;
