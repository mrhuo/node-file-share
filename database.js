const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

class FileDatabase {
  constructor(dbPath = './files.db') {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new sqlite3.Database(dbPath);
    this.initPromise = this.init();
  }

  init() {
    return new Promise((resolve, reject) => {
      // Create upload tokens table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS upload_tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          token TEXT UNIQUE NOT NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          used INTEGER DEFAULT 0,
          file_token TEXT,
          platform TEXT,
          created_by_ip TEXT
        )
      `, (err) => {
        if (err) return reject(err);

        // Create files table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_token TEXT UNIQUE NOT NULL,
            original_name TEXT NOT NULL,
            stored_path TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            upload_time INTEGER NOT NULL,
            download_count INTEGER DEFAULT 0,
            upload_token TEXT
          )
        `, (err) => {
          if (err) return reject(err);

          // Create download logs table
          this.db.run(`
            CREATE TABLE IF NOT EXISTS download_logs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              file_token TEXT NOT NULL,
              download_time INTEGER NOT NULL,
              ip_address TEXT NOT NULL,
              user_agent TEXT
            )
          `, (err) => {
            if (err) return reject(err);

            // Create indexes
            this.db.run(`
              CREATE INDEX IF NOT EXISTS idx_upload_token ON upload_tokens(token);
              CREATE INDEX IF NOT EXISTS idx_file_token ON files(file_token);
              CREATE INDEX IF NOT EXISTS idx_download_file ON download_logs(file_token);
            `, (err) => {
              if (err) return reject(err);
              resolve();
            });
          });
        });
      });
    });
  }

  // Wait for init
  async ready() {
    await this.initPromise;
  }

  // Create upload token
  async createUploadToken(token, platform, ip, expirationMs = 300000) {
    const now = Date.now();
    const expiresAt = now + expirationMs;
    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT INTO upload_tokens (token, created_at, expires_at, platform, created_by_ip)
        VALUES (?, ?, ?, ?, ?)
      `, [token, now, expiresAt, platform, ip], function(err) {
        if (err) return reject(err);
        resolve(this.lastID);
      });
    });
  }

  // Get upload token if valid
  async getValidUploadToken(token) {
    const now = Date.now();
    return new Promise((resolve, reject) => {
      this.db.get(`
        SELECT * FROM upload_tokens 
        WHERE token = ? AND used = 0 AND expires_at > ?
      `, [token, now], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
  }

  // Mark upload token as used
  async markUploadTokenUsed(token, fileToken) {
    return new Promise((resolve, reject) => {
      this.db.run(`
        UPDATE upload_tokens SET used = 1, file_token = ? WHERE token = ?
      `, [fileToken, token], function(err) {
        if (err) return reject(err);
        resolve({ changes: this.changes });
      });
    });
  }

  // Cleanup expired tokens
  async cleanupExpiredTokens() {
    const now = Date.now();
    return new Promise((resolve, reject) => {
      this.db.run(`
        DELETE FROM upload_tokens WHERE used = 0 AND expires_at < ?
      `, [now], function(err) {
        if (err) return reject(err);
        resolve(this.changes);
      });
    });
  }

  // Insert file record
  async insertFile(fileToken, originalName, storedPath, fileSize, uploadToken) {
    const now = Date.now();
    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT INTO files (file_token, original_name, stored_path, file_size, upload_time, upload_token)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [fileToken, originalName, storedPath, fileSize, now, uploadToken], function(err) {
        if (err) return reject(err);
        resolve(this.lastID);
      });
    });
  }

  // Get file by token
  async getFile(fileToken) {
    return new Promise((resolve, reject) => {
      this.db.get(`
        SELECT * FROM files WHERE file_token = ?
      `, [fileToken], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
  }

  // Increment download count
  async incrementDownloadCount(fileToken) {
    return new Promise((resolve, reject) => {
      this.db.run(`
        UPDATE files SET download_count = download_count + 1 WHERE file_token = ?
      `, [fileToken], function(err) {
        if (err) return reject(err);
        resolve({ changes: this.changes });
      });
    });
  }

  // Log download
  async logDownload(fileToken, ip, userAgent) {
    const now = Date.now();
    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT INTO download_logs (file_token, download_time, ip_address, user_agent)
        VALUES (?, ?, ?, ?)
      `, [fileToken, now, ip, userAgent], function(err) {
        if (err) return reject(err);
        resolve(this.lastID);
      });
    });
  }

  // Get download statistics
  async getDownloadStats(fileToken) {
    const file = await this.getFile(fileToken);
    if (!file) return null;
    return new Promise((resolve, reject) => {
      this.db.get(`
        SELECT COUNT(*) as total_downloads FROM download_logs WHERE file_token = ?
      `, [fileToken], (err, stats) => {
        if (err) return reject(err);
        resolve({
          ...file,
          ...stats
        });
      });
    });
  }

  // Get all download logs for a file
  async getDownloadLogs(fileToken) {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT * FROM download_logs WHERE file_token = ? ORDER BY download_time DESC
      `, [fileToken], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  }

  // Delete file record
  async deleteFile(fileToken) {
    await new Promise((resolve, reject) => {
      this.db.run(`DELETE FROM download_logs WHERE file_token = ?`, [fileToken], (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
    await new Promise((resolve, reject) => {
      this.db.run(`DELETE FROM files WHERE file_token = ?`, [fileToken], (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  close() {
    this.db.close();
  }
}

module.exports = FileDatabase;
