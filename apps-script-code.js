/**
 * GETリクエスト対応の関数
 * Webアプリとしてデプロイする際に必要
 */
function doGet() {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'active',
    message: '部活動時間外勤務申請処理APIが正常に動作しています'
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * POSTリクエストを処理する関数
 * この関数はウェブアプリとしてデプロイされ、API側から呼び出されます
 */
function doPost(e) {
  try {
    // リクエストデータをパースする
    let data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseError) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'JSONデータの解析に失敗しました: ' + parseError.toString()
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // アクセストークンの検証（テスト段階では無効化）
    const accessToken = data.accessToken;
    
    // 開発環境では一時的にトークン検証をスキップ
    if (accessToken !== "temporary_access_token_for_testing") {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: '不正なアクセストークンです'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // 月次集計データを更新
    updateSummary();
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: '集計が更新されました'
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: 'エラーが発生しました: ' + error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * アクセストークンを生成して保存する関数
 * この関数は手動で1回だけ実行してください
 */
function generateAccessToken() {
  const token = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty('ACCESS_TOKEN', token);
  
  // トークンを表示（APIの実装時に使用）
  Logger.log('生成されたアクセストークン: ' + token);
  return token;
}

/**
 * 月次集計データを更新する関数
 */
function updateSummary() {
  try {
    // スプレッドシートを取得
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 月次シートの一覧を取得
    const allSheets = ss.getSheets();
    const periodSheets = allSheets.filter(sheet => {
      const name = sheet.getName();
      // 「YYYY年MM月DD日 - YYYY年MM月DD日」形式のシート名を検出
      return /^\d{4}年\d{1,2}月\d{1,2}日 - \d{4}年\d{1,2}月\d{1,2}日$/.test(name);
    });
    
    if (periodSheets.length === 0) {
      Logger.log('申請期間シートが見つかりません。');
      return;
    }
    
    // サマリーシートを取得または作成
    let summarySheet = ss.getSheetByName('申請期間集計');
    if (!summarySheet) {
      summarySheet = ss.insertSheet('申請期間集計');
      // ヘッダーを設定
      summarySheet.getRange('A1:E1').setValues([['申請期間', '申請数', '教員数', '総勤務時間（分）', '平均勤務時間（分/件）']]);
      summarySheet.getRange('A1:E1').setFontWeight('bold').setBackground('#f3f3f3');
    }
    
    // 各申請期間シートについて集計を更新
    periodSheets.forEach(periodSheet => {
      const sheetName = periodSheet.getName();
      
      // シートデータの集計
      const data = periodSheet.getDataRange().getValues();
      if (data.length <= 1) {
        // ヘッダーしかない場合はスキップ
        return;
      }
      
      const headers = data[0];
      const rows = data.slice(1); // ヘッダーを除外
      
      // 必要な列のインデックスを取得
      const teacherColumn = headers.indexOf('教員名');
      const workingTimeColumn = headers.indexOf('勤務時間（分）');
      
      if (teacherColumn === -1 || workingTimeColumn === -1) {
        Logger.log(`シート「${sheetName}」に必要な列が見つかりません。`);
        return;
      }
      
      // 集計
      const totalApplications = rows.length;
      
      // ユニークな教員数
      const uniqueTeachers = new Set();
      rows.forEach(row => uniqueTeachers.add(row[teacherColumn]));
      const teacherCount = uniqueTeachers.size;
      
      // 総勤務時間
      let totalWorkingTime = 0;
      rows.forEach(row => {
        const time = parseInt(row[workingTimeColumn], 10);
        if (!isNaN(time)) {
          totalWorkingTime += time;
        }
      });
      
      // 平均勤務時間
      const avgWorkingTime = totalApplications > 0 ? Math.round(totalWorkingTime / totalApplications) : 0;
      
      // サマリーシートに追加または更新
      const summaryData = summarySheet.getDataRange().getValues();
      let existingRowIndex = -1;
      
      for (let i = 1; i < summaryData.length; i++) {
        if (summaryData[i][0] === sheetName) {
          existingRowIndex = i + 1; // 1-indexed
          break;
        }
      }
      
      if (existingRowIndex > 0) {
        // 既存の行を更新
        summarySheet.getRange(existingRowIndex, 1, 1, 5).setValues([[sheetName, totalApplications, teacherCount, totalWorkingTime, avgWorkingTime]]);
      } else {
        // 新しい行を追加
        summarySheet.appendRow([sheetName, totalApplications, teacherCount, totalWorkingTime, avgWorkingTime]);
      }
    });
    
    // 集計シートを整形
    summarySheet.autoResizeColumns(1, 5);
    
    // 期間の降順でソート（最新の期間が上に来るようにする）
    if (summarySheet.getLastRow() > 1) {
      try {
        summarySheet.getRange(2, 1, summarySheet.getLastRow() - 1, 5).sort({column: 1, ascending: false});
      } catch (sortError) {
        Logger.log('ソートエラー: ' + sortError.toString());
        // ソートエラーは無視して処理を続行
      }
    }
    
    Logger.log('申請期間集計が正常に更新されました。');
    return true;
  } catch (error) {
    Logger.log('集計更新エラー: ' + error.toString());
    throw error;
  }
}

/**
 * メニューを追加する関数
 * スプレッドシートを開いたときに実行されます
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('部活動時間外勤務')
    .addItem('申請期間集計を今すぐ更新', 'updateSummary')
    .addSeparator()
    .addItem('期間別シート一覧表示', 'listPeriodSheets')
    .addSeparator()
    .addItem('現在のシートに操作ボタンを追加', 'addControlButtons')
    .addItem('教員別集計シートを作成', 'createTeacherSummary')
    .addToUi();
}

/**
 * 申請期間シートの一覧を表示する関数
 */
function listPeriodSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  
  // 申請期間パターンに一致するシートを抽出
  const periodSheets = sheets.filter(sheet => {
    const name = sheet.getName();
    return /^\d{4}年\d{1,2}月\d{1,2}日 - \d{4}年\d{1,2}月\d{1,2}日$/.test(name);
  });
  
  if (periodSheets.length === 0) {
    SpreadsheetApp.getUi().alert('申請期間シートが見つかりませんでした。');
    return;
  }
  
  // シート名と行数の一覧を作成
  const sheetInfo = periodSheets.map(sheet => {
    const rowCount = Math.max(0, sheet.getLastRow() - 1); // ヘッダー行を除く
    return `${sheet.getName()}: ${rowCount}件の申請`;
  });
  
  SpreadsheetApp.getUi().alert('申請期間別シート一覧:\n' + sheetInfo.join('\n'));
}

/**
 * 月初めに自動で集計レポートを生成するトリガーを設定する関数
 * この関数は手動で1回だけ実行してください
 */
function createMonthlyTrigger() {
  // 既存のトリガーをクリア
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'updateSummary') {
      ScriptApp.deleteTrigger(trigger);
    }
  }
  
  // 毎月22日の午前1時に実行するトリガーを設定
  ScriptApp.newTrigger('updateSummary')
    .timeBased()
    .onMonthDay(22)
    .atHour(1)
    .create();
  
  SpreadsheetApp.getUi().alert('申請期間集計の自動トリガーが設定されました（毎月22日午前1時実行）');
}

