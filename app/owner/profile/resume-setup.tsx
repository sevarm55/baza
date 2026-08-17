'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { resumeSetup } from '@/app/onboarding-actions';
import { useT } from '@/lib/i18n/client';

/**
 * Вернуть «Начало работы» на главную.
 *
 * Дверь обратно нужна по одной причине: пропустить настройку можно
 * случайно и в первый же день, а вспомнить о ней — на третий. Без этой
 * строки единственным способом вернуть список было бы завести бизнес
 * заново.
 *
 * Стоит на своей странице, среди личного: блок убирал человек, а не
 * бизнес, и у второго участника мойки он не пропадал вовсе. После
 * возврата сразу уводим на главную — туда, где список и появится, иначе
 * нажатие выглядит как ничего не сделавшее.
 */
export function ResumeSetup() {
  const t = useT();
  const router = useRouter();
  const [pending, go] = useTransition();

  return (
    <button
      type="button"
      className="btn-inline"
      disabled={pending}
      onClick={() =>
        go(async () => {
          await resumeSetup();
          router.push('/owner');
        })
      }
    >
      {pending ? t.common.loading : t.setup.resumeCta}
    </button>
  );
}
