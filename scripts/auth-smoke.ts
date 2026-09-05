/**
 * Проверка входа по почте и паролю, целиком и на настоящей базе.
 *
 * Гоняет тот путь, которым пойдёт человек: заявка на регистрацию →
 * письмо → ссылка → бизнес → вход → неверный пароль → восстановление →
 * вход новым. Почтовик подменяется на перехватчик, поэтому ссылка
 * берётся ровно из того текста, который ушёл бы человеку, а не из базы:
 * в базе лежит только хеш, и проверять по нему значило бы проверять не
 * то, что читает получатель.
 *
 *   DATABASE_URL=... npx tsx scripts/auth-smoke.ts
 */
import { randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';

import { db } from '../lib/db';
import { accounts, tenants, users } from '../lib/db/schema';
import { __setMailProvider, type MailMessage } from '../lib/mail';
import {
  attemptLogin,
  beginPasswordReset,
  beginRegistration,
  changeOwnPassword,
  completePasswordReset,
  completeRegistration,
  issueStaffPassword,
} from '../lib/auth-password';
import { generatePassword } from '../lib/password';

const outbox: MailMessage[] = [];
__setMailProvider({
  name: 'test',
  async send(message) {
    outbox.push(message);
    return { ok: true, provider: 'test' };
  },
});

const signals = { agent: 'smoke', ip: '127.0.0.1' } as never;
const tag = randomBytes(4).toString('hex');
const email = `smoke.${tag}@example.com`;
const phone = `+3749${Math.floor(1000000 + Math.random() * 8999999)}`;
const password = 'Marmashen-77';

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? '  ок  ' : ' МИМО '} ${name}${detail === undefined ? '' : ` · ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

/** Достать ссылку из последнего письма — так же, как это сделает человек. */
function linkFromLastLetter(): string {
  const text = outbox.at(-1)?.text ?? '';
  return text.match(/https?:\/\/\S+/)?.[0] ?? '';
}

function tokenOf(link: string): string {
  return new URL(link).searchParams.get('t') ?? '';
}

async function main() {
  console.log(`почта ${email}, телефон ${phone}\n`);

  /* --- регистрация --- */
  const begun = await beginRegistration(
    {
      niche: 'carwash',
      businessName: `Мойка ${tag}`,
      ownerName: 'Севак',
      email,
      password,
      phone,
      locale: 'ru',
    },
    { ip: '127.0.0.1' },
  );
  check('заявка принята', begun.ok, begun.ok ? undefined : begun);
  check('письмо ушло одно', outbox.length === 1, outbox.length);

  const link = linkFromLastLetter();
  check('в письме есть ссылка', link.includes('/auth/confirm'), link.slice(0, 60));

  check(
    'до перехода по ссылке аккаунта нет',
    !(await db.select().from(accounts).where(sql`lower(${accounts.email}) = lower(${email})`))[0],
  );

  const done = await completeRegistration({ token: tokenOf(link), ip: '127.0.0.1', signals });
  check('бизнес заведён', done.ok, done.ok ? undefined : done);
  if (!done.ok) return finish();

  const second = await completeRegistration({ token: tokenOf(link), ip: '127.0.0.1', signals });
  check('вторая попытка по той же ссылке отбита', !second.ok);

  /* --- вход --- */
  const ok = await attemptLogin({ login: email, password, ip: '127.0.0.1', signals });
  check('вход по почте', ok.kind === 'ok', ok.kind);

  const upper = await attemptLogin({
    login: email.toUpperCase(),
    password,
    ip: '127.0.0.1',
    signals,
  });
  check('регистр адреса не мешает', upper.kind === 'ok', upper.kind);

  const wrong = await attemptLogin({ login: email, password: 'не тот', ip: '127.0.0.1', signals });
  check('неверный пароль отбит', wrong.kind === 'denied', wrong.kind);

  const nobody = await attemptLogin({
    login: `нет.${tag}@example.com`,
    password,
    ip: '127.0.0.1',
    signals,
  });
  check('незнакомый адрес отбит так же', nobody.kind === 'denied', nobody.kind);

  /* --- сотрудник: телефон и выданный пароль --- */
  const [account] = await db
    .select()
    .from(accounts)
    .where(sql`lower(${accounts.email}) = lower(${email})`);
  const [owner] = await db.select().from(users).where(eq(users.accountId, account.id));

  const staffPhone = `+3749${Math.floor(1000000 + Math.random() * 8999999)}`;
  const [staffAccount] = await db
    .insert(accounts)
    .values({ phone: staffPhone, passwordHash: null })
    .returning();
  const [staff] = await db
    .insert(users)
    .values({
      tenantId: owner.tenantId,
      accountId: staffAccount.id,
      phone: staffPhone,
      name: 'Карен',
      role: 'staff',
      percent: 40,
    })
    .returning();

  const noPass = await attemptLogin({
    login: staffPhone,
    password: 'что угодно',
    ip: '127.0.0.1',
    signals,
  });
  check('без выданного пароля сотрудник не входит', noPass.kind === 'denied', noPass.kind);

  const issued = generatePassword();
  const gave = await issueStaffPassword({
    membershipId: staff.id,
    password: issued,
    byAccountId: account.id,
    ip: '127.0.0.1',
  });
  check('владелец выдал пароль', gave.ok, gave.ok ? undefined : gave);

  const staffIn = await attemptLogin({
    login: staffPhone,
    password: issued,
    ip: '127.0.0.1',
    signals,
  });
  check('сотрудник вошёл по телефону', staffIn.kind === 'ok', staffIn.kind);

  /* --- восстановление --- */
  outbox.length = 0;
  const reset = await beginPasswordReset({ email, ip: '127.0.0.1', locale: 'ru' });
  check('восстановление принято', reset.ok, reset.ok ? undefined : reset);
  check('письмо восстановления ушло', outbox.length === 1, outbox.length);

  const resetLink = linkFromLastLetter();
  check('ссылка ведёт на сброс', resetLink.includes('/auth/reset'), resetLink.slice(0, 60));

  const nextPassword = 'Arshakunyats-24';
  const reset2 = await completePasswordReset({
    token: tokenOf(resetLink),
    password: nextPassword,
    ip: '127.0.0.1',
  });
  check('новый пароль принят', reset2.ok, reset2.ok ? undefined : reset2);

  const oldGone = await attemptLogin({ login: email, password, ip: '127.0.0.1', signals });
  check('старый пароль больше не пускает', oldGone.kind === 'denied', oldGone.kind);

  const newIn = await attemptLogin({
    login: email,
    password: nextPassword,
    ip: '127.0.0.1',
    signals,
  });
  check('новый пароль пускает', newIn.kind === 'ok', newIn.kind);

  /* --- смена своего пароля --- */
  const wrongCurrent = await changeOwnPassword({
    accountId: account.id,
    current: 'не тот',
    next: 'Hrazdan-91',
    ip: null,
  });
  check(
    'без текущего пароля сменить нельзя',
    !wrongCurrent.ok && wrongCurrent.problem === 'WRONG_CURRENT',
  );

  const shortOne = await changeOwnPassword({
    accountId: account.id,
    current: nextPassword,
    next: 'коротк',
    ip: null,
  });
  check('короткий пароль отбит', !shortOne.ok && shortOne.problem === 'PASSWORD_SHORT');

  const changed = await changeOwnPassword({
    accountId: account.id,
    current: nextPassword,
    next: 'Hrazdan-91',
    ip: null,
  });
  check('пароль сменён', changed.ok, changed.ok ? undefined : changed);

  /* --- уборка --- */
  await db.delete(tenants).where(eq(tenants.id, owner.tenantId));
  await db.delete(accounts).where(eq(accounts.id, account.id));
  await db.delete(accounts).where(eq(accounts.id, staffAccount.id));
  console.log('\nвременный бизнес и оба человека удалены');

  finish();
}

function finish() {
  console.log(failures === 0 ? '\nвсё сошлось' : `\nне сошлось: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
