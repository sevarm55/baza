import type { AuthDict } from './auth-hy';

/** English. Same shape as Armenian — TypeScript will not let a key slip. */
export const authEn: AuthDict = {
  brand: 'Tetrin',

  login: {
    title: 'Welcome back',
    subtitle: 'Sign in to continue',
    phone: 'Phone number',
    pin: 'PIN code',
    submit: 'Sign in',
    submitting: 'Signing in…',
    forgot: 'Forgot your PIN?',
    welcomeBack: 'Welcome back',
    tapAvatar: 'Tap your avatar to sign in',
    anotherAccount: 'Use a different number',
    rememberedExpired: 'Your saved sign-in expired. Enter your phone and PIN.',
  },

  register: {
    title: 'Create your car wash',
    subtitle: 'Setup takes less than a minute',
    businessName: 'Car wash name',
    ownerName: 'Your name',
    phone: 'Phone number',
    pin: 'Create a PIN',
    pinHint: 'Use 6 digits you will remember',
    submit: 'Continue',
    submitting: 'Sending…',
    freeDays: (days: number) => `${days} days free. No card needed.`,
    haveAccount: 'Already have an account?',
  },

  otp: {
    title: 'Confirm your number',
    description: (phone: string) => `We sent a code to ${phone}`,
    code: 'Code from SMS',
    verify: 'Confirm',
    verifying: 'Checking…',
    resend: 'Send the code again',
    resendIn: (mmss: string) => `Send again in ${mmss}`,
    resendsLeft: (n: number) => `${n} attempts left`,
    changePhone: 'Change number',
    success: 'All set',
  },

  stepUp: {
    title: 'Extra check',
    description: (phone: string) =>
      `Sign-in from an unfamiliar device. We sent a code to ${phone}`,
  },

  forgotPin: {
    title: 'Reset your PIN',
    subtitle: 'Enter your number — we will send a confirmation code',
    newPin: 'New PIN',
    newPinHint: 'Use 6 digits you will remember',
    submit: 'Send the code',
    save: 'Save the new PIN',
    done: 'PIN changed',
    doneNote: 'All other devices have been signed out.',
    backToLogin: 'Back to sign in',
  },

  tabs: {
    signIn: 'Sign in',
    register: 'Sign up',
  },

  pin: {
    groupLabel: (n: number) => `PIN code, ${n} digits`,
    otpGroupLabel: (n: number) => `Confirmation code, ${n} digits`,
    show: 'Show code',
    hide: 'Hide code',
    entered: (n: number, total: number) => `${n} of ${total} entered`,
  },

  phone: {
    country: 'Country code',
    label: 'Phone number',
  },

  errors: {
    invalidCredentials: 'Could not sign in. Check your phone number and PIN.',
    tooManyAttempts: (minutes: number) => `Too many attempts. Try again in ${minutes} min.`,
    network: 'Connection problem. Please try again.',
    server: 'Something went wrong. Please try again.',
    offline: 'No internet connection',
    otpInvalid: 'That code is wrong',
    otpExpired: 'The code expired. Ask for a new one.',
    otpTooMany: 'Too many attempts. Ask for a new code.',
    otpResendTooSoon: 'Wait a moment before asking for a new code',
    smsFailed: 'Could not send the SMS. Try again shortly.',
    phoneTaken: 'That number is already registered',
    badPhone: 'Invalid phone number',
    pinLength: 'The PIN must be 6 digits',
    pinTrivial: 'Pick a less obvious PIN',
    required: 'Fill in every field',
  },

  security: {
    verifyPhone: 'Confirm your number',
    verifyPhoneNote:
      'Without a confirmed number your PIN cannot be recovered. Takes half a minute.',
    verifyNow: 'Confirm',
    later: 'Later',
    verified: 'Number confirmed',
  },
};
