import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export default defineConfig({
  plugins: [{
    name: 'app-shell-service-worker',
    generateBundle(_options, bundle) {
      const assets = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-icon.png', ...Object.keys(bundle).map(name => '/' + name)];
      const version = createHash('sha256').update(JSON.stringify(bundle)).digest('hex').slice(0, 16);
      const template = readFileSync(new URL('./src/sw-template.js', import.meta.url), 'utf8');
      this.emitFile({type:'asset', fileName:'sw.js', source: template.replace('__VERSION__', version).replace('__ASSETS__', JSON.stringify([...new Set(assets)]))});
    }
  }]
});
