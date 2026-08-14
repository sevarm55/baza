import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { NumericText } from '@/components/numeric-text';

/**
 * Табло — язык приложения, перенесённый в веб.
 *
 * Экран собирается не из карточек с заголовками, а из приборов: одно
 * показание крупной цифрой, плитки со свечением, журнал строками.
 * Разница не в оформлении. Карточка требует прочитать заголовок, чтобы
 * понять, что внутри; прибор отвечает раньше чтения — размером, цветом
 * и местом.
 *
 * На телефоне приборы идут сверху вниз, на компьютере стоят рядом в
 * сетке страницы. Сама сетка — дело страницы: здесь только форма
 * приборов и то, из чего их складывают.
 */

export type Tone = 'violet' | 'teal' | 'amber' | 'lime' | 'slate';

/**
 * Плитка со свечением.
 *
 * Заливка тона плюс радиальное пятно из угла — то же, что рисует
 * `View.tile(_:)` в приложении. Тона одинаковы в обеих темах: плитка
 * это прибор на панели, он светится и днём, и ночью.
 *
 * Свечение здесь остаётся сознательно. От формы — капсул и толстых
 * скруглений — продукт отказался, потому что она врала про точность;
 * свет не врёт ни про что: это прибор, и он горит. Изменились только
 * углы (12 вместо 24, как у всех поверхностей) и набор числа —
 * полужирный с тесным трекингом вместо жирного.
 */
export function Tile({
  tone = 'slate',
  label,
  value,
  note,
  wide,
  children,
}: {
  tone?: Tone;
  label: string;
  value?: ReactNode;
  note?: ReactNode;
  /** во всю ширину: для показания, которое не влезает в половину */
  wide?: boolean;
  children?: ReactNode;
}) {
  const ink = tone === 'lime' ? 'var(--tone-ink-on-lime)' : 'var(--tone-ink)';
  const style: CSSProperties = {
    background: `radial-gradient(120% 120% at 100% 0%, color-mix(in srgb, var(--tone-${tone}-glow) 28%, transparent) 0%, transparent 62%), var(--tone-${tone})`,
    color: ink,
  };

  return (
    <div
      className={`flex flex-col rounded-[var(--radius-card)] p-4 sm:p-5 ${wide ? 'col-span-2' : ''}`}
      style={style}
    >
      <div className="text-[12.5px] font-medium opacity-70">{label}</div>
      {value !== undefined && (
        <div className="num mt-auto pt-3 text-[clamp(24px,2.1vw,30px)] leading-none font-semibold tracking-[-0.03em]">
          {typeof value === 'string' || typeof value === 'number' ? (
            <NumericText>{String(value)}</NumericText>
          ) : (
            value
          )}
        </div>
      )}
      {note !== undefined && <div className="num mt-1.5 text-[12.5px] opacity-70">{note}</div>}
      {children}
    </div>
  );
}

/**
 * Показание — то, ради чего экран открывают.
 *
 * По центру и крупно, без карточки вокруг: у прибора нет рамки. Над
 * цифрой — что это, под цифрой — сравнение. Больше на этой высоте ничего
 * быть не должно, иначе глазу приходится выбирать, куда смотреть первым.
 */
export function Reading({
  caption,
  value,
  compare,
  tone,
}: {
  caption: ReactNode;
  value: ReactNode;
  compare?: ReactNode;
  /** окраска сравнения: рост, падение или молчание */
  tone?: 'good' | 'warn';
}) {
  const compareColor =
    tone === 'good'
      ? 'var(--good-on-board)'
      : tone === 'warn'
        ? 'var(--warn-on-board)'
        : 'var(--board-muted)';

  /* На телефоне показание стоит по центру: экран узкий, и цифра в нём
     сама себе ось. На компьютере — по левому краю, вместе со всем
     остальным содержимым: центрированный блок в широкой колонке
     повисает без опоры, а глаз при переходе от раздела к разделу
     каждый раз ищет новое начало строки. */
  return (
    <div className="flex flex-col items-center pt-2 pb-3 text-center lg:items-start lg:pt-0 lg:text-start">
      <div className="text-[13px] font-medium" style={{ color: 'var(--board-muted)' }}>
        {caption}
      </div>
      {/* Разряды разделены узким пробелом, и трекинг здесь не трогаем:
          отрицательный схлопывает группы в одно число. */}
      <div
        className="num mt-1.5 text-[clamp(40px,7vw,64px)] leading-[0.95] font-bold"
        style={{ color: 'var(--on-board)' }}
      >
        {typeof value === 'string' || typeof value === 'number' ? (
          <NumericText>{String(value)}</NumericText>
        ) : (
          value
        )}
      </div>
      {/* Сравнение — строкой, а не капсулой.

          Плашка с заливкой вокруг «−2 204 ֏ против прошлой недели»
          обещала предмет: то, на что нажимают или что закрывают. Внутри
          был текст, который надо просто прочитать. Цвет несёт то же
          самое и без коробки, а точка слева — тот же знак состояния,
          которым в продукте помечен человек на смене. */}
      {compare !== undefined && (
        <div
          className="num mt-3 flex items-center gap-2 text-[13px] font-semibold"
          style={{ color: compareColor }}
        >
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: 'currentColor' }}
            aria-hidden
          />
          {compare}
        </div>
      )}
    </div>
  );
}

/**
 * Прибор с заголовком — то, из чего собран широкий экран.
 *
 * На телефоне разделы шли подряд сверху вниз, и подписи над ними
 * хватало, чтобы отделить один от другого. Рядом по горизонтали так не
 * работает: без общей подложки два списка в соседних колонках читаются
 * как один в две колонки. Подложка — те же чернила полотна, что у
 * карточки, без рамки и без тени.
 */
