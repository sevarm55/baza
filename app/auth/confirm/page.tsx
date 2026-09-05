import Link from 'next/link';

import { ensureDb } from '@/lib/db/ready';
import { peekLink } from '@/lib/email-link';
import { getDict } from '@/lib/i18n/server';
import { LinkShell } from '../link-shell';
import { ConfirmForm } from './form';

/**
 * Подтверждение почты: сюда ведёт ссылка из письма о регистрации.
 *
 * Страница только показывает, что подтверждают, и ничего не гасит.
 * Заявку гасит нажатие кнопки: почтовые антивирусы ходят по ссылкам
 * заранее, и подтверждение по факту открытия сгорало бы до человека.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  await ensureDb();
  const t = await getDict();
  const token = (await searchParams).t ?? '';

  const peeked = await peekLink<{ businessName: string; ownerName: string }>({
    token,
    purpose: 'register',
  });

  if (!peeked.ok) {
    return (
      <LinkShell>
        <div className="flex flex-col gap-6">
          <h1 className="font-wordmark text-[26px] leading-[1.08] uppercase md:text-[30px]">
            {peeked.reason === 'EXPIRED' ? t.auth.linkExpired : t.auth.linkInvalid}
          </h1>
          <Link
            href="/?auth=register"
            className="text-[14px] underline decoration-border underline-offset-[5px]"
          >
            {t.auth.backToSignIn}
          </Link>
        </div>
      </LinkShell>
    );
  }

  return (
    <LinkShell>
      <ConfirmForm token={token} email={peeked.email} business={peeked.payload.businessName} />
    </LinkShell>
  );
}
