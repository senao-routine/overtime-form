import { google } from "googleapis"
import { NextResponse } from "next/server"

// Google Sheets APIの認証情報
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n") || ""
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL || ""
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID || ""

// Webアプリとしてデプロイされたスクリプトのエンドポイントとアクセストークン
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || "https://script.google.com/macros/s/AKfycbwnB50xE0Y-EoiFym658O6r2GaZRV7CrXcH5285MomEX2XzvqCdE0KqWzEH--d4k60RNw/exec"
const ACCESS_TOKEN = process.env.APPS_SCRIPT_ACCESS_TOKEN || "temporary_access_token_for_testing"

// スプレッドシートの列名
const COLUMN_HEADERS = [
  "教員名",
  "クラブ名",
  "活動日",
  "業務開始時間",
  "業務終了時間",
  "活動に関する報告事項",
  "申請日時",
  "勤務時間（分）",
]

// Google Sheets APIの認証
const authorize = async () => {
  const jwtClient = new google.auth.JWT(GOOGLE_CLIENT_EMAIL, undefined, GOOGLE_PRIVATE_KEY, [
    "https://www.googleapis.com/auth/spreadsheets",
  ])

  await jwtClient.authorize()
  return jwtClient
}

// スプレッドシートが空かどうかを確認し、空なら列名を設定する
const initializeSheetIfEmpty = async (auth: any) => {
  const sheets = google.sheets({ version: "v4", auth })

  try {
    // スプレッドシートのデータを取得
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: "シート1!A1:H1",
    })

    // データが空の場合、列名を設定
    if (!response.data.values || response.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: GOOGLE_SHEET_ID,
        range: "シート1!A1:H1",
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [COLUMN_HEADERS],
        }
      })

      // 列の書式設定（オプション）
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: GOOGLE_SHEET_ID,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: {
                  sheetId: 0, // デフォルトのシートID
                  startRowIndex: 0,
                  endRowIndex: 1,
                  startColumnIndex: 0,
                  endColumnIndex: COLUMN_HEADERS.length,
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: {
                      red: 0.8,
                      green: 0.8,
                      blue: 0.8,
                    },
                    horizontalAlignment: "CENTER",
                    textFormat: {
                      bold: true,
                    },
                  },
                },
                fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
              },
            },
            {
              updateSheetProperties: {
                properties: {
                  sheetId: 0,
                  gridProperties: {
                    frozenRowCount: 1,
                  },
                },
                fields: "gridProperties.frozenRowCount",
              },
            },
          ],
        },
      })

      console.log("スプレッドシートの列名を初期化しました")
    }
  } catch (error) {
    console.error("スプレッドシートの初期化エラー:", error)
    throw error
  }
}

// 勤務時間を計算する関数（分単位）
const calculateWorkingTime = (startTime: string, endTime: string): number => {
  const [startHour, startMinute] = startTime.split(":").map(Number)
  const [endHour, endMinute] = endTime.split(":").map(Number)

  let totalMinutes = endHour * 60 + endMinute - (startHour * 60 + startMinute)

  // 日をまたぐ場合（終了時間が開始時間より前の場合）
  if (totalMinutes < 0) {
    totalMinutes += 24 * 60 // 24時間分を加算
  }

  return totalMinutes
}

// スプレッドシートにデータを追加する関数
const appendToSheet = async (auth: any, values: any[], activityDate: Date) => {
  const sheets = google.sheets({ version: "v4", auth })

  // 申請期間の決定（前月22日〜当月21日）
  const activityDateYear = activityDate.getFullYear()
  const activityDateMonth = activityDate.getMonth() + 1 // 0-11 -> 1-12
  const activityDateDay = activityDate.getDate()
  
  let sheetYear, sheetMonth
  
  // 1-21日の場合は当月扱い、22-31日の場合は翌月扱い
  if (activityDateDay <= 21) {
    sheetYear = activityDateYear
    sheetMonth = activityDateMonth
  } else {
    // 月を1つ進める（12月の場合は年も変わる）
    if (activityDateMonth === 12) {
      sheetYear = activityDateYear + 1
      sheetMonth = 1
    } else {
      sheetYear = activityDateYear
      sheetMonth = activityDateMonth + 1
    }
  }
  
  // 前月の算出（1月の場合は前年12月）
  let prevMonth, prevYear
  if (sheetMonth === 1) {
    prevMonth = 12
    prevYear = sheetYear - 1
  } else {
    prevMonth = sheetMonth - 1
    prevYear = sheetYear
  }
  
  // シート名を「前月22日 - 当月21日」の形式で設定
  const sheetName = `${prevYear}年${prevMonth}月22日 - ${sheetYear}年${sheetMonth}月21日`

  try {
    // シートが存在するか確認し、なければ作成
    const isNewSheet = await ensureSheetExists(auth, sheetName)
    
    // 新しいシートが作成された場合、少し待機してから処理を続行
    if (isNewSheet) {
      await new Promise(resolve => setTimeout(resolve, 1500))
    }
    
    // 最大3回までリトライ
    let attempts = 0
    let lastError = null
    
    while (attempts < 3) {
      try {
        const request = {
          spreadsheetId: GOOGLE_SHEET_ID,
          range: `${sheetName}!A:H`,
          valueInputOption: "USER_ENTERED",
          insertDataOption: "INSERT_ROWS",
          requestBody: {
            values: [values],
          },
        }
        
        const response = await sheets.spreadsheets.values.append(request)
        return response.data
      } catch (error) {
        lastError = error
        console.error(`データ追加エラー (試行 ${attempts + 1}/3):`, error)
        
        // 待機時間を少し増やしてリトライ
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempts + 1)))
        attempts++
      }
    }
    
    // すべての試行が失敗
    throw lastError || new Error("データの追加に失敗しました")
  } catch (error) {
    console.error("Google Sheets APIエラー:", error)
    throw error
  }
}

