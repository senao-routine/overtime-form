import OvertimeForm from "@/components/overtime-form"

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50/40 via-stone-50 to-orange-50/30">
      <div className="mx-auto max-w-[640px] px-4 py-8 sm:py-12">

        {/* Card */}
        <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_8px_30px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.04] overflow-hidden">

          {/* Branded header */}
          <div className="relative px-6 pt-10 pb-8 sm:px-8 bg-gradient-to-br from-[var(--color-primary)] to-[#2d3070]">
            <div className="absolute top-0 left-0 right-0 h-1 bg-[var(--color-accent)]" />
            <p className="text-[13px] text-white/60 font-medium tracking-wide mb-2">
              花園中学高等学校
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              時間外勤務申請フォーム
            </h1>
            <div className="mt-3 w-10 h-1 rounded-full bg-[var(--color-accent)]" />
          </div>

          {/* Divider */}
          <div className="mx-6 sm:mx-8 border-t border-stone-100" />

          {/* Form body */}
          <div className="px-6 py-6 sm:px-8 sm:py-8">
            <OvertimeForm />
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-8 text-center text-xs text-stone-400 tracking-wide">
          <p>&copy; 花園中学高等学校</p>
        </footer>
      </div>
    </main>
  )
}
