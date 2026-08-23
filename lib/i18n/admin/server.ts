import 'server-only';
import { getLocale } from '../server';
import { adminDict, type AdminDict } from './index';

export async function getAdminDict(): Promise<AdminDict> {
  return adminDict(await getLocale());
}
