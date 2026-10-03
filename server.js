/**
 * ==========================================================================
 * WellnessLab Diagnostics - Local Development Server
 * --------------------------------------------------------------------------
 * A zero-dependency static file server.
 *
 * WHY THIS EXISTS
 * Supabase Google OAuth needs a real http(s) origin. A page opened straight
 * from disk (file://) reports its origin as "null", which breaks the OAuth
 * redirect. Run this server and browse http://localhost:3000 instead of
 * double-clicking the HTML files.
 *
 *   npm run dev        (or: node server.js)
 *
 * The port must match `localDevOrigin` in js/supabase-config.js AND be listed
 * under Supabase -> Authentication -> URL Configuration -> Redirect URLs.
 * Override the port with:  PORT=4000 npm run dev
 * ==========================================================================
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

function send(res, statusCode, body, contentType) {
  res.writeHead(statusCode, { 'Content-Type': contentType || 'text/plain; charset=utf-8' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    // Only the pathname matters; strip any query string / hash.
    urlPath = decodeURIComponent(new URL(req.url, `http://localhost:${PORT}`).pathname);
  } catch (err) {
    return send(res, 400, 'Bad Request');
  }

  // Never serve dotfiles (e.g. .env), even locally.
  if (urlPath.split('/').some((segment) => segment.startsWith('.'))) {
    return send(res, 403, 'Forbidden');
  }

  const filePath = path.join(ROOT, urlPath);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    return send(res, 403, 'Forbidden'); // path traversal attempt
  }

  fs.stat(filePath, (err, stats) => {
    let target = filePath;

    if (!err && stats.isDirectory()) {
      target = path.join(filePath, 'index.html'); // directory -> its index
    } else if (err && (urlPath === '/' || !path.extname(urlPath))) {
      target = path.join(ROOT, 'index.html'); // root / extension-less -> index
    }

    fs.readFile(target, (readErr, content) => {
      if (readErr) {
        return send(res, 404, '<h1>404 Not Found</h1>', 'text/html; charset=utf-8');
      }
      const ext = path.extname(target).toLowerCase();
      send(res, 200, content, MIME_TYPES[ext] || 'application/octet-stream');
    });
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use. Try: PORT=4000 npm run dev\n`);
  } else {
    console.error('\n  Server error:', err.message, '\n');
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log('\n  WellnessLab dev server running:\n');
  console.log(`  > Landing:  http://localhost:${PORT}/`);
  console.log(`  > Checkout: http://localhost:${PORT}/checkout.html`);
  console.log('\n  Open the Landing URL above (do NOT open the .html files directly).');
  console.log('  Press Ctrl+C to stop.\n');
});
