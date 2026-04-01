// Google Apps Script用のコード
// スプレッドシートにデプロイして、ウェブアプリとして公開する

/**
 * 期間に基づいてシート名を生成する関数
 * @param {Date} date - 対象の日付
 * @returns {string} シート名（例：202604期）
 */
function generatePeriodSheetName(date) {
  const targetDate = new Date(date);
  const day = targetDate.getDate();

  let periodYear, periodMonth;
  if (day >= 22) {
    periodMonth = targetDate.getMonth() + 2;
    periodYear = targetDate.getFullYear();
    if (periodMonth > 12) {
      periodMonth = 1;
      periodYear++;
    }
  } else {
    periodMonth = targetDate.getMonth() + 1;
    periodYear = targetDate.getFullYear();
  }

  return `${periodYear}${String(periodMonth).padStart(2, '0')}期`;
}

/**
 * 分を「X時間Y分」形式に変換する関数
 */
function formatWorkingTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}時間${remainingMinutes}分`;
}

/**
 * 時間文字列を分数に変換する関数
 */
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;

  let hours = 0;
  let minutes = 0;

  if (timeStr instanceof Date) {
    hours = timeStr.getHours();
    minutes = timeStr.getMinutes();
  } else if (typeof timeStr === 'number') {
    if (timeStr < 1) {
      const totalMinutesInDay = timeStr * 24 * 60;
      hours = Math.floor(totalMinutesInDay / 60);
      minutes = Math.round(totalMinutesInDay % 60);
    } else {
      hours = Math.floor(timeStr);
      minutes = Math.round((timeStr - hours) * 60);
    }
  } else {
    const parts = timeStr.toString().split(':');
    if (parts.length === 2) {
      hours = parseInt(parts[0]);
      minutes = parseInt(parts[1]);
    }
  }

  if (isNaN(hours) || isNaN(minutes)) return 0;
  return hours * 60 + minutes;
}

// ============================================================
// 期間シートの管理
// ============================================================

// 期間シート列構成（15列）:
// A:申請日時 B:申請種類 C:教員名 D:メールアドレス E:クラブ名
// F:活動日 G:開始時間 H:終了時間 I:勤務時間 J:報告事項
// K:校長 L:事務長 M:副校長 N:教頭 O:承認済み

/**
 * 期間シートを取得または作成する関数
 */
function getOrCreateSheet(ss, sheetName) {
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    const headers = [
      '申請日時', '申請種類', '教員名', 'メールアドレス', 'クラブ名',
      '活動日', '開始時間', '終了時間', '勤務時間', '報告事項',
      '校長', '事務長', '副校長', '教頭', '承認済み'
    ];

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
    sheet.setColumnWidth(2, 130);  // 申請種類
    sheet.setColumnWidth(3, 150);  // 教員名
    sheet.setColumnWidth(4, 250);  // メールアドレス
    sheet.setColumnWidth(5, 150);  // クラブ名
    sheet.setColumnWidth(6, 100);  // 活動日
    sheet.setColumnWidth(7, 80);   // 開始時間
    sheet.setColumnWidth(8, 80);   // 終了時間
    sheet.setColumnWidth(9, 100);  // 勤務時間
    sheet.setColumnWidth(10, 300); // 報告事項
    sheet.setColumnWidth(11, 100); // 校長
    sheet.setColumnWidth(12, 100); // 事務長
    sheet.setColumnWidth(13, 100); // 副校長
    sheet.setColumnWidth(14, 100); // 教頭
    sheet.setColumnWidth(15, 100); // 承認済み

    // フォーマット設定
    sheet.getRange(2, 1, 999, 1).setNumberFormat('yyyy/MM/dd HH:mm:ss');
    sheet.getRange(2, 6, 999, 1).setNumberFormat('yyyy/MM/dd');
    sheet.getRange(2, 7, 999, 2).setNumberFormat('HH:mm');
    sheet.getRange(2, 9, 999, 1).setNumberFormat('@');

    // 承認チェックボックス（K〜N列 = 11〜14列目）
    const approvalRange = sheet.getRange(2, 11, 999, 4);
    approvalRange.insertCheckboxes();

    // 承認済み列の条件付き書式（O列 = 15列目）
    const approvalStatusRange = sheet.getRange(2, 15, 999, 1);
    const rule = SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND(K2=TRUE,L2=TRUE,M2=TRUE,N2=TRUE)')
      .setBackground('#b7e1cd')
      .setRanges([approvalStatusRange])
      .build();
    sheet.setConditionalFormatRules([rule]);

    sheet.getRange(1, 1, 1, headers.length).createFilter();
    sheet.setFrozenRows(1);

    const protection = sheet.protect();
    protection.setDescription('承認機能の保護');
    protection.setUnprotectedRanges([approvalRange]);
  }

  return sheet;
}

// ============================================================
// API エンドポイント
// ============================================================

/**
 * GETリクエスト対応（マスタデータ取得）
 */
function doGet(e) {
  const type = e && e.parameter && e.parameter.type;

  if (type === 'teachers') return getTeachersMaster();
  if (type === 'clubs') return getClubsMaster();

  return ContentService.createTextOutput(JSON.stringify({
    status: 'active',
    message: '部活動時間外勤務申請処理APIが正常に動作しています'
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * 教員マスタを取得
 */
function getTeachersMaster() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('教員マスタ');
    if (!sheet) return ContentService.createTextOutput('[]').setMimeType(ContentService.MimeType.JSON);

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return ContentService.createTextOutput('[]').setMimeType(ContentService.MimeType.JSON);

    const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
    const teachers = data
      .filter(row => row[1])
      .map((row, index) => ({
        id: 't' + (index + 1),
        name: row[1].toString().trim(),
        email: row[2] ? row[2].toString().trim() : ''
      }));

    return ContentService.createTextOutput(JSON.stringify(teachers))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log('教員マスタ取得エラー: ' + error.toString());
    return ContentService.createTextOutput('[]').setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * クラブマスタを取得
 */
function getClubsMaster() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('クラブマスタ');
    if (!sheet) return ContentService.createTextOutput('[]').setMimeType(ContentService.MimeType.JSON);

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return ContentService.createTextOutput('[]').setMimeType(ContentService.MimeType.JSON);

    const data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    const clubs = data
      .filter(row => row[0])
      .map((row, index) => ({
        id: 'c' + (index + 1),
        name: row[0].toString().trim()
      }));

    return ContentService.createTextOutput(JSON.stringify(clubs))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log('クラブマスタ取得エラー: ' + error.toString());
    return ContentService.createTextOutput('[]').setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * POSTリクエスト処理（申請受付）
 */
function doPost(e) {
  try {
    let data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseError) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'データの解析に失敗しました: ' + parseError.toString()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const activityDate = new Date(data.date);
    const sheetName = generatePeriodSheetName(activityDate);

    // 期間シートにデータを追加
    const sheet = getOrCreateSheet(ss, sheetName);

    const startTime = timeToMinutes(data.startTime);
    const endTime = timeToMinutes(data.endTime);
    let workMinutes = endTime - startTime;
    if (workMinutes < 0) workMinutes += 24 * 60;

    const workTimeFormatted = formatWorkingTime(workMinutes);
    const timestamp = new Date();

    const newRow = [
      timestamp,                      // A: 申請日時
      data.applicationType || '',     // B: 申請種類
      data.teacherName || '',         // C: 教員名
      data.teacherEmail || '',        // D: メールアドレス
      data.clubName || '',            // E: クラブ名
      new Date(data.date),            // F: 活動日
      data.startTime || '',           // G: 開始時間
      data.endTime || '',             // H: 終了時間
      workTimeFormatted,              // I: 勤務時間
      data.reason || '',              // J: 報告事項
      '', '', '', '', ''              // K〜O: 校長〜承認済み
    ];

    sheet.insertRowBefore(2);
    sheet.getRange(2, 1, 1, 15).setValues([newRow]);
    sheet.getRange(2, 1, 1, 15).setBorder(true, true, true, true, true, true);
    sheet.getRange(2, 1).setNumberFormat('yyyy/MM/dd HH:mm:ss');
    sheet.getRange(2, 6).setNumberFormat('yyyy/MM/dd');
    sheet.getRange(2, 7, 1, 2).setNumberFormat('HH:mm');
    sheet.getRange(2, 9).setNumberFormat('@');
    sheet.getRange(2, 11, 1, 4).insertCheckboxes();

    // Looker Studio統合シートにも追加
    try {
      updateLookerStudioSummary(sheetName, {
        applicationType: data.applicationType || '',
        teacherName: data.teacherName || '',
        teacherEmail: data.teacherEmail || '',
        clubName: data.clubName || '',
        activityDate: new Date(data.date),
        startTime: data.startTime || '',
        endTime: data.endTime || '',
        workMinutes: workMinutes,
        reason: data.reason || ''
      });
    } catch (lookerError) {
      Logger.log('Looker Studio更新失敗: ' + lookerError.toString());
    }

    // 申請控えメールを送信
    try {
      sendConfirmationEmail({
        applicationType: data.applicationType || '',
        teacherName: data.teacherName || '',
        teacherEmail: data.teacherEmail || '',
        clubName: data.clubName || '',
        activityDate: data.date || '',
        startTime: data.startTime || '',
        endTime: data.endTime || '',
        workingTime: workTimeFormatted,
        reason: data.reason || '',
        period: sheetName,
        timestamp: Utilities.formatDate(timestamp, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss')
      });
    } catch (mailError) {
      Logger.log('メール送信失敗: ' + mailError.toString());
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: '申請を受け付けました',
      details: {
        period: sheetName,
        timestamp: Utilities.formatDate(timestamp, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss'),
        workingTime: workTimeFormatted
      }
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('エラー: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: 'エラーが発生しました: ' + error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// メール通知
// ============================================================

/**
 * 申請控えメールを教員に送信する関数
 */
function sendConfirmationEmail(info) {
  if (!info.teacherEmail) return;

  const subject = `【申請受付】${info.applicationType}（${info.activityDate}）`;

  const body = [
    `${info.teacherName} 先生`,
    '',
    '以下の内容で時間外勤務申請を受け付けました。',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    `  申請種類：${info.applicationType}`,
    `  対象期間：${info.period}`,
    `  活動日　：${info.activityDate}`,
    info.clubName ? `  クラブ名：${info.clubName}` : null,
    `  開始時間：${info.startTime}`,
    `  終了時間：${info.endTime}`,
    `  勤務時間：${info.workingTime}`,
    `  報告事項：${info.reason || 'なし'}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    `申請日時：${info.timestamp}`,
    '',
    '承認状況はLooker Studioダッシュボードから確認できます。',
    'https://lookerstudio.google.com/reporting/a375b2fa-f2d6-451e-a8cb-433d2a2ce7c0/page/kmvtF',
    '',
    '※このメールは自動送信です。',
  ].filter(line => line !== null).join('\n');

  MailApp.sendEmail({
    to: info.teacherEmail,
    subject: subject,
    body: body
  });

  Logger.log('控えメール送信完了: ' + info.teacherEmail);
}

