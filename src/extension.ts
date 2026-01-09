import * as vscode from 'vscode';
import { isSkipNaninovelSyntax, trimRuby, trimBrTag, trimFgTag } from 'naninovel-script-spec';

export function activate(context: vscode.ExtensionContext) {
    const statsProvider = new NaninovelStatsProvider();
    vscode.window.registerTreeDataProvider('naninovelStatsView', statsProvider);

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(() => statsProvider.refresh()),
        vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document === vscode.window.activeTextEditor?.document) {
                statsProvider.refresh();
            }
        })
    );
}

// アイテムの型定義
type ItemType = 'folder' | 'file' | 'detail';

class StatItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly resourceUri?: vscode.Uri,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
        public readonly stats?: { body: number; speaker: number },
        public readonly type: ItemType = 'file'
    ) {
        super(label, collapsibleState);
        
        if (type === 'file' && stats) {
            const total = stats.body + stats.speaker;
            this.description = `${total} 文字`;
            this.tooltip = `合計: ${total}文字 (セリフ: ${stats.body} / 話者: ${stats.speaker})`;
            this.iconPath = new vscode.ThemeIcon('file-text');
        } else if (type === 'folder') {
            this.iconPath = vscode.ThemeIcon.Folder;
        } else if (type === 'detail') {
            this.description = stats ? `${stats.body} 文字` : "";
            // 内訳用のアイコン設定
            const icon = label.includes("セリフ") ? "comment" : "person";
            this.iconPath = new vscode.ThemeIcon(icon);
        }
    }
}

class NaninovelStatsProvider implements vscode.TreeDataProvider<StatItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<StatItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: StatItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: StatItem): Promise<StatItem[]> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!workspaceRoot) { return []; }

        // 1. ファイルの下に「内訳」を表示する場合
        if (element && element.type === 'file' && element.stats) {
            return [
                new StatItem("セリフ純文字数", undefined, vscode.TreeItemCollapsibleState.None, { body: element.stats.body, speaker: 0 }, 'detail'),
                new StatItem("話者名（重複除外）", undefined, vscode.TreeItemCollapsibleState.None, { body: element.stats.speaker, speaker: 0 }, 'detail')
            ];
        }

        // 2. ディレクトリ走査
        const folderUri = element ? element.resourceUri : workspaceRoot;
        if (!folderUri) { return []; }

        try {
            // 設定から除外リストを取得
            const config = vscode.workspace.getConfiguration('naninovelDistiller');
            const excludeDirs = config.get<string[]>('excludeDirectories') || [];

            const children = await vscode.workspace.fs.readDirectory(folderUri);
            const items: StatItem[] = [];

            for (const [name, type] of children) {
                // 除外設定に含まれる名前のディレクトリをスキップ
                if (type === vscode.FileType.Directory && excludeDirs.includes(name)) {
                    continue;
                }

                const uri = vscode.Uri.joinPath(folderUri, name);

                if (type === vscode.FileType.Directory) {
                    items.push(new StatItem(name, uri, vscode.TreeItemCollapsibleState.Collapsed, undefined, 'folder'));
                } else if (name.endsWith('.nani')) {
                    const stats = await this.countFileStats(uri);
                    // ファイル自体を展開可能にして内訳が見えるようにする
                    items.push(new StatItem(name, uri, vscode.TreeItemCollapsibleState.Collapsed, stats, 'file'));
                }
            }

            return items.sort((a, b) => (b.collapsibleState - a.collapsibleState) || a.label.localeCompare(b.label));
        } catch (err) {
            return [];
        }
    }

    private async countFileStats(uri: vscode.Uri): Promise<{ body: number; speaker: number }> {
        try {
            const uint8Array = await vscode.workspace.fs.readFile(uri);
            const text = new TextDecoder().decode(uint8Array);
            
            let bodyCharCount = 0;
            const uniqueSpeakers = new Set<string>();

            const lines = text.split(/\r?\n/);
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || isSkipNaninovelSyntax(trimmed)) { continue; }

                const cleanLine = trimFgTag(trimBrTag(trimRuby(trimmed)));
                const match = cleanLine.match(/^([^:\s]+)\s*:\s*(.*)$/);
                
                if (match) {
                    uniqueSpeakers.add(match[1].trim());
                    bodyCharCount += match[2].length;
                } else {
                    bodyCharCount += cleanLine.length;
                }
            }
            
            let speakerNameCount = 0;
            uniqueSpeakers.forEach(name => speakerNameCount += name.length);
            return { body: bodyCharCount, speaker: speakerNameCount };
        } catch (e) {
            return { body: 0, speaker: 0 };
        }
    }
}