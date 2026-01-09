import * as vscode from 'vscode';
import { isSkipNaninovelSyntax, trimRuby, trimBrTag, trimFgTag } from 'naninovel-script-spec';

export function activate(context: vscode.ExtensionContext) {
    const statsProvider = new NaninovelStatsProvider();
    vscode.window.registerTreeDataProvider('naninovelStatsView', statsProvider);

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(() => statsProvider.refresh()),
        vscode.workspace.onDidSaveTextDocument(() => statsProvider.refresh())
    );
}

type ItemType = 'folder' | 'file' | 'detail';

class StatItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly resourceUri?: vscode.Uri,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
        public readonly stats?: { body: number; words: number; speakerChars: number; speakerCount: number },
        public readonly type: ItemType = 'file'
    ) {
        super(label, collapsibleState);
        
        if (stats) {
            if (type === 'file' || type === 'folder') {
                // 略称を使わず「characters / words」と表記
                this.description = `${stats.body.toLocaleString()} characters / ${stats.words.toLocaleString()} words`;
                this.tooltip = `純文字数: ${stats.body}\nワード数: ${stats.words}\nユニーク話者数: ${stats.speakerCount} 名`;
            } else if (type === 'detail') {
                // 内訳の表示
                if (label.includes("話者数")) {
                    this.description = `${stats.speakerCount} 名`;
                } else if (label.includes("ワード数")) {
                    this.description = `${stats.words.toLocaleString()} words`;
                } else {
                    this.description = `${stats.body.toLocaleString()} characters`;
                }
            }
        }

        if (type === 'folder') {
            this.iconPath = vscode.ThemeIcon.Folder;
        } else if (type === 'file') {
            this.iconPath = new vscode.ThemeIcon('file-text');
        } else {
            const icon = label.includes("セリフ") ? "comment" : (label.includes("ワード") ? "word-file" : "person");
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
        if (!workspaceRoot) return [];

        // ファイルの子要素（内訳）
        if (element && element.type === 'file' && element.stats) {
            return [
                new StatItem("セリフ純文字数", undefined, vscode.TreeItemCollapsibleState.None, { ...element.stats }, 'detail'),
                new StatItem("ワード数", undefined, vscode.TreeItemCollapsibleState.None, { ...element.stats }, 'detail'),
                new StatItem("話者数（ユニーク）", undefined, vscode.TreeItemCollapsibleState.None, { ...element.stats }, 'detail')
            ];
        }

        const folderUri = element ? element.resourceUri : workspaceRoot;
        if (!folderUri) return [];

        try {
            const config = vscode.workspace.getConfiguration('naninovelDistiller');
            const excludeDirs = config.get<string[]>('excludeDirectories') || [];

            const children = await vscode.workspace.fs.readDirectory(folderUri);
            const items: StatItem[] = [];

            for (const [name, type] of children) {
                if (type === vscode.FileType.Directory && excludeDirs.includes(name)) continue;

                const uri = vscode.Uri.joinPath(folderUri, name);

                if (type === vscode.FileType.Directory) {
                    const stats = await this.getDeepStats(uri, excludeDirs);
                    items.push(new StatItem(name, uri, vscode.TreeItemCollapsibleState.Collapsed, this.flattenStats(stats), 'folder'));
                } else if (name.endsWith('.nani')) {
                    const stats = await this.countFileStats(uri);
                    items.push(new StatItem(name, uri, vscode.TreeItemCollapsibleState.Collapsed, this.flattenStats(stats), 'file'));
                }
            }

            return items.sort((a, b) => (b.collapsibleState - a.collapsibleState) || a.label.localeCompare(b.label));
        } catch { return []; }
    }

    // Setから表示用の数値に変換。このタイミングでディレクトリ内の全話者をマージしたユニーク数を確定
    private flattenStats(s: {body: number, words: number, speakers: Set<string>}) {
        let speakerChars = 0;
        s.speakers.forEach(name => speakerChars += name.length);
        return {
            body: s.body,
            words: s.words,
            speakerChars: speakerChars,
            speakerCount: s.speakers.size
        };
    }

    // 再帰的に統計を取得。Setをマージすることで、ディレクトリ全体のユニーク話者数を算出
    private async getDeepStats(folderUri: vscode.Uri, excludeDirs: string[]): Promise<{body: number, words: number, speakers: Set<string>}> {
        let body = 0, words = 0;
        const speakers = new Set<string>();

        const children = await vscode.workspace.fs.readDirectory(folderUri);
        for (const [name, type] of children) {
            const uri = vscode.Uri.joinPath(folderUri, name);
            if (type === vscode.FileType.Directory) {
                if (excludeDirs.includes(name)) continue;
                const sub = await this.getDeepStats(uri, excludeDirs);
                body += sub.body; 
                words += sub.words;
                sub.speakers.forEach(v => speakers.add(v)); // 話者名をセットに追加して重複排除
            } else if (name.endsWith('.nani')) {
                const sub = await this.countFileStats(uri);
                body += sub.body; 
                words += sub.words;
                sub.speakers.forEach(v => speakers.add(v));
            }
        }
        return { body, words, speakers };
    }

    private async countFileStats(uri: vscode.Uri): Promise<{body: number, words: number, speakers: Set<string>}> {
        try {
            const data = await vscode.workspace.fs.readFile(uri);
            const text = new TextDecoder().decode(data);
            let body = 0, words = 0;
            const speakers = new Set<string>();

            for (const line of text.split(/\r?\n/)) {
                const t = line.trim();
                if (!t || isSkipNaninovelSyntax(t)) continue;
                const clean = trimFgTag(trimBrTag(trimRuby(t)));
                const match = clean.match(/^([^:\s]+)\s*:\s*(.*)$/);
                
                const content = match ? match[2] : clean;
                if (match) speakers.add(match[1].trim());

                body += content.length;
                // 空白やUnicode指定の句読点クラスで分割してワードカウント
                words += content.split(/[\s\p{P}]+/u).filter(w => w.length > 0).length;
            }
            return { body, words, speakers };
        } catch { return { body: 0, words: 0, speakers: new Set() }; }
    }
}