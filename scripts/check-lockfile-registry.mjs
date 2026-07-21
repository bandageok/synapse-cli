import { readFile } from 'node:fs/promises';

const lockfile = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
const unexpected = [];
const displayLimit = 20;

for (const [packagePath, metadata] of Object.entries(lockfile.packages ?? {})) {
  if (typeof metadata.resolved !== 'string') {
    continue;
  }

  let resolvedUrl;
  try {
    resolvedUrl = new URL(metadata.resolved);
  } catch {
    unexpected.push(`${packagePath || '<root>'}: ${metadata.resolved}`);
    continue;
  }

  if (resolvedUrl.protocol !== 'https:' || resolvedUrl.hostname !== 'registry.npmjs.org') {
    unexpected.push(`${packagePath || '<root>'}: ${metadata.resolved}`);
  }
}

if (unexpected.length > 0) {
  console.error('package-lock.json contains dependencies outside the canonical npm registry:');
  for (const entry of unexpected.slice(0, displayLimit)) {
    console.error(`- ${entry}`);
  }
  if (unexpected.length > displayLimit) {
    console.error(`- ... and ${unexpected.length - displayLimit} more`);
  }
  process.exitCode = 1;
} else {
  console.log('package-lock.json uses only https://registry.npmjs.org package URLs.');
}