// シートが存在するか確認し、なければ作成する関数
const ensureSheetExists = async (auth: any, sheetName: string) => {
  const sheets = google.sheets({ version: "v4", auth })

  try {
    // スプレッドシート情報を取得
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: GOOGLE_SHEET_ID,
    })

    // シートが存在するか確認
    const sheetExists = spreadsheet.data.sheets?.some(
      sheet => sheet.properties?.title === sheetName
    )

    // シートが存在する場合は何もせずfalseを返す
    if (sheetExists) {
      return false
    }
    
    console.log(`シート「${sheetName}」が存在しないため、新規作成します`)
    
    // シートを新規作成
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: GOOGLE_SHEET_ID,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: sheetName,
              },
            },
          },
        ],
      },
    })
    
    // APIの処理を待つ
    await new Promise(resolve => setTimeout(resolve, 1000))

    // 作成したシートに列名を設定
    await sheets.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${sheetName}!A1:H1`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [COLUMN_HEADERS],
      }
    })
    
    // もう少し待機
    await new Promise(resolve => setTimeout(resolve, 500))

    // 列の書式設定
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: GOOGLE_SHEET_ID,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: {
                sheetId: spreadsheet.data.sheets?.length, // 新しく追加されたシートのID
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: COLUMN_HEADERS.length,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.8,
                    green: 0.8,
                    blue: 0.8,
                  },
                  horizontalAlignment: "CENTER",
                  textFormat: {
                    bold: true,
                  },
                },
              },
              fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
            },
          },
          {
            updateSheetProperties: {
              properties: {
                sheetId: spreadsheet.data.sheets?.length,
                gridProperties: {
                  frozenRowCount: 1,
                },
              },
              fields: "gridProperties.frozenRowCount",
            },
          },
        ],
      },
    })

    console.log(`シート「${sheetName}」を作成し、列名を初期化しました`)
    return true // 新しいシートを作成したことを示す
  } catch (error) {
    console.error("シート確認/作成エラー:", error)
    throw error
  }
}

export async function POST(request: Request) {
  try {
    // リクエストボディからデータを取得
    const data = await request.json()
    const { teacherName, clubName, activityDate, startTime, endTime, report } = data
    
    // 活動日をDate型に変換
    const activityDateObj = new Date(activityDate)

    // 日付をフォーマット
    const formattedDate = new Date(activityDate).toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })

    // 現在の日時（申請日時）
    const submissionDateTime = new Date().toLocaleString("ja-JP")

    // 勤務時間を計算（分単位）
    const workingTimeMinutes = calculateWorkingTime(startTime, endTime)

    // スプレッドシートに追加するデータの配列
    const rowData = [
      teacherName,
      clubName,
      formattedDate,
      startTime,
      endTime,
      report || "",
      submissionDateTime,
      workingTimeMinutes.toString(),
    ]

    // Google Sheetsに認証
    const auth = await authorize()

    try {
      // データを追加（活動日に基づいて適切なシートに追加）
      await appendToSheet(auth, rowData, activityDateObj)
      
      // 正常に処理できた場合の応答を準備
      const response = {
        success: true,
        message: "申請が正常に送信されました",
        workingTime: workingTimeMinutes,
      }

      // Apps Scriptのウェブアプリを呼び出して集計を更新
      if (APPS_SCRIPT_URL) {
        try {
          const scriptResponse = await fetch(APPS_SCRIPT_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              accessToken: ACCESS_TOKEN,
            }),
          })
          
          // レスポンスのステータスコードを確認
          if (scriptResponse.ok) {
            console.log("集計更新トリガーを正常に呼び出しました")
          } else {
            const errorData = await scriptResponse.text()
            console.warn("集計更新トリガーが失敗しました:", errorData)
          }
        } catch (triggerError) {
          // 集計更新の失敗はフォーム送信の成功に影響しないようにする
          console.error("集計更新トリガーの呼び出しに失敗しました:", triggerError)
        }
      }

      // 処理結果を返す
      return NextResponse.json(response)
    } catch (sheetError) {
      // スプレッドシートの処理でエラーが発生した場合
      console.error("スプレッドシート処理エラー:", sheetError)
      return NextResponse.json({ 
        success: false, 
        message: "申請データの保存中にエラーが発生しました。お手数ですが、もう一度お試しください。"
      }, { status: 500 })
    }
  } catch (error) {
    console.error("エラー:", error)
    return NextResponse.json({ 
      success: false, 
      message: "申請の送信中にエラーが発生しました。入力内容をご確認の上、再度お試しください。" 
    }, { status: 500 })
  }
}
