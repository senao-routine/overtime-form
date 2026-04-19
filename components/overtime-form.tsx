"use client"

import { useState, useEffect } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { format } from "date-fns"
import { ja } from "date-fns/locale"
import { CalendarIcon, Clock, Check, ChevronsUpDown, Search, Mail } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { toast } from "@/components/ui/use-toast"
import { Toaster } from "@/components/ui/toaster"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { teachers as fallbackTeachers, clubs as fallbackClubs } from "@/lib/data/lists"

type UserType = "teacher" | "staff"
type Person = { id: string; name: string; email: string }
type Club = { id: string; name: string }
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command"

// GAS URLの設定
const GAS_URLS: Record<UserType, string> = {
  teacher: "https://script.google.com/macros/s/AKfycbxSg9KYbkmcO6vlOR_flM-0xFuYdkMK4nask84P0-x9fRQCFnyctC2RH-UxQoHcR1vX/exec",
  staff: "https://script.google.com/macros/s/AKfycbzoerLJXDo4NlTceKiD8t3FvQ1hDew2JX1Nn8zCyeHxZfAe7ZGoV4m9yP8j_1pcShyNsA/exec",
}

const USER_TYPE_LABELS: Record<UserType, { title: string; nameLabel: string; namePlaceholder: string; storageKey: string; masterType: string }> = {
  teacher: {
    title: "教員",
    nameLabel: "教員名",
    namePlaceholder: "教員を選択してください",
    storageKey: "overtime_teacherName",
    masterType: "teachers",
  },
  staff: {
    title: "職員",
    nameLabel: "職員名",
    namePlaceholder: "職員を選択してください",
    storageKey: "overtime_staffName",
    masterType: "staff",
  },
}

// 日付の範囲を取得する関数
function getValidDateRange() {
  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth() // 0-11の値

  // 今月の1日と月末を取得
  const currentMonthStart = new Date(currentYear, currentMonth, 1)
  const currentMonthEnd = new Date(currentYear, currentMonth + 1, 0) // 翌月の0日=当月末日

  // 前月の22日
  const prevMonthDay22 = new Date(currentYear, currentMonth - 1, 22)

  // 申請可能開始日: 前月の22日
  const startDate = prevMonthDay22

  // 申請可能終了日: 当月末日
  const endDate = currentMonthEnd

  return { startDate, endDate }
}

const { startDate, endDate } = getValidDateRange()

// 申請種類の選択肢
const applicationTypes = [
  { id: "club", name: "クラブ指導" },
  { id: "exam", name: "模試業務" },
  { id: "recruit", name: "生徒募集イベント" },
] as const

// フォームのバリデーションスキーマ
const formSchema = z.object({
  applicationType: z.string().min(1, {
    message: "申請種類を選択してください。",
  }),
  teacherName: z.string().min(1, {
    message: "氏名を選択してください。",
  }),
  clubName: z.string().optional(),
  activityDate: z
    .date({
      required_error: "活動日を選択してください。",
    })
    .refine((date) => date >= startDate && date <= endDate, {
      message: `${format(startDate, "yyyy年MM月dd日")}（前月22日）から${format(endDate, "yyyy年MM月dd日")}（当月末）までの日付を選択してください。`,
    }),
  startTime: z.string().min(1, {
    message: "業務開始時間を入力してください。",
  }),
  endTime: z.string().min(1, {
    message: "業務終了時間を入力してください。",
  }),
  report: z.string().optional(),
})

