import Link from 'next/link';
import type { Metadata } from 'next';
import { hy } from '@/lib/i18n/hy';
import s from '../legal.module.css';

/**
 * Поддержка.
 *
 * Обязательна для App Store: адрес этой страницы указывается в карточке
 * приложения, и Apple по нему ходит. Но польза не только в этом — вопросы
 * ниже реальные, и первый из них («забыл PIN») закрывает больше половины
 * обращений: сотруднику код меняет владелец, и об этом никто не догадывается.
 *
 * Телефон здесь, а не в приложении, и это осознанно: правила App Store
 * (3.1.3f) запрещают внутри приложения звать к оплате снаружи, а на сайт
 * они не распространяются.
 */
export const metadata: Metadata = {
  title: 'Աջակցություն · Տետր',
  description: 'Օգնություն Տետր հավելվածի հետ',
};

export default function SupportPage() {
  return (
    <div className={s.page}>
      <Link href="/" className={s.back}>
        ← Տետր
      </Link>

      <h1 className={s.title}>Աջակցություն</h1>

      <p className={s.p}>
        Ցանկացած հարցի դեպքում զանգահարեք{' '}
        <a className={s.link} href="tel:+37499855546">
          {hy.billing.wallPhone}
        </a>
        ։ Պատասխանում ենք ամեն օր՝ 10:00–20:00։
      </p>

      <h2 className={s.h2}>Մոռացել եմ PIN-ը</h2>
      <p className={s.p}>
        Աշխատակցի PIN-ը փոխում է բիզնեսի սեփականատերը՝ «Կարգավորումներ» բաժնից։ Սեփականատերն իր
        PIN-ը փոխում է «Պրոֆիլ» բաժնում, եթե դեռ մուտք ունի։ Եթե մուտքը կորել է — զանգահարեք։
      </p>
      <p className={s.p}>
        Կոդը մենք չգիտենք և չենք կարող ասել. այն պահվում է միայն գաղտնագրված տեսքով։ Կարող ենք
        միայն նորը դնել։
      </p>

      <h2 className={s.h2}>Ինչպե՞ս ավելացնել աշխատակից</h2>
      <p className={s.p}>
        «Կարգավորումներ» → աշխատակիցներ։ Նշում եք անունը, հեռախոսը, PIN-ը և տոկոսը։ Աշխատակիցն
        այդ հեռախոսով և կոդով մտնում է հավելված։ Հաշիվն ինքնուրույն չի ստեղծվում — միշտ
        սեփականատերն է ավելացնում։
      </p>

      <h2 className={s.h2}>Ինչպե՞ս վերցնել իմ տվյալները</h2>
      <p className={s.p}>
        «Ավելին» → ներբեռնել տվյալները։ Ստացվում է CSV ֆայլ՝ բոլոր գրանցումներով։ Աշխատում է նաև
        այն ժամանակ, երբ մուտքի ժամկետը լրացել է. ձեր պատմությունը ձերն է։
      </p>

      <h2 className={s.h2}>Ինչպե՞ս ջնջել բիզնեսը</h2>
      <p className={s.p}>
        «Ավելին» → ջնջել բիզնեսը։ Ջնջվում է ամեն ինչ՝ գրանցումները, հաճախորդները, աշխատակիցները —
        անվերադարձ։ Խորհուրդ ենք տալիս մինչ այդ ներբեռնել տվյալները։
      </p>

      <h2 className={s.h2}>Ծանուցումները չեն գալիս</h2>
      <p className={s.p}>
        Ստուգեք հեռախոսի կարգավորումները՝ Settings → Տետր → Notifications, և հավելվածում՝
        «Պրոֆիլ» → ծանուցումներ։ Ծանուցումները գալիս են սեփականատիրոջը՝ հերթափոխի բացման և նոր
        գրանցումների մասին։
      </p>

      <h2 className={s.h2}>Մուտքի ժամկետը լրացել է</h2>
      <p className={s.p}>
        Տվյալները մնում են տեղում՝ ոչինչ չի ջնջվում։ Կարող եք ներբեռնել դրանք կամ ջնջել բիզնեսը։
        Շարունակելու համար զանգահարեք վերևի համարով։
      </p>

      <div className={s.other}>
        <h2 className={s.h2}>Support (English)</h2>
        <p className={s.p}>
          Tetr is a bookkeeping tool for service businesses in Armenia. For any question, call{' '}
          <a className={s.link} href="tel:+37499855546">
            {hy.billing.wallPhone}
          </a>{' '}
          (10:00–20:00, daily).
        </p>
        <p className={s.p}>
          <b>Forgot your PIN?</b> Staff PINs are reset by the business owner in Settings. Owners
          change their own PIN in Profile. We cannot tell you a PIN — it is stored only as a hash —
          we can only set a new one.
        </p>
        <p className={s.p}>
          <b>Accounts.</b> Staff accounts are created by the business owner; there is no self
          sign-up inside the app. Businesses are registered on this website.
        </p>
        <p className={s.p}>
          <b>Your data.</b> Export everything as CSV from More → Download data, at any time, even
          after access has expired. Delete the business from the same screen — it erases everything
          permanently.
        </p>
        <p className={s.p}>
          See also our{' '}
          <Link className={s.link} href="/privacy">
            privacy policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
