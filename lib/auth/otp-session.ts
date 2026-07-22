// sessionStorage keys shared between /login, /signup, and /login/verify —
// centralized so the phone-OTP handoff between those pages can't drift out of sync.
export const OTP_VERIFICATION_ID_KEY = "otp_verification_id";
export const OTP_PHONE_KEY = "otp_phone";
export const OTP_FULL_NAME_KEY = "otp_full_name";
export const OTP_EMAIL_KEY = "otp_email";
export const OTP_INTENT_KEY = "otp_intent";

export type OtpIntent = "login" | "register";
