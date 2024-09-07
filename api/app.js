"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const fastify_1 = __importDefault(require("fastify"));
const multipart_1 = __importDefault(require("@fastify/multipart"));
const process_1 = require("process");
const kv_1 = require("@vercel/kv");
const ratelimit_1 = require("@upstash/ratelimit");
const config_1 = require("./config");
const mail_1 = require("./util/mail");
const captcha_1 = require("./util/captcha");
const validation_1 = require("./util/validation");
const extract_1 = require("./util/extract");
const strings_1 = require("./local/strings");
const loadModeDefinition_1 = require("./util/loadModeDefinition");
const ratelimit = new ratelimit_1.Ratelimit({
    redis: kv_1.kv,
    limiter: ratelimit_1.Ratelimit.slidingWindow(5, '10 s')
});
exports.app = (0, fastify_1.default)();
exports.app.register(multipart_1.default, { attachFieldsToBody: true });
exports.app.addHook("onRequest", async (request, reply) => {
    const { success } = await ratelimit.limit(request.ip + (request.headers['origin'] ?? 'no-origin'));
    if (!success) {
        const { code, data } = {
            code: 429,
            data: {
                success: false,
                message: "Rate limit exceeded.",
            }
        };
        reply.status(code).send(data);
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
    let { preferences, formInvalidResponse, formSuccessResponse, formCriticalFailureResponse } = (0, loadModeDefinition_1.loadModeDefinition)(form.mode);
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
    if (process_1.env.HCAPTCHA_ENABLED === 'true') {
        const { "h-captcha-response": token } = req.body;
        const result = await (0, captcha_1.validateCaptcha)(token);
        if (!result.success) {
            const { code, data } = formInvalidResponse();
            res.status(code).send(data);
            return;
        }
    }
    try {
        await (0, mail_1.sendEmail)({ fields, form });
        const { code, data } = formSuccessResponse(form.successMessage, form);
        res.status(code).send(data);
    }
    catch (e) {
        console.error(e);
        const { code, data } = formCriticalFailureResponse(form.successMessage, form);
        res.status(code).send(data);
    }
});
exports.app.get('/', async (_, res) => {
    return res.type('text/html').send('Schoodic Mailer / powered by Fastify');
});
