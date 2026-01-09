import * as vscode from 'vscode';
import { isSkipNaninovelSyntax, trimRuby, trimBrTag, trimFgTag } from 'naninovel-script-spec';

export function activate(context: vscode.ExtensionContext) {
    const statsProvider = new NaninovelStatsProvider();
    vscode.window.registerTreeDataProvider('naninovelStatsView', statsProvider);

    // 追加：エディタの切り替えや選択変更を監視
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(() => statsProvider.refresh()),
        vscode.workspace.onDidChangeTextDocument(e => {
            // 現在開いているドキュメントの変更ならリフレッシュ
            if (e.document === vscode.window.activeTextEditor?.document) {
                statsProvider.refresh();
            }
        })
    );
}

// ツリーに表示する項目の定義
class StatItem extends vscode.TreeItem {
    constructor(label: string, value: string, iconId?: string) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = value;
        if (iconId) {
            this.iconPath = new vscode.ThemeIcon(iconId);
        }
    }
}

// サイドバーにデータを流し込むクラス
class NaninovelStatsProvider implements vscode.TreeDataProvider<StatItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<StatItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: StatItem): vscode.TreeItem {
        return element;
    }

    async getChildren(): Promise<StatItem[]> {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return [new StatItem("エディタが開かれていません", "", "info")];
            }

            const text = editor.document.getText();
            const lines = text.split(/\r?\n/); // テキストを行ごとに分割

            let totalLength = 0;
            let speakerUniqueChars = new Set<string>(); // 重複除外用

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine) {continue;} // 空行はスキップ

                // 1行ずつ判定ライブラリに渡す
                if (isSkipNaninovelSyntax(trimmedLine)) {
                    // スキップ対象（コマンドやコメント）
                    continue;
                }

                // rubyタグを取り除いて
                const trimmedLine2 = trimRuby(trimmedLine);
            
                const aaa = trimBrTag(
                            trimmedLine2
                        );
                        console.log("aaa:", aaa);


                // console.log("text:",trimmedLine2);

                // --- ここからカウントロジック ---
                // 形式が "話者: セリフ" かどうかを判定
                if (trimmedLine.includes(':')) {
                    const [speaker, ...contentParts] = trimmedLine.split(':');
                    const content = contentParts.join(':').trim();

                    // 話者名をセットに追加（重複は自動で無視される）
                    speakerUniqueChars.add(speaker.trim());
                    // セリフ内容をカウント
                    totalLength += content.length;
                } else {
                    // 話者がいない地の文などの場合
                    totalLength += trimmedLine.length;
                }
            }

            // ユニークな話者名の合計文字数を計算
            let totalSpeakerLength = 0;
            speakerUniqueChars.forEach(name => totalSpeakerLength += name.length);

            return [
                new StatItem("セリフ純文字数", `${totalLength} 文字`, "comment-discussion"),
                new StatItem("話者名（重複除外）", `${totalSpeakerLength} 文字`, "person"),
                new StatItem("合計見積文字数", `${totalLength + totalSpeakerLength} 文字`, "layers")
            ];
        } catch (err) {
            console.error("Critical error in getChildren:", err);
            return [new StatItem("解析エラー発生", String(err), "error")];
        }
    }
}