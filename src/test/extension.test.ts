import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { isSkipNaninovelSyntax, trimRuby, trimBrTag, trimFgTag } from 'naninovel-script-spec';

suite('Naninovel Script Spec Unit Tests', () => {

    test('isSkipNaninovelSyntax should identify commands and labels', () => {
        assert.strictEqual(isSkipNaninovelSyntax('@choice "Option"'), true);
        assert.strictEqual(isSkipNaninovelSyntax('# LabelName'), true);
        assert.strictEqual(isSkipNaninovelSyntax('; Comment line'), true);
        assert.strictEqual(isSkipNaninovelSyntax('Normal dialogue'), false);
    });

    test('trimRuby should remove ruby notation but keep base text', () => {
        // [ruby/rt] 形式の除去確認
        assert.strictEqual(trimRuby('こんにちは<ruby="ルビ">世界</ruby>'), 'こんにちはルビ世界');
    });

    test('trimBrTag and trimFgTag should remove markup tags', () => {
        assert.strictEqual(trimBrTag('First line[br]Second line'), 'First lineSecond line');
        assert.strictEqual(trimFgTag('Hello [fg/00ff00]Color[fgoff] World'), 'Hello Color World');
    });

    test('Complex cleanup chain', () => {
        const input = 'Kohaku: [ruby/こんにちは]今日は[br][fg/ff0000]良い天気[fgoff]だね。';
        const clean = trimFgTag(trimBrTag(trimRuby(input)));

        // 話者分離ロジックのシミュレーション
        const match = clean.match(/^([^:\s]+)\s*:\s*(.*)$/);
        const content = match ? match[2] : clean;

        assert.strictEqual(content, '今日は良い天気だね。');
    });
});