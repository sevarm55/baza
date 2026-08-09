import { hy } from '@/lib/i18n/hy';

/**
 * Знак и название рядом.
 *
 * Знак — тот же, что у приложения на телефоне: лаймовая буква на
 * грейповом поле (`ios/AppIcon.src.png`, отмасштабирован в
 * `public/logo.png`). Веб отставал на одну версию — здесь ещё лежали
 * три полосы прежнего ребрендинга, и человек, поставивший приложение,
 * не узнавал сайт.
 *
 * Именно со своей плашкой, а не голым знаком: лайм по светлой шапке
 * даёт контраст 1.06, то есть исчезает. На грейпе он читается в обеих
 * темах одинаково.
 *
 * Скругление — как у иконки на домашнем экране: доля от размера, а не
 * фиксированные пиксели, иначе на 26 и на 512 углы «плывут».
 */
export function Logo({
  size = 34,
  withName = true,
  className = '',
}: {
  size?: number;
  withName?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt=""
        width={size}
        height={size}
        aria-hidden
        style={{ borderRadius: Math.round(size * 0.22) }}
      />
      {withName && (
        <span
          className="font-bold text-ink"
          style={{
            // название растёт вместе со знаком, иначе на крупном
            // размере оно висит подписью, а не читается как марка
            fontSize: Math.round(size * 0.48),
            letterSpacing: '0.2em',
          }}
        >
          {hy.app.name.toUpperCase()}
        </span>
      )}
    </span>
  );
}
