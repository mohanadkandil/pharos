import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

rmSync('dist', { recursive: true, force: true });

execFileSync(process.execPath, ['./node_modules/typescript/bin/tsc'], {
    stdio: 'inherit',
});

mkdirSync('dist', { recursive: true });
for (const file of ['index.html', 'styles.css', 'LICENSE', 'README.md']) {
    cpSync(file, `dist/${file}`);
}