export function Panel({
  title,
  count,
  actions,
  children,
  className = '',
  bare,
}: {
  title?: string;
  count?: number;
  /** управление в правом углу заголовка */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** без подложки: когда прибор уже стоит внутри другого */
  bare?: boolean;
}) {
  /* Воздуха внутри прибора теперь вдвое больше, а заголовок читается.
     Было 17 пикселей поля и подпись 13.5 приглушённым — прибор выглядел
     тесной коробкой с шёпотом наверху, и на экране из шести таких не
     находилось ни одного названия. Поле выросло до 26, заголовок стал
     размером с текст и цветом чернил; счётчик рядом остался тихим — он
     подробность, а не имя. */
  return (
    <section
      className={`flex min-w-0 flex-col ${bare ? '' : 'panel-pad rounded-[var(--radius-card)]'} ${className}`}
      style={bare ? undefined : { background: 'color-mix(in srgb, var(--board-ink) 5%, transparent)' }}
    >
      {title !== undefined && (
        <div className="mb-4 flex min-h-[1.75rem] items-center justify-between gap-3">
          <h2
            className="flex items-baseline gap-2 text-[14px] font-semibold tracking-[-0.01em]"
            style={{ color: 'var(--on-board)' }}
          >
            {title}
            {count !== undefined && (
              <span className="num text-[12.5px] font-normal" style={{ color: 'var(--board-muted)' }}>
                {count}
              </span>
            )}
          </h2>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Плитка человека — его цветом.
 *
 * Цвет берётся из имени, тот же самый, что в ленте и на смене: на листе
 * зарплат он превращает стопку одинаковых карточек в список людей. Тон
 * строится из одного цвета — тёмная заливка и он же свечением, — чтобы
 * не заводить вторую палитру рядом с существующей.
 */
export function PersonTile({
  color,
  children,
}: {
  color: string;
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-[var(--radius-card)] p-4 text-white sm:p-5"
      style={{
        background: `radial-gradient(120% 120% at 100% 0%, color-mix(in srgb, ${color} 40%, transparent) 0%, transparent 62%), color-mix(in srgb, ${color} 45%, #0d0d10)`,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Сетка плиток: две колонки, как в приложении.
 *
 * Шов тот же, что у всей страницы. Разные зазоры между приборами и
 * между блоками — первое, по чему разметка читается собранной из
 * случайных деталей.
 */
export function Grid({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`grid grid-cols-2 gap-[var(--seam)] ${className}`}>{children}</div>;
}

/**
 * Строка журнала.
 *
 * Карточка вокруг каждой записи делает сорок машин сорока предметами.
 * Строка с волосяной линией между — это список, который читают сверху
 * вниз, а не разглядывают. Линии рисует `.board-journal` на обёртке,
 * заголовок и счётчик — `Panel` вокруг неё.
 */
export function Row({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2.5 px-1.5 py-2.5">{children}</div>;
}

/* ─────────────────────── итог и слагаемые ───────────────────────
 *
 * Пара приборов, с которой начинается денежная страница: тёмная плита с
 * единственным числом и полоса тише её, объясняющая, из чего оно
 * сложилось.
 *
 * Приём был придуман для зарплат — там плита отвечала «сколько раздать
 * сейчас», а полоса под ней перечисляла справочное. Сводке нужно ровно
 * то же самое, только числа другие: «сколько вам остаётся» и три
 * слагаемых. Держать две одинаковые верстки в двух файлах значило бы
 * завести внутри одного продукта две похожие, но разные шапки — а
 * расхождение на экранах, где считают деньги, читается как ошибка
 * расчёта.
 */

/**
 * Плита: одно число, ради которого страницу открывают.
 *
 * Единственное место шапки, где цвет несёт смысл. Остальное нейтрально —
 * иначе раскрашенными оказываются все числа сразу, и ни одно не главное.
 */
export function Plate({
  label,
  value,
  note,
  /** число ушло в минус: это состояние, а не оформление */
  bad,
}: {
  label: ReactNode;
  value: string;
  note?: ReactNode;
  bad?: boolean;
}) {
  return (
    <div className="plate" data-bad={bad ? '' : undefined}>
      <span className="plate-label">{label}</span>
      <span className="plate-value">
        <NumericText>{value}</NumericText>
      </span>
      {note !== undefined && <span className="plate-note">{note}</span>}
    </div>
  );
}

export type Figure = {
  label: string;
  value: string;
  /** знак связи с предыдущим слагаемым: видно, что из чего вычитается */
  sign?: '−' | '+';
  note?: string;
  /** слагаемое, за которым стоит свой раздел */
  href?: string;
};

/**
 * Слагаемые — одной полосой, а не карточками поштучно.
 *
 * Карточка вокруг каждого числа сделала бы их равными плите, и шапка
 * превратилась бы в ряд одинаково важных показаний, между которыми глазу
 * приходится выбирать.
 */
export function Figures({ items }: { items: Figure[] }) {
  return (
    <div className="figures">
      {items.map((f) => {
        const body = (
          <>
            <div className="figure-value">
              {f.sign && (
                <span className="figure-sign" aria-hidden>
                  {f.sign}
                </span>
              )}
              <NumericText>{f.value}</NumericText>
            </div>
            <div className="figure-label">{f.label}</div>
            {f.note && <div className="figure-note num">{f.note}</div>}
          </>
        );

        return f.href ? (
          <Link key={f.label} href={f.href} className="figure figure-open">
            {body}
          </Link>
        ) : (
          <div key={f.label} className="figure">
            {body}
          </div>
        );
      })}
    </div>
  );
}
