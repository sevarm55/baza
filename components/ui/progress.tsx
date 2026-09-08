"use client"

import { Progress as ProgressPrimitive } from "@base-ui/react/progress"

import { useLocale } from "@/lib/i18n/client"
import { cn } from "@/lib/utils"

function Progress({
  className,
  children,
  value,
  locale,
  getAriaValueText,
  ...props
}: ProgressPrimitive.Root.Props) {
  /* Язык задаётся явно: без него `Intl` берёт локаль среды, а она у
     сервера и у браузера разная. */
  const current = useLocale()

  return (
    <ProgressPrimitive.Root
      value={value}
      locale={locale ?? current}
      /* Пробел перед знаком процента снимается руками, и это не
         придирка к типографике. Node и браузер расставляют его
         по-разному даже на одной локали: сервер отдаёт «100 %», клиент
         рисует «100%», а React 19 такие расхождения атрибутов не
         сглаживает — он пишет в консоль предупреждение о гидратации на
         каждой загрузке страницы. Само по себе оно ничего не ломает, но
         засоряет ровно то место, где ищут настоящие ошибки.

         Читалке от этого хуже не становится: «100%» она произносит так
         же, а рядом стоит человеческий `aria-label` вроде
         «Оплачено · 30 дней». */
      getAriaValueText={getAriaValueText ?? ((formatted) => formatted.replace(/\s+/g, ''))}
      data-slot="progress"
      className={cn("flex flex-wrap gap-3", className)}
      {...props}
    >
      {children}
      <ProgressTrack>
        <ProgressIndicator />
      </ProgressTrack>
    </ProgressPrimitive.Root>
  )
}

function ProgressTrack({ className, ...props }: ProgressPrimitive.Track.Props) {
  return (
    <ProgressPrimitive.Track
      className={cn(
        "relative flex h-1 w-full items-center overflow-x-hidden rounded-full bg-muted",
        className
      )}
      data-slot="progress-track"
      {...props}
    />
  )
}

function ProgressIndicator({
  className,
  ...props
}: ProgressPrimitive.Indicator.Props) {
  return (
    <ProgressPrimitive.Indicator
      data-slot="progress-indicator"
      className={cn("h-full bg-primary transition-all", className)}
      {...props}
    />
  )
}

function ProgressLabel({ className, ...props }: ProgressPrimitive.Label.Props) {
  return (
    <ProgressPrimitive.Label
      className={cn("text-sm font-medium", className)}
      data-slot="progress-label"
      {...props}
    />
  )
}

function ProgressValue({ className, ...props }: ProgressPrimitive.Value.Props) {
  return (
    <ProgressPrimitive.Value
      className={cn(
        "ml-auto text-sm text-muted-foreground tabular-nums",
        className
      )}
      data-slot="progress-value"
      {...props}
    />
  )
}

export {
  Progress,
  ProgressTrack,
  ProgressIndicator,
  ProgressLabel,
  ProgressValue,
}