// ============================================================
// Looker Studio統合シート
// ============================================================

// Looker Studio統合シート列構成（17列）:
// A:教員名 B:メールアドレス C:申請種類 D:期間 E:クラブ名
// F:活動日 G:開始時間 H:終了時間 I:勤務時間 J:勤務時間数 K:報告事項
// L:校長 M:事務長 N:副校長 O:教頭 P:承認済み Q:最終更新

/**
 * Looker Studio統合シートにデータを追加する関数
 */
function updateLookerStudioSummary(period, data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let lookerSheet = ss.getSheetByName('Looker Studio用集計_統合');
  if (!lookerSheet) {
    lookerSheet = ss.insertSheet('Looker Studio用集計_統合');

    lookerSheet.appendRow([
      '教員名', 'メールアドレス', '申請種類', '期間', 'クラブ名',
      '活動日', '開始時間', '終了時間', '勤務時間', '勤務時間数', '報告事項',
      '校長', '事務長', '副校長', '教頭', '承認済み', '最終更新'
    ]);

    const headerRange = lookerSheet.getRange(1, 1, 1, 17);
    headerRange
      .setFontWeight('bold')
      .setBackground('#f3f3f3')
      .setHorizontalAlignment('center')
      .setBorder(true, true, true, true, true, true);

    lookerSheet.setColumnWidth(1, 150);  // 教員名
    lookerSheet.setColumnWidth(2, 250);  // メールアドレス
    lookerSheet.setColumnWidth(3, 130);  // 申請種類
    lookerSheet.setColumnWidth(4, 100);  // 期間
    lookerSheet.setColumnWidth(5, 150);  // クラブ名
    lookerSheet.setColumnWidth(6, 100);  // 活動日
    lookerSheet.setColumnWidth(7, 80);   // 開始時間
    lookerSheet.setColumnWidth(8, 80);   // 終了時間
    lookerSheet.setColumnWidth(9, 100);  // 勤務時間
    lookerSheet.setColumnWidth(10, 100); // 勤務時間数
    lookerSheet.setColumnWidth(11, 300); // 報告事項
    lookerSheet.setColumnWidth(12, 100); // 校長
    lookerSheet.setColumnWidth(13, 100); // 事務長
    lookerSheet.setColumnWidth(14, 100); // 副校長
    lookerSheet.setColumnWidth(15, 100); // 教頭
    lookerSheet.setColumnWidth(16, 100); // 承認済み
    lookerSheet.setColumnWidth(17, 150); // 最終更新

    lookerSheet.getRange(1, 1, 1, 17).createFilter();
    lookerSheet.setFrozenRows(1);
  }

  const workTimeFormatted = formatWorkingTime(data.workMinutes);
  const timestamp = new Date();

  const newRow = [
    data.teacherName, data.teacherEmail,
    data.applicationType, period, data.clubName,
    Utilities.formatDate(data.activityDate, 'Asia/Tokyo', 'yyyy/MM/dd'),
    data.startTime, data.endTime, workTimeFormatted, Math.round(data.workMinutes / 60 * 10) / 10, data.reason,
    false, false, false, false, '',
    Utilities.formatDate(timestamp, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss')
  ];

  if (lookerSheet.getLastRow() > 1) {
    lookerSheet.insertRowBefore(2);
    lookerSheet.getRange(2, 1, 1, 17).setValues([newRow]);
  } else {
    lookerSheet.appendRow(newRow);
  }

  const newRowRange = lookerSheet.getRange(2, 1, 1, 17);
  newRowRange.setHorizontalAlignment('center').setBorder(true, true, true, true, true, true);
  lookerSheet.getRange(2, 9).setNumberFormat('@');
  lookerSheet.getRange(2, 6).setNumberFormat('yyyy/MM/dd');
  lookerSheet.getRange(2, 17).setNumberFormat('yyyy/MM/dd HH:mm:ss');
  lookerSheet.getRange(2, 7, 1, 2).setNumberFormat('HH:mm');
}

// ============================================================
// 承認連動
// ============================================================

/**
 * 期間シートの承認状態を更新する関数
 * 期間シート: K=校長(11), L=事務長(12), M=副校長(13), N=教頭(14), O=承認済み(15)
 */
function updateApprovalStatus(sheet, row) {
  const approvalValues = sheet.getRange(row, 11, 1, 4).getValues()[0];
  const allApproved = approvalValues.every(value => value === true);

  const statusCell = sheet.getRange(row, 15);
  if (allApproved) {
    statusCell.setValue('承認済み');
    statusCell.setBackground('#b7e1cd');
  } else {
    statusCell.setValue('');
    statusCell.setBackground(null);
  }
}

/**
 * 期間シートの承認をLooker Studio統合シートに同期する関数
 * 期間シート: D=メールアドレス(4), F=活動日(6), G=開始時間(7), K〜N=承認(11〜14)
 * 統合シート: B=メールアドレス(2), F=活動日(6), G=開始時間(7), L〜O=承認(12〜15), P=承認済み(16)
 */
function syncApprovalToLookerStudio(periodSheet, row) {
  try {
    const ss = periodSheet.getParent();
    const lookerSheet = ss.getSheetByName('Looker Studio用集計_統合');
    if (!lookerSheet) return;

    const periodRow = periodSheet.getRange(row, 1, 1, 15).getValues()[0];
    const teacherEmail = periodRow[3].toString().trim();  // D列: メールアドレス
    const activityDate = periodRow[5];                     // F列: 活動日
    const startTime = periodRow[6];                        // G列: 開始時間

    const principal = periodRow[10];     // K列: 校長
    const business = periodRow[11];      // L列: 事務長
    const vicePrincipal = periodRow[12]; // M列: 副校長
    const headTeacher = periodRow[13];   // N列: 教頭
    const allApproved = principal === true && business === true && vicePrincipal === true && headTeacher === true;

    // 活動日を正規化
    let activityDateStr = '';
    if (activityDate instanceof Date) {
      activityDateStr = Utilities.formatDate(activityDate, 'Asia/Tokyo', 'yyyy/MM/dd');
    } else {
      activityDateStr = activityDate.toString().replace(/-/g, '/').substring(0, 10);
    }

    // 開始時間を正規化
    let startTimeStr = '';
    if (startTime instanceof Date) {
      startTimeStr = Utilities.formatDate(startTime, 'Asia/Tokyo', 'HH:mm');
    } else {
      startTimeStr = startTime.toString().substring(0, 5);
    }

    // 統合シートから該当行を検索
    const lookerLastRow = lookerSheet.getLastRow();
    if (lookerLastRow <= 1) return;

    const lookerData = lookerSheet.getRange(2, 1, lookerLastRow - 1, 17).getValues();

    for (let i = 0; i < lookerData.length; i++) {
      const lEmail = lookerData[i][1].toString().trim();  // B列: メールアドレス

      let lDate = '';
      if (lookerData[i][5] instanceof Date) {              // F列: 活動日
        lDate = Utilities.formatDate(lookerData[i][5], 'Asia/Tokyo', 'yyyy/MM/dd');
      } else {
        lDate = lookerData[i][5].toString().replace(/-/g, '/').substring(0, 10);
      }

      let lStart = '';
      if (lookerData[i][6] instanceof Date) {              // G列: 開始時間
        lStart = Utilities.formatDate(lookerData[i][6], 'Asia/Tokyo', 'HH:mm');
      } else {
        lStart = lookerData[i][6].toString().substring(0, 5);
      }

      if (lEmail === teacherEmail && lDate === activityDateStr && lStart === startTimeStr) {
        const targetRow = i + 2;
        lookerSheet.getRange(targetRow, 12, 1, 4).setValues([[principal, business, vicePrincipal, headTeacher]]);
        lookerSheet.getRange(targetRow, 16).setValue(allApproved ? '承認済み' : '');
        break;
      }
    }
  } catch (error) {
    Logger.log('Looker Studio承認同期エラー: ' + error.toString());
  }
}

/**
 * 編集時のトリガー関数
 * 期間シート: 承認列は K〜N（11〜14列目）
 */
function onEdit(e) {
  const sheet = e.source.getActiveSheet();
  const sheetName = sheet.getName();
  const range = e.range;

  if (range.getColumn() >= 11 && range.getColumn() <= 14) {
    updateApprovalStatus(sheet, range.getRow());

    if (sheetName.match(/^\d{6}期$/)) {
      syncApprovalToLookerStudio(sheet, range.getRow());
    }
  }
}

/**
 * スプレッドシートを開いたときに実行される関数
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('部活動時間外勤務')
    .addItem('ログを表示', 'showLogs')
    .addToUi();
}

/**
 * ログを表示する関数
 */
function showLogs() {
  const logs = Logger.getLog();
  SpreadsheetApp.getUi().alert(logs || 'ログはありません。');
}
