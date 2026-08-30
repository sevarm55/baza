import Link from 'next/link';
import { KeyRound } from 'lucide-react';

import { getDict } from '@/lib/i18n/server';

/**
 * Код временный: напоминание задать свой.
 *
 * Код выдал админ платформы, когда человеку было нечем войти. Он
 * сгорает в свой срок, и человек останется у ворот посреди смены —
 * поэтому напоминание не закрывается: оно уйдёт само, как только код
 * сменят.
 *
 * Янтарное, а не красное: ничего не сломано, вход работает. Красным в
 * продукте помечено разрушительное.
 *
 * Ведёт в профиль, к смене кода. У мойщика профиля нет, и ссылки у него
 * тоже нет — только текст: сменить код он может в приложении, а на
 * вебе для этого некуда идти.
 */
export async function TempAccessBanner({
  until,
  timezone,
  canChange,
}: {
  until: Date | null;
  timezone: string;
  /** есть ли куда вести: у мойщика профиля нет */
  canChange: boolean;
}) {
  if (!until) return null;
  const t = await getDict();

  /* Время в зоне бизнеса, а не браузера: владелец в поездке видел бы
     чужой срок и решил, что код сгорает не тогда. */
  const deadline = new Intl.DateTimeFormat(t.locale, {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(until);

  return (
    <div
      role="status"
      className="mb-4 flex gap-3 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm max-md:mb-3 max-md:rounded-m-tile max-md:border-0 max-md:px-4 max-md:py-3.5"
    >
      <KeyRound className="mt-0.5 size-4 shrink-0 text-warning-soft-foreground" aria-hidden />
      <div className="min-w-0">
        <div className="font-semibold text-warning-soft-foreground">{t.auth.tempAccessTitle}</div>
        <p className="mt-0.5 text-muted-foreground">{t.auth.tempAccessNote(deadline)}</p>
        {canChange && (
          <Link
            href="/owner/profile#pin"
            className="mt-1 inline-block font-medium text-warning-soft-foreground underline underline-offset-4"
          >
            {t.auth.tempAccessAction}
          </Link>
        )}
      </div>
    </div>
  );
}