/**
 * 現在のシートに操作ボタンを追加する関数
 */
function addControlButtons() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  const sheetName = sheet.getName();
  
  // 申請期間シートかどうかを判定
  if (!/^\d{4}年\d{1,2}月\d{1,2}日 - \d{4}年\d{1,2}月\d{1,2}日$/.test(sheetName)) {
    SpreadsheetApp.getUi().alert('申請期間シートを選択してください。\n（例：2023年10月22日 - 2023年11月21日）');
    return;
  }
  
  // 列のインデックスを取得（ヘッダー行から）
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const teacherColIndex = headers.indexOf('教員名') + 1; // 1-indexed
  const clubColIndex = headers.indexOf('クラブ名') + 1;
  const dateColIndex = headers.indexOf('活動日') + 1;
  const reportColIndex = headers.indexOf('活動に関する報告事項') + 1;
  
  // ヘッダー行がなかった場合の対処
  if (teacherColIndex < 1 || clubColIndex < 1 || dateColIndex < 1) {
    SpreadsheetApp.getUi().alert('必要な列（教員名、クラブ名、活動日）が見つかりません。');
    return;
  }
  
  // すでにボタンがある場合は削除
  const drawings = sheet.getDrawings();
  for (let i = 0; i < drawings.length; i++) {
    drawings[i].remove();
  }
  
  // ボタンの位置を決定（A列の右側に配置）
  const buttonWidth = 120;
  const buttonHeight = 30;
  const spacing = 10;
  let currentTop = 5; // 上端からの距離
  
  // 教員名でソートするボタン
  addButton(sheet, '教員名でソート', 'sortByTeacher', buttonWidth, buttonHeight, sheet.getLastColumn() + 2, currentTop);
  currentTop += buttonHeight + spacing;
  
  // クラブ名でソートするボタン
  addButton(sheet, 'クラブ名でソート', 'sortByClub', buttonWidth, buttonHeight, sheet.getLastColumn() + 2, currentTop);
  currentTop += buttonHeight + spacing;
  
  // 活動日でソートするボタン
  addButton(sheet, '活動日でソート', 'sortByDate', buttonWidth, buttonHeight, sheet.getLastColumn() + 2, currentTop);
  currentTop += buttonHeight + spacing;
  
  // 元の順序に戻すボタン
  addButton(sheet, '申請順に戻す', 'resetSort', buttonWidth, buttonHeight, sheet.getLastColumn() + 2, currentTop);
  currentTop += buttonHeight + spacing * 2;
  
  // 教員別集計ボタン
  addButton(sheet, '教員別集計', 'showTeacherSummary', buttonWidth, buttonHeight, sheet.getLastColumn() + 2, currentTop);
  
  // ボタン説明を追加
  sheet.getRange(1, sheet.getLastColumn() + 2).setValue('操作ボタン');
  
  SpreadsheetApp.getUi().alert('操作ボタンが追加されました。\nシートの右側にあるボタンを使って、データの並べ替えや集計ができます。');
  
  // シートのプロパティに列インデックスを保存（ソート関数で使用）
  PropertiesService.getDocumentProperties().setProperty('teacherColIndex', teacherColIndex.toString());
  PropertiesService.getDocumentProperties().setProperty('clubColIndex', clubColIndex.toString());
  PropertiesService.getDocumentProperties().setProperty('dateColIndex', dateColIndex.toString());
  PropertiesService.getDocumentProperties().setProperty('activeSheetId', sheet.getSheetId().toString());
}

