/**
 * Google OAuth2 認証モジュール
 *
 * 初回実行時: ブラウザで認証 → token.json に保存
 * 2回目以降: token.json を読み込んで自動使用（有効期限切れは自動更新）
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { URL } = require('url');

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const TOKEN_PATH = path.resolve('token.json');
const CREDENTIALS_PATH = path.resolve('credentials.json');

/**
 * 認証済み OAuth2 クライアントを返す
 * token.json がなければブラウザ認証フローを実行する
 */
async function authorize() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      'credentials.json が見つかりません。\n' +
      'README.md の「Googleの認証設定」を参照してセットアップしてください。'
    );
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

  // 既存トークンがある場合はそれを使用
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    const client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    client.setCredentials(token);

    // アクセストークン更新時にファイルへ自動保存
    client.on('tokens', (newTokens) => {
      const current = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      fs.writeFileSync(TOKEN_PATH, JSON.stringify({ ...current, ...newTokens }, null, 2));
    });

    return client;
  }

  // 初回: ブラウザ認証フロー
  return getNewToken(client_id, client_secret);
}

/**
 * ローカルHTTPサーバーを立ててOAuth認証コードを受け取る
 */
function getNewToken(clientId, clientSecret) {
  return new Promise((resolve, reject) => {
    let serverPort;

    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url, `http://localhost:${serverPort}`);
        const code = reqUrl.searchParams.get('code');
        if (!code) return;

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body><h1>認証成功！このタブを閉じてターミナルに戻ってください。</h1></body></html>');
        server.close();

        const redirectUri = `http://localhost:${serverPort}`;
        const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
        const { tokens } = await client.getToken(code);
        client.setCredentials(tokens);

        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
        console.log(`✓ 認証成功。トークンを ${TOKEN_PATH} に保存しました。`);
        resolve(client);
      } catch (err) {
        server.close();
        reject(err);
      }
    });

    server.listen(0, 'localhost', () => {
      serverPort = server.address().port;
      const redirectUri = `http://localhost:${serverPort}`;
      const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

      const authUrl = client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
      });

      console.log('\n【初回認証】以下のURLをブラウザで開いてGoogleアカウントにログインしてください:\n');
      console.log(authUrl);
      console.log('\nブラウザで認証が完了すると、自動的に処理が続きます...\n');
    });
  });
}

module.exports = { authorize };
