import Link from 'next/link';

import { ensureDb } from '@/lib/db/ready';
import { peekLink } from '@/lib/email-link';
import { getDict } from '@/lib/i18n/server';
import { LinkShell } from '../link-shell';
import { ResetForm } from './form';

/** Новый пароль: сюда ведёт ссылка из письма восстановления. */
export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  await ensureDb();
  const t = await getDict();
  const token = (await searchParams).t ?? '';

  const peeked = await peekLink({ token, purpose: 'reset' });

  if (!peeked.ok) {
    return (
      <LinkShell>
        <div className="flex flex-col gap-6">
          <h1 className="font-wordmark text-[26px] leading-[1.08] uppercase md:text-[30px]">
            {peeked.reason === 'EXPIRED' ? t.auth.linkExpired : t.auth.linkInvalid}
          </h1>
          <Link
            href="/?auth=signIn"
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
      <ResetForm token={token} email={peeked.email} />
    </LinkShell>
  );
}
