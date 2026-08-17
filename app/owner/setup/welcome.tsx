'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Sheet } from '@/components/sheet';
import { markWelcomeSeen } from '@/app/onboarding-actions';
import { useT } from '@/lib/i18n/client';

/**
 * Первая минута владельца.
 *
 * Одно окно, один раз за всю жизнь бизнеса, и в нём ровно четыре вещи:
 * куда он попал, что от него нужно, что случится потом и с чего начать.
 * Ни «шаг 1 из 14», ни тура по разделам: продукт приходит настроенным, и
 * рассказывать про кнопки в первую минуту незачем — человек их ещё не
 * искал.
 *
 * Окно, а не отдельная страница: страница означала бы, что до продукта
 * ещё надо дойти. Здесь под ним уже лежит его собственный кабинет с его
 * названием, и закрыть окно можно крестиком, Escape или щелчком мимо —
 * всеми тремя способами, какими закрывают любое окно в Tetrin.
 *
 * На телефоне то же окно приезжает снизу, из-под пальца: это `Sheet`
 * продукта, а не своя коробка (см. globals.css, «окно приезжает снизу»).
 */
export function Welcome({ nextHref }: { nextHref: string }) {
  const t = useT();
  const [open, setOpen] = useState(true);
  const marked = useRef(false);

  /* Отмечаем прочитанным при показе, а не при закрытии.
     Приветствие уже случилось — человек его видит. Ждать нажатия значило
     бы показывать его снова после перезагрузки страницы, а окно, которое
     возвращается при каждом обновлении, перестаёт быть приветствием и
     становится помехой. */
  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    void markWelcomeSeen();
  }, []);

  const steps = [
    { name: t.setup.flowSetup, note: t.setup.flowSetupNote },
    { name: t.setup.flowWork, note: t.setup.flowWorkNote },
    { name: t.setup.flowMoney, note: t.setup.flowMoneyNote },
    { name: t.setup.flowResult, note: t.setup.flowResultNote },
  ];

  return (
    <Sheet
      open={open}
      onClose={() => setOpen(false)}
      title={t.setup.welcomeTitle}
      subtitle={t.setup.welcomeLead}
      footer={
        /* Две кнопки одного размера, а не «отмена и сохранить».

           В окнах правки подвал устроен иначе: слева тихое «отмена»
           мелкой кнопкой, справа крупное действие. Там это верно —
           отказ от правки не равен правке. Здесь оба выхода
           равноправны: осмотреться сначала такой же нормальный ответ,
           как начать сразу, и разный размер кнопок объявлял бы один из
           них ошибкой. Разница остаётся в заливке: лайм у того, который
           мы советуем. */
        <div className="setup-foot">
          {/* Тихий выход стоит первым: человек, который хочет сначала
              осмотреться, не должен искать его среди действий. */}
          <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
            {t.setup.welcomeLook}
          </button>
          {/* Главное действие ведёт в настоящий раздел, а не на
              следующий экран мастера: настройка делается там же, где её
              потом правят каждый месяц. */}
          <Link href={nextHref} className="btn" onClick={() => setOpen(false)}>
            {t.setup.welcomeStart}
          </Link>
        </div>
      }
    >
      <p className="setup-welcome-note">{t.setup.welcomeNote}</p>

      {/* Путь бизнеса, а не список возможностей. Четыре звена отвечают
          на вопрос, который человек задаёт первым: что вообще будет
          происходить, если я это настрою. */}
      <ol className="setup-flow">
        {steps.map((step) => (
          <li key={step.name}>
            <span className="setup-flow-name">{step.name}</span>
            <span className="setup-flow-note">{step.note}</span>
          </li>
        ))}
      </ol>
    </Sheet>
  );
}
