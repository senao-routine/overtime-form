import OvertimeForm from "@/components/overtime-form"

export default function Home() {
  return (
    <main className="container mx-auto py-12 px-4 relative">
      {/* 装飾的な背景要素 */}
      <div className="absolute top-0 right-0 w-72 h-72 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob"></div>
      <div className="absolute top-0 -left-4 w-72 h-72 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-8 left-20 w-72 h-72 bg-indigo-200 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-4000"></div>
      
      <div className="relative z-10">
        <h1 className="text-4xl font-bold mb-2 text-center bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">
          教員部活動時間外勤務申請フォーム
        </h1>
        <p className="text-center mb-8 text-muted-foreground max-w-xl mx-auto">
          部活動指導に関する時間外勤務を簡単に申請できます。記入後、自動的にスプレッドシートに記録されます。
        </p>
        
        <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-lg overflow-hidden glass-morphism">
          <div className="p-8">
            <OvertimeForm />
          </div>
        </div>
        
        <footer className="mt-12 text-center text-sm text-muted-foreground">
          <p>© 花園中学高等学校 - すべての権利を保有します</p>
        </footer>
      </div>
    </main>
  )
}
