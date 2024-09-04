"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const fastify_1 = __importDefault(require("fastify"));
const multipart_1 = __importDefault(require("@fastify/multipart"));
const sanitize_html_1 = __importDefault(require("sanitize-html"));
const process_1 = require("process");
const kv_1 = require("@vercel/kv");
const ratelimit_1 = require("@upstash/ratelimit");
const config_1 = require("./config");
const mail_1 = require("./util/mail");
const captcha_1 = require("./util/captcha");
const validation_1 = require("./util/validation");
const ratelimit = new ratelimit_1.Ratelimit({
    redis: kv_1.kv,
    limiter: ratelimit_1.Ratelimit.slidingWindow(5, '10 s')
});
exports.app = (0, fastify_1.default)();
exports.app.register(multipart_1.default, { attachFieldsToBody: true });
exports.app.addHook("onRequest", async (request, reply) => {
    const { success } = await ratelimit.limit(request.ip + (request.headers['origin'] ?? 'no-origin'));
    if (!success) {
        const response = {
            success: false,
            data: {
                message: "Rate limit exceeded. Please try again later.",
            }
        };
        reply.status(429).send(response);
        return;
    }
});
exports.app.options("/submit/:formId", async (_, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Headers', 'Content-Type');
    return reply.status(200).send();
});
const extractFields = (body, fieldKey) => {
    const fields = {};
    for (const [key, value] of Object.entries(body)) {
        const match = key.substring(0, fieldKey.length + 1) === fieldKey + '[' && key[key.length - 1] === ']';
        if (match) {
            fields[key.substring(fieldKey.length + 1, key.length - 1)] = value;
        }
    }
    return fields;
};
exports.app.post("/submit/:formId", async (req, res) => {
    await (0, config_1.fetchRemoteConfig)();
    const formId = req.params.formId;
    const form = (0, config_1.getConfig)().forms[formId];
    if (!form) {
        const response = {
            success: false,
            data: {
                message: "The form you're trying to submit wasn't found.",
            }
        };
        res.status(404).send(response);
        return;
    }
    if (form.validOrigin.includes(req.headers.origin)) {
        res.header('Access-Control-Allow-Origin', req.headers.origin);
        res.header('Access-Control-Allow-Headers', 'Content-Type');
    }
    else {
        const response = {
            success: false,
            data: {
                message: "Invalid origin.",
            }
        };
        res.status(403).send(response);
        return;
    }
    const body = Object.fromEntries(Object.keys(req.body).map((key) => [key, req.body[key].value]));
    const formFields = form.fieldKey ? body[form.fieldKey] ?? extractFields(body, form.fieldKey) : req.body;
    if (!formFields || typeof formFields !== 'object' || Object.keys(formFields).length === 0) {
        const requiredFields = Object.entries(form.fields).filter(([, field]) => !!field.required).map(([name]) => name);
        const response = {
            "success": false,
            "data": {
                "message": "Your submission failed because of an error.",
                "errors": Object.fromEntries(requiredFields.map(name => [name, "This field is required."])),
            }
        };
        res.status(400).send(response);
        return;
    }
    const errors = {};
    for (const [name, field] of Object.entries(form.fields)) {
        if (field.required && (!formFields[name] || formFields[name].toString().trim() === '')) {
            errors[name] = "This field is required.";
        }
        const { valid, message } = (0, validation_1.validateField)(field, formFields[name]);
        if (!valid) {
            errors[name] = message ?? 'Invalid field value';
        }
    }
    if (Object.keys(errors).length > 0) {
        const response = {
            "success": false,
            "data": {
                "message": "Your submission failed because of an error.",
                "errors": errors,
            }
        };
        res.status(400).send(response);
        return;
    }
    if (Object.keys(formFields).some((name) => !form.fields[name])) {
        const response = {
            "success": false,
            "data": {
                "message": "Your submission failed because of an error.",
            }
        };
        res.status(400).send(response);
    }
    if (process_1.env.HCAPTCHA_ENABLED === 'true') {
        const { "h-captcha-response": token } = req.body;
        const result = await (0, captcha_1.validateCaptcha)(token);
        if (!result.success) {
            res.status(400).send({ error: "Invalid captcha" });
            return;
        }
    }
    const html = Object.entries(formFields).map(([key, value]) => {
        const cleanValue = typeof value === 'string' ? (0, sanitize_html_1.default)(value) : value?.toString ? (0, sanitize_html_1.default)(value.toString()) : '<invalid value>';
        if (key === 'message') {
            return `<br><b>${key[0].toUpperCase() + key.slice(1)}</b>:<br> ${cleanValue}<br>`;
        }
        else {
            return `<b>${key[0].toUpperCase() + key.slice(1)}</b>: ${cleanValue}<br>`;
        }
    }).join('\n');
    const fromName = formFields.name?.toString() || 'Contact Form';
    const replyToAddress = formFields.email?.toString() || process_1.env.SMTP_FROM;
    try {
        await (0, mail_1.sendMailPromise)({
            from: `${fromName} <${process_1.env.SMTP_FROM}>`,
            to: form.recipient ?? process_1.env.SMTP_RCPT,
            subject: form.subject ?? process_1.env.SMTP_SUBJECT,
            headers: {
                'Reply-To': `${fromName} <${replyToAddress}>`,
            },
            html,
        });
        res.status(200).send({ success: true, message: form.successMessage });
    }
    catch (e) {
        console.error(e);
        res.status(500).send({ success: false, message: form.errorMessage });
    }
});
exports.app.get('/', async (_, res) => {
    return res.status(200).type('text/html').send('Schoodic Mailer / powered by Fastify');
});
