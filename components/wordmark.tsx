import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/utils';

/**
 * Марка Tetrin, набранная: «TETR» чернилами и «IN» вывороткой на
 * грейповой плашке. Имя лежит в одном месте (`lib/brand.ts`), знак
 * собирается из него.
 *
 * При появлении знак разыгрывает сюжет собственной конструкции: буквы
 * встают слева направо, плашка падает штампом, удар отдаёт затухающей
 * волной по слову. Хореография и её вывод: `app/globals.css` («марка»)
 * и docs/brand/logo-motion. Каждая буква в своём span, потому что
 * актёром каскада может быть только отдельный элемент; раскладку это
 * не меняет (флекс-элементы одной высоты, разрядка остаётся внутри
 * каждого span). При «уменьшении движения» знак стоит статично.
 */
export function Wordmark({ className = '' }: { className?: string }) {
  const name = BRAND.toUpperCase();

  return (
    <span
      className={cn(
        'wm inline-flex items-center font-wordmark text-[13px] leading-none tracking-[0.18em] text-foreground select-none',
        className,
      )}
      aria-hidden
    >
      {name
        .slice(0, -2)
        .split('')
        .map((letter, i) => (
          <span key={i} className={`wm-letter-${i + 1}`}>
            {letter}
          </span>
        ))}
      <span className="wm-badge ml-0.5 rounded-[3px] bg-primary px-1 py-0.5 text-primary-foreground">
        {name.slice(-2)}
      </span>
    </span>
  );
}
