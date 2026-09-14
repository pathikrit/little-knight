import { defineConfig } from 'vite';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

function git(...args: string[]) {
  try { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return ''; }
}
const commit = process.env.GITHUB_SHA || git('rev-parse', 'HEAD');
const origin = git('remote', 'get-url', 'origin');
const repository = process.env.GITHUB_REPOSITORY || origin.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/)?.[1];
const commitUrl = repository && /^[\w.-]+\/[\w.-]+$/.test(repository) && /^[a-f0-9]{40}$/.test(commit)
  ? `https://github.com/${repository}/commit/${commit}` : '';

// Upstream's old Emscripten output is Latin-1, not UTF-8. Decode it without
// modifying the dependency, in both production and development prebundling.
const speechEncoding = {
  name: 'mespeak-latin1',
  load(id: string) {
    if (id.endsWith('/mespeak/src/ESpeak.js')) return readFile(id, 'latin1');
  },
};
export default defineConfig({ base: './', plugins: [speechEncoding],
  define: { __COMMIT__: JSON.stringify(commit), __COMMIT_URL__: JSON.stringify(commitUrl) },
  optimizeDeps: { rolldownOptions: { plugins: [speechEncoding] } },
});
