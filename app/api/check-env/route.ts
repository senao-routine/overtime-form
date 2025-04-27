import { NextResponse } from "next/server"

export const dynamic = 'force-static';
// もしくは適切なrevalidate設定
// export const revalidate = false;

export async function GET() {
  const envVars = {
    GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY ? "設定されています" : "設定されていません",
    GOOGLE_CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL ? "設定されています" : "設定されていません",
    GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID ? "設定されています" : "設定されていません",
    SHEET_ID_VALUE: process.env.GOOGLE_SHEET_ID || "値がありません"
  }

  return NextResponse.json(envVars)
} 