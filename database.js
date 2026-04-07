const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

class FileDatabase {
  constructor(dbPath = './files.db') {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.init();
  }

  init() {
    // Create upload tokens table
    this.db.exec(`
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
    `);

    // Create files table
    this.db.exec(`
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
    `);

    // Create download logs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS download_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_token TEXT NOT NULL,
        download_time INTEGER NOT NULL,
        ip_address TEXT NOT NULL,
        user_agent TEXT
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_upload_token ON upload_tokens(token);
      CREATE INDEX IF NOT EXISTS idx_file_token ON files(file_token);
      CREATE INDEX IF NOT EXISTS idx_download_file ON download_logs(file_token);
    `);
  }

  // Create upload token
  createUploadToken(token, platform, ip, expirationMs = 300000) {
    const now = Date.now();
    const expiresAt = now + expirationMs;
    const stmt = this.db.prepare(`
      INSERT INTO upload_tokens (token, created_at, expires_at, platform, created_by_ip)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(token, now, expiresAt, platform, ip);
    return result.lastInsertRowid;
  }

  // Get upload token if valid
  getValidUploadToken(token) {
    const now = Date.now();
    const stmt = this.db.prepare(`
      SELECT * FROM upload_tokens 
      WHERE token = ? AND used = 0 AND expires_at > ?
    `);
    return stmt.get(token, now);
  }

  // Mark upload token as used
  markUploadTokenUsed(token, fileToken) {
    const stmt = this.db.prepare(`
      UPDATE upload_tokens SET used = 1, file_token = ? WHERE token = ?
    `);
    return stmt.run(fileToken, token);
  }

  // Cleanup expired tokens
  cleanupExpiredTokens() {
    const now = Date.now();
    const stmt = this.db.prepare(`
      DELETE FROM upload_tokens WHERE used = 0 AND expires_at < ?
    `);
    const result = stmt.run(now);
    return result.changes;
  }

  // Insert file record
  insertFile(fileToken, originalName, storedPath, fileSize, uploadToken) {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO files (file_token, original_name, stored_path, file_size, upload_time, upload_token)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(fileToken, originalName, storedPath, fileSize, now, uploadToken);
    return result.lastInsertRowid;
  }

  // Get file by token
  getFile(fileToken) {
    const stmt = this.db.prepare(`
      SELECT * FROM files WHERE file_token = ?
    `);
    return stmt.get(fileToken);
  }

  // Increment download count
  incrementDownloadCount(fileToken) {
    const stmt = this.db.prepare(`
      UPDATE files SET download_count = download_count + 1 WHERE file_token = ?
    `);
    return stmt.run(fileToken);
  }

  // Log download
  logDownload(fileToken, ip, userAgent) {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO download_logs (file_token, download_time, ip_address, user_agent)
      VALUES (?, ?, ?, ?)
    `);
    return stmt.run(fileToken, now, ip, userAgent);
  }

  // Get download statistics
  getDownloadStats(fileToken) {
    const file = this.getFile(fileToken);
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as total_downloads FROM download_logs WHERE file_token = ?
    `);
    const stats = stmt.get(fileToken);
    return {
      ...file,
      ...stats
    };
  }

  // Get all download logs for a file
  getDownloadLogs(fileToken) {
    const stmt = this.db.prepare(`
      SELECT * FROM download_logs WHERE file_token = ? ORDER BY download_time DESC
    `);
    return stmt.all(fileToken);
  }

  // Delete file record
  deleteFile(fileToken) {
    this.db.prepare(`DELETE FROM download_logs WHERE file_token = ?`).run(fileToken);
    this.db.prepare(`DELETE FROM files WHERE file_token = ?`).run(fileToken);
  }

  close() {
    this.db.close();
  }
}

module.exports = FileDatabase;
