#!/usr/bin/env node

const { program } = require('commander');
const FileShareApp = require('./app');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

program
  .name('file-share')
  .description('CLI-based file sharing platform, JSON/SQLite storage supported')
  .version('2.0.0');

program
  .command('start')
  .description('Start the file share server')
  .option('-p, --port <port>', 'Port to listen on', '3000')
  .option('-h, --host <host>', 'Host to bind to', '0.0.0.0')
  .option('-b, --base-url <url>', 'Base URL for download links (e.g. http://yourdomain.com)')
  .option('-d, --upload-dir <dir>', 'Upload directory', './uploads')
  .option('--db-path <path>', 'Database file path', './data/files.json')
  .option('-s, --storage <type>', 'Storage type: json or sqlite', 'json')
  .option('--daemon', 'Run in background (daemon mode)', false)
  .action(async (options) => {
    const config = {
      port: parseInt(options.port),
      host: options.host,
      baseUrl: options.baseUrl || `http://${options.host}:${options.port}`,
      uploadDir: path.resolve(options.uploadDir),
      dbPath: path.resolve(options.dbPath),
      storageType: options.storage
    };

    if (options.storage === 'sqlite' && !options.dbPath.includes('.db')) {
      config.dbPath = path.resolve('./data/files.db');
    }

    if (options.daemon) {
      // Run in background
      console.log('Starting File Share Platform in background...');
      
      // Ensure log directory exists
      const logDir = path.dirname(path.resolve('./logs/file-share.log'));
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      const out = fs.openSync('./logs/file-share.log', 'a');
      const err = fs.openSync('./logs/file-share.error.log', 'a');

      const child = spawn(process.argv[0], [process.argv[1], 'start',
        '--port', options.port,
        '--host', options.host,
        '--base-url', options.baseUrl || `http://${options.host}:${options.port}`,
        '--upload-dir', options.uploadDir,
        '--db-path', options.dbPath,
        '--storage', options.storage
      ], {
        detached: true,
        stdio: ['ignore', out, err]
      });

      child.unref();
      
      const pidFile = './file-share.pid';
      fs.writeFileSync(pidFile, child.pid.toString());
      
      console.log(`Server started in background. PID: ${child.pid}`);
      console.log(`Log file: ./logs/file-share.log`);
      console.log(`PID file: ${pidFile}`);
      
      process.exit(0);
    } else {
      // Run in foreground
      const app = new FileShareApp(config);
      await app.start();

      // Handle shutdown
      process.on('SIGINT', () => {
        console.log('\nShutting down...');
        app.stop();
        process.exit(0);
      });

      process.on('SIGTERM', () => {
        console.log('\nReceived SIGTERM, shutting down...');
        app.stop();
        process.exit(0);
      });
    }
  });

program
  .command('stop')
  .description('Stop the daemonized server')
  .action(() => {
    const pidFile = './file-share.pid';
    if (!fs.existsSync(pidFile)) {
      console.error('PID file not found. Is the server running?');
      process.exit(1);
    }

    const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim());
    try {
      process.kill(pid, 0); // Check if process exists
      process.kill(pid, 'SIGTERM');
      console.log(`Stopped server with PID ${pid}`);
      fs.unlinkSync(pidFile);
    } catch (error) {
      if (error.code === 'ESRCH') {
        console.error(`Process ${pid} not found. Cleaning up PID file.`);
        fs.unlinkSync(pidFile);
        process.exit(1);
      }
      throw error;
    }
  });

program
  .command('status')
  .description('Check if server is running')
  .action(() => {
    const pidFile = './file-share.pid';
    if (!fs.existsSync(pidFile)) {
      console.log('Server is not running (no PID file found)');
      return;
    }

    const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim());
    try {
      process.kill(pid, 0);
      console.log(`Server is running (PID: ${pid})`);
    } catch (error) {
      console.log('Server is not running (PID file exists but process is dead)');
    }
  });

program.parse();
