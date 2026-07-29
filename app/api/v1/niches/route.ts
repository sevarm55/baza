import { ACTIVE_NICHES } from '@/lib/niches';
import { ok } from '@/lib/api/respond';

/**
 * Типы бизнеса для экрана регистрации.
 *
 * Единственный открытый эндпоинт без токена: его спрашивают до того, как
 * аккаунт вообще существует. Отдаёт только включённые ниши — тот же
 * фильтр, что на лендинге, из того же конфига. Приложение не должно
 * знать, какие ниши бывают: это данные, а не код.
 */
export function GET() {
  return ok({
    niches: ACTIVE_NICHES.map((n) => ({
      key: n.key,
      icon: n.icon,
      name: n.name,
      tag: n.tag,
      defaultName: n.name,
    })),
  });
}
