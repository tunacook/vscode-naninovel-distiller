import * as assert from 'node:assert';
import { isSkipNaninovelSyntax, trimRuby, trimBrTag, trimFgTag } from 'naninovel-script-spec';

suite('Naninovel Script Counting Logic Tests', () => {

    test('isSkipNaninovelSyntax should identify commands and labels', () => {
        assert.strictEqual(isSkipNaninovelSyntax('@choice "Option"'), true);
        assert.strictEqual(isSkipNaninovelSyntax('# LabelName'), true);
        assert.strictEqual(isSkipNaninovelSyntax('; Comment line'), true);
        assert.strictEqual(isSkipNaninovelSyntax('Normal dialogue'), false);
    });

    test('trimRuby should remove ruby markup but keep base and ruby text', () => {
        // タグのみを除去しテキストは残す
        assert.strictEqual(trimRuby('こんにちは<ruby="ルビ">世界</ruby>'), 'こんにちは世界ルビ');
    });

    test('trimBrTag and trimFgTag should remove markup tags', () => {
        assert.strictEqual(trimBrTag('First line<br>Second line'), 'First lineSecond line');
        assert.strictEqual(trimFgTag('Hello <fg="red">Color</fg> World'), 'Hello Color World');
    });

    test('Speaker separation logic (First Colon Rule)', () => {
        const cases = [
            { input: 'Kohaku: Hello', expectedSpeaker: 'Kohaku', expectedContent: 'Hello' },
            { input: 'Unknown: Hello: World', expectedSpeaker: 'Unknown', expectedContent: 'Hello: World' }, // 最初のコロンで分割
            { input: '地の文のみの行', expectedSpeaker: null, expectedContent: '地の文のみの行' },
            { input: ' : Content with leading colon', expectedSpeaker: null, expectedContent: ' Content with leading colon' }
        ];

        cases.forEach(({ input, expectedSpeaker, expectedContent }) => {
            const colonIndex = input.indexOf(':');
            let speaker: string | null = null;
            let content: string;

            if (colonIndex !== -1) {
                speaker = input.substring(0, colonIndex).trim() || null;
                content = input.substring(colonIndex + 1);
            } else {
                content = input;
            }

            assert.strictEqual(speaker, expectedSpeaker, `Failed speaker match for: ${input}`);
            assert.strictEqual(content.trim(), expectedContent.trim(), `Failed content match for: ${input}`);
        });
    });

    test('Complex cleanup chain including speaker removal', () => {
        const input = 'Kohaku: <ruby="きょうは">今日は</ruby><br><fg="red">良い天気</fg>だね。';

        // 1. タグ除去
        const clean = trimFgTag(trimBrTag(trimRuby(input)));

        // 2. 話者分離
        const colonIndex = clean.indexOf(':');
        const content = colonIndex !== -1 ? clean.substring(colonIndex + 1) : clean;

        // 結果: 「Kohaku: 」と各タグが消え、中身のテキストだけが残る
        assert.strictEqual(content.trim(), '今日はきょうは良い天気だね。');
    });
});