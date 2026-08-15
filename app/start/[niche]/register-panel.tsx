import Link from 'next/link';
import { formatMoney } from '@/lib/money';
import type { Niche } from '@/lib/niches';
import { RegisterForm } from './register-form';
import { getDict } from '@/lib/i18n/server';
import { nicheNameTerm, nicheTagTerm } from '@/lib/i18n/terms';

/**
 * Регистрация бизнеса.
 *
 * Раньше это была голая форма из четырёх полей — по ней нельзя было
 * понять, что вообще создаётся и что будет дальше. Теперь сначала видно
 * предмет разговора: какой бизнес заводим и с чем он сразу заработает.
 *
 * Список услуг здесь не для красоты. Он снимает главное возражение
 * владельца — «мне это ещё настраивать» — до того, как оно возникнет.
 */
export async function RegisterPanel({ niche }: { niche: Niche }) {
  const t = await getDict();
  return (
    <>
      <div className="mb-5">
        <span className="label">
          {t.onboarding.newBusiness} · {t.onboarding.inThreeMinutes}
        </span>
        {/* Значок ниши — эмодзи, и на этом месте он был крупнее
            названия бизнеса. Системная картинка в тридцать пунктов
            перед словом «Автомойка» ничего не добавляет: слово уже
            сказало всё, а рисунок пришёл из чужой палитры. В данных он
            остаётся — его читает приложение через /api/v1/niches. */}
        <h1 className="mt-2 text-[26px] leading-tight font-bold tracking-[-0.025em]">
          {nicheNameTerm(niche.name, t.locale)}
        </h1>
        <p className="mt-2 text-[13.5px] text-muted">{nicheTagTerm(niche.tag, t.locale)}</p>
      </div>

      <div className="tile mb-5">
        <div className="label mb-3">{t.onboarding.whatYouGet}</div>

        <div className="grid gap-2">
          {niche.services.map((service) => (
            <div key={service.name} className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[15px]">{service.name}</span>
              <span className="num shrink-0 text-[15px] text-muted">
                {formatMoney(service.price)}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-3 border-t border-hairline pt-3">
          <p className="text-[13.5px] text-faint">
            {t.onboarding.servicesReady(niche.services.length)}
          </p>
          <p className="mt-0.5 text-[13.5px] text-faint">{t.onboarding.editLater}</p>
        </div>
      </div>

      <RegisterForm nicheKey={niche.key} defaultName={nicheNameTerm(niche.name, t.locale)} />

      <p className="mt-5 text-center text-[13.5px] text-muted">
        {t.onboarding.alreadyHave}{' '}
        <Link href="/login" className="underline underline-offset-4 hover:text-ink">
          {t.auth.signIn}
        </Link>
      </p>
    </>
  );
}