/**
 * ボタン追加のヘルパー関数
 */
function addButton(sheet, buttonText, functionName, width, height, left, top) {
  const button = sheet.insertDrawingNew();
  button.setPosition(top, left, 0, 0)
        .setSize(width, height)
        .assignScript(functionName);
  
  // ボタンのUIを設定
  const fillColor = '#4285F4'; // Googleブルー
  const builder = button.build();
  builder.addLine()
    .setLineColor('#FFFFFF')
    .setLineWidth(1)
    .setLinearGradient('#E8EAED', '#DADCE0', 45); // ライトグレーのグラデーション
  
  builder.addTextBox()
    .setText(buttonText)
    .setFontSize(10)
    .setFontColor('#202124')
    .setHorizontalAlignment('CENTER')
    .setVerticalAlignment('MIDDLE')
    .setBold(true);
  
  button.setShape(builder.build());
}

/**
 * 教員名でソートする関数（ボタンから呼び出される）
 */
function sortByTeacher() {
  const props = PropertiesService.getDocumentProperties();
  const teacherColIndex = parseInt(props.getProperty('teacherColIndex'));
  const sheetId = parseInt(props.getProperty('activeSheetId'));
  
  if (!teacherColIndex || !sheetId) {
    SpreadsheetApp.getUi().alert('ソート情報が見つかりません。\n操作ボタンを再度追加してください。');
    return;
  }
  
  const sheet = getSheetById(sheetId);
  if (!sheet) {
    SpreadsheetApp.getUi().alert('シートが見つかりません。');
    return;
  }
  
  // データ行（ヘッダー以降）をソート
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn())
         .sort({column: teacherColIndex, ascending: true});
    SpreadsheetApp.getUi().alert('教員名で並べ替えました。');
  } else {
    SpreadsheetApp.getUi().alert('ソートするデータがありません。');
  }
}

/**
 * クラブ名でソートする関数（ボタンから呼び出される）
 */
