import Fastify, { FastifyReply, FastifyRequest } from "fastify";
import multipart from '@fastify/multipart';

import sanitizeHtml from "sanitize-html";

import { env } from "process";
import { kv } from "@vercel/kv"
import { Ratelimit } from '@upstash/ratelimit';

import { fetchRemoteConfig, FormModes, getConfig } from "./config";
import { sendMailPromise } from "./util/mail";
import { validateCaptcha } from "./util/captcha";
import { validateFields } from "./util/validation";
import { extractFields } from "./util/extract";
import { FormModeDefinition } from "./types/form-mode-definition";
import { GENERIC_FROM_NAME, REQUIRED_FIELD_ERROR } from "./local/strings";

interface FormSubmissionResponse {
    success: boolean;
    data: {
        message: string;
        errors?: Record<string, string>;
        data?: any[];
    };
}

const ratelimit = new Ratelimit({
    redis: kv,
    limiter: Ratelimit.slidingWindow(5, '10 s')
});
export const app = Fastify();

app.register(multipart, { attachFieldsToBody: true });

app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const { success } = await ratelimit.limit(
        request.ip + (request.headers['origin'] ?? 'no-origin'),
    );

    if (!success) {
        const response: FormSubmissionResponse = {
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

app.options("/submit/:formId", async (_, reply: FastifyReply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Headers', 'Content-Type');
    return reply.send();
});


app.post<{ Params: { formId: string }, Body: Record<string, any> }>("/submit/:formId", async (req, res) => {
    await fetchRemoteConfig();

    const form = getConfig().forms[req.params.formId];

    if (!form) {
        const response = {
            success: false,
            message: "The form you're trying to submit wasn't found.",
        }
        res.send(response);
        return;
    }

    if (typeof form.validOrigin === 'string') form.validOrigin = [form.validOrigin];
    let origins: string[] = [];

    if (req.headers.origin?.includes(',')) {
        origins = req.headers.origin.split(',').map(v => v.trim());
    } else if (req.headers.origin) {
        origins = [req.headers.origin];
    }
    
    if (form.validOrigin.some(validOrigin => origins.includes(validOrigin))) {
        res.header('Access-Control-Allow-Origin', req.headers.origin!);
        res.header('Access-Control-Allow-Headers', 'Content-Type');
    } else {
        const response = {
            success: false,
            message: "Invalid origin.",
        }
        res.send(response);
        return;
    }

    const body = Object.fromEntries(
      Object.keys(req.body).map((key) => [key, req.body[key].value])
    )

    form.mode = form.mode && FormModes.includes(form.mode) ? form.mode : 'generic';
    let { preferences, formInvalidResponse, formSuccessResponse, formCriticalFailureResponse } = require(`./modes/${form.mode}`) as FormModeDefinition;

    const fieldKey = preferences?.fieldKey ?? form.fieldKey;

    const fields: Record<string, any> = fieldKey ? (body[fieldKey] ?? extractFields(body, fieldKey)) : req.body;
    const fieldDefinitions = form.fields;

    if (!fields || typeof fields !== 'object' || Object.keys(fields).length === 0) {
        const requiredFields = Object.entries(fieldDefinitions).filter(([, field]) => !!field.required).map(([name]) => name);
        const errors = Object.fromEntries(requiredFields.map(name => [name, REQUIRED_FIELD_ERROR]));

        const { code, data } = formInvalidResponse(null, errors);
        res.status(code).send(data);

        return;
    }

    const errors: Record<string, string> = validateFields(fields, fieldDefinitions);

    if (Object.keys(errors).length > 0) {
        const { code, data } = formInvalidResponse(null, errors);
        res.status(code).send(data);
        return;
    }

    /* if (Object.keys(fields).some((name) => !fieldDefinitions[name])) {
        const { code, data } = formInvalidResponse(form.errorMessage);
        res.status(code).send(data);
    } */

    if (env.HCAPTCHA_ENABLED === 'true') {
        const { "h-captcha-response": token } = req.body;

        const result = await validateCaptcha(token);
        if (!result.success) {
            const { code, data }= formInvalidResponse();
            res.status(code).send(data);
            return;
        }
    }
    
    const html = Object.entries(fields).filter(
        ([key]) => Object.keys(fieldDefinitions).includes(key)
    ).map(
        ([key, value]) => {
            const label = fieldDefinitions[key].label ?? key;
            const realValue = value?.value ?? (value?.toString ? value.toString() : '');
            const cleanValue = sanitizeHtml(realValue);
            if (key === 'message') {
                return `<br><b>${label}</b>:<br> ${cleanValue}<br>`;
            } else {
                return `<b>${label}</b>: ${cleanValue}<br>`;
            }
        }
    ).join('\n');

    const nameFieldKey: string = Object.entries(fieldDefinitions).find(([, { as }]) => as === 'name')?.[0] ?? 'name';
    const emailFieldKey: string = Object.entries(fieldDefinitions).find(([, { as }]) => as === 'email')?.[0] ?? 'email';

    let fromName = fields.name ?? fields[nameFieldKey] ?? GENERIC_FROM_NAME;
    let replyToAddress = fields.email ?? fields[emailFieldKey] ?? env.SMTP_FROM!;

    if (fromName.value) fromName = fromName.value;
    if (replyToAddress.value) replyToAddress = replyToAddress.value;

    try {
        await sendMailPromise({
            from: `${fromName} <${env.SMTP_FROM}>`,
            to: form.recipient ?? env.SMTP_RCPT,
            subject: form.subject ?? env.SMTP_SUBJECT,
            headers: {
                'Reply-To': `${fromName} <${replyToAddress}>`,
            },
            html,
            // attachments: file ? [{
            //     filename: file,
            //      content: data.file,
            // }] : undefined,
        });

        const { code, data } = formSuccessResponse(form.successMessage);
        res.status(code).send(data);
    } catch (e: unknown) {
        console.error(e);
        const { code, data } = formCriticalFailureResponse(form.successMessage);
        res.status(code).send(data);
    }
});

app.get('/', async (_, res) => {
    return res.type('text/html').send('Schoodic Mailer / powered by Fastify')
})