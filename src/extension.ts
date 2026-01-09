import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    // 1. 統計データの提供元（Provider）をインスタンス化
    const statsProvider = new NaniStatsProvider();

    // 2. サイドバーのビューにProviderを登録
    vscode.window.registerTreeDataProvider('naniStatsView', statsProvider);

    // 3. ファイルを保存したときに統計を更新する設定
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(() => statsProvider.refresh())
    );

    // 4. PDF出力コマンドの実装
    context.subscriptions.push(
        vscode.commands.registerCommand('nani-distiller.exportPdf', () => {
            vscode.window.showInformationMessage('PDF出力機能はここに実装します');
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
class NaniStatsProvider implements vscode.TreeDataProvider<StatItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<StatItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: StatItem): vscode.TreeItem {
        return element;
    }

    async getChildren(): Promise<StatItem[]> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return [new StatItem("エディタが開かれていません", "", "info")];
        }

        const text = editor.document.getText();
        
        // --- ここであなたのライブラリを呼び出すイメージ ---
        // 例: const result = yourLibrary.analyze(text);
        // 現在はダミー数値を表示します
        
        return [
            new StatItem("セリフ（純文字数）", "1,234 文字", "comment-discussion"),
            new StatItem("話者名（ユニーク）", "56 文字", "person"),
            new StatItem("除外（スクリプト）", "89 行", "code")
        ];
    }
}