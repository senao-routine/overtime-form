"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { format } from "date-fns"
import { ja } from "date-fns/locale"
import { CalendarIcon, Clock, Check, ChevronsUpDown, Search } from "lucide-react"

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
import { teachers, clubs } from "@/lib/data/lists"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command"

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

// フォームのバリデーションスキーマ
const formSchema = z.object({
  teacherName: z.string().min(1, {
    message: "教員名を選択してください。",
  }),
  clubName: z.string().min(1, {
    message: "クラブ名を選択してください。",
  }),
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
  const [isSubmitting, setIsSubmitting] = useState(false)

  // フォームの初期化
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      teacherName: "",
      clubName: "",
      startTime: "",
      endTime: "",
      report: "",
    },
  })

  // フォーム送信処理
  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true)

    try {
      // Google Apps ScriptウェブアプリのURL - 実際のURLに置き換えてください
      const apiUrl = "https://script.google.com/macros/s/AKfycbyG4MqX4gJ7rnaFMG8RP4t3VG4UNddx7bOoz2iBYMxNHVkqRAk0a9yWmMMZksgHhs9w/exec";
      
      // データを整形
      const dateFormatted = format(values.activityDate, "yyyy/MM/dd");
      
      // 勤務時間を計算
      const startTimeParts = values.startTime.split(":");
      const endTimeParts = values.endTime.split(":");
      const startMinutes = parseInt(startTimeParts[0]) * 60 + parseInt(startTimeParts[1]);
      const endMinutes = parseInt(endTimeParts[0]) * 60 + parseInt(endTimeParts[1]);
      const totalMinutes = endMinutes - startMinutes;
      const hourCount = (totalMinutes / 60).toFixed(1);
      
      const formData = {
        teacherName: values.teacherName,
        date: dateFormatted,
        startTime: values.startTime,
        endTime: values.endTime,
        hourCount: hourCount,
        clubName: values.clubName,
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

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="teacherName"
                render={({ field }) => (
                  <FormItem className="transition-all duration-200 hover:translate-y-[-2px]">
                    <FormLabel className="text-foreground/90 font-medium">教員名</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="rounded-lg border-input focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200">
                          <SelectValue placeholder="教員を選択してください" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="max-h-[300px] overflow-auto bg-white/80 backdrop-blur-sm rounded-lg">
                        <SelectGroup>
                          {teachers.map((teacher) => (
                            <SelectItem 
                              key={teacher.id} 
                              value={teacher.name}
                              className="cursor-pointer hover:bg-accent/20 transition-colors"
                            >
                              {teacher.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="clubName"
                render={({ field }) => (
                  <FormItem className="transition-all duration-200 hover:translate-y-[-2px]">
                    <FormLabel className="text-foreground/90 font-medium">クラブ名</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="rounded-lg border-input focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200">
                          <SelectValue placeholder="クラブを選択してください" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="max-h-[300px] overflow-auto bg-white/80 backdrop-blur-sm rounded-lg">
                        <SelectGroup>
                          <SelectLabel className="px-2 py-1.5 text-sm font-semibold">高校</SelectLabel>
                          {clubs
                            .filter(club => club.name.startsWith("高:"))
                            .map(club => (
                              <SelectItem 
                                key={club.id} 
                                value={club.name}
                                className="cursor-pointer hover:bg-accent/20 transition-colors"
                              >
                                {club.name}
                              </SelectItem>
                            ))
                          }
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel className="px-2 py-1.5 text-sm font-semibold">中学校</SelectLabel>
                          {clubs
                            .filter(club => club.name.startsWith("中:"))
                            .map(club => (
                              <SelectItem 
                                key={club.id} 
                                value={club.name}
                                className="cursor-pointer hover:bg-accent/20 transition-colors"
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
            </div>

            <FormField
              control={form.control}
              name="activityDate"
              render={({ field }) => (
                <FormItem className="flex flex-col transition-all duration-200 hover:translate-y-[-2px]">
                  <FormLabel className="text-foreground/90 font-medium">活動日</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full pl-3 text-left font-normal rounded-lg border-input hover:bg-accent/10 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200", 
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(field.value, "yyyy年MM月dd日 (EEE)", { locale: ja })
                          ) : (
                            <span>日付を選択してください</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 rounded-lg shadow-lg border-0 glass-morphism" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) => date < startDate || date > endDate}
                        initialFocus
                        locale={ja}
                        className="rounded-lg"
                      />
                    </PopoverContent>
                  </Popover>
                  <FormDescription className="text-muted-foreground text-sm">
                    申請期間: {format(startDate, "yyyy年MM月dd日")}（前月22日）から{format(endDate, "yyyy年MM月dd日")}（当月末）
                    までの期間で選択してください。
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem className="transition-all duration-200 hover:translate-y-[-2px]">
                    <FormLabel className="text-foreground/90 font-medium">業務開始時間</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input 
                          type="time" 
                          {...field} 
                          className="rounded-lg border-input focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200" 
                        />
                        <Clock className="absolute right-3 top-2.5 h-4 w-4 opacity-50" />
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
                  <FormItem className="transition-all duration-200 hover:translate-y-[-2px]">
                    <FormLabel className="text-foreground/90 font-medium">業務終了時間</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input 
                          type="time" 
                          {...field} 
                          className="rounded-lg border-input focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200" 
                        />
                        <Clock className="absolute right-3 top-2.5 h-4 w-4 opacity-50" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="report"
              render={({ field }) => (
                <FormItem className="transition-all duration-200 hover:translate-y-[-2px]">
                  <FormLabel className="text-foreground/90 font-medium">活動に関する報告事項</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="活動内容や特記事項があれば入力してください。"
                      className="resize-none rounded-lg border-input min-h-[120px] focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200"
                      rows={4}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <Button 
            type="submit" 
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 rounded-lg py-6 font-medium text-lg shadow-md hover:shadow-lg transform transition-all duration-200 hover:translate-y-[-2px] hover:shadow-primary/20 disabled:opacity-70 disabled:hover:translate-y-0"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <div className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                送信中...
              </div>
            ) : "申請を送信する"}
          </Button>
        </form>
      </Form>
      <Toaster />
    </>
  )
}
