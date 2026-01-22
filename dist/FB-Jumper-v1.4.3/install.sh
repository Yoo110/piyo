#!/bin/bash

echo "========================================="
echo "FB Jumper インストーラー"
echo "========================================="
echo ""

# バージョン表示
if [ -f "VERSION.txt" ]; then
    VERSION=$(head -1 VERSION.txt)
    echo "バージョン: $VERSION"
    echo ""
fi

# インストール先ディレクトリ
INSTALL_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions/premiere-fb-jumper"

# 既存のインストールを確認
if [ -d "$INSTALL_DIR" ]; then
    echo "既存のインストールが見つかりました。"
    echo "上書きしますか？ (y/n)"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo "インストールをキャンセルしました。"
        exit 0
    fi
    echo ""
fi

# インストール先ディレクトリを作成
echo "インストール先を準備中..."
mkdir -p "$INSTALL_DIR"

# ファイルをコピー
echo "ファイルをコピー中..."
cp -r css "$INSTALL_DIR/"
cp -r js "$INSTALL_DIR/"
cp -r lib "$INSTALL_DIR/"
cp -r host "$INSTALL_DIR/"
cp -r CSXS "$INSTALL_DIR/"
cp index.html "$INSTALL_DIR/"
cp README.md "$INSTALL_DIR/"
cp 使い方.md "$INSTALL_DIR/" 2>/dev/null || true
cp VERSION.txt "$INSTALL_DIR/" 2>/dev/null || true

echo ""
echo "✓ ファイルのインストール完了！"
echo ""

# デバッグモードを有効化（全バージョン対応）
echo "========================================="
echo "Adobe CEP デバッグモードを有効化中..."
echo "========================================="
echo "すべてのPremiere Proバージョンに対応するため、複数のCSXSバージョンを設定します..."
defaults write com.adobe.CSXS.13 PlayerDebugMode 1
defaults write com.adobe.CSXS.9 PlayerDebugMode 1
defaults write com.adobe.CSXS.10 PlayerDebugMode 1
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
defaults write com.adobe.CSXS.12 PlayerDebugMode 1

# 設定の確認
echo ""
echo "デバッグモード設定状況:"
for version in 9 10 11 12 13; do
    DEBUG_MODE=$(defaults read com.adobe.CSXS.$version PlayerDebugMode 2>/dev/null)
    if [ "$DEBUG_MODE" = "1" ]; then
        echo "  ✓ CSXS.$version: 有効"
    fi
done

echo ""
echo "CEPキャッシュを削除中..."
CACHE_DIR="$HOME/Library/Caches/CSXS/cep_cache"
if [ -d "$CACHE_DIR" ]; then
    find "$CACHE_DIR" -maxdepth 1 -type d -name "*com.yasu.fbjumper.panel*" -exec rm -rf {} + 2>/dev/null || true
fi
echo "✓ CEPキャッシュを削除しました"
echo ""
echo "✓ すべてのインストール処理が完了しました！"
echo ""
echo "========================================="
echo "次の手順:"
echo "========================================="
echo "1. Premiere Pro を完全に終了してから再起動"
echo "2. ウィンドウ > 拡張機能（レガシー）> FB Jumper を開く"
echo ""
echo "使い方は README.md または 使い方.md を参照してください"
echo "========================================="
