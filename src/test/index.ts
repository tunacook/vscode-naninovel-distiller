import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

export async function run(): Promise<void> {
    const mocha = new Mocha({
        ui: 'tdd',
        color: true
    });

    // out/test フォルダを起点にする
    const testsRoot = path.resolve(__dirname, '.');

    // glob でテストファイルを取得
    const files = await glob('**/*.test.js', { cwd: testsRoot });

    files.forEach((f: string) => {
        mocha.addFile(path.resolve(testsRoot, f));
    });

    return new Promise((c, e) => {
        try {
            mocha.run(failures => {
                if (failures > 0) {
                    e(new Error(`${failures} tests failed.`));
                } else {
                    c();
                }
            });
        } catch (err) {
            e(err);
        }
    });
}