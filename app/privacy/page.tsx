import Link from 'next/link';
import type { Metadata } from 'next';
import { hy } from '@/lib/i18n/hy';
import s from '../legal.module.css';

/**
 * Политика конфиденциальности.
 *
 * Обязательна: без публичного адреса этой страницы приложение в App Store
 * не заводится вовсе, а Apple сверяет написанное здесь с тем, что заявлено
 * в карточке приложения. Расхождение — отказ, поэтому текст перечисляет
 * ровно те поля, что есть в схеме, и ничего сверх.
 *
 * Две половины, армянская и английская. Первую читают те, кто пользуется,
 * вторую — ревьюер: заставлять его искать переключатель языка значит
 * добровольно добавлять себе непонятную задержку.
 *
 * Страница открыта без входа — так и задумано: proxy.ts закрывает только
 * /work и /owner.
 */
export const metadata: Metadata = {
  title: 'Գաղտնիության քաղաքականություն · Tetr',
  description: 'Ի՞նչ տվյալներ է պահում Tetr-ը և ինչի համար',
};

const UPDATED = '31.07.2026';

export default function PrivacyPage() {
  return (
    <div className={s.page}>
      <Link href="/" className={s.back}>
        ← Tetr
      </Link>

      <h1 className={s.title}>Գաղտնիության քաղաքականություն</h1>
      <p className={s.updated}>Թարմացվել է {UPDATED}</p>

      <p className={s.p}>
        Tetr-ը հաշվառման գործիք է սպասարկման բիզնեսների համար։ Մենք պահում ենք միայն այն, ինչ
        անհրաժեշտ է ծառայությունն աշխատեցնելու համար, և չենք տալիս այն ոչ մեկին։
      </p>

      <h2 className={s.h2}>Ի՞նչ տվյալներ ենք պահում</h2>
      <ul className={s.list}>
        <li>
          <b>Հաշիվ.</b> անուն, հեռախոսահամար, դեր (սեփականատեր կամ աշխատակից), աշխատակցի տոկոսը։
          PIN-ը պահվում է միայն գաղտնագրված տեսքով (scrypt) — բուն կոդը մեզ հայտնի չէ և վերականգնման
          ենթակա չէ։
        </li>
        <li>
          <b>Բիզնես.</b> անվանում, ոլորտ, արժույթ, ժամային գոտի։
        </li>
        <li>
          <b>Գրանցումներ.</b> ծառայություն, գումար, վճարման ձև, հաճախորդի նշանը (օրինակ՝ մեքենայի
          համարանիշը), ժամանակը և ով է կատարել։
        </li>
        <li>
          <b>Հաճախորդներ.</b> նշանը, այցերի քանակը և ընդհանուր գումարը։ Անուն կամ հեռախոս
          պարտադիր չեն և լրացվում են միայն ձեր ցանկությամբ։
        </li>
        <li>
          <b>Ծախսեր, հերթափոխեր, աշխատավարձեր.</b> գումարներ, ամսաթվեր, ում է վերաբերում։
        </li>
        <li>
          <b>Անվտանգություն.</b> մուտքի փորձերը (հեռախոս, IP հասցե, ժամանակ) — որպեսզի կոդի
          ընտրության փորձերը կանգնեցվեն։ Սեսիաների ցանկը՝ սարքի անունով։
        </li>
        <li>
          <b>Ծանուցումներ.</b> սարքի token, եթե միացրել եք push-ծանուցումները։
        </li>
      </ul>

      <h2 className={s.h2}>Ինչի՞ համար</h2>
      <p className={s.p}>
        Միայն ծառայությունը մատուցելու համար՝ ցույց տալ ձեր հասույթը, աշխատավարձերը և շահույթը,
        պահել պատմությունը, ուղարկել ծանուցումներ հերթափոխի և նոր գրանցումների մասին։ Ուրիշ
        նպատակով տվյալները չեն օգտագործվում։
      </p>

      <h2 className={s.h2}>Ո՞ւմ ենք փոխանցում</h2>
      <p className={s.p}>
        Ոչ մեկին։ Մենք չենք վաճառում տվյալները, չենք տալիս գովազդատուներին և չենք օգտագործում
        երրորդ կողմի վերլուծություն կամ հետագծում — հավելվածում և կայքում այդպիսի գործիքներ
        պարզապես չկան։
      </p>
      <p className={s.p}>
        Push-ծանուցումներն անցնում են Apple-ի սերվերով (APNs) — առանց դրա ծանուցում հեռախոս չի
        հասնում։ Apple-ը տեսնում է սարքի token-ը և ծանուցման տեքստը։
      </p>

      <h2 className={s.h2}>Որքա՞ն ենք պահում</h2>
      <p className={s.p}>
        Քանի դեռ հաշիվը գործում է։ Բիզնեսը ջնջելիս ջնջվում է ամեն ինչ՝ գրանցումները, հաճախորդները,
        աշխատակիցները, ծախսերը — անվերադարձ։ Մուտքի փորձերի գրառումները ջնջվում են ինքնաբերաբար։
      </p>

      <h2 className={s.h2}>Ձեր իրավունքները</h2>
      <ul className={s.list}>
        <li>Ցանկացած պահի ներբեռնել բոլոր տվյալները CSV ֆայլով — հավելվածից կամ կայքից։</li>
        <li>Ջնջել բիզնեսը ամբողջությամբ։ Դա անելու համար ոչ մեկին զանգահարել պետք չէ։</li>
        <li>Ուղղել կամ լրացնել ցանկացած տվյալ։</li>
      </ul>

      <h2 className={s.h2}>Երեխաներ</h2>
      <p className={s.p}>
        Ծառայությունը նախատեսված է բիզնեսի համար և չի ուղղված 18 տարեկանից ցածր անձանց։
      </p>

      <h2 className={s.h2}>Կապ</h2>
      <p className={s.p}>
        Հարցերի դեպքում զանգահարեք{' '}
        <a className={s.link} href="tel:+37499855546">
          {hy.billing.wallPhone}
        </a>
        ։
      </p>

      <div className={s.other}>
        <h2 className={s.h2}>Privacy Policy (English)</h2>
        <p className={s.p}>
          Tetr is a bookkeeping tool for service businesses. We store only what is needed to run
          the service, and we share it with no one.
        </p>

        <h2 className={s.h2}>What we store</h2>
        <ul className={s.list}>
          <li>
            <b>Account:</b> name, phone number, role (owner or staff), staff percentage. The PIN is
            stored only as a scrypt hash — we do not know the code itself and cannot recover it.
          </li>
          <li>
            <b>Business:</b> name, industry, currency, time zone.
          </li>
          <li>
            <b>Records:</b> service, amount, payment method, customer identifier (for example, a
            vehicle plate number), time, and who performed the work.
          </li>
          <li>
            <b>Customers:</b> the identifier, visit count and total. Name and phone are optional.
          </li>
          <li>
            <b>Expenses, shifts, payroll:</b> amounts, dates, and who they relate to.
          </li>
          <li>
            <b>Security:</b> login attempts (phone, IP address, time) to stop PIN guessing, and a
            list of sessions with the device name.
          </li>
          <li>
            <b>Notifications:</b> a device token, if you enabled push notifications.
          </li>
        </ul>

        <h2 className={s.h2}>Why</h2>
        <p className={s.p}>
          Only to provide the service: show your revenue, payroll and profit, keep the history, and
          send notifications about shifts and new records. The data is not used for anything else.
        </p>

        <h2 className={s.h2}>Who we share it with</h2>
        <p className={s.p}>
          No one. We do not sell data, do not pass it to advertisers, and use no third-party
          analytics or tracking — there are no such tools in the app or on the site. Push
          notifications are delivered through Apple (APNs), which sees the device token and the
          notification text.
        </p>

        <h2 className={s.h2}>How long we keep it</h2>
        <p className={s.p}>
          As long as the account is active. Deleting the business erases everything — records,
          customers, staff, expenses — permanently. Login-attempt records expire automatically.
        </p>

        <h2 className={s.h2}>Your rights</h2>
        <p className={s.p}>
          You can download all your data as CSV at any time, from the app or the site, and delete
          the business entirely without contacting anyone.
        </p>

        <h2 className={s.h2}>Contact</h2>
        <p className={s.p}>
          Call{' '}
          <a className={s.link} href="tel:+37499855546">
            {hy.billing.wallPhone}
          </a>
          .
        </p>
      </div>
    </div>
  );
}
