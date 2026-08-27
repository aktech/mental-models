import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'node:child_process';

// Commit of the build, shown in the footer and linked. Empty outside a git checkout.
const git = (args) => {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};
const commit = git('rev-parse --short HEAD');
const commitSha = git('rev-parse HEAD');

export default defineConfig({
  // Served as a project site under the user site's domain: iamit.in/mental-models/
  site: 'https://iamit.in',
  base: '/mental-models',
  integrations: [react(), mdx()],
  vite: {
    plugins: [tailwindcss()],
    define: { __COMMIT__: JSON.stringify(commit), __COMMIT_SHA__: JSON.stringify(commitSha) },
  },
});
