const fs = require('fs');
const path = require('path');

class JsonDatabase {
  constructor(dbPath = './data/files.json') {
    this.dbPath = dbPath;
    this.dir = path.dirname(dbPath);
    
    // Ensure directory exists
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }

    // Load or initialize database
    if (fs.existsSync(dbPath)) {
      try {
        this.data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      } catch (e) {
        console.error('Error reading JSON database, initializing new:', e);
        this.init();
      }
    } else {
      this.init();
    }
  }

  init() {
    this.data = {
      files: [],
      downloadLogs: []
    };
    this.save();
  }

  save() {
    fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf8');
  }

  // Wait for init (always ready for JSON)
  async ready() {
    // Already ready
    return;
  }

  // Insert file record
  async insertFile(fileToken, originalName, storedPath, fileSize, uploadIp) {
    const now = Date.now();
    const ext = path.extname(originalName).toLowerCase().replace(/^\./, '') || 'unknown';
    const file = {
      id: this.data.files.length + 1,
      file_token: fileToken,
      original_name: originalName,
      stored_path: storedPath,
      file_size: fileSize,
      file_type: ext,
      upload_time: now,
      download_count: 0,
      upload_ip: uploadIp
    };
    this.data.files.push(file);
    this.save();
    return file.id;
  }

  // Get file by token
  async getFile(fileToken) {
    return this.data.files.find(f => f.file_token === fileToken);
  }

  // Get all files
  async getAllFiles() {
    return [...this.data.files].sort((a, b) => b.upload_time - a.upload_time);
  }

  // Increment download count
  async incrementDownloadCount(fileToken) {
    const file = await this.getFile(fileToken);
    if (file) {
      file.download_count += 1;
      this.save();
      return { changes: 1 };
    }
    return { changes: 0 };
  }

  // Log download
  async logDownload(fileToken, ip, userAgent) {
    const now = Date.now();
    const log = {
      id: this.data.downloadLogs.length + 1,
      file_token: fileToken,
      download_time: now,
      ip_address: ip,
      user_agent: userAgent
    };
    this.data.downloadLogs.push(log);
    this.save();
    return log.id;
  }

  // Get download statistics
  async getDownloadStats(fileToken) {
    const file = await this.getFile(fileToken);
    if (!file) return null;
    const logs = this.data.downloadLogs.filter(l => l.file_token === fileToken);
    return {
      ...file,
      total_downloads: logs.length
    };
  }

  // Get download logs for a file
  async getDownloadLogs(fileToken) {
    return this.data.downloadLogs
      .filter(l => l.file_token === fileToken)
      .sort((a, b) => b.download_time - a.download_time);
  }

  // Delete file
  async deleteFile(fileToken) {
    this.data.files = this.data.files.filter(f => f.file_token !== fileToken);
    this.data.downloadLogs = this.data.downloadLogs.filter(l => l.file_token !== fileToken);
    this.save();
  }

  // Cleanup (not needed for JSON)
  async cleanupExpiredTokens() {
    return 0;
  }

  close() {
    // Nothing to do for JSON
  }
}

module.exports = JsonDatabase;
