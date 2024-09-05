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
const extract_1 = require("./util/extract");
const strings_1 = require("./local/strings");
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
                data: [],
            }
        };
        reply.send(response);
        return;
    }
});
exports.app.options("/submit/:formId", async (_, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Headers', 'Content-Type');
    return reply.send();
});
exports.app.post("/submit/:formId", async (req, res) => {
    await (0, config_1.fetchRemoteConfig)();
    const form = (0, config_1.getConfig)().forms[req.params.formId];
    if (!form) {
        const response = {
            success: false,
            message: "The form you're trying to submit wasn't found.",
        };
        res.send(response);
        return;
    }
    if (typeof form.validOrigin === 'string')
        form.validOrigin = [form.validOrigin];
    let origins = [];
    if (req.headers.origin?.includes(',')) {
        origins = req.headers.origin.split(',').map(v => v.trim());
    }
    else if (req.headers.origin) {
        origins = [req.headers.origin];
    }
    if (form.validOrigin.some(validOrigin => origins.includes(validOrigin))) {
        res.header('Access-Control-Allow-Origin', req.headers.origin);
        res.header('Access-Control-Allow-Headers', 'Content-Type');
    }
    else {
        const response = {
            success: false,
            message: "Invalid origin.",
        };
        res.send(response);
        return;
    }
    const body = Object.fromEntries(Object.keys(req.body).map((key) => [key, req.body[key].value]));
    form.mode = form.mode && config_1.FormModes.includes(form.mode) ? form.mode : 'generic';
    let { preferences, formInvalidResponse, formSuccessResponse, formCriticalFailureResponse } = require(`./modes/${form.mode}`);
    const fieldKey = preferences?.fieldKey ?? form.fieldKey;
    const fields = fieldKey ? (body[fieldKey] ?? (0, extract_1.extractFields)(body, fieldKey)) : req.body;
    const fieldDefinitions = form.fields;
    if (!fields || typeof fields !== 'object' || Object.keys(fields).length === 0) {
        const requiredFields = Object.entries(fieldDefinitions).filter(([, field]) => !!field.required).map(([name]) => name);
        const errors = Object.fromEntries(requiredFields.map(name => [name, strings_1.REQUIRED_FIELD_ERROR]));
        const { code, data } = formInvalidResponse(null, errors);
        res.status(code).send(data);
        return;
    }
    const errors = (0, validation_1.validateFields)(fields, fieldDefinitions);
    if (Object.keys(errors).length > 0) {
        const { code, data } = formInvalidResponse(null, errors);
        res.status(code).send(data);
        return;
    }
    if (Object.keys(fields).some((name) => !fieldDefinitions[name])) {
        const { code, data } = formInvalidResponse(form.errorMessage);
        res.status(code).send(data);
    }
    if (process_1.env.HCAPTCHA_ENABLED === 'true') {
        const { "h-captcha-response": token } = req.body;
        const result = await (0, captcha_1.validateCaptcha)(token);
        if (!result.success) {
            const { code, data } = formInvalidResponse();
            res.status(code).send(data);
            return;
        }
    }
    const html = Object.entries(fields).map(([key, value]) => {
        const label = fieldDefinitions[key].label ?? key;
        const realValue = value?.value ?? (value?.toString ? value.toString() : '');
        const cleanValue = (0, sanitize_html_1.default)(realValue);
        if (key === 'message') {
            return `<br><b>${label}</b>:<br> ${cleanValue}<br>`;
        }
        else {
            return `<b>${label}</b>: ${cleanValue}<br>`;
        }
    }).join('\n');
    const nameFieldKey = Object.entries(fieldDefinitions).find(([, { as }]) => as === 'name')?.[0] ?? 'name';
    const emailFieldKey = Object.entries(fieldDefinitions).find(([, { as }]) => as === 'email')?.[0] ?? 'email';
    let fromName = fields.name ?? fields[nameFieldKey] ?? strings_1.GENERIC_FROM_NAME;
    let replyToAddress = fields.email ?? fields[emailFieldKey] ?? process_1.env.SMTP_FROM;
    if (fromName.value)
        fromName = fromName.value;
    if (replyToAddress.value)
        replyToAddress = replyToAddress.value;
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
        const { code, data } = formSuccessResponse(form.successMessage);
        res.status(code).send(data);
    }
    catch (e) {
        console.error(e);
        const { code, data } = formCriticalFailureResponse(form.successMessage);
        res.status(code).send(data);
    }
});
exports.app.get('/', async (_, res) => {
    return res.type('text/html').send('Schoodic Mailer / powered by Fastify');
});
