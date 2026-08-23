import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getServiceStats, getTenant, listServices, startOfMonth } from '@/lib/queries';
import { tiersOf } from '@/lib/catalog';
import { currencySymbol, formatAmount, formatMoney, toMajor } from '@/lib/money';
import { getDict } from '@/lib/i18n/server';
import { localizeTenantOrNull, serviceNameTerm, unitCount } from '@/lib/i18n/terms';
import { PageHeader } from '@/components/patterns/page-header';
import { AddService } from './add-service';
import { ServiceList } from './service-list';
import { TiersEditor } from './tiers';
import type { ServiceRow } from './model';

/**
 * Услуги.
 *
 * Прейскурант правят чаще всего остального в кабинете, потому что цена
 * это рабочая сущность наравне с людьми, машинами и расходами, а не
 * параметр продукта. Отсюда своя страница и своя строка в меню.
 *
 * Порядок на странице тот же, в каком задают вопросы:
 *
 *   сколько их всего и почём в среднем → строка под заголовком;
 *   что именно и что из этого берут    → список;
 *   как поменять цену                  → лист по нажатию на строку.
 */
export default async function ServicesPage() {
  const t = await getDict();
  const session = await requireOwner();
  /* Слова бизнеса — на языке того, кто смотрит; своё название владельца
     проходит насквозь (см. terms.ts). В базу отсюда ничего не пишется. */
  const tenant = localizeTenantOrNull(await getTenant(session.tid), t.locale);
  if (!tenant) redirect('/session-ended');

  /* Рядом с прейскурантом — что из него берут за месяц: цену правят
     оглядываясь на спрос, а не на сам список. */
  const [services, month] = await Promise.all([
    listServices(tenant.id),
    getServiceStats(tenant.id, startOfMonth(tenant.timezone)),
  ]);

  const symbol = currencySymbol(tenant.currency);
  const step = toMajor(1, tenant.currency);
  const money = (n: number) => formatMoney(n, tenant.currency, t.locale);
  const sold = new Map(month.map((m) => [m.serviceId ?? '', m]));

  /* Классы машин. Пусто — ни ряда цен в форме услуги, ни разговора о
     них: у мойки без классов это управление, которое ничего не меняет. */
  const tiers = tiersOf(tenant);

  const rows: ServiceRow[] = services.map((s) => ({
    id: s.id,
    /* Заводские строки прайса переводятся, названия владельца проходят
       насквозь (см. terms.ts). */
    name: serviceNameTerm(s.name, t.locale),
    price: toMajor(s.price, tenant.currency),
    display: formatAmount(s.price, tenant.currency, t.locale),
    count: sold.get(s.id)?.count ?? 0,
    revenue: money(sold.get(s.id)?.revenue ?? 0),
    /* По одной цене на класс, в порядке `tiers`. Ноль означает «своей
       нет, берём базовую» — то же, что понимает `priceForTier`. */
    tierPrices: tiers.map((_, i) => toMajor(s.tierPrices?.[i] ?? 0, tenant.currency)),
    tierDisplay: tiers.map((_, i) => {
      const own = s.tierPrices?.[i] ?? 0;
      return own > 0 ? formatAmount(own, tenant.currency, t.locale) : '';
    }),
  }));

  const cars = month.reduce((sum, m) => sum + m.count, 0);
  const revenue = month.reduce((sum, m) => sum + m.revenue, 0);
  const avgPrice = services.length
    ? Math.round(services.reduce((sum, s) => sum + s.price, 0) / services.length)
    : 0;

  /* Справочная строка вместо показаний: сколько услуг, по какой средней
     цене и что прайс принёс за месяц. Весить как показания этим числам
     незачем: над списком, ради которого сюда пришли, встал бы ряд
     равных ему по громкости плиток. */
  const facts =
    services.length > 0
      ? [
          `${services.length} ${t.owner.colService.toLocaleLowerCase(t.locale)}`,
          avgPrice > 0 ? `${t.owner.avgShort} ${money(avgPrice)}` : null,
          cars > 0
            ? `${unitCount(cars, tenant.unitOne, t.locale)} · ${money(revenue)} ${t.owner.periodMonth.toLocaleLowerCase(t.locale)}`
            : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        className="mb-0"
        title={t.settings.tabServices}
        description={t.settings.servicesLead}
        meta={facts ? <span className="num">{facts}</span> : undefined}
        actions={
          <>
            {/* Классы стоят рядом с прайсом, а не в настройках бизнеса:
                они меняют весь прайс целиком, и правят их, глядя на него. */}
            <TiersEditor label={tenant.tierLabel ?? t.work.tier} tiers={tiers} />
            <AddService currencySymbol={symbol} step={step} tiers={tiers} />
          </>
        }
      />

      <ServiceList rows={rows} step={step} currencySymbol={symbol} tiers={tiers} />
    </div>
  );
}
