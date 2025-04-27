// Google Apps Script用のコード
// スプレッドシートにデプロイして、ウェブアプリとして公開する

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);
  
  try {
    // POSTリクエストからデータを取得
    const data = JSON.parse(e.postData.contents);
    Logger.log("受信データ: " + JSON.stringify(data));
    
    // スプレッドシートを開く - シート名を確認
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // すべてのシート名をログに記録（デバッグ用）
    const allSheets = ss.getSheets();
    const sheetNames = allSheets.map(s => s.getName());
    Logger.log("利用可能なシート: " + JSON.stringify(sheetNames));
    
    // メインシートを取得（シート名を確認してください）
    // 「シート1」ではなく、実際のシート名を使用 - 例えば「Sheet1」や「20250422 時間外申請App」など
    const sheet = ss.getSheetByName('20250422 時間外申請App');
    
    if (!sheet) {
      // シートが見つからない場合は最初のシートを使用
      Logger.log("指定したシートが見つかりません。最初のシートを使用します。");
      const sheet = ss.getSheets()[0];
      if (!sheet) {
        throw new Error("シートが見つかりません。スプレッドシートにシートが存在するか確認してください。");
      }
      Logger.log("使用するシート: " + sheet.getName());
    } else {
      Logger.log("使用するシート: " + sheet.getName());
    }
    
    // タイムスタンプを作成
    const timestamp = new Date().toLocaleString('ja-JP');
    
    // 勤務時間（分）を計算
    const startTimeParts = data.startTime.split(":");
    const endTimeParts = data.endTime.split(":");
    const startMinutes = parseInt(startTimeParts[0]) * 60 + parseInt(startTimeParts[1]);
    const endMinutes = parseInt(endTimeParts[0]) * 60 + parseInt(endTimeParts[1]);
    const totalMinutes = endMinutes - startMinutes;
    
    // スプレッドシートの列の順序に合わせてデータを追加
    // A: 教員名, B: クラブ名, C: 活動日, D: 業務開始時間, E: 業務終了時間, F: 活動に関する報告事項, G: 申請日時, H: 勤務時間（分）
    sheet.appendRow([
      data.teacherName,         // 教員名
      data.clubName,            // クラブ名
      data.date,                // 活動日
      data.startTime,           // 業務開始時間
      data.endTime,             // 業務終了時間
      data.reason,              // 活動に関する報告事項
      timestamp,                // 申請日時
      totalMinutes              // 勤務時間（分）
    ]);
    
    Logger.log("データを追加しました: " + JSON.stringify(data));
    
    // 成功レスポンスを返す
    return ContentService.createTextOutput(JSON.stringify({
      'success': true,
      'message': '残業申請が正常に送信されました',
      'workingTime': totalMinutes
    }))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader('Access-Control-Allow-Origin', '*');
    
  } catch (error) {
    Logger.log("エラー発生: " + error.toString());
    
    // エラーレスポンスを返す
    return ContentService.createTextOutput(JSON.stringify({
      'success': false,
      'message': '申請処理中にエラーが発生しました',
      'error': error.toString()
    }))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader('Access-Control-Allow-Origin', '*');
    
  } finally {
    lock.releaseLock();
  }
}

// OPTIONSリクエストに対応（CORS対策）
function doOptions() {
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT)
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    .setHeader('Access-Control-Allow-Headers', 'Content-Type')
    .setHeader('Access-Control-Max-Age', '86400');
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({
    'status': 'active',
    'message': 'このAPIはPOSTリクエストのみ受け付けています'
  }))
  .setMimeType(ContentService.MimeType.JSON)
  .setHeader('Access-Control-Allow-Origin', '*');
} 