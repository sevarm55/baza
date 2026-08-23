'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { resumeSetup } from '@/app/onboarding-actions';
import { LoadingButton } from '@/components/loading';
import { useT } from '@/lib/i18n/client';

/**
 * Вернуть «Начало работы» на главную.
 *
 * Пропустить настройку можно случайно в первый день, а вспомнить о ней
 * на третий. После возврата сразу уводим на главную, туда, где список и
 * появится, иначе нажатие выглядит как ничего не сделавшее.
 */
export function ResumeSetup() {
  const t = useT();
  const router = useRouter();
  const [pending, go] = useTransition();

  return (
    <LoadingButton
      type="button"
      variant="outline"
      size="sm"
      busy={pending}
      label={t.setup.resumeCta}
      busyLabel={t.common.updating}
      onClick={() =>
        go(async () => {
          await resumeSetup();
          router.push('/owner');
        })
      }
    />
  );
}
