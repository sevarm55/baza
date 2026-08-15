'use client';

import { useActionState } from 'react';
import { registerBusiness, type FormState } from '@/app/actions';
import { PinInput } from '@/components/pin-input';
import { TRIAL_DAYS } from '@/lib/plan';
import { useT } from '@/lib/i18n/client';

export function RegisterForm({
  nicheKey,
  defaultName,
}: {
  nicheKey: string;
  defaultName: string;
}) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(
    registerBusiness,
    null,
  );

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="niche" value={nicheKey} />

      {/* Название мойки и имя владельца — в одну строку. Оба коротких, оба
          заполняются один раз в жизни, и каждое собственной строкой
          растягивало форму на целый экран: между вкладками и первым полем
          оставалась пустота, а кнопка входа уезжала под сгиб. Рядом они
          занимают одну строку вместо двух и читаются парой, какой и
          являются: чей бизнес и кто им владеет. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2">
          <span className="label">{t.onboarding.bizName}</span>
          <input
            className="field auth-field !text-[16px]"
            name="businessName"
            defaultValue={defaultName}
            required
            autoComplete="organization"
          />
        </label>

        <label className="grid gap-2">
          <span className="label">{t.onboarding.ownerName}</span>
          <input className="field auth-field !text-[16px]" name="ownerName" required autoComplete="name" />
        </label>
      </div>

      <label className="grid gap-2">
        <span className="label">{t.auth.phone}</span>
        <div className="relative">
          <span className="num pointer-events-none absolute inset-y-0 start-4 flex items-center text-[16px] text-faint">
            +374
          </span>
          <input
            className="field auth-field num !ps-[4.4rem] !text-[16px]"
            name="phone"
            type="tel"
            inputMode="tel"
            placeholder="77 123 456"
            required
            autoComplete="tel"
          />
        </div>
      </label>

      <label className="grid gap-2">
        <span className="label">
          {t.auth.pin} · {t.auth.pinHint}
        </span>
        {/* Здесь без авто-отправки: регистрация — не то действие, которое
            должно случаться от последней набранной цифры. */}
        <PinInput submitOnComplete={false} />
      </label>

      {state?.error && <p className="alert">{state.error}</p>}

      <div className="mt-1 grid gap-2">
        <button className="btn" disabled={pending}>
          {pending ? t.common.loading : t.onboarding.createAndStart}
        </button>
        <p className="text-center text-[13.5px] text-faint">
          {t.onboarding.freeDays(TRIAL_DAYS)}
        </p>
      </div>
    </form>
  );
}
