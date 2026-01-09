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

class StatItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly resourceUri?: vscode.Uri, // ファイルパスを保持
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
        public readonly stats?: { body: number; speaker: number }
    ) {
        super(label, collapsibleState);
        
        if (stats) {
            this.description = `${stats.body + stats.speaker} 文字`;
            this.tooltip = `セリフ: ${stats.body} / 話者: ${stats.speaker}`;
        }

        // フォルダならフォルダアイコン、ファイルならファイルアイコン
        if (collapsibleState === vscode.TreeItemCollapsibleState.Collapsed) {
            this.iconPath = vscode.ThemeIcon.Folder;
        } else {
            this.iconPath = vscode.ThemeIcon.File;
            this.contextValue = 'file'; // 右クリックメニューなどの判定用
        }
    }
}

class NaninovelStatsProvider implements vscode.TreeDataProvider<StatItem> {
    // イベント通知用のエミッター（refreshメソッドで使用）
    private _onDidChangeTreeData = new vscode.EventEmitter<StatItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    // 表示を更新するためのメソッド
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    // 各アイテムの見た目を決定する
    getTreeItem(element: StatItem): vscode.TreeItem {
        return element; // StatItem自体がTreeItemを継承しているのでそのまま返す
    }

    // ツリーの階層構造を決定する
    async getChildren(element?: StatItem): Promise<StatItem[]> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!workspaceRoot) { return []; }

        const folderUri = element ? element.resourceUri : workspaceRoot;
        if (!folderUri) { return []; }

        try {
            const children = await vscode.workspace.fs.readDirectory(folderUri);
            const items: StatItem[] = [];

            for (const [name, type] of children) {
                const uri = vscode.Uri.joinPath(folderUri, name);

                if (type === vscode.FileType.Directory) {
                    items.push(new StatItem(name, uri, vscode.TreeItemCollapsibleState.Collapsed));
                } else if (name.endsWith('.nani')) {
                    const stats = await this.countFileStats(uri);
                    items.push(new StatItem(name, uri, vscode.TreeItemCollapsibleState.None, stats));
                }
            }

            return items.sort((a, b) => (b.collapsibleState - a.collapsibleState) || a.label.localeCompare(b.label));
        } catch (err) {
            console.error("Failed to read directory:", err);
            return [];
        }
    }

    // カウントロジック
    private async countFileStats(uri: vscode.Uri): Promise<{ body: number; speaker: number }> {
        try {
            const uint8Array = await vscode.workspace.fs.readFile(uri);
            const text = new TextDecoder().decode(uint8Array);
            
            let bodyCharCount = 0;
            let speakerNameCount = 0;
            const uniqueSpeakers = new Set<string>();

            const lines = text.split(/\r?\n/);
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || isSkipNaninovelSyntax(trimmed)) { continue; }

                const cleanLine = trimFgTag(trimBrTag(trimRuby(trimmed)));
                const match = cleanLine.match(/^([^:\s]+)\s*:\s*(.*)$/);
                
                if (match) {
                    uniqueSpeakers.add(match[1]);
                    bodyCharCount += match[2].length;
                } else {
                    bodyCharCount += cleanLine.length;
                }
            }
            
            uniqueSpeakers.forEach(name => speakerNameCount += name.length);
            return { body: bodyCharCount, speaker: speakerNameCount };
        } catch (e) {
            return { body: 0, speaker: 0 };
        }
    }
}