/**
 * SafeTracker — Smart Launcher
 * ════════════════════════════════
 * This script:
 *  1. Starts the backend server (server/server.js)
 *  2. Starts cloudflared tunnel on port 4000
 *  3. Reads the tunnel URL from cloudflared's output automatically
 *  4. Patches App.js SERVER_URL with the new tunnel URL
 *  5. Patches dashboard/index.html with the new WSS URL
 *  6. Prints a summary with all URLs
 *
 * Run with: node start.js
 */

const { spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');

const ROOT      = __dirname;
const APP_JS    = path.join(ROOT, 'SafeTracker', 'App.js');
const DASH_HTML = path.join(ROOT, 'dashboard', 'index.html');

let tunnelUrl = null;

// ─── Colour helpers ───────────────────────────────────────────────────────────
const c = {
  reset:  '\x1b[0m',
  green:  '\x1b[32m',
  cyan:   '\x1b[36m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  bold:   '\x1b[1m',
};
const log  = (msg)       => console.log(`${c.cyan}[launcher]${c.reset} ${msg}`);
const ok   = (msg)       => console.log(`${c.green}[launcher]${c.reset} ✅ ${msg}`);
const warn = (msg)       => console.log(`${c.yellow}[launcher]${c.reset} ⚠️  ${msg}`);
const err  = (msg)       => console.log(`${c.red}[launcher]${c.reset} ❌ ${msg}`);

// ─── Patch App.js SERVER_URL ──────────────────────────────────────────────────
function patchAppJs(url) {
  try {
    let content = fs.readFileSync(APP_JS, 'utf8');
    // Replace any existing SERVER_URL line (http or https)
    content = content.replace(
      /const SERVER_URL\s*=\s*['"][^'"]+['"](;.*)?/,
      `const SERVER_URL        = '${url}'; // auto-set by start.js`
    );
    fs.writeFileSync(APP_JS, content, 'utf8');
    ok(`App.js SERVER_URL → ${url}`);
  } catch (e) {
    err(`Could not patch App.js: ${e.message}`);
  }
}

// ─── Patch dashboard WSS URL ──────────────────────────────────────────────────
function patchDashboard(url) {
  try {
    const wssUrl = url.replace('https://', 'wss://').replace('http://', 'ws://');
    let content = fs.readFileSync(DASH_HTML, 'utf8');
    // Replace the value attribute of the serverUrl input
    content = content.replace(
      /(<input[^>]+id="serverUrl"[^>]+value=")[^"]*(")/,
      `$1${wssUrl}$2`
    );
    fs.writeFileSync(DASH_HTML, content, 'utf8');
    ok(`dashboard/index.html WebSocket URL → ${wssUrl}`);
  } catch (e) {
    err(`Could not patch dashboard: ${e.message}`);
  }
}

// ─── Start backend server ─────────────────────────────────────────────────────
function startServer() {
  log('Starting backend server on port 4000…');
  const srv = spawn('node', ['server/server.js'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  srv.stdout.on('data', d => process.stdout.write(`${c.green}[server]${c.reset}  ${d}`));
  srv.stderr.on('data', d => process.stderr.write(`${c.red}[server]${c.reset}  ${d}`));
  srv.on('exit', code => { if (code) err(`Server exited with code ${code}`); });
  return srv;
}

// ─── Start cloudflared tunnel ─────────────────────────────────────────────────
function startTunnel() {
  log('Starting cloudflared tunnel on localhost:4000…');
  const cf = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:4000'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const handleLine = (line) => {
    // Detect the tunnel URL line
    const match = line.match(/https:\/\/[a-z0-9\-]+\.trycloudflare\.com/);
    if (match && !tunnelUrl) {
      tunnelUrl = match[0];

      console.log('');
      console.log(`${c.bold}${c.green}══════════════════════════════════════════════════${c.reset}`);
      console.log(`${c.bold}  🌐 TUNNEL URL: ${tunnelUrl}${c.reset}`);
      console.log(`${c.bold}${c.green}══════════════════════════════════════════════════${c.reset}`);
      console.log('');

      // Auto-patch files
      patchAppJs(tunnelUrl);
      patchDashboard(tunnelUrl);

      // Print final instructions
      setTimeout(() => {
        console.log('');
        console.log(`${c.bold}${c.cyan}─────────────────────────────────────────────────${c.reset}`);
        console.log(`${c.bold}  SafeTracker is ready! Here is what to do:${c.reset}`);
        console.log(`${c.bold}${c.cyan}─────────────────────────────────────────────────${c.reset}`);
        console.log(`  📊 Monitor Dashboard → open in browser:`);
        console.log(`     ${c.yellow}file://${DASH_HTML.replace(/\\/g, '/')}${c.reset}`);
        console.log(`     (then press F5 to reload with new tunnel URL)`);
        console.log('');
        console.log(`  📱 Target Phone → run in another terminal:`);
        console.log(`     ${c.yellow}cd SafeTracker && npx expo start --lan --port 8090${c.reset}`);
        console.log(`     Then scan the QR code with Expo Go`);
        console.log('');
        console.log(`  🔗 Server API (public) → ${tunnelUrl}`);
        console.log(`  🔗 WebSocket (dashboard) → ${tunnelUrl.replace('https://', 'wss://')}`);
        console.log(`${c.bold}${c.cyan}─────────────────────────────────────────────────${c.reset}`);
        console.log('');
      }, 500);
    }
  };

  cf.stdout.on('data', d => {
    const text = d.toString();
    text.split('\n').forEach(handleLine);
    process.stdout.write(`${c.yellow}[cloudflared]${c.reset} ${text}`);
  });
  cf.stderr.on('data', d => {
    const text = d.toString();
    text.split('\n').forEach(handleLine);
    // cloudflared logs to stderr by default — only show errors
    if (text.includes('ERR') || text.includes('error')) {
      process.stderr.write(`${c.red}[cloudflared]${c.reset} ${text}`);
    }
  });

  cf.on('exit', code => {
    if (code) err(`cloudflared exited with code ${code}`);
  });
  return cf;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log('');
console.log(`${c.bold}${c.cyan}  SafeTracker Smart Launcher${c.reset}`);
console.log(`${c.cyan}  Auto-detects tunnel URL and patches all config files${c.reset}`);
console.log('');

// Give the server 1.5s head start before opening the tunnel
const serverProc = startServer();
setTimeout(() => {
  const tunnelProc = startTunnel();

  // Graceful shutdown on Ctrl+C
  process.on('SIGINT', () => {
    console.log('\n');
    log('Shutting down…');
    tunnelProc.kill();
    serverProc.kill();
    process.exit(0);
  });
}, 1500);
