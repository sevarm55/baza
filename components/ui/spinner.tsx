import { cn } from "@/lib/utils"
import { Loader2Icon } from "lucide-react"

/* Подпись для читалки экрана приходит снаружи словом на языке
   интерфейса; без неё значок просто скрыт от чтеца. */
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon
      data-slot="spinner"
      role={props["aria-label"] ? "status" : undefined}
      aria-hidden={props["aria-label"] ? undefined : true}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
