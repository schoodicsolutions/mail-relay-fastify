import { env } from "process";

export const validateCaptcha = (token: string) => {
    if (!env.HCAPTCHA_SECRET_KEY) throw new Error("HCAPTCHA_SECRET_KEY is not defined");
    if (!env.HCAPTCHA_VERIFY_API) throw new Error("HCAPTCHA_VERIFY_API is not defined");

    const hcaptchaBody = new FormData();

    hcaptchaBody.append('secret', env.HCAPTCHA_SECRET_KEY);
    hcaptchaBody.append('response', token);

    return fetch(env.HCAPTCHA_VERIFY_API, {
        method: 'POST',
        body: hcaptchaBody,
    }).then(
        res => res.json()
    );
};