import { cn } from "@/lib/utils"

/**
 * Признак работы — один на весь продукт.
 *
 * Три столбика волной: та же фигура, которой продукт показывает деньги
 * (график дня, профиль недели, значок вкладки), и та же, что стоит в
 * кнопках приложения. Крутящегося кружка здесь больше нет: так выглядит
 * каждый второй индикатор, и фигура, которая крутится, перестаёт быть
 * чьей-то.
 *
 * Разметка и кадры живут в `.tl-mini` (`app/globals.css`) рядом с
 * фирменным загрузчиком; числа перенесены из
 * `ios/Tetr/Design/Theme.swift` и правятся вместе. Размер задаётся
 * высотой, поэтому `size-3.5` и `size-4` работают как у значка.
 *
 * Подпись для читалки экрана приходит снаружи словом на языке
 * интерфейса; без неё фигура просто скрыта от чтеца.
 */
function Spinner({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="spinner"
      role={props["aria-label"] ? "status" : undefined}
      aria-hidden={props["aria-label"] ? undefined : true}
      {...props}
      className={cn("tl-mini size-4 shrink-0", className)}
    >
      <i />
      <i />
      <i />
    </span>
  )
}

export { Spinner }
