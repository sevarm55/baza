import Link from 'next/link';
import { SUPPORT_PHONE } from '@/lib/brand';
import type { Metadata } from 'next';
import { ChevronLeft } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { getDict } from '@/lib/i18n/server';

/**
 * Поддержка.
 *
 * Обязательна для App Store: адрес этой страницы указывается в карточке
 * приложения, и Apple по нему ходит. Но польза не только в этом: вопросы
 * ниже реальные, и первый из них («забыл PIN») закрывает больше половины
 * обращений: сотруднику код меняет владелец, и об этом никто не догадывается.
 *
 * Телефон здесь, а не в приложении, и это осознанно: правила App Store
 * (3.1.3f) запрещают внутри приложения звать к оплате снаружи, а на сайт
 * они не распространяются.
 *
 * Ширина ограничена по мере чтения, а не по ширине экрана: строка в
 * 120 знаков глазом не держится, а до конца этой страницы дойти должны.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict();
  return { title: t.meta.supportTitle, description: t.meta.supportDescription };
}

const h2 = 'mt-8 mb-2 text-[15px] font-semibold';
const p = 'mt-3';
const link = 'text-primary underline-offset-4 hover:underline';

export default async function SupportPage() {
  const t = await getDict();
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 text-sm leading-relaxed">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" aria-hidden />
        Tetrin
      </Link>

      <h1 className="mb-2 text-[22px] font-semibold tracking-[-0.01em]">Աջակցություն</h1>

      <p className={`${p} text-muted-foreground`}>
        Ցանկացած հարցի դեպքում զանգահարեք{' '}
        <a className={link} href={`tel:${SUPPORT_PHONE}`}>
          {t.billing.wallPhone}
        </a>
        ։ Պատասխանում ենք ամեն օր՝ 10:00–20:00։
      </p>

      <h2 className={h2}>Մոռացել եմ PIN-ը</h2>
      <p className={p}>
        Աշխատակցի PIN-ը փոխում է բիզնեսի սեփականատերը՝ «Կարգավորումներ» բաժնից։ Սեփականատերն իր
        PIN-ը փոխում է «Պրոֆիլ» բաժնում, եթե դեռ մուտք ունի։ Եթե մուտքը կորել է — զանգահարեք։
      </p>
      <p className={p}>
        Կոդը մենք չգիտենք և չենք կարող ասել. այն պահվում է միայն գաղտնագրված տեսքով։ Կարող ենք
        միայն նորը դնել։
      </p>

      <h2 className={h2}>Ինչպե՞ս ավելացնել աշխատակից</h2>
      <p className={p}>
        «Կարգավորումներ» → աշխատակիցներ։ Նշում եք անունը, հեռախոսը, PIN-ը և տոկոսը։ Աշխատակիցն
        այդ հեռախոսով և կոդով մտնում է հավելված։ Հաշիվն ինքնուրույն չի ստեղծվում — միշտ
        սեփականատերն է ավելացնում։
      </p>

      <h2 className={h2}>Ինչպե՞ս վերցնել իմ տվյալները</h2>
      <p className={p}>
        «Ավելին» → ներբեռնել տվյալները։ Ստացվում է CSV ֆայլ՝ բոլոր գրանցումներով։ Աշխատում է նաև
        այն ժամանակ, երբ մուտքի ժամկետը լրացել է. ձեր պատմությունը ձերն է։
      </p>

      <h2 className={h2}>Ինչպե՞ս ջնջել բիզնեսը</h2>
      <p className={p}>
        «Ավելին» → ջնջել բիզնեսը։ Ջնջվում է ամեն ինչ՝ գրանցումները, հաճախորդները, աշխատակիցները —
        անվերադարձ։ Խորհուրդ ենք տալիս մինչ այդ ներբեռնել տվյալները։
      </p>

      <h2 className={h2}>Ծանուցումները չեն գալիս</h2>
      <p className={p}>
        Ստուգեք հեռախոսի կարգավորումները՝ Settings → Tetrin → Notifications, և հավելվածում՝
        «Պրոֆիլ» → ծանուցումներ։ Ծանուցումները գալիս են սեփականատիրոջը՝ հերթափոխի բացման և նոր
        գրանցումների մասին։
      </p>

      <h2 className={h2}>Մուտքի ժամկետը լրացել է</h2>
      <p className={p}>
        Տվյալները մնում են տեղում՝ ոչինչ չի ջնջվում։ Կարող եք ներբեռնել դրանք կամ ջնջել բիզնեսը։
        Շարունակելու համար զանգահարեք վերևի համարով։
      </p>

      {/* Английская половина. Не спрятана и не свёрнута: её читает
          ревьюер App Store, и заставлять его искать переключатель
          языка значит добровольно добавлять себе задержку. */}
      <Separator className="mt-10" />
      <section lang="en">
        <h2 className={h2}>Support (English)</h2>
        <p className={p}>
          Tetrin is a bookkeeping tool for service businesses in Armenia. For any question, call{' '}
          <a className={link} href={`tel:${SUPPORT_PHONE}`}>
            {t.billing.wallPhone}
          </a>{' '}
          (10:00–20:00, daily).
        </p>
        <p className={p}>
          <b>Forgot your PIN?</b> Staff PINs are reset by the business owner in Settings. Owners
          change their own PIN in Profile. We cannot tell you a PIN — it is stored only as a hash —
          we can only set a new one.
        </p>
        <p className={p}>
          <b>Accounts.</b> Staff accounts are created by the business owner; there is no self
          sign-up inside the app. Businesses are registered on this website.
        </p>
        <p className={p}>
          <b>Your data.</b> Export everything as CSV from More → Download data, at any time, even
          after access has expired. Delete the business from the same screen — it erases everything
          permanently.
        </p>
        <p className={p}>
          See also our{' '}
          <Link className={link} href="/privacy">
            privacy policy
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