// 勤務時間を表示用にフォーマットする関数
function formatWorkingTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}時間${remainingMinutes}分`
}

export default function OvertimeForm() {
  const [userType, setUserType] = useState<UserType>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("overtime_userType") as UserType) || "teacher"
    }
    return "teacher"
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedTeacherEmail, setSelectedTeacherEmail] = useState<string | null>(null)
  const [people, setPeople] = useState<Person[]>(fallbackTeachers)
  const [clubs, setClubs] = useState<Club[]>(fallbackClubs)
  const [isLoading, setIsLoading] = useState(true)

  const labels = USER_TYPE_LABELS[userType]

  useEffect(() => {
    const GAS_URL = GAS_URLS[userType]

    async function fetchMasterData() {
      setIsLoading(true)
      try {
        const [peopleRes, clubsRes] = await Promise.all([
          fetch(`${GAS_URL}?type=${labels.masterType}`),
          fetch(`${GAS_URL}?type=clubs`),
        ])
        if (peopleRes.ok) {
          const data = await peopleRes.json()
          if (data.length > 0) setPeople(data)
        }
        if (clubsRes.ok) {
          const data = await clubsRes.json()
          if (data.length > 0) setClubs(data)
        }
      } catch (error) {
        console.error("マスタデータ取得エラー:", error)
        if (userType === "teacher") setPeople(fallbackTeachers)
      } finally {
        setIsLoading(false)
      }
    }
    fetchMasterData()
  }, [userType])

  // フォームの初期化
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      applicationType: "",
      teacherName: "",
      clubName: "",
      startTime: "",
      endTime: "",
      report: "",
    },
  })

  // 名前をlocalStorageから復元
  useEffect(() => {
    const saved = localStorage.getItem(labels.storageKey)
    if (saved && people.length > 0) {
      const found = people.find((p: Person) => p.name === saved)
      if (found) {
        form.setValue("teacherName", found.name)
        setSelectedTeacherEmail(found.email)
      }
    }
  }, [people])

  // 名前が変更されたときにメールアドレスを更新＆保存
  const handleTeacherChange = (value: string) => {
    const selected = people.find((p: Person) => p.name === value)
    if (selected) {
      setSelectedTeacherEmail(selected.email)
      localStorage.setItem(labels.storageKey, value)
    } else {
      setSelectedTeacherEmail(null)
    }
    form.setValue("teacherName", value)
  }

  // フォーム送信処理
  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true)

    try {
      const apiUrl = GAS_URLS[userType];

      // データを整形
      const dateFormatted = format(values.activityDate, "yyyy/MM/dd");

      // 勤務時間を計算
      const startTimeParts = values.startTime.split(":");
      const endTimeParts = values.endTime.split(":");
      const startMinutes = parseInt(startTimeParts[0]) * 60 + parseInt(startTimeParts[1]);
      const endMinutes = parseInt(endTimeParts[0]) * 60 + parseInt(endTimeParts[1]);
      const totalMinutes = endMinutes - startMinutes;
      const hourCount = (totalMinutes / 60).toFixed(1);

      // メールアドレスを取得
      const selectedPerson = people.find((p: Person) => p.name === values.teacherName);
      const teacherEmail = selectedPerson?.email || "";

      console.log("選択された人:", selectedPerson);
      console.log("メールアドレス:", teacherEmail);

      // 申請種類のラベルを取得
      const appType = applicationTypes.find(t => t.id === values.applicationType);
      const appTypeName = appType?.name || values.applicationType;

      const formData = {
        applicationType: appTypeName,
        teacherName: values.teacherName,
        teacherEmail: teacherEmail,
        date: dateFormatted,
        startTime: values.startTime,
        endTime: values.endTime,
        hourCount: hourCount,
        clubName: values.applicationType === "club" ? values.clubName : "",
        reason: values.report || "特になし"
      };

      // デバッグ情報をコンソールに表示
      console.log("送信データ:", formData);
      console.log("送信先URL:", apiUrl);

      // データをJSON文字列に変換
      const jsonData = JSON.stringify(formData);
      console.log("JSON文字列:", jsonData);

      // FormDataオブジェクトを使用した代替送信方法
      try {
        // 直接fetchを試みる (CORS制限がない場合)
        const fetchOptions = {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: jsonData,
        };

        const response = await fetch(apiUrl, fetchOptions);
        console.log("直接送信レスポンス:", response);

        if (response.ok) {
          const responseData = await response.json();
          console.log("レスポンスデータ:", responseData);
        }
      } catch (fetchError) {
        console.warn("直接送信に失敗しました。no-corsモードで再試行します:", fetchError);

        // フォールバック: no-corsモードで送信
        const fallbackOptions = {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: jsonData,
          mode: "no-cors" as RequestMode
        };

        await fetch(apiUrl, fallbackOptions);
        console.log("no-corsモードで送信完了");
      }

      // 成功メッセージを表示
      toast({
        title: "申請が完了しました",
        description: `${format(values.activityDate, "yyyy年MM月dd日")}の申請（勤務時間: ${hourCount}時間）が送信されました。`,
      });

      // フォームをリセット
      form.reset();
    } catch (error) {
      console.error("送信エラー:", error);
      // エラーメッセージを表示
      toast({
        title: "エラーが発生しました",
        description:
          error instanceof Error ? error.message : "申請の送信中にエラーが発生しました。もう一度お試しください。",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  // Shared style tokens
  const labelClass = "text-sm font-semibold text-stone-700"
  const selectTriggerClass = "form-input-base h-11 rounded-md px-3 text-sm"
  const selectContentClass = "bg-white rounded-md shadow-lg border border-stone-200"
  const timeInputClass = "form-input-base h-11 rounded-md text-sm"

  return (
    <>
      {isLoading && (
        <div className="text-center text-stone-400 text-sm py-3">データを読み込み中...</div>
      )}
      {/* 教員 / 職員 切り替え */}
      <div className="flex rounded-lg border border-stone-200 overflow-hidden mb-6">
        {(["teacher", "staff"] as UserType[]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => {
              setUserType(type)
              localStorage.setItem("overtime_userType", type)
              form.reset()
              setSelectedTeacherEmail(null)
            }}
            className={cn(
              "flex-1 py-2.5 text-sm font-semibold transition-colors duration-150",
              userType === type
                ? "bg-[var(--color-primary)] text-white"
                : "bg-white text-stone-500 hover:bg-stone-50"
            )}
          >
            {USER_TYPE_LABELS[type].title}
          </button>
        ))}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-7">

          {/* Section: 申請種類 */}
          <FormField
            control={form.control}
            name="applicationType"
            render={({ field }) => (
              <FormItem>
                <FormLabel className={labelClass}>申請種類</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className={selectTriggerClass}>
                      <SelectValue placeholder="申請種類を選択してください" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className={selectContentClass}>
                    <SelectGroup>
                      {applicationTypes.map((type) => (
                        <SelectItem
                          key={type.id}
                          value={type.id}
                          className="cursor-pointer text-sm"
                        >
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Section: 名前 / クラブ */}
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <FormField
                control={form.control}
                name="teacherName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={labelClass}>{labels.nameLabel}</FormLabel>
                    <Select onValueChange={handleTeacherChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className={selectTriggerClass}>
                          <SelectValue placeholder={labels.namePlaceholder} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className={cn(selectContentClass, "max-h-[300px] overflow-auto")}>
                        <SelectGroup>
                          {people.map((person: Person, index: number) => (
                            <SelectItem
                              key={person.id}
                              value={person.name}
                              className="cursor-pointer text-sm"
                            >
                              {`${index + 1}. ${person.name}`}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {selectedTeacherEmail && (
                      <div className="mt-1.5 text-xs flex items-center gap-1.5 text-stone-400">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <span>{selectedTeacherEmail}</span>
                      </div>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              {form.watch("applicationType") === "club" && (
                <FormField
                  control={form.control}
                  name="clubName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={labelClass}>クラブ名</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className={selectTriggerClass}>
                            <SelectValue placeholder="クラブを選択してください" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className={cn(selectContentClass, "max-h-[300px] overflow-auto")}>
                          <SelectGroup>
                            <SelectLabel className="px-2 py-1.5 text-xs font-semibold text-stone-500 uppercase tracking-wider">高校</SelectLabel>
                            {clubs
                              .filter(club => club.name.startsWith("高:"))
                              .map(club => (
                                <SelectItem
                                  key={club.id}
                                  value={club.name}
                                  className="cursor-pointer text-sm"
                                >
                                  {club.name}
                                </SelectItem>
                              ))
                            }
                          </SelectGroup>
                          <SelectGroup>
                            <SelectLabel className="px-2 py-1.5 text-xs font-semibold text-stone-500 uppercase tracking-wider">中学校</SelectLabel>
                            {clubs
                              .filter(club => club.name.startsWith("中:"))
                              .map(club => (
                                <SelectItem
                                  key={club.id}
                                  value={club.name}
                                  className="cursor-pointer text-sm"
                                >
                                  {club.name}
                                </SelectItem>
                              ))
                            }
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
          </div>

          {/* Section: 日付・時間 */}
          <div className="space-y-5">
            <FormField
              control={form.control}
              name="activityDate"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel className={labelClass}>活動日</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "form-input-base w-full h-11 pl-3 text-left font-normal text-sm justify-between",
                            !field.value && "text-stone-400"
                          )}
                        >
                          {field.value ? (
                            format(field.value, "yyyy年MM月dd日 (EEE)", { locale: ja })
                          ) : (
                            <span>日付を選択してください</span>
                          )}
                          <CalendarIcon className="h-4 w-4 text-stone-400" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 rounded-md shadow-lg border border-stone-200" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) => date < startDate || date > endDate}
                        initialFocus
                        locale={ja}
                        className="rounded-md"
                      />
                    </PopoverContent>
                  </Popover>
                  <FormDescription className="text-xs text-stone-400 mt-1.5">
                    申請期間: {format(startDate, "yyyy年MM月dd日")}（前月22日）から{format(endDate, "yyyy年MM月dd日")}（当月末）
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-5">
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={labelClass}>業務開始時間</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type="time"
                          {...field}
                          className={timeInputClass}
                        />
                        <Clock className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={labelClass}>業務終了時間</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type="time"
                          {...field}
                          className={timeInputClass}
                        />
                        <Clock className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Section: 報告 */}
          <FormField
            control={form.control}
            name="report"
            render={({ field }) => (
              <FormItem>
                <FormLabel className={labelClass}>活動に関する報告事項</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="活動内容や特記事項があれば入力してください。"
                    className="form-input-base resize-none min-h-[120px] rounded-md text-sm leading-relaxed px-3 py-2.5"
                    rows={4}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Submit */}
          <div className="pt-2">
            <Button
              type="submit"
              className="w-full h-12 bg-[var(--color-primary)] hover:bg-[var(--color-primary-light)] text-white rounded-md font-semibold text-sm tracking-wide shadow-none transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  送信中...
                </span>
              ) : "申請を送信する"}
            </Button>
          </div>
        </form>
      </Form>
      <Toaster />
    </>
  )
}
