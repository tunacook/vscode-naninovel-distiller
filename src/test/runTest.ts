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
            // 実行環境が Mac (darwin) かつ arm64 なら指定、それ以外はデフォルト
            platform: process.platform === 'darwin' && process.arch === 'arm64'
                      ? 'darwin-arm64'
                      : undefined,
            launchArgs: ['--disable-extensions']
        });
    } catch (err) {
        console.error('Failed to run tests', err);
        process.exit(1);
    }
}

main();