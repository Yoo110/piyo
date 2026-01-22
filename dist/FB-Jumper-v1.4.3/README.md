# FB Jumper - Premiere Pro フィードバックジャンパー

Premiere Proでフィードバックラインから直接タイムコードにジャンプしたり、マーカーを追加したりできる拡張機能です。

## 機能

- フィードバックラインをテキストで貼り付け
- タイムコードを自動解析
- ワンクリックで該当時間にジャンプ
- マーカーを自動追加

## 対応バージョン

- Premiere Pro 14.0 以降（2025 / 25.6.4 で動作確認）

## インストール

### 開発版のインストール

```bash
cd /Users/ueday/Developer/piyo/premiere-fb-jumper
./install.sh
```

### 手動インストール

1. プロジェクトフォルダ全体を以下の場所にコピー：
   - macOS: `~/Library/Application Support/Adobe/CEP/extensions/premiere-fb-jumper`
   - Windows: `%AppData%\Adobe\CEP\extensions\premiere-fb-jumper`

2. 未署名拡張を有効化：
   - macOS: `~/Library/Preferences/com.adobe.CSXS.13.plist` に `PlayerDebugMode` を数値 `1` で追加（Premiere Pro 2025 / 25.6.4）
     - 旧バージョン: `CSXS.12/11/10` を使用
   - Windows: `HKEY_CURRENT_USER/Software/Adobe/CSXS.13` に `PlayerDebugMode` を文字列 `1` で追加（Premiere Pro 2025 / 25.6.4）
     - 旧バージョン: `CSXS.12/11/10` を使用

3. Premiere Proを再起動

4. ウィンドウ > 拡張機能（レガシー）> FB Jumper を開く

## 使い方

1. フィードバックラインをコピー（例：`5:48 クリックノイズ`）
2. **textareaを右クリック → ペースト**（最も確実）
3. 「解析」ボタンをクリック
4. 結果リストから時間ボタンをクリックしてジャンプ、または●ボタンでマーカー追加

### ペースト機能について

**推奨方法**: 右クリック → ペースト（最も確実に動作します）

その他の方法：
- Cmd+V / Ctrl+V（動作が不安定な場合があります）

※ CEP環境の制約により、Cmd+VはPremiereのショートカットと競合して不安定になることがあります。右クリック→ペーストが最も確実です。

## 開発

### バージョン更新

```bash
# バージョン番号を更新（例：1.2.0に更新）
./update-version.sh 1.2.0 "新機能の説明"

# プラグインをインストール
./install.sh
```

### 手動でバージョン更新する場合

1. `VERSION.txt` - バージョン番号と履歴を更新
2. `CSXS/manifest.xml` - `ExtensionBundleVersion` と `Version` を更新
3. `index.html` - `<div class="version">` のバージョン番号を更新

### デバッグ

CEPパネルのデバッグコンソールを開く：

- Chrome: `chrome://inspect` または `http://localhost:8092`
- コンソールログに `[FB Jumper]` で始まるログが表示されます

## ライセンス

MIT License
