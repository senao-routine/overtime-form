# スプレッドシート連携のトラブルシューティング

現在「The caller does not have permission」というエラーが発生しています。これはGoogleスプレッドシートの権限設定に問題があることを示しています。

## 解決方法

1. スプレッドシートを開く: https://docs.google.com/spreadsheets/d/1OnLaN1Q0AVRaxE31lhBckdj--61Ffk8_o1Zn1aDRFoE/edit?gid=0

2. スプレッドシートの共有設定を確認する:
   - 右上の「共有」ボタンをクリック
   - サービスアカウントのメールアドレス `id-app-771@smooth-concept-457612-i4.iam.gserviceaccount.com` が共有ユーザーに含まれているか確認
   - もし含まれていない場合は、「ユーザーやグループを追加」にこのメールアドレスを入力し、権限を「編集者」に設定して共有

3. サービスアカウントに編集権限があることを確認後、アプリケーションを再度テストします。

もし上記の手順を実施しても問題が解決しない場合は、以下の点も確認してください：

1. サービスアカウントキーが有効か（Google Cloud Consoleで確認）
2. プロジェクトでGoogle Sheets APIが有効になっているか
3. スプレッドシートのURLが正しいか（ID: `1OnLaN1Q0AVRaxE31lhBckdj--61Ffk8_o1Zn1aDRFoE`） 