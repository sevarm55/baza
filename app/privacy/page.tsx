import Link from 'next/link';
import type { Metadata } from 'next';
import { ChevronLeft } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { getDict } from '@/lib/i18n/server';

/**
 * Политика конфиденциальности.
 *
 * Обязательна: без публичного адреса этой страницы приложение в App Store
 * не заводится вовсе, а Apple сверяет написанное здесь с тем, что заявлено
 * в карточке приложения. Расхождение это отказ, поэтому текст перечисляет
 * ровно те поля, что есть в схеме, и ничего сверх.
 *
 * Две половины, армянская и английская. Первую читают те, кто пользуется,
 * вторую ревьюер: заставлять его искать переключатель языка значит
 * добровольно добавлять себе непонятную задержку.
 *
 * Страница открыта без входа, так и задумано: proxy.ts закрывает только
 * /work и /owner.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict();
  return { title: t.meta.privacyTitle, description: t.meta.privacyDescription };
}

const UPDATED = '31.07.2026';

const h2 = 'mt-8 mb-2 text-[15px] font-semibold';
const p = 'mt-3';
const list = 'mt-3 list-disc space-y-1 pl-5';
const link = 'text-primary underline-offset-4 hover:underline';

export default async function PrivacyPage() {
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

      <h1 className="mb-2 text-[22px] font-semibold tracking-[-0.01em]">
        Գաղտնիության քաղաքականություն
      </h1>
      <p className="num text-xs text-muted-foreground">Թարմացվել է {UPDATED}</p>

      <p className={`${p} text-muted-foreground`}>
        Tetrin-ը հաշվառման գործիք է սպասարկման բիզնեսների համար։ Մենք պահում ենք միայն այն, ինչ
        անհրաժեշտ է ծառայությունն աշխատեցնելու համար, և չենք տալիս այն ոչ մեկին։
      </p>

      <h2 className={h2}>Ի՞նչ տվյալներ ենք պահում</h2>
      <ul className={list}>
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

      <h2 className={h2}>Ինչի՞ համար</h2>
      <p className={p}>
        Միայն ծառայությունը մատուցելու համար՝ ցույց տալ ձեր հասույթը, աշխատավարձերը և շահույթը,
        պահել պատմությունը, ուղարկել ծանուցումներ հերթափոխի և նոր գրանցումների մասին։ Ուրիշ
        նպատակով տվյալները չեն օգտագործվում։
      </p>

      <h2 className={h2}>Ո՞ւմ ենք փոխանցում</h2>
      <p className={p}>
        Ոչ մեկին։ Մենք չենք վաճառում տվյալները, չենք տալիս գովազդատուներին և չենք օգտագործում
        երրորդ կողմի վերլուծություն կամ հետագծում — հավելվածում և կայքում այդպիսի գործիքներ
        պարզապես չկան։
      </p>
      <p className={p}>
        Push-ծանուցումներն անցնում են Apple-ի սերվերով (APNs) — առանց դրա ծանուցում հեռախոս չի
        հասնում։ Apple-ը տեսնում է սարքի token-ը և ծանուցման տեքստը։
      </p>

      <h2 className={h2}>Որքա՞ն ենք պահում</h2>
      <p className={p}>
        Քանի դեռ հաշիվը գործում է։ Բիզնեսը ջնջելիս ջնջվում է ամեն ինչ՝ գրանցումները, հաճախորդները,
        աշխատակիցները, ծախսերը — անվերադարձ։ Մուտքի փորձերի գրառումները ջնջվում են ինքնաբերաբար։
      </p>

      <h2 className={h2}>Ձեր իրավունքները</h2>
      <ul className={list}>
        <li>Ցանկացած պահի ներբեռնել բոլոր տվյալները CSV ֆայլով — հավելվածից կամ կայքից։</li>
        <li>Ջնջել բիզնեսը ամբողջությամբ։ Դա անելու համար ոչ մեկին զանգահարել պետք չէ։</li>
        <li>Ուղղել կամ լրացնել ցանկացած տվյալ։</li>
      </ul>

      <h2 className={h2}>Երեխաներ</h2>
      <p className={p}>
        Ծառայությունը նախատեսված է բիզնեսի համար և չի ուղղված 18 տարեկանից ցածր անձանց։
      </p>

      <h2 className={h2}>Կապ</h2>
      <p className={p}>
        Հարցերի դեպքում զանգահարեք{' '}
        <a className={link} href="tel:+37499855546">
          {t.billing.wallPhone}
        </a>
        ։
      </p>

      {/* Английская половина. Не спрятана и не свёрнута: её читает
          ревьюер App Store, и заставлять его искать переключатель
          языка значит добровольно добавлять себе задержку. */}
      <Separator className="mt-10" />
      <section lang="en">
        <h2 className={h2}>Privacy Policy (English)</h2>
        <p className={p}>
          Tetrin is a bookkeeping tool for service businesses. We store only what is needed to run
          the service, and we share it with no one.
        </p>

        <h2 className={h2}>What we store</h2>
        <ul className={list}>
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

        <h2 className={h2}>Why</h2>
        <p className={p}>
          Only to provide the service: show your revenue, payroll and profit, keep the history, and
          send notifications about shifts and new records. The data is not used for anything else.
        </p>

        <h2 className={h2}>Who we share it with</h2>
        <p className={p}>
          No one. We do not sell data, do not pass it to advertisers, and use no third-party
          analytics or tracking — there are no such tools in the app or on the site. Push
          notifications are delivered through Apple (APNs), which sees the device token and the
          notification text.
        </p>

        <h2 className={h2}>How long we keep it</h2>
        <p className={p}>
          As long as the account is active. Deleting the business erases everything — records,
          customers, staff, expenses — permanently. Login-attempt records expire automatically.
        </p>

        <h2 className={h2}>Your rights</h2>
        <p className={p}>
          You can download all your data as CSV at any time, from the app or the site, and delete
          the business entirely without contacting anyone.
        </p>

        <h2 className={h2}>Contact</h2>
        <p className={p}>
          Call{' '}
          <a className={link} href="tel:+37499855546">
            {t.billing.wallPhone}
          </a>
          .
        </p>
      </section>
    </main>
  );
}
