import Link from 'next/link';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import type { Dict } from '@/lib/i18n';

import { Words } from './words';

/**
 * Вопросы и подвал. Хвост витрины.
 *
 * Движения тут нет, и это решение, а не забывчивость. Выше человека вели
 * поворотом робота, наводкой на резкость, живой лентой и липкой сценой;
 * страница себя показала. Здесь он либо снимает последнее возражение,
 * либо уходит, и мешать ему в этот момент нечем.
 *
 * Ответы честные до неудобного: что будет после пробного срока (кабинет
 * закроется на чтение), можно ли забрать данные (да, выгрузкой). Такие
 * вопросы всё равно задают на встрече, и написанный заранее ответ стоит
 * дешевле, чем тот же ответ в переписке.
 *
 * Подвал обязателен: адреса `/privacy` и `/support` указаны в карточке
 * приложения в App Store, Apple по ним ходит, и с витрины на них должна
 * вести ссылка.
 */
export function Questions({ t }: { t: Dict }) {
  const l = t.landing.faq;

  return (
    <>
      <section
        id="faq"
        aria-labelledby="faq-title"
        className="scroll-mt-16 bg-[var(--landing-bg)]"
      >
        <div className="mx-auto grid w-full max-w-[1360px] gap-10 px-5 pt-16 pb-20 md:px-10 md:pt-20 md:pb-24 lg:grid-cols-[minmax(0,0.62fr)_minmax(0,1.38fr)] lg:gap-20">
          <Words
            id="faq-title"
            text={l.title}
            className="font-wordmark max-w-[13ch] text-[26px] leading-[1.12] tracking-[-0.01em] uppercase md:text-[36px]"
          />

          <Accordion className="border-t border-border">
            {l.items.map((item) => (
              <AccordionItem key={item.q} value={item.q} className="border-b border-border">
                <AccordionTrigger className="py-5 text-[15px] font-semibold md:text-base">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="max-w-[62ch] pb-5 text-[14px] leading-relaxed text-muted-foreground md:text-[15px]">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <footer className="bg-[var(--landing-bg)]">
        <div className="mx-auto flex w-full max-w-[1360px] flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-border px-5 py-6 text-xs text-muted-foreground md:px-10">
          <span>
            {t.app.name} · {t.landing.footer}
          </span>
          <nav aria-label={t.landing.footerAria} className="flex gap-5">
            <Link href="/privacy" className="hover:text-foreground">
              {t.legal.privacy}
            </Link>
            <Link href="/support" className="hover:text-foreground">
              {t.legal.support}
            </Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
