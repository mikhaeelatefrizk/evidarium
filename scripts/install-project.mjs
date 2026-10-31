import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readExecutionProfile} from './execution-profile.mjs';

// Preserve the managed image's pinned installer while supporting real Windows/macOS checkouts.
const managed = readExecutionProfile() === 'managed-linux';
if (!managed && !process.env.npm_execpath) throw Error('Run through the project package manager: pnpm run install:ci.');
const command = managed ? 'bash' : process.execPath;
const args = managed
  ? [fileURLToPath(new URL('./install-pnpm.sh', import.meta.url))]
  : [process.env.npm_execpath, 'install', '--frozen-lockfile'];
const result = spawnSync(command, args, {stdio:'inherit', env:{...process.env, CI:'true'}});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
