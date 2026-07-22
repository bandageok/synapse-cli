import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

const readText = async (path) => readFile(new URL(path, root), 'utf8');
const packageJson = JSON.parse(await readText('package.json'));
const lockfile = JSON.parse(await readText('package-lock.json'));
const version = packageJson.version;

const files = {
  runtime: await readText('src/version.ts'),
  changelog: await readText('CHANGELOG.md'),
  readme: await readText('README.md'),
  readmeZh: await readText('README.zh-CN.md'),
};

const failures = [];
const expectEqual = (label, actual, expected) => {
  if (actual !== expected) {
    failures.push(`${label}: expected ${expected}, found ${String(actual)}`);
  }
};
const expectIncludes = (label, content, expected) => {
  if (!content.includes(expected)) {
    failures.push(`${label}: missing ${JSON.stringify(expected)}`);
  }
};

expectEqual('package-lock.json version', lockfile.version, version);
expectEqual('package-lock.json root package version', lockfile.packages?.['']?.version, version);
expectIncludes('src/version.ts', files.runtime, `export const VERSION = '${version}';`);
expectIncludes('CHANGELOG.md', files.changelog, `## ${version} -`);
expectIncludes('README.md verification', files.readme, `The \`v${version}\` release is covered`);
expectIncludes('README.md project status', files.readme, `\`v${version}\` is usable and tested`);
expectIncludes('README.zh-CN.md verification', files.readmeZh, `\`v${version}\` 有`);
expectIncludes('README.zh-CN.md project status', files.readmeZh, `\`v${version}\` 已完成验证`);

if (failures.length > 0) {
  console.error('Release metadata is inconsistent:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Release metadata is consistent for v${version}.`);
}
