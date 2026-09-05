import { BRAND } from './brand';
import type { Locale } from './i18n';

/**
 * Письма входа: подтверждение почты и восстановление пароля.
 *
 * Текст лежит здесь, а не в общих словарях, и это не небрежность. Общие
 * словари едут в браузер: всё, что там написано, попадает в бандл
 * страницы. Письма шлёт только сервер, и трём языкам писем незачем
 * весить у каждого посетителя витрины.
 *
 * Разметки нет. Письмо из одной строки и одной ссылки читается в любом
 * почтовике, не попадает в «промоакции» за картинки и не ломается в
 * тёмной теме. Как только письмам понадобится вид, у них появится своя
 * вёрстка — но не раньше, чем понадобится.
 *
 * Про срок в тексте сказано словами: человек, открывший письмо назавтра,
 * должен понять, почему ссылка не сработала, не обращаясь в поддержку.
 */

type Letter = { subject: string; text: string };

const HOUR: Record<Locale, string> = {
  hy: 'Հղումը գործում է 1 ժամ։',
  ru: 'Ссылка действует 1 час.',
  en: 'The link is valid for 1 hour.',
};

const IGNORE: Record<Locale, string> = {
  hy: 'Եթե դուք չեք խնդրել, պարզապես անտեսեք այս նամակը։',
  ru: 'Если вы этого не просили, просто не отвечайте на письмо.',
  en: 'If you did not request this, simply ignore this email.',
};

/** Письмо с подтверждением почты при регистрации. */
export function confirmLetter(locale: Locale, link: string): Letter {
  const body: Record<Locale, Letter> = {
    hy: {
      subject: `${BRAND}: հաստատեք ձեր հասցեն`,
      text: `Բարև։\n\nՀաստատեք ձեր էլ. հասցեն, և բիզնեսը կստեղծվի։\n\n${link}\n\n${HOUR.hy}\n${IGNORE.hy}`,
    },
    ru: {
      subject: `${BRAND}: подтвердите адрес`,
      text: `Здравствуйте.\n\nПодтвердите адрес почты, и бизнес будет создан.\n\n${link}\n\n${HOUR.ru}\n${IGNORE.ru}`,
    },
    en: {
      subject: `${BRAND}: confirm your email`,
      text: `Hello.\n\nConfirm your email address and your business will be created.\n\n${link}\n\n${HOUR.en}\n${IGNORE.en}`,
    },
  };
  return body[locale] ?? body.hy;
}

/** Письмо восстановления пароля. */
export function resetLetter(locale: Locale, link: string): Letter {
  const body: Record<Locale, Letter> = {
    hy: {
      subject: `${BRAND}: նոր գաղտնաբառ`,
      text: `Բարև։\n\nՆոր գաղտնաբառ սահմանելու համար անցեք հղումով։\n\n${link}\n\n${HOUR.hy}\n${IGNORE.hy}`,
    },
    ru: {
      subject: `${BRAND}: новый пароль`,
      text: `Здравствуйте.\n\nЧтобы задать новый пароль, перейдите по ссылке.\n\n${link}\n\n${HOUR.ru}\n${IGNORE.ru}`,
    },
    en: {
      subject: `${BRAND}: new password`,
      text: `Hello.\n\nFollow the link to set a new password.\n\n${link}\n\n${HOUR.en}\n${IGNORE.en}`,
    },
  };
  return body[locale] ?? body.hy;
}

/** Письмо о смене адреса: уходит на НОВЫЙ адрес. */
export function emailChangeLetter(locale: Locale, link: string): Letter {
  const body: Record<Locale, Letter> = {
    hy: {
      subject: `${BRAND}: հաստատեք նոր հասցեն`,
      text: `Բարև։\n\nՀաստատեք նոր էլ. հասցեն։ Մինչ այդ մուտքը մնում է հին հասցեով։\n\n${link}\n\n${HOUR.hy}\n${IGNORE.hy}`,
    },
    ru: {
      subject: `${BRAND}: подтвердите новый адрес`,
      text: `Здравствуйте.\n\nПодтвердите новый адрес почты. До этого вход остаётся по старому.\n\n${link}\n\n${HOUR.ru}\n${IGNORE.ru}`,
    },
    en: {
      subject: `${BRAND}: confirm your new email`,
      text: `Hello.\n\nConfirm your new email address. Until then, sign in with the old one.\n\n${link}\n\n${HOUR.en}\n${IGNORE.en}`,
    },
  };
  return body[locale] ?? body.hy;
}
