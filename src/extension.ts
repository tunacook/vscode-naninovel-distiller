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

// --- 型定義 ---
type ItemType = 'root_summary' | 'folder' | 'file' | 'speaker_group' | 'speaker_name';

type Stats = {
    body: number;
    words: number;
    speakers: Set<string>;
};

class StatItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly resourceUri?: vscode.Uri,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
        public readonly type: ItemType = 'file',
        public readonly statsData?: { body: number; words: number; speakerList: string[] }
    ) {
        super(label, collapsibleState);
        
        if (statsData) {
            if (type === 'file' || type === 'folder') {
                this.description = `${statsData.body.toLocaleString()} characters / ${statsData.words.toLocaleString()} words`;
                this.tooltip = `文字数: ${statsData.body}\nワード数: ${statsData.words}\n話者数: ${statsData.speakerList.length}名`;
            }
        }

        // アイコン設定
        switch (type) {
            case 'folder': this.iconPath = vscode.ThemeIcon.Folder; break;
            case 'file': this.iconPath = new vscode.ThemeIcon('file-text'); break;
            case 'speaker_group': 
                this.iconPath = new vscode.ThemeIcon('organization');
                this.description = statsData ? `${statsData.speakerList.length} 名` : "";
                break;
            case 'speaker_name': this.iconPath = new vscode.ThemeIcon('account'); break;
            case 'root_summary': this.iconPath = new vscode.ThemeIcon('info'); break;
        }
    }
}

class NaninovelStatsProvider implements vscode.TreeDataProvider<StatItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<StatItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    refresh(): void { this._onDidChangeTreeData.fire(); }
    getTreeItem(element: StatItem): vscode.TreeItem { return element; }

    async getChildren(element?: StatItem): Promise<StatItem[]> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!workspaceRoot) {return [];}

        // 1. ルート表示（プロジェクト全体の解析）
        if (!element) {
            const config = vscode.workspace.getConfiguration('naninovelDistiller');
            const excludeDirs = config.get<string[]>('excludeDirectories') || [];
            const allStats = await this.getDeepStats(workspaceRoot, excludeDirs);
            const flat = this.flatten(allStats);

            return [
                // プロジェクト全体の話者リストを独立したトップ項目として出す
                new StatItem("プロジェクト全話者リスト", undefined, vscode.TreeItemCollapsibleState.Collapsed, 'speaker_group', flat),
                // その下にディレクトリ構造を並べる
                ...(await this.getFolderItems(workspaceRoot, excludeDirs))
            ];
        }

        // 2. 話者リスト項目の展開
        if (element.type === 'speaker_group' && element.statsData) {
            return element.statsData.speakerList.sort().map(name => 
                new StatItem(name, undefined, vscode.TreeItemCollapsibleState.None, 'speaker_name')
            );
        }

        // 3. フォルダ項目の展開
        if (element.type === 'folder' && element.resourceUri) {
            const config = vscode.workspace.getConfiguration('naninovelDistiller');
            const excludeDirs = config.get<string[]>('excludeDirectories') || [];
            return this.getFolderItems(element.resourceUri, excludeDirs);
        }

        // 4. ファイル項目の展開（内訳のみ）
        if (element.type === 'file' && element.statsData) {
            return [
                new StatItem(`文字数: ${element.statsData.body.toLocaleString()}`, undefined, vscode.TreeItemCollapsibleState.None, 'root_summary'),
                new StatItem(`ワード数: ${element.statsData.words.toLocaleString()}`, undefined, vscode.TreeItemCollapsibleState.None, 'root_summary'),
                new StatItem("登場話者", undefined, vscode.TreeItemCollapsibleState.Collapsed, 'speaker_group', element.statsData)
            ];
        }

        return [];
    }

    // 特定のディレクトリ内の中身（フォルダとファイル）を生成する共通処理
    private async getFolderItems(uri: vscode.Uri, excludeDirs: string[]): Promise<StatItem[]> {
        const children = await vscode.workspace.fs.readDirectory(uri);
        const items: StatItem[] = [];

        for (const [name, type] of children) {
            const childUri = vscode.Uri.joinPath(uri, name);
            if (type === vscode.FileType.Directory) {
                if (excludeDirs.includes(name)) {continue;}
                const stats = await this.getDeepStats(childUri, excludeDirs);
                items.push(new StatItem(name, childUri, vscode.TreeItemCollapsibleState.Collapsed, 'folder', this.flatten(stats)));
            } else if (name.endsWith('.nani')) {
                const stats = await this.countFileStats(childUri);
                items.push(new StatItem(name, childUri, vscode.TreeItemCollapsibleState.Collapsed, 'file', this.flatten(stats)));
            }
        }
        return items.sort((a, b) => (b.collapsibleState - a.collapsibleState) || a.label.localeCompare(b.label));
    }

    private flatten(s: Stats) {
        return { body: s.body, words: s.words, speakerList: Array.from(s.speakers) };
    }

    private async getDeepStats(folderUri: vscode.Uri, excludeDirs: string[]): Promise<Stats> {
        let body = 0, words = 0;
        const speakers = new Set<string>();
        const children = await vscode.workspace.fs.readDirectory(folderUri);
        for (const [name, type] of children) {
            const uri = vscode.Uri.joinPath(folderUri, name);
            if (type === vscode.FileType.Directory) {
                if (excludeDirs.includes(name)) {continue;}
                const sub = await this.getDeepStats(uri, excludeDirs);
                body += sub.body; words += sub.words;
                sub.speakers.forEach(v => speakers.add(v));
            } else if (name.endsWith('.nani')) {
                const sub = await this.countFileStats(uri);
                body += sub.body; words += sub.words;
                sub.speakers.forEach(v => speakers.add(v));
            }
        }
        return { body, words, speakers };
    }

    private async countFileStats(uri: vscode.Uri): Promise<Stats> {
        try {
            const data = await vscode.workspace.fs.readFile(uri);
            const text = new TextDecoder().decode(data);
            let body = 0, words = 0;
            const speakers = new Set<string>();
            for (const line of text.split(/\r?\n/)) {
                const t = line.trim();
                if (!t || isSkipNaninovelSyntax(t)) {continue;}
                const clean = trimFgTag(trimBrTag(trimRuby(t)));
                const match = clean.match(/^([^:\s]+)\s*:\s*(.*)$/);
                const content = match ? match[2] : clean;
                if (match) {
                    const n = match[1].trim();
                    if (n) {speakers.add(n);}
                }
                body += content.length;
                words += content.split(/[\s\p{P}]+/u).filter(w => w.length > 0).length;
            }
            return { body, words, speakers };
        } catch { return { body: 0, words: 0, speakers: new Set() }; }
    }
}