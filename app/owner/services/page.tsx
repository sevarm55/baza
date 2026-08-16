import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getServiceStats, getTenant, listServices, startOfMonth } from '@/lib/queries';
import { currencySymbol, formatAmount, formatMoney, toMajor } from '@/lib/money';
import { PageHead } from '@/components/page-head';
import { AddService } from './add-service';
import { ServiceList, type ServiceRow } from './service-list';
import { getDict } from '@/lib/i18n/server';
import { unitCount } from '@/lib/i18n/terms';
import { localizeTenantOrNull } from '@/lib/i18n/terms';

/**
 * Услуги.
 *
 * Раздел годами лежал вкладкой внутри настроек, и это была главная
 * ошибка расстановки в кабинете. Настройки — то, что трогают раз в год:
 * название точки, выгрузка, удаление бизнеса. Прейскурант правят чаще
 * всего остального в кабинете вместе взятого, потому что цена — это
 * рабочая сущность наравне с людьми, машинами и расходами, а не
 * параметр продукта.
 *
 * Отсюда своя страница и своя строка в меню. Старый адрес
 * (`/owner/settings?s=services`) уводит сюда переадресацией: ссылки на
 * прейскурант человек мог сохранить, и ломать их незачем.
 *
 * Порядок на странице тот же, в каком задают вопросы:
 *
 *   сколько их всего и почём в среднем → строка под заголовком;
 *   что именно и что из этого берут    → список;
 *   как поменять цену                  → панель по нажатию на строку.
 */
export default async function ServicesPage() {
  const t = await getDict();
  const session = await requireOwner();
  /* Слова бизнеса — на языке того, кто смотрит. Переводятся только
     заводские: своё название владельца проходит насквозь (см. terms.ts).
     Копия уходит ТОЛЬКО на экран, в базу отсюда ничего не пишется. */
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

  const rows: ServiceRow[] = services.map((s) => ({
    id: s.id,
    name: s.name,
    price: toMajor(s.price, tenant.currency),
    display: formatAmount(s.price, tenant.currency, t.locale),
    count: sold.get(s.id)?.count ?? 0,
    revenue: money(sold.get(s.id)?.revenue ?? 0),
  }));

  const cars = month.reduce((sum, m) => sum + m.count, 0);
  const revenue = month.reduce((sum, m) => sum + m.revenue, 0);
  const avgPrice = services.length
    ? Math.round(services.reduce((sum, s) => sum + s.price, 0) / services.length)
    : 0;

  return (
    <>
      <PageHead title={t.settings.tabServices} meta={t.settings.servicesLead}>
        <AddService currencySymbol={symbol} step={step} />
      </PageHead>

      {/* Операционная строка вместо карточек: сколько услуг в
          прейскуранте, по какой средней цене и что он принёс за месяц.
          Числа справочные, и весить как показания им незачем — иначе
          над списком, ради которого сюда пришли, встаёт ряд равных ему
          по громкости плиток. */}
      {services.length > 0 && (
        <p className="quick">
          <b className="num">{services.length}</b> {t.owner.colService.toLocaleLowerCase(t.locale)}
          {avgPrice > 0 && (
            <>
              <i />
              {t.owner.avgShort} <b className="num">{money(avgPrice)}</b>
            </>
          )}
          {cars > 0 && (
            <>
              <i />
              {unitCount(cars, tenant.unitOne, t.locale)}
              <i />
              <b className="num">{money(revenue)}</b>{' '}
              {t.owner.periodMonth.toLocaleLowerCase(t.locale)}
            </>
          )}
        </p>
      )}

      <div className={services.length > 0 ? 'mt-[var(--seam)]' : ''}>
        <ServiceList rows={rows} step={step} currencySymbol={symbol} />
      </div>
    </>
  );
}
