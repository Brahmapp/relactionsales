# 営業成績管理アプリ

営業チーム・個人の成績、目標達成率、店舗成績、ランキングを管理するWebアプリです。
`index.html` 1ファイルだけで動作し、データはFirebase（無料）に保存されるため、
URLを知っている全員がどのデバイスからでも同じ成績をリアルタイムで閲覧・編集できます。

## 公開までの手順（約15分）

### 1. Firebaseの設定（無料）

1. https://console.firebase.google.com にGoogleアカウントでログイン
2. 「プロジェクトを追加」→ 好きな名前で作成（Googleアナリティクスはオフでよい）
3. 左メニュー「構築」→「**Realtime Database**」→「データベースを作成」
   - ロケーションは任意（例：asia-southeast1）
   - セキュリティルールは「テストモード」で開始
4. 作成後、「ルール」タブを開き、次の内容に書き換えて「公開」：

   ```json
   {
     "rules": {
       ".read": true,
       ".write": true
     }
   }
   ```

   > テストモードのままだと約30日で書き込みが止まるため、この書き換えは必須です。
   > この設定は「URLを知っている全員が読み書きできる」仕様（Wikipedia方式）に対応します。

5. 左上の歯車アイコン →「プロジェクトの設定」→ 下の「マイアプリ」→ ウェブ（`</>`）を追加
6. 表示される `firebaseConfig = { ... }` の中身をコピー

### 2. index.html に設定を貼り付け

`index.html` をテキストエディタで開き、上部にある

```js
const firebaseConfig = {
  apiKey: "ここに貼り付け",
  ...
};
```

の部分を、コピーした自分の `firebaseConfig` に置き換えて保存します。

### 3. GitHub Pagesで公開

1. GitHubで新しいリポジトリを作成（例：`sales-tracker`、Public）
2. `index.html` と この `README.md` をアップロード（Add file → Upload files）
3. リポジトリの **Settings → Pages** を開き、
   Branch を `main`（フォルダは `/root`）にして Save
4. 数分後に表示されるURL（`https://ユーザー名.github.io/sales-tracker/`）がアプリのURLです。
   このURLをメンバーに共有すれば、全員が同じデータを使えます。

## データについて

- データはFirebase Realtime Databaseに保存されます。**index.htmlを更新・差し替えてもデータは消えません**（コードとデータが完全に分離されているため）
- 入力はリアルタイムで同期され、他の人の入力が自動で画面に反映されます
- 月ごとに独立して保存され、前月・翌月ボタンで過去ログを閲覧できます
- 画面右上の 📊 ボタンから全データを表で確認でき、CSVダウンロード（Excel／Googleスプレッドシート対応）とコピー貼り付けができます
- Firebaseの無料枠（保存1GB・月間転送10GB）は、このアプリの規模なら十分すぎる容量です

## 注意

- ルールを `.read: true / .write: true` にしているため、**データベースのURLやアプリのURLを知っている人は誰でも編集できます**。仕様どおりの運用ですが、URLの共有範囲には気をつけてください
- `firebaseConfig` の値（apiKeyなど）は公開されても問題ない情報です（Firebaseの仕様上、秘密鍵ではありません）
