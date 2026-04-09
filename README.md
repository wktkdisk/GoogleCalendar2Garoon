# GoogleCalendar2Garoon

Google Calendar のイベントを Garoon (サイボウズ) に自動同期する Node.js スクリプトです。

Google Apps Script 版 (`code.gs`) を、ローカルの Node.js から実行できるように移植したものです。

## 動作概要

- Google Calendar のイベント（今日〜4ヶ月後）を取得
- Garoon の同じ期間のイベントと照合
  - Garoon に存在しない → **新規登録**
  - 両方に存在するが内容が違う → **更新**
  - Garoon に存在するが Google にない（自分が作成したもの） → **削除**
- Google イベントの `htmlLink` を Garoon の `notes` フィールドに保存することで同一イベントを識別

## 必要環境

- Node.js 18 以上
- Garoon にアクセスできるネットワーク環境

---

## セットアップ手順

### 1. リポジトリをクローン

```bash
git clone https://github.com/wktkdisk/GoogleCalendar2Garoon.git
cd GoogleCalendar2Garoon
npm install
```

### 2. 環境変数ファイルを作成

```bash
cp .env.example .env
```

`.env` を開いて各項目を設定してください。

| 変数名 | 説明 |
|---|---|
| `GOOGLE_CALENDAR_ID` | 同期元カレンダーのID（通常はGmailアドレス） |
| `GAROON_API` | GaroonのREST APIエンドポイントURL |
| `GAROON_USERNAME` | Garoonのログイン名 |
| `GAROON_PASSWORD` | Garoonのパスワード |
| `GAROON_USER_ID` | GaroonでのあなたのユーザーID（数値） |
| `TIMEZONE` | タイムゾーン（デフォルト: `Asia/Tokyo`） |

> **GaroonユーザーIDの確認方法**
> Garoonにログインし、プロフィールページの URL に含まれる `uid=数字` の数字部分です。

### 3. Googleの認証設定

Google Calendar API を使用するため、OAuth 2.0 の認証情報が必要です。
> 2026/04/09現在の手順です。

#### 3-1. Google Cloud Console でプロジェクトを作成

1. [Google Cloud Console](https://console.cloud.google.com/) を開く
2. 上部のプロジェクト選択 → **「新しいプロジェクト」** をクリック
3. プロジェクト名（例: `calendar-to-garoon`）を入力して作成
4. 上部のプロジェクト選択 → 作成したプロジェクトを選択

#### 3-2. Google Calendar API を有効化

1. クイックアクセス → **「APIとサービス」** → **「ライブラリ」**
2. 検索欄に `Google Calendar API` と入力
3. **「Google Calendar API」** を選択 → **「有効にする」**

#### 3-3. OAuth 同意画面を設定

1. 左メニュー → **「APIとサービス」** → **「OAuth 同意画面」** → 「開始」
2. 「アプリ情報」の入力
   - アプリ名: 任意（例: `Calendar Sync`）
   - ユーザーサポートメール: 自分のGmailアドレス → 「次へ」
3. 「対象」の選択 → **「外部」** を選択 → 「次へ」
4. 「連絡先情報」の入力
   - 連絡先情報: 自分のGmailアドレス → 「次へ」
5. 「終了」 → 「同意します」をチェック → 「続行」 → **「作成」**
6. 左メニュー → **「対象」** → 「テストユーザー」の**「+Add users」** → 自分のGmailアドレスを追加

#### 3-4. OAuth 2.0 クライアントIDを作成

1. 左メニュー → **「クライアント」** → **「クライアントを作成」**
2. アプリケーションの種類: **「デスクトップアプリ」** を選択
3. 名前: 任意（例: `Calendar Sync Desktop`） → 「作成」
4. **「JSONをダウンロード」**
5. ダウンロードしたファイルを **`credentials.json`** という名前でプロジェクトルートに配置

```
GoogleCalendar2Garoon/
├── credentials.json   ← ここに配置
├── .env
├── src/
└── ...
```

> `credentials.json` と `token.json` は `.gitignore` に含まれています。
> **絶対にコミットしないでください。**

### 4. 初回実行（ブラウザ認証）

```bash
npm start
```

初回のみ、ターミナルにURLが表示されます。

```
【初回認証】以下のURLをブラウザで開いてGoogleアカウントにログインしてください:

https://accounts.google.com/o/oauth2/auth?...

ブラウザで認証が完了すると、自動的に処理が続きます...
```

1. URLをブラウザで開く
2. Googleアカウントでログイン
3. 「このアプリはGoogleで確認されていません」と表示される場合は **「詳細」→「〜に移動（安全でない）」** をクリック
4. カレンダーへのアクセスを **「許可」**
5. ブラウザに「認証成功！」と表示されたらターミナルに戻る

認証情報は `token.json` に保存されます。2回目以降は認証不要です。

---

## 実行方法

```bash
npm start
```

実行例:

```
Google Calendar からイベントを取得中...
  → 42 件
Garoon からイベントを取得中...
  → 38 件
追加: 定例ミーティング
更新: 出張（大阪）
削除: キャンセルされた予定
...
同期が完了しました。
```

### 定期実行する場合（cron）

毎日9時に同期する設定例:

```bash
# crontab -e
0 9 * * * cd /path/to/GoogleCalendar2Garoon && node src/index.js >> sync.log 2>&1
```

---

## ファイル構成

```
GoogleCalendar2Garoon/
├── src/
│   ├── index.js          # エントリポイント・同期ロジック
│   ├── auth.js           # Google OAuth2認証
│   ├── googleCalendar.js # Google Calendar APIラッパー
│   └── garoon.js         # Garoon APIラッパー
├── code.gs               # 元のGoogle Apps Script版（参考用）
├── .env.example          # 環境変数のテンプレート
├── .gitignore
├── package.json
└── README.md
```

## 注意事項

- `credentials.json`, `token.json`, `.env` は機密情報です。GitHubにコミットしないよう `.gitignore` で除外しています。
- Garoon APIのエンドポイントやユーザーIDはシステム管理者に確認してください。
- 本スクリプトは「自分が作成したGaroonイベント」のみを管理します。他のユーザーが作成したイベントは変更しません。

## ライセンス

MIT
