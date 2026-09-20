/**
 * Код из письма. Длину задаёт Supabase (Authentication → Email OTP Length),
 * и она бывает не только шестизначной: поле не должно обрезать чужую настройку,
 * иначе введённый код заведомо не сойдётся.
 */
export const OTP_MIN = 6
export const OTP_MAX = 10

/** Оставляем только цифры и не даём ввести больше, чем Supabase вообще присылает. */
export const otpDigits = (value:string) => value.replace(/\D/g, '').slice(0, OTP_MAX)

/** Код готов к проверке. */
export const isOtpReady = (code:string) => code.length >= OTP_MIN && code.length <= OTP_MAX
