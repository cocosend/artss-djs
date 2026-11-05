import express from 'express';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {execSync} from 'node:child_process';

const app = express();
const port = 3000;
const host = '0.0.0.0';

const distDir = join(process.cwd(), 'dist');
if (!existsSync(join(distDir, 'index.html')) || !existsSync(join(distDir, 'samples/abyss/909_foundation.wav'))) {
  console.log('[AI Studio] Initializing build for production assets...');
  execSync('npm run build', {stdio: 'inherit'});
}

app.use(express.static(distDir, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.webmanifest')) {
      res.setHeader('Content-Type', 'application/manifest+json');
    }
  }
}));

app.get('*', (_req, res) => {
  res.sendFile(join(distDir, 'index.html'));
});

app.listen(port, host, () => {
  console.log(`ARTSS NEXUS DJ CREATOR listening on http://${host}:${port}`);
});