function sortByClub() {
  const props = PropertiesService.getDocumentProperties();
  const clubColIndex = parseInt(props.getProperty('clubColIndex'));
  const sheetId = parseInt(props.getProperty('activeSheetId'));
  
  if (!clubColIndex || !sheetId) {
    SpreadsheetApp.getUi().alert('ソート情報が見つかりません。\n操作ボタンを再度追加してください。');
    return;
  }
  
  const sheet = getSheetById(sheetId);
  if (!sheet) {
    SpreadsheetApp.getUi().alert('シートが見つかりません。');
    return;
  }
  
  // データ行（ヘッダー以降）をソート
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn())
         .sort({column: clubColIndex, ascending: true});
    SpreadsheetApp.getUi().alert('クラブ名で並べ替えました。');
  } else {
    SpreadsheetApp.getUi().alert('ソートするデータがありません。');
  }
}

/**
 * 活動日でソートする関数（ボタンから呼び出される）
 */
function sortByDate() {
  const props = PropertiesService.getDocumentProperties();
  const dateColIndex = parseInt(props.getProperty('dateColIndex'));
  const sheetId = parseInt(props.getProperty('activeSheetId'));
  
  if (!dateColIndex || !sheetId) {
    SpreadsheetApp.getUi().alert('ソート情報が見つかりません。\n操作ボタンを再度追加してください。');
    return;
  }
  
  const sheet = getSheetById(sheetId);
  if (!sheet) {
    SpreadsheetApp.getUi().alert('シートが見つかりません。');
    return;
  }
  
  // データ行（ヘッダー以降）をソート
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn())
         .sort({column: dateColIndex, ascending: true});
    SpreadsheetApp.getUi().alert('活動日で並べ替えました。');
  } else {
    SpreadsheetApp.getUi().alert('ソートするデータがありません。');
  }
}

/**
 * 元の順序（申請順）に戻す関数（ボタンから呼び出される）
 */
function resetSort() {
  const props = PropertiesService.getDocumentProperties();
  const sheetId = parseInt(props.getProperty('activeSheetId'));
  
  if (!sheetId) {
    SpreadsheetApp.getUi().alert('シート情報が見つかりません。\n操作ボタンを再度追加してください。');
    return;
  }
  
  const sheet = getSheetById(sheetId);
  if (!sheet) {
    SpreadsheetApp.getUi().alert('シートが見つかりません。');
    return;
  }
  
  // 申請日時の列のインデックスを探す
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const submissionTimeColIndex = headers.indexOf('申請日時') + 1;
  
  if (submissionTimeColIndex > 0 && sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn())
         .sort({column: submissionTimeColIndex, ascending: true});
    SpreadsheetApp.getUi().alert('申請順に戻しました。');
  } else {
    SpreadsheetApp.getUi().alert('申請日時の列が見つからないか、データがありません。');
  }
}

/**
 * シートIDからシートを取得するヘルパー関数
 */
function getSheetById(sheetId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === sheetId) {
      return sheets[i];
    }
  }
  return null;
}

/**
 * 教員別の集計シートを作成する関数
 */
function createTeacherSummary() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const activeSheet = ss.getActiveSheet();
  const sheetName = activeSheet.getName();
  
  // 申請期間シートかどうかを判定
  if (!/^\d{4}年\d{1,2}月\d{1,2}日 - \d{4}年\d{1,2}月\d{1,2}日$/.test(sheetName)) {
    SpreadsheetApp.getUi().alert('申請期間シートを選択してください。\n（例：2023年10月22日 - 2023年11月21日）');
    return;
  }
  
  // データを取得
  const data = activeSheet.getDataRange().getValues();
  if (data.length <= 1) {
    SpreadsheetApp.getUi().alert('集計するデータがありません。');
    return;
  }
  
  const headers = data[0];
  const rows = data.slice(1);
  
  // 必要な列のインデックスを取得
  const teacherColIndex = headers.indexOf('教員名');
  const clubColIndex = headers.indexOf('クラブ名');
  const dateColIndex = headers.indexOf('活動日');
  const workingTimeColIndex = headers.indexOf('勤務時間（分）');
  
  if (teacherColIndex === -1 || clubColIndex === -1 || workingTimeColIndex === -1) {
    SpreadsheetApp.getUi().alert('必要な列（教員名、クラブ名、勤務時間）が見つかりません。');
    return;
  }
  
  // 教員別に集計
  const teacherSummary = {};
  rows.forEach(row => {
    const teacher = row[teacherColIndex];
    const club = row[clubColIndex];
    const workingTime = parseInt(row[workingTimeColIndex], 10) || 0;
    
    if (!teacherSummary[teacher]) {
      teacherSummary[teacher] = {
        totalTime: 0,
        applications: 0,
        clubs: new Set(),
        clubDetails: {}
      };
    }
    
    teacherSummary[teacher].totalTime += workingTime;
    teacherSummary[teacher].applications++;
    teacherSummary[teacher].clubs.add(club);
    
    // クラブごとの詳細も集計
    if (!teacherSummary[teacher].clubDetails[club]) {
      teacherSummary[teacher].clubDetails[club] = {
        applications: 0,
        totalTime: 0
      };
    }
    teacherSummary[teacher].clubDetails[club].applications++;
    teacherSummary[teacher].clubDetails[club].totalTime += workingTime;
  });
  
  // 集計シートの名前
  const summarySheetName = `${sheetName} 教員別集計`;
  
  // 既存の集計シートを削除
  let summarySheet = ss.getSheetByName(summarySheetName);
  if (summarySheet) {
    ss.deleteSheet(summarySheet);
  }
  
  // 新しい集計シートを作成
  summarySheet = ss.insertSheet(summarySheetName);
  
  // ヘッダーを設定
  summarySheet.getRange('A1:F1').setValues([['教員名', '申請回数', '合計勤務時間', '平均勤務時間（分/回）', '担当クラブ数', '詳細']]);
  summarySheet.getRange('A1:F1').setFontWeight('bold').setBackground('#f3f3f3');
  
  // 集計データを入力
  const summaryData = [];
  Object.keys(teacherSummary).sort().forEach(teacher => {
    const summary = teacherSummary[teacher];
    const avgTime = Math.round(summary.totalTime / summary.applications);
    
    // クラブごとの詳細を文字列化
    const clubDetailStrs = [];
    Object.keys(summary.clubDetails).sort().forEach(club => {
      const detail = summary.clubDetails[club];
      clubDetailStrs.push(`${club}: ${detail.applications}回, ${detail.totalTime}分`);
    });
    
    summaryData.push([
      teacher,
      summary.applications,
      summary.totalTime,
      avgTime,
      summary.clubs.size,
      clubDetailStrs.join('\n')
    ]);
  });
  
  if (summaryData.length > 0) {
    summarySheet.getRange(2, 1, summaryData.length, 6).setValues(summaryData);
  }
  
  // シート整形
  summarySheet.autoResizeColumns(1, 6);
  summarySheet.setColumnWidth(6, 300); // 詳細列は幅広く
  
  // 合計行を追加
  const totalRow = [
    '合計',
    rows.length,
    Object.values(teacherSummary).reduce((sum, t) => sum + t.totalTime, 0),
    Math.round(Object.values(teacherSummary).reduce((sum, t) => sum + t.totalTime, 0) / rows.length),
    new Set(rows.map(r => r[clubColIndex])).size,
    ''
  ];
  
  summarySheet.getRange(summaryData.length + 2, 1, 1, 6).setValues([totalRow]);
  summarySheet.getRange(summaryData.length + 2, 1, 1, 6).setFontWeight('bold').setBackground('#e6f2ff');
  
  SpreadsheetApp.getUi().alert('教員別集計シートを作成しました。');
  ss.setActiveSheet(summarySheet);
}

/**
 * 教員別集計を表示する関数（ボタンから呼び出される）
 */
function showTeacherSummary() {
  const props = PropertiesService.getDocumentProperties();
  const sheetId = parseInt(props.getProperty('activeSheetId'));
  
  if (!sheetId) {
    SpreadsheetApp.getUi().alert('シート情報が見つかりません。\n操作ボタンを再度追加してください。');
    return;
  }
  
  const sheet = getSheetById(sheetId);
  if (!sheet) {
    SpreadsheetApp.getUi().alert('シートが見つかりません。');
    return;
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setActiveSheet(sheet);
  createTeacherSummary();
} 