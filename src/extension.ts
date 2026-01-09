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
            if (!editor) return [new StatItem("エディタが開かれていません", "", "info")];

            const text = editor.document.getText();
            const lines = text.split(/\r?\n/);

            let bodyCharCount = 0; // セリフ・地の文
            let uniqueSpeakers = new Set<string>(); // 話者名の集合

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || isSkipNaninovelSyntax(trimmed)) continue;

                // タグ除去（ルビやFGタグなど、中身だけを残す）
                const cleanLine = trimFgTag(trimBrTag(trimRuby(trimmed)));

                // 話者とセリフの分離
                // Naninovelの「話者:」は行頭から始まり、その後にセリフが続く形式
                // 例: "Yuko: こんにちは" -> speaker: "Yuko", content: "こんにちは"
                const genericTextMatch = cleanLine.match(/^([^:\s]+)\s*:\s*(.*)$/);

                if (genericTextMatch) {
                    const speaker = genericTextMatch[1];
                    const content = genericTextMatch[2];

                    uniqueSpeakers.add(speaker);
                    bodyCharCount += content.length;
                } else {
                    // 話者がいない場合（地の文など）
                    // コマンド（@から始まる行）は isSkipNaninovelSyntax で除外済みのはず
                    bodyCharCount += cleanLine.length;
                }
            }

            // ユニーク話者名の合計
            const totalSpeakerNameChars = Array.from(uniqueSpeakers).join('').length;

            return [
                new StatItem("セリフ・地の文", `${bodyCharCount} 文字`, "comment-discussion"),
                new StatItem("話者名 (重複なし)", `${totalSpeakerNameChars} 文字`, "person"),
                new StatItem("合計 (シート換算用)", `${bodyCharCount + totalSpeakerNameChars} 文字`, "layers")
            ];
        } catch (err) {
            return [new StatItem("解析エラー発生", String(err), "error")];
        }
    }
}