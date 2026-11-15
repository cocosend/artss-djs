import express from 'express';
import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {execSync} from 'node:child_process';
import {createRateLimiter} from './rate-limit.js';

const app = express();
const port = 3000;
const host = '0.0.0.0';

const distDir = join(process.cwd(), 'dist');
if (!existsSync(join(distDir, 'index.html')) || !existsSync(join(distDir, 'samples/abyss/909_foundation.wav'))) {
  console.log('[AI Studio] Initializing build for production assets...');
  execSync('npm run build', {stdio: 'inherit'});
}
const indexHtml = readFileSync(join(distDir, 'index.html'), 'utf8');

app.use(createRateLimiter());

app.use(express.static(distDir, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.webmanifest')) {
      res.setHeader('Content-Type', 'application/manifest+json');
    }
  }
}));

app.get('/{*path}', (_req, res) => {
  res.type('html').send(indexHtml);
});

app.listen(port, host, () => {
  console.log(`ARTSS NEXUS DJ CREATOR listening on http://${host}:${port}`);
});
