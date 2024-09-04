"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateCaptcha = void 0;
const process_1 = require("process");
const validateCaptcha = (token) => {
    if (!process_1.env.HCAPTCHA_SECRET_KEY)
        throw new Error("HCAPTCHA_SECRET_KEY is not defined");
    if (!process_1.env.HCAPTCHA_VERIFY_API)
        throw new Error("HCAPTCHA_VERIFY_API is not defined");
    const hcaptchaBody = new FormData();
    hcaptchaBody.append('secret', process_1.env.HCAPTCHA_SECRET_KEY);
    hcaptchaBody.append('response', token);
    return fetch(process_1.env.HCAPTCHA_VERIFY_API, {
        method: 'POST',
        body: hcaptchaBody,
    }).then(res => res.json());
};
exports.validateCaptcha = validateCaptcha;
