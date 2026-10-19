# vscode-naninovel-distiller README

This is the README for your extension "vscode-naninovel-distiller". After writing up a brief description, we recommend including the following sections.

## ローカルでの実行方法

### 前提

* Node.js 24（CI と同じバージョン）
* pnpm 10.27.0（10.28 以降は git 依存の `onlyBuiltDependencies` が効かないため固定）
* VS Code 1.107.0 以上

### セットアップ

```sh
pnpm install
```

### デバッグ実行

1. このリポジトリを VS Code で開く
2. `F5` を押す（または「実行とデバッグ」ビューで `Run Extension` を選択して実行）
3. ビルドタスク `full-cleanup-build` が走り、`dist/extension.js` が生成された後、拡張機能が読み込まれた新しいウィンドウ（Extension Development Host）が開く
4. 開いたウィンドウで Naninovel シナリオを含むフォルダを開き、アクティビティバーの「Nani Distiller」から統計を確認する

コードを変更した場合は、Extension Development Host ウィンドウで `Cmd+R`（Windows/Linux は `Ctrl+R`）を押すか、デバッグツールバーの再起動ボタンで再読み込みする。

### その他のコマンド

```sh
pnpm run compile      # ビルド
pnpm run watch        # 変更を監視してビルド
pnpm run check-types  # 型チェック
pnpm run lint         # Lint
```

### VSIX を作成して手元の VS Code にインストールする

```sh
pnpm dlx @vscode/vsce package --no-dependencies
code --install-extension vscode-naninovel-distiller-0.0.1.vsix
```

## Features

Describe specific features of your extension including screenshots of your extension in action. Image paths are relative to this README file.

For example if there is an image subfolder under your extension project workspace:

\!\[feature X\]\(images/feature-x.png\)

> Tip: Many popular extensions utilize animations. This is an excellent way to show off your extension! We recommend short, focused animations that are easy to follow.

## Requirements

If you have any requirements or dependencies, add a section describing those and how to install and configure them.

## Extension Settings

### `naninovelDistiller.excludeDirectories`

統計スキャンから除外するディレクトリ名のリスト。

デフォルト値:

```json
["node_modules", ".git", ".github", ".prh", ".vscode", "docs", "staging-test"]
```

* ディレクトリ名の完全一致で判定する（パスやワイルドカードは使えない）
* 階層の深さに関係なく、同じ名前のディレクトリはすべて除外される
* 値を設定するとデフォルト値は丸ごと置き換わるため、デフォルトの除外も残したい場合は一緒に記載する
* 設定を変更すると統計ビューは自動で更新される

設定例（シナリオのワークスペースの `.vscode/settings.json`）:

```jsonc
{
  "naninovelDistiller.excludeDirectories": [
    "node_modules", ".git", ".github", ".prh", ".vscode", "docs", "staging-test",
    "drafts"
  ]
}
```

設定画面（`Cmd+,`、Windows/Linux は `Ctrl+,`）で「Naninovel Distiller」を検索しても変更できる。

なお、カウント対象のファイルは `.nani` 拡張子のみで、これは設定では変更できない。

## Known Issues

Calling out known issues can help limit users opening duplicate issues against your extension.

## Release Notes

Users appreciate release notes as you update your extension.

### 1.0.0

Initial release of ...

### 1.0.1

Fixed issue #.

### 1.1.0

Added features X, Y, and Z.

---

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
