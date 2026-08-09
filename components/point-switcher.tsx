import { PointForm } from '@/components/point-form';
import { hy } from '@/lib/i18n/hy';
import type { Point } from '@/lib/accounts';

/**
 * Выбор точки.
 *
 * Название бизнеса в шапке само становится кнопкой — отдельного элемента
 * рядом не появляется. Название уже отвечает на вопрос «где я», и
 * приписать к нему второй ответ значило бы задать вопрос дважды.
 *
 * На `<details>`, а не на состоянии: список открывается без единой
 * строчки клиентского кода, работает до гидратации и на выключенном
 * JavaScript. Каждая строка — форма с серверным действием, потому что
 * переписать cookie можно только из действия.
 */
export function PointSwitcher({
  points,
  currentId,
  subtitle,
}: {
  points: Point[];
  currentId: string;
  subtitle: string;
}) {
  const current = points.find((p) => p.id === currentId);

  return (
    <details className="group relative min-w-0">
      <summary className="flex min-w-0 cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1">
            <span className="truncate text-[15px] font-semibold">
              {current?.name ?? hy.points.title}
            </span>
            <svg
              className="size-3.5 shrink-0 text-muted transition group-open:rotate-180"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden
            >
              <path
                d="M2.5 4.5 6 8l3.5-3.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="truncate text-[12px] text-muted">{subtitle}</div>
        </div>
      </summary>

      {/* Панель поверх содержимого, а не в потоке: иначе открытие списка
          сдвигало бы вниз всю страницу. */}
      <div className="absolute left-0 top-full z-30 mt-2 w-[min(280px,calc(100vw-2rem))] overflow-hidden rounded-[var(--radius-sm)] border border-line bg-surface shadow-lg">
        {points.map((point) => {
          const here = point.id === currentId;
          return (
            <PointForm key={point.id} tid={point.id}>
              <button
                type="submit"
                disabled={here}
                aria-current={here ? 'true' : undefined}
                className={`flex w-full items-center gap-2.5 border-b border-line px-3.5 py-2.5 text-left last:border-b-0 ${
                  here ? 'bg-surface2' : 'hover:bg-surface2'
                }`}
              >
                {/* Точка состояния: закрытую мойку видно до того, как в
                    неё зашли, а не после. */}
                <span
                  className={`size-2 shrink-0 rounded-full ${
                    point.canRead ? 'bg-good' : 'bg-warn'
                  }`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{point.name}</span>
                  <span className="block truncate text-[12px] text-muted">
                    {point.role === 'owner' ? hy.roles.owner : hy.roles.staff}
                    {point.canRead ? '' : ` · ${hy.points.needsPayment}`}
                  </span>
                </span>
                {here && (
                  <svg className="size-4 shrink-0 text-muted" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path
                      d="M3.5 8.5 6.5 11.5 12.5 5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            </PointForm>
          );
        })}
      </div>
    </details>
  );
}
