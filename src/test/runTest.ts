// src/test/runTest.ts
import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
    try {
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');
        const extensionTestsPath = path.resolve(__dirname, './index');

        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            // Apple Silicon Mac を使用している場合、arm64版を強制指定して高速化
            platform: 'darwin-arm64',
            launchArgs: [
                '--disable-extensions',
                '--disable-gpu'
            ]
        });
    } catch (err) {
        console.error('Failed to run tests', err);
        process.exit(1);
    }
}

main();