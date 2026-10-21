# Astro + EmDash

既存のAstroプロジェクトがなかったため、独立したCMSを追加しました。GOLDEN HORSEのゲームや量子ラボとのデータ連携は含みません。

## ローカルで起動

Node.js 24を使用します。

```sh
cd apps/emdash-cms
npm ci
npm run secrets:generate
npm run dev
```

- ホーム: http://localhost:4321/
- 管理画面: http://localhost:4321/_emdash/admin/
- 公開記事の表示確認: http://localhost:4321/emdash-test/

管理画面でサイト情報・管理者を設定し、ご自身の端末でパスキーを登録してください。Postsから記事を作り、保存後に公開すると、表示確認ページにタイトルが表示されます。管理者アカウントやパスキーはあらかじめ作成していません。

暗号化キーは`.env`に保存します。すでに運用中のキーを再生成・交換すると、既存の暗号化されたプラグイン設定が読めなくなります。キーの保護されたバックアップを保持してください。

## 本番用ビルドと確認

```sh
npm run build
npm test
npm start
```

`npm start`は`.env`を読み込みます。本番で初期設定する前に、`.env`またはホスティング環境に`EMDASH_SITE_URL=https://実際のドメイン`を設定してください。`HOST`は待受アドレス、`PORT`は待受ポートです。外部アクセスとパスキーにはHTTPSを使用します（localhostは開発用の例外）。

テストは一時フォルダーのデータベースを使い、アプリの実データを変更しません。先に`npm run build`が必要です。

## データ保存と公開

Node.jsサーバーで実行します。GitHub Pagesなどの静的ホスティングだけでは動きません。GitHubへの保存と外部公開は別の工程です。

- `data.db`とその関連ファイル: 記事・設定・アカウント
- `uploads/`: 画像などのメディア
- `.env`: 暗号化キーなどの環境設定

実行ディレクトリのデータベースとuploadsを永続保存し、定期的にバックアップしてください。これらはGitへ含めません。サーバーの公開時は、第三者が初期管理者にならないよう初回設定が終わるまで外部アクセスを制限してください。

Dockerを利用できる環境では次のコマンドでも起動できます。

```sh
npm run secrets:generate
docker compose up --build -d
```

Dockerは名前付きボリューム`emdash-data`を`/data`にマウントします。コンテナー再作成後もデータを保持します。初期状態ではホストのlocalhostだけにポートを公開します。外部公開はHTTPSのリバースプロキシと実際の`EMDASH_SITE_URL`を設定して行います。`docker compose down -v`はデータボリュームも削除するため、通常の停止には使用しないでください。

## 公式資料

- https://docs.emdashcms.com/existing-project/
- https://docs.emdashcms.com/deployment/nodejs/
