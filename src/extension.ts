import * as vscode from 'vscode';
import { isSkipNaninovelSyntax, trimRuby, trimBrTag, trimFgTag } from 'naninovel-script-spec';

export function activate(context: vscode.ExtensionContext) {
    const statsProvider = new NaninovelStatsProvider();
    vscode.window.registerTreeDataProvider('naninovelStatsView', statsProvider);

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(() => statsProvider.refresh()),
        vscode.workspace.onDidSaveTextDocument(() => statsProvider.refresh()),
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('naninovelDistiller')) {
                statsProvider.refresh();
            }
        })
    );
}

// --- 型定義 ---
type ItemType = 'root_summary' | 'folder' | 'file' | 'speaker_group' | 'speaker_name' | 'word_group' | 'word_name';

type Stats = {
    body: number;
    words: number;
    speakers: Set<string>;
    wordList: string[]; // 単語の内訳を保持
};

type FlatStats = {
    body: number;
    words: number;
    speakerList: string[];
    wordList: string[]; // Flatデータにも単語リストを保持
};

class StatItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly resourceUri?: vscode.Uri,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
        public readonly type: ItemType = 'file',
        public readonly statsData?: FlatStats
    ) {
        super(label, collapsibleState);

        if (statsData) {
            if (type === 'file' || type === 'folder') {
                this.description = `${statsData.body.toLocaleString()} characters / ${statsData.words.toLocaleString()} words`;
                this.tooltip = `文字数: ${statsData.body}\nワード数: ${statsData.words}\n話者数: ${statsData.speakerList.length} Speakers (unique)`;
            }
        }

        switch (type) {
            case 'folder':
                this.iconPath = vscode.ThemeIcon.Folder;
                break;
            case 'file':
                this.iconPath = new vscode.ThemeIcon('file-text');
                break;
            case 'speaker_group':
                this.iconPath = new vscode.ThemeIcon('organization');
                if (statsData) {
                    this.description = `${statsData.speakerList.length} Speakers (unique)`;
                }
                break;
            case 'word_group':
                this.iconPath = new vscode.ThemeIcon('word-file');
                break;
            case 'speaker_name':
                this.iconPath = new vscode.ThemeIcon('account');
                break;
            case 'word_name':
                this.iconPath = new vscode.ThemeIcon('tag');
                break;
            case 'root_summary':
                this.iconPath = new vscode.ThemeIcon('info');
                break;
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

    private getExcludeDirs(): string[] {
        return vscode.workspace.getConfiguration('naninovelDistiller').get<string[]>('excludeDirectories') || [];
    }

    async getChildren(element?: StatItem): Promise<StatItem[]> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!workspaceRoot) {return [];}

        // 1. ルート: 全話者とフォルダを表示
        if (!element) {
            const excludeDirs = this.getExcludeDirs();
            const allStats = await this.getDeepStats(workspaceRoot, excludeDirs);
            const flat = this.flatten(allStats);

            return [
                new StatItem("All Speakers", undefined, vscode.TreeItemCollapsibleState.Collapsed, 'speaker_group', flat),
                ...(await this.getFolderItems(workspaceRoot, excludeDirs))
            ];
        }

        // 2. 話者リストの展開
        if (element.type === 'speaker_group' && element.statsData) {
            return element.statsData.speakerList.sort().map(name =>
                new StatItem(name, undefined, vscode.TreeItemCollapsibleState.None, 'speaker_name')
            );
        }

        // 3. ワードリスト（内訳）の展開
        if (element.type === 'word_group' && element.statsData) {
            // 重複排除してソート
            const uniqueWords = Array.from(new Set(element.statsData.wordList)).sort();
            return uniqueWords.map(word =>
                new StatItem(word, undefined, vscode.TreeItemCollapsibleState.None, 'word_name')
            );
        }

        // 4. フォルダの展開
        if (element.type === 'folder' && element.resourceUri) {
            const excludeDirs = this.getExcludeDirs();
            return this.getFolderItems(element.resourceUri, excludeDirs);
        }

        // 5. ファイルの展開（内訳を表示）
        if (element.type === 'file' && element.statsData) {
            return [
                new StatItem(`文字数: ${element.statsData.body.toLocaleString()} characters`, undefined, vscode.TreeItemCollapsibleState.None, 'root_summary'),
                // ワード数を展開可能に変更
                new StatItem(`ワード数: ${element.statsData.words.toLocaleString()} words`, undefined, vscode.TreeItemCollapsibleState.Collapsed, 'word_group', element.statsData),
                new StatItem("このファイルの話者", undefined, vscode.TreeItemCollapsibleState.Collapsed, 'speaker_group', element.statsData)
            ];
        }

        return [];
    }

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

    private flatten(s: Stats): FlatStats {
        return {
            body: s.body,
            words: s.words,
            speakerList: Array.from(s.speakers),
            wordList: s.wordList
        };
    }

    private async getDeepStats(folderUri: vscode.Uri, excludeDirs: string[]): Promise<Stats> {
        let body = 0, words = 0;
        const speakers = new Set<string>();
        const wordList: string[] = [];
        const children = await vscode.workspace.fs.readDirectory(folderUri);

        for (const [name, type] of children) {
            const uri = vscode.Uri.joinPath(folderUri, name);
            if (type === vscode.FileType.Directory) {
                if (excludeDirs.includes(name)) {continue;}
                const sub = await this.getDeepStats(uri, excludeDirs);
                body += sub.body; words += sub.words;
                sub.speakers.forEach(v => speakers.add(v));
                wordList.push(...sub.wordList);
            } else if (name.endsWith('.nani')) {
                const sub = await this.countFileStats(uri);
                body += sub.body; words += sub.words;
                sub.speakers.forEach(v => speakers.add(v));
                wordList.push(...sub.wordList);
            }
        }
        return { body, words, speakers, wordList };
    }

    private async countFileStats(uri: vscode.Uri): Promise<Stats> {
        try {
            const data = await vscode.workspace.fs.readFile(uri);
            const text = new TextDecoder().decode(data);
            let body = 0, words = 0;
            const speakers = new Set<string>();
            const wordList: string[] = [];

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

                // 単語の抽出とカウント
                const extractedWords = content.split(/[\s\p{P}]+/u).filter((w: string) => w.length > 0);
                words += extractedWords.length;
                wordList.push(...extractedWords);
            }
            return { body, words, speakers, wordList };
        } catch {
            return { body: 0, words: 0, speakers: new Set(), wordList: [] };
        }
    }
}