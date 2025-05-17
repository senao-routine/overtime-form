// Google Apps Script用のコード
// スプレッドシートにデプロイして、ウェブアプリとして公開する

/**
 * 期間に基づいてシート名を生成する関数
 * @param {Date} date - 対象の日付
 * @returns {string} シート名
 */
function generatePeriodSheetName(date) {
  // 日付が22日以降の場合は翌月の期間として扱う
  const targetDate = new Date(date);
  const day = targetDate.getDate();
  
  let periodYear, periodMonth;
  if (day >= 22) {
    // 22日以降は翌月分
    periodMonth = targetDate.getMonth() + 2; // 翌月
    periodYear = targetDate.getFullYear();
    if (periodMonth > 12) {
      periodMonth = 1;
      periodYear++;
    }
  } else {
    // 21日以前は当月分
    periodMonth = targetDate.getMonth() + 1;
    periodYear = targetDate.getFullYear();
  }
  
  // シート名を生成（例：202404期）
  return `${periodYear}${String(periodMonth).padStart(2, '0')}期`;
}

/**
 * 分を時間と分の形式に変換する関数
 * @param {number} minutes - 分数
 * @returns {string} "X時間Y分"形式の文字列
 */
function formatWorkingTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}時間${remainingMinutes}分`;
}

/**
 * シートを取得または作成する関数
 * @param {SpreadsheetApp.Spreadsheet} ss - スプレッドシート
 * @param {string} sheetName - シート名
 * @returns {SpreadsheetApp.Sheet} シート
 */
function getOrCreateSheet(ss, sheetName) {
  let sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    // ヘッダーを設定
    const headers = [
      '申請日時',
      '教員名',
      'メールアドレス',
      'クラブ名',
      '活動日',
      '開始時間',
      '終了時間',
      '勤務時間',
      '報告事項',
      '校長',
      '事務長',
      '副校長',
      '教頭',
      '承認済み'
    ];
    
    // ヘッダー行を追加
    sheet.appendRow(headers);
    
    // ヘッダーの書式設定
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange
      .setFontWeight('bold')
      .setBackground('#f3f3f3')
      .setHorizontalAlignment('center')
      .setBorder(true, true, true, true, true, true);
    
    // 列幅の設定
    sheet.setColumnWidth(1, 180);  // 申請日時
    sheet.setColumnWidth(2, 150);  // 教員名
    sheet.setColumnWidth(3, 250);  // メールアドレス
    sheet.setColumnWidth(4, 150);  // クラブ名
    sheet.setColumnWidth(5, 100);  // 活動日
    sheet.setColumnWidth(6, 80);   // 開始時間
    sheet.setColumnWidth(7, 80);   // 終了時間
    sheet.setColumnWidth(8, 100);  // 勤務時間
    sheet.setColumnWidth(9, 300);  // 報告事項
    sheet.setColumnWidth(10, 100); // 校長
    sheet.setColumnWidth(11, 100); // 事務長
    sheet.setColumnWidth(12, 100); // 副校長
    sheet.setColumnWidth(13, 100); // 教頭
    sheet.setColumnWidth(14, 100); // 承認済み
    
    // 日時列のフォーマット設定
    sheet.getRange(2, 1, 999, 1).setNumberFormat('yyyy/MM/dd HH:mm:ss');
    sheet.getRange(2, 5, 999, 1).setNumberFormat('yyyy/MM/dd');
    sheet.getRange(2, 6, 999, 2).setNumberFormat('HH:mm');
    sheet.getRange(2, 8, 999, 1).setNumberFormat('@'); // テキスト形式に設定
    
    // 承認列にチェックボックスを設定
    const approvalRange = sheet.getRange(2, 10, 999, 4); // 校長から教頭までの列
    approvalRange.insertCheckboxes();
    
    // 承認済み列の条件付き書式を設定
    const approvalStatusRange = sheet.getRange(2, 14, 999, 1); // 承認済み列
    const rule = SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND(J2=TRUE,K2=TRUE,L2=TRUE,M2=TRUE)')
      .setBackground('#b7e1cd')
      .setRanges([approvalStatusRange])
      .build();
    sheet.setConditionalFormatRules([rule]);
    
    // フィルターを設定
    sheet.getRange(1, 1, 1, headers.length).createFilter();
    
    // 先頭行を固定
    sheet.setFrozenRows(1);
    
    // 編集権限の設定
    const protection = sheet.protect();
    protection.setDescription('承認機能の保護');
    protection.setUnprotectedRanges([approvalRange]);
  }
  
  return sheet;
}

/**
 * GETリクエスト対応の関数
 */
function doGet() {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'active',
    message: '部活動時間外勤務申請処理APIが正常に動作しています'
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * POSTリクエストを処理する関数
 */
function doPost(e) {
  try {
    // リクエストデータをパースする
    let data;
    try {
      data = JSON.parse(e.postData.contents);
      Logger.log('受信データ: ' + JSON.stringify(data, null, 2));
    } catch (parseError) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'データの解析に失敗しました: ' + parseError.toString()
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // スプレッドシートを開く
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 活動日から対象期間のシート名を生成
    const activityDate = new Date(data.date);
    const sheetName = generatePeriodSheetName(activityDate);
    Logger.log('生成されたシート名: ' + sheetName);
    
    try {
      // シートを取得または作成
      const sheet = getOrCreateSheet(ss, sheetName);
      
      // 勤務時間を計算
      const startTime = timeToMinutes(data.startTime);
      const endTime = timeToMinutes(data.endTime);
      let workMinutes = endTime - startTime;
      if (workMinutes < 0) {
        workMinutes += 24 * 60; // 日をまたぐ場合の処理
      }
      
      // 勤務時間を時間と分の形式に変換
      const workTimeFormatted = formatWorkingTime(workMinutes);
      
      // 現在の日時を取得
      const timestamp = new Date();
      
      // データを追加（2行目に挿入）
      const newRow = [
        timestamp,                    // 申請日時
        data.teacherName || '',      // 教員名
        data.teacherEmail || '',     // メールアドレス
        data.clubName || '',         // クラブ名
        new Date(data.date),         // 活動日
        data.startTime || '',        // 開始時間
        data.endTime || '',          // 終了時間
        workTimeFormatted,           // 勤務時間
        data.reason || '',           // 報告事項
        '',                         // 校長
        '',                         // 事務長
        '',                         // 副校長
        '',                         // 教頭
        ''                          // 承認済み
      ];
      
      // 2行目に新しい行を挿入
      sheet.insertRowBefore(2);
      sheet.getRange(2, 1, 1, 14).setValues([newRow]);
      
      // 追加した行の書式を設定
      sheet.getRange(2, 1, 1, 14).setBorder(true, true, true, true, true, true);
      
      // 日付列のフォーマット設定
      sheet.getRange(2, 1).setNumberFormat('yyyy/MM/dd HH:mm:ss');
      sheet.getRange(2, 5).setNumberFormat('yyyy/MM/dd');
      
      // 時間列のフォーマット設定
      sheet.getRange(2, 6, 1, 2).setNumberFormat('HH:mm');
      
      // 勤務時間列のフォーマット設定
      sheet.getRange(2, 8).setNumberFormat('@');
      
      // 承認列にチェックボックスを設定
      sheet.getRange(2, 10, 1, 4).insertCheckboxes();
      
      Logger.log('期間シートにデータを追加しました: ' + sheetName);
      
      // Looker Studio用集計シートを更新
      try {
        updateLookerStudioSummary(sheetName, {
          teacherName: data.teacherName || '',
          teacherEmail: data.teacherEmail || '',
          activityDate: new Date(data.date),
          startTime: data.startTime || '',
          endTime: data.endTime || '',
          workMinutes: workMinutes,
          reason: data.reason || ''
        });
        Logger.log('Looker Studio用集計シートを更新しました');
      } catch (lookerError) {
        Logger.log('Looker Studio用集計シートの更新に失敗: ' + lookerError.toString());
        // Looker Studioの更新エラーはメインの処理に影響を与えないようにする
      }
      
      // 成功レスポンスを返す
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: '申請を受け付けました',
        details: {
          period: sheetName,
          timestamp: Utilities.formatDate(timestamp, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss'),
          workingTime: workTimeFormatted
        }
      })).setMimeType(ContentService.MimeType.JSON);
      
    } catch (sheetError) {
      Logger.log('シート処理エラー: ' + sheetError.toString());
      throw sheetError;
    }
    
  } catch (error) {
    Logger.log('エラー: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: 'エラーが発生しました: ' + error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * メニューを追加する関数
 */
function createMenu() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('部活動時間外勤務')
    .addItem('申請期間集計を今すぐ更新', 'updatePeriodAggregation')
    .addItem('期間別シート一覧表示', 'showPeriodSheets')
    .addItem('教員別集計シートを作成', 'createTeacherSummary')
    .addItem('期間を選択してLooker Studio用集計を更新', 'selectPeriodForLookerStudio')
    .addSeparator()
    .addItem('ログを表示', 'showLogs')
    .addToUi();
}

/**
 * スプレッドシートを開いたときに実行される関数
 */
function onOpen() {
  createMenu();
}

/**
 * ログを表示する関数
 */
function showLogs() {
  const logs = Logger.getLog();
  if (logs) {
    SpreadsheetApp.getUi().alert('最新のログ:\n\n' + logs);
  } else {
    SpreadsheetApp.getUi().alert('ログはありません。');
  }
}

/**
 * 申請期間の集計を更新する関数
 */
function updatePeriodAggregation() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  
  // 集計シートを取得または作成
  let summarySheet = ss.getSheetByName('期間別集計');
  if (!summarySheet) {
    summarySheet = ss.insertSheet('期間別集計');
    // ヘッダーを設定
    summarySheet.appendRow([
      '期間',
      '申請件数',
      '合計時間',
      '教員数',
      '平均時間',
      '最終更新'
    ]);
    
    // ヘッダーの書式設定
    summarySheet.getRange(1, 1, 1, 6)
      .setFontWeight('bold')
      .setBackground('#f3f3f3')
      .setHorizontalAlignment('center');
    
    // 列幅の設定
    summarySheet.setColumnWidths(1, 6, 150);
  }
  
  // データシートを処理
  const periodData = {};
  
  sheets.forEach(sheet => {
    const sheetName = sheet.getName();
    // 集計シートとシステムシートを除外
    if (sheetName !== '期間別集計' && !sheetName.startsWith('集計') && sheetName.includes('部活動時間外勤務')) {
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) { // ヘッダー行を除く
        const data = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
        
        let totalMinutes = 0;
        const teachers = new Set();
        
        data.forEach(row => {
          if (row[7]) { // 勤務時間（時間）の列
            totalMinutes += Number(row[7]);
            teachers.add(row[1]); // 教員名の列
          }
        });
        
        periodData[sheetName] = {
          period: sheetName,
          count: lastRow - 1,
          totalMinutes: totalMinutes,
          teacherCount: teachers.size,
          averageMinutes: Math.round(totalMinutes / (lastRow - 1))
        };
      }
    }
  });
  
  // 集計データを更新
  const timestamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
  const summaryData = Object.values(periodData).map(data => [
    data.period,
    data.count,
    formatWorkingTime(data.totalMinutes),
    data.teacherCount,
    formatWorkingTime(data.averageMinutes),
    timestamp
  ]);
  
  // 既存のデータをクリアして新しいデータを書き込み
  if (summaryData.length > 0) {
    summarySheet.getRange(2, 1, summarySheet.getLastRow() - 1, 6).clear();
    summarySheet.getRange(2, 1, summaryData.length, 6).setValues(summaryData);
  }
  
  SpreadsheetApp.getUi().alert('申請期間の集計を更新しました。');
}

/**
 * 期間別シートの一覧を表示する関数
 */
function showPeriodSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  
  let message = '期間別シート一覧:\n\n';
  sheets.forEach(sheet => {
    const sheetName = sheet.getName();
    if (sheetName.includes('部活動時間外勤務')) {
      const lastRow = sheet.getLastRow();
      message += `${sheetName}: ${lastRow - 1}件の申請\n`;
    }
  });
  
  SpreadsheetApp.getUi().alert(message);
}

/**
 * 時間文字列から分数に変換する関数
 */
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  
  // デバッグログ
  Logger.log(`時間変換開始 - 入力値: ${timeStr}, 型: ${typeof timeStr}`);
  
  let hours = 0;
  let minutes = 0;
  
  // Googleスプレッドシートの時間値の場合（日付オブジェクト）
  if (timeStr instanceof Date) {
    hours = timeStr.getHours();
    minutes = timeStr.getMinutes();
    Logger.log(`日付オブジェクトから時間を抽出: ${hours}:${minutes}`);
  }
  // 数値型の場合
  else if (typeof timeStr === 'number') {
    // スプレッドシートの時間表現（0-1の割合）の場合
    if (timeStr < 1) {
      const totalMinutesInDay = timeStr * 24 * 60;
      hours = Math.floor(totalMinutesInDay / 60);
      minutes = Math.round(totalMinutesInDay % 60);
      Logger.log(`時間割合から変換: ${timeStr} → ${hours}:${minutes}`);
    } else {
      hours = Math.floor(timeStr);
      minutes = Math.round((timeStr - hours) * 60);
      Logger.log(`小数点数値から変換: ${timeStr} → ${hours}:${minutes}`);
    }
  }
  // 文字列型の場合
  else {
    const parts = timeStr.toString().split(':');
    if (parts.length === 2) {
      hours = parseInt(parts[0]);
      minutes = parseInt(parts[1]);
      Logger.log(`文字列から変換: ${timeStr} → ${hours}:${minutes}`);
    }
  }
  
  // 値の有効性チェック
  if (isNaN(hours) || isNaN(minutes)) {
    Logger.log(`無効な時間形式: ${timeStr}`);
    return 0;
  }
  
  const totalMinutes = hours * 60 + minutes;
  Logger.log(`時間変換結果 - ${hours}時間${minutes}分 = ${totalMinutes}分`);
  return totalMinutes;
}

/**
 * 教員別の集計シートを作成する関数
 */
function createTeacherSummary() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  
  // 教員別集計シートを作成
  let teacherSheet = ss.getSheetByName('教員別集計');
  if (!teacherSheet) {
    teacherSheet = ss.insertSheet('教員別集計');
  }

  // ヘッダーを設定
  teacherSheet.clear();
  teacherSheet.appendRow([
    '教員名',
    'メールアドレス',
    '期間',
    '申請件数',
    '合計時間',
    '平均時間',
    '最終申請日',
    '最終更新'
  ]);
  
  // ヘッダーの書式設定
  teacherSheet.getRange(1, 1, 1, 8)
    .setFontWeight('bold')
    .setBackground('#f3f3f3')
    .setHorizontalAlignment('center');
  
  // 列幅の設定
  teacherSheet.setColumnWidths(1, 8, 150);
  
  // 教員データを収集
  const teacherData = {};
  let dataFound = false;
  
  // 処理状況をログに記録
  Logger.log('教員別集計の処理を開始します');
  
  sheets.forEach(sheet => {
    const sheetName = sheet.getName();
    // 期間シートのみを処理（例：202404期）
    if (sheetName.match(/^\d{6}期$/)) {
      const lastRow = sheet.getLastRow();
      Logger.log(`シート「${sheetName}」の処理を開始（最終行: ${lastRow}）`);
      
      if (lastRow > 1) {
        // データを取得
        const data = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
        
        data.forEach((row, index) => {
          if (row[1] && row[2]) { // 教員名とメールアドレスが存在する場合
            const teacherName = row[1].toString().trim();
            const teacherEmail = row[2].toString().trim();
            const startTime = row[5];  // 開始時間
            const endTime = row[6];    // 終了時間
            
            // 時間を分に変換
            const startMinutes = timeToMinutes(startTime);
            const endMinutes = timeToMinutes(endTime);
            
            // 勤務時間を計算
            let minutes = 0;
            if (startMinutes > 0 && endMinutes > 0) {
              minutes = endMinutes - startMinutes;
              if (minutes < 0) {
                minutes += 24 * 60;
              }
            }
            
            // 教員と期間の組み合わせでキーを生成
            const key = `${teacherEmail}_${sheetName}`;
            
            if (!teacherData[key]) {
              teacherData[key] = {
                name: teacherName,
                email: teacherEmail,
                period: sheetName,
                count: 0,
                totalMinutes: 0,
                lastApplication: null
              };
            }
            
            teacherData[key].count++;
            teacherData[key].totalMinutes += minutes;
            
            // 最終申請日を更新
            const applicationDate = row[0];
            if (!teacherData[key].lastApplication || 
                new Date(applicationDate) > new Date(teacherData[key].lastApplication)) {
              teacherData[key].lastApplication = applicationDate;
            }
            
            dataFound = true;
          }
        });
      }
    }
  });
  
  if (!dataFound) {
    SpreadsheetApp.getUi().alert('データが見つかりませんでした。シートの内容を確認してください。');
    return;
  }
  
  // 集計データを更新
  const timestamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
  const summaryData = Object.values(teacherData)
    .filter(data => data.count > 0)
    .map(data => [
      data.name,
      data.email,
      data.period,
      data.count,
      formatWorkingTime(data.totalMinutes),
      formatWorkingTime(Math.round(data.totalMinutes / data.count)),
      Utilities.formatDate(new Date(data.lastApplication), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss'),
      timestamp
    ]);
  
  // データを書き込み
  if (summaryData.length > 0) {
    teacherSheet.getRange(2, 1, summaryData.length, 8).setValues(summaryData);
    
    // 書式の設定
    teacherSheet.getRange(2, 1, summaryData.length, 8)
      .setHorizontalAlignment('center')
      .setBorder(true, true, true, true, true, true);
    
    // 数値列の書式設定
    teacherSheet.getRange(2, 4, summaryData.length, 3).setNumberFormat('@');
    
    // 日付列の書式設定
    teacherSheet.getRange(2, 7, summaryData.length, 2).setNumberFormat('yyyy/MM/dd HH:mm:ss');
    
    // フィルターを設定
    teacherSheet.getRange(1, 1, 1, 8).createFilter();
    
    SpreadsheetApp.getUi().alert(`教員別集計シートを更新しました。\n${summaryData.length}件のデータを処理しました。`);
  } else {
    SpreadsheetApp.getUi().alert('有効なデータが見つかりませんでした。');
  }
}

/**
 * Looker Studio用の集計シートを作成する関数
 * @param {string} selectedPeriod - 選択された期間（例：202404期）
 */
function createLookerStudioSummary(selectedPeriod) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  
  // Looker Studio用集計シートを作成
  let lookerSheet = ss.getSheetByName('Looker Studio用集計');
  if (!lookerSheet) {
    lookerSheet = ss.insertSheet('Looker Studio用集計');
  }

  // ヘッダーを設定
  lookerSheet.clear();
  lookerSheet.appendRow([
    '教員名',
    'メールアドレス',
    '期間',
    '活動日',
    '開始時間',
    '終了時間',
    '勤務時間',
    '報告事項',
    '最終更新'
  ]);
  
  // ヘッダーの書式設定
  lookerSheet.getRange(1, 1, 1, 9)
    .setFontWeight('bold')
    .setBackground('#f3f3f3')
    .setHorizontalAlignment('center');
  
  // 列幅の設定
  lookerSheet.setColumnWidths(1, 9, 150);
  
  // 選択された期間のシートを取得
  const periodSheet = sheets.find(sheet => sheet.getName() === selectedPeriod);
  
  if (!periodSheet) {
    SpreadsheetApp.getUi().alert('選択された期間のシートが見つかりませんでした。');
    return;
  }
  
  const lastRow = periodSheet.getLastRow();
  if (lastRow <= 1) {
    SpreadsheetApp.getUi().alert('データが見つかりませんでした。');
    return;
  }
  
  // データを取得
  const data = periodSheet.getRange(2, 1, lastRow - 1, 9).getValues();
  const summaryData = [];
  
  data.forEach(row => {
    if (row[1] && row[2]) { // 教員名とメールアドレスが存在する場合
      const teacherName = row[1].toString().trim();
      const teacherEmail = row[2].toString().trim();
      const activityDate = row[4];  // 活動日
      const startTime = row[5];     // 開始時間
      const endTime = row[6];       // 終了時間
      const reason = row[8];        // 報告事項
      
      // 時間を分に変換
      const startMinutes = timeToMinutes(startTime);
      const endMinutes = timeToMinutes(endTime);
      
      // 勤務時間を計算
      let minutes = 0;
      if (startMinutes > 0 && endMinutes > 0) {
        minutes = endMinutes - startMinutes;
        if (minutes < 0) {
          minutes += 24 * 60;
        }
      }
      
      // 勤務時間を時間と分の形式に変換
      const workTimeFormatted = formatWorkingTime(minutes);
      
      summaryData.push([
        teacherName,
        teacherEmail,
        selectedPeriod,
        Utilities.formatDate(new Date(activityDate), 'Asia/Tokyo', 'yyyy/MM/dd'),
        startTime,
        endTime,
        workTimeFormatted,
        reason,
        Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss')
      ]);
    }
  });
  
  // データを書き込み
  if (summaryData.length > 0) {
    lookerSheet.getRange(2, 1, summaryData.length, 9).setValues(summaryData);
    
    // 書式の設定
    lookerSheet.getRange(2, 1, summaryData.length, 9)
      .setHorizontalAlignment('center')
      .setBorder(true, true, true, true, true, true);
    
    // 数値列の書式設定
    lookerSheet.getRange(2, 7, summaryData.length, 1).setNumberFormat('@');
    
    // 日付列の書式設定
    lookerSheet.getRange(2, 4, summaryData.length, 1).setNumberFormat('yyyy/MM/dd');
    lookerSheet.getRange(2, 9, summaryData.length, 1).setNumberFormat('yyyy/MM/dd HH:mm:ss');
    
    // 時間列の書式設定
    lookerSheet.getRange(2, 5, summaryData.length, 2).setNumberFormat('HH:mm');
    
    // フィルターを設定
    lookerSheet.getRange(1, 1, 1, 9).createFilter();
    
    SpreadsheetApp.getUi().alert(`Looker Studio用集計シートを更新しました。\n${summaryData.length}件のデータを処理しました。`);
  } else {
    SpreadsheetApp.getUi().alert('有効なデータが見つかりませんでした。');
  }
}

/**
 * 期間を選択してLooker Studio用集計を更新する関数
 */
function selectPeriodForLookerStudio() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  
  // 期間シートを取得
  const periodSheets = sheets
    .map(sheet => sheet.getName())
    .filter(name => name.match(/^\d{6}期$/))
    .sort()
    .reverse(); // 最新の期間から表示
  
  if (periodSheets.length === 0) {
    SpreadsheetApp.getUi().alert('期間シートが見つかりませんでした。');
    return;
  }
  
  // 期間選択のダイアログを表示
  const ui = SpreadsheetApp.getUi();
  const htmlOutput = HtmlService
    .createHtmlOutput(`
      <style>
        select { width: 100%; padding: 5px; margin: 10px 0; }
        button { padding: 5px 10px; margin: 5px; }
      </style>
      <select id="periodSelect">
        ${periodSheets.map(period => `<option value="${period}">${period}</option>`).join('')}
      </select>
      <br>
      <button onclick="google.script.run
        .withSuccessHandler(() => google.script.host.close())
        .createLookerStudioSummary(document.getElementById('periodSelect').value)">
        更新
      </button>
      <button onclick="google.script.host.close()">キャンセル</button>
    `)
    .setWidth(300)
    .setHeight(150);
  
  ui.showModalDialog(htmlOutput, '期間を選択してください');
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

/**
 * Looker Studio用集計シートを更新する関数
 * @param {string} period - 期間（例：202404期）
 * @param {Object} data - 追加するデータ
 */
function updateLookerStudioSummary(period, data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Looker Studio用集計シートを取得または作成
  let lookerSheet = ss.getSheetByName('Looker Studio用集計');
  if (!lookerSheet) {
    lookerSheet = ss.insertSheet('Looker Studio用集計');
    
    // ヘッダーを設定
    lookerSheet.appendRow([
      '教員名',
      'メールアドレス',
      '期間',
      '活動日',
      '開始時間',
      '終了時間',
      '勤務時間',
      '報告事項',
      '最終更新'
    ]);
    
    // ヘッダーの書式設定
    const headerRange = lookerSheet.getRange(1, 1, 1, 9);
    headerRange
      .setFontWeight('bold')
      .setBackground('#f3f3f3')
      .setHorizontalAlignment('center')
      .setBorder(true, true, true, true, true, true);
    
    // 列幅の設定
    lookerSheet.setColumnWidth(1, 150);  // 教員名
    lookerSheet.setColumnWidth(2, 250);  // メールアドレス
    lookerSheet.setColumnWidth(3, 100);  // 期間
    lookerSheet.setColumnWidth(4, 100);  // 活動日
    lookerSheet.setColumnWidth(5, 80);   // 開始時間
    lookerSheet.setColumnWidth(6, 80);   // 終了時間
    lookerSheet.setColumnWidth(7, 100);  // 勤務時間
    lookerSheet.setColumnWidth(8, 300);  // 報告事項
    lookerSheet.setColumnWidth(9, 150);  // 最終更新
    
    // フィルターを設定
    lookerSheet.getRange(1, 1, 1, 9).createFilter();
  }
  
  // 勤務時間を時間と分の形式に変換
  const workTimeFormatted = formatWorkingTime(data.workMinutes);
  
  // データを追加
  const timestamp = new Date();
  const newRow = [
    data.teacherName,
    data.teacherEmail,
    period,
    Utilities.formatDate(data.activityDate, 'Asia/Tokyo', 'yyyy/MM/dd'),
    data.startTime,
    data.endTime,
    workTimeFormatted,
    data.reason,
    Utilities.formatDate(timestamp, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss')
  ];
  
  lookerSheet.appendRow(newRow);
  
  // 追加した行の書式を設定
  const lastRow = lookerSheet.getLastRow();
  const newRowRange = lookerSheet.getRange(lastRow, 1, 1, 9);
  
  // 全体の書式設定
  newRowRange
    .setHorizontalAlignment('center')
    .setBorder(true, true, true, true, true, true);
  
  // 数値列の書式設定
  lookerSheet.getRange(lastRow, 7).setNumberFormat('@');
  
  // 日付列の書式設定
  lookerSheet.getRange(lastRow, 4).setNumberFormat('yyyy/MM/dd');
  lookerSheet.getRange(lastRow, 9).setNumberFormat('yyyy/MM/dd HH:mm:ss');
  
  // 時間列の書式設定
  lookerSheet.getRange(lastRow, 5, 1, 2).setNumberFormat('HH:mm');
  
  Logger.log('Looker Studio用集計シートにデータを追加しました: ' + newRow.join(', '));
}

/**
 * 承認状態を更新する関数
 * @param {SpreadsheetApp.Sheet} sheet - 対象のシート
 * @param {number} row - 更新する行番号
 */
function updateApprovalStatus(sheet, row) {
  const approvalRange = sheet.getRange(row, 10, 1, 4); // 校長から教頭までの列
  const approvalValues = approvalRange.getValues()[0];
  const allApproved = approvalValues.every(value => value === true);
  
  const statusCell = sheet.getRange(row, 14); // 承認済み列
  if (allApproved) {
    statusCell.setValue('承認済み');
    statusCell.setBackground('#b7e1cd');
  } else {
    statusCell.setValue('');
    statusCell.setBackground(null);
  }
}

/**
 * 編集時のトリガー関数
 */
function onEdit(e) {
  const sheet = e.source.getActiveSheet();
  const range = e.range;
  
  // 承認列（10-13列目）が編集された場合のみ処理
  if (range.getColumn() >= 10 && range.getColumn() <= 13) {
    updateApprovalStatus(sheet, range.getRow());
  }
} 