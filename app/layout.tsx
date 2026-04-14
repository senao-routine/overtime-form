import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '時間外勤務申請フォーム | 花園中学高等学校',
  description: '時間外勤務申請フォーム',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  )
}
