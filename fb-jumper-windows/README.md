# FB Jumper Windows インストーラー

このフォルダには、FB Jumper（CEP拡張）の Windows 用インストーラーが入っています。

## 必要なもの

- Windows
- Adobe Premiere Pro を終了してから実行

## かんたん実行

FB Jumper の zip を解凍し、このスクリプトを同じフォルダに置いた場合：

```
install-windows.bat
```

PowerShell から実行する場合：

```powershell
PowerShell -NoProfile -ExecutionPolicy Bypass -File ".\install-windows.ps1"
```

## zip からインストール

```powershell
PowerShell -NoProfile -ExecutionPolicy Bypass -File ".\install-windows.ps1" -ZipPath "$env:USERPROFILE\Downloads\FB-Jumper-v1.4.3_windows.zip"
```

一時フォルダに解凍してインストールし、最後に自動で削除します。

## 解凍済みフォルダからインストール

```powershell
PowerShell -NoProfile -ExecutionPolicy Bypass -File ".\install-windows.ps1" -SourceDir "C:\Users\you\Downloads\FB-Jumper-v1.4.3"
```

## 全ユーザー向けインストール（管理者）

```powershell
PowerShell -NoProfile -ExecutionPolicy Bypass -File ".\install-windows.ps1" -AllUsers
```

## インストーラーの動作

- 拡張ファイルを以下にコピー
  - ユーザー: `%APPDATA%\Adobe\CEP\extensions\premiere-fb-jumper`
  - 全ユーザー: `%ProgramFiles(x86)%\Common Files\Adobe\CEP\extensions\premiere-fb-jumper`
- CSXS PlayerDebugMode を有効化（CSXS 9-16）
- CEP デバッグ用の `.debug` を作成
- FB Jumper 関連の CEP キャッシュを削除

## インストール後

Premiere Pro を再起動し、以下から開きます：

`Window > Extensions (Legacy) > FB Jumper`
