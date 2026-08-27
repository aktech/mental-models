import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'node:child_process';

// Short commit hash of the build, shown in the footer. Empty outside a git checkout.
let commit = '';
try {
  commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
} catch {}

export default defineConfig({
  integrations: [react(), mdx()],
  vite: {
    plugins: [tailwindcss()],
    define: { __COMMIT__: JSON.stringify(commit) },
  },
});
