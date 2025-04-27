import { google } from "googleapis"
import { NextResponse } from "next/server"

// Google Sheets APIの認証情報
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n") || ""
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL || ""
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID || ""

// Google Sheets APIの認証
const authorize = async () => {
  const jwtClient = new google.auth.JWT(GOOGLE_CLIENT_EMAIL, undefined, GOOGLE_PRIVATE_KEY, [
    "https://www.googleapis.com/auth/spreadsheets",
  ])

  await jwtClient.authorize()
  return jwtClient
}

export const dynamic = 'force-static';
// もしくは適切なrevalidate設定
// export const revalidate = false;

export async function GET() {
  try {
    // Google Sheetsに認証
    const auth = await authorize()
    const sheets = google.sheets({ version: "v4", auth })

    // スプレッドシートの情報を取得
    const spreadsheetInfo = await sheets.spreadsheets.get({
      spreadsheetId: GOOGLE_SHEET_ID,
    })

    // シートの一覧を取得
    const sheetsList = spreadsheetInfo.data.sheets?.map(sheet => ({
      sheetId: sheet.properties?.sheetId,
      title: sheet.properties?.title,
    }))

    // Sheet1のデータを取得
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: "シート1!A1:H10",
    })

    return NextResponse.json({
      success: true,
      sheetInfo: {
        title: spreadsheetInfo.data.properties?.title,
        sheets: sheetsList,
      },
      values: response.data.values || [],
    })
  } catch (error) {
    console.error("エラー:", error)
    return NextResponse.json({ 
      success: false, 
      message: "スプレッドシートの接続中にエラーが発生しました",
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
} 