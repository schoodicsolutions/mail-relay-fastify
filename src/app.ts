import Fastify, { FastifyReply, FastifyRequest } from "fastify";
import multipart from '@fastify/multipart';

import sanitizeHtml from "sanitize-html";

import { env } from "process";
import { kv } from "@vercel/kv"
import { Ratelimit } from '@upstash/ratelimit';

import { fetchRemoteConfig, FormModes, getConfig } from "./config";
import { sendMailPromise } from "./util/mail";
import { validateCaptcha } from "./util/captcha";
import { validateField } from "./util/validation";
import { extractFields } from "./util/extract";
import { FormModeDefinition } from "./types/form-mode-definition";
import { GENERIC_FROM_NAME, INVALID_FIELD_ERROR, REQUIRED_FIELD_ERROR } from "./strings";

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
            data: {
                message: "The form you're trying to submit wasn't found.",
                data: [],
            }
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
            data: {
                message: "Invalid origin.",
                data: [],
            }
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

    const formFields: Record<string, any> = fieldKey ? body[fieldKey] ?? extractFields(body, fieldKey) : req.body;

    if (!formFields || typeof formFields !== 'object' || Object.keys(formFields).length === 0) {
        const requiredFields = Object.entries(form.fields).filter(([, field]) => !!field.required).map(([name]) => name);
        const errors = Object.fromEntries(requiredFields.map(name => [name, REQUIRED_FIELD_ERROR]));

        const response = formInvalidResponse(null, errors);
        res.send(response);
        return;
    }

    const errors: Record<string, string> = {};
    for (const [name, field] of Object.entries(form.fields)) {
        if (field.required && (!formFields[name] || formFields[name].toString().trim() === '')) {
            errors[name] = "This field is required.";
        }

        const { valid, message } = validateField(field, formFields[name]);
        if (!valid) {
            errors[name] = message ?? INVALID_FIELD_ERROR;
        }
    }

    if (Object.keys(errors).length > 0) {
        const response = formInvalidResponse(null, errors);
        res.send(response);
        return;
    }

    if (Object.keys(formFields).some((name) => !form.fields[name])) {
        const response = formInvalidResponse(form.errorMessage);
        res.send(response);
    }

    if (env.HCAPTCHA_ENABLED === 'true') {
        const { "h-captcha-response": token } = req.body;

        const result = await validateCaptcha(token);
        if (!result.success) {
            const response = formInvalidResponse();
            res.send(response);
            return;
        }
    }

    const html = Object.entries(formFields).map(
        ([key, value]) => {
            const cleanValue = typeof value === 'string' ? sanitizeHtml(value) : value?.toString ? sanitizeHtml(value.toString()) : '<invalid value>';
            if (key === 'message') {
                return `<br><b>${key[0].toUpperCase() + key.slice(1)}</b>:<br> ${cleanValue}<br>`;
            } else {
                return `<b>${key[0].toUpperCase() + key.slice(1)}</b>: ${cleanValue}<br>`;
            }
        }
    ).join('\n');

    const nameFieldKey: string = Object.entries(form.fields).find(([, { as }]) => as === 'name')?.[0] ?? 'name';
    const emailFieldKey: string = Object.entries(form.fields).find(([, { as }]) => as === 'email')?.[0] ?? 'email';

    const fromName = formFields.name ?? formFields[nameFieldKey] ?? GENERIC_FROM_NAME;
    const replyToAddress = formFields.email ?? formFields[emailFieldKey] ?? env.SMTP_FROM!;

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

        res.send(formSuccessResponse(form.successMessage));
    } catch (e: unknown) {
        console.error(e);
        res.send(formCriticalFailureResponse(form.errorMessage));
    }
});

app.get('/', async (_, res) => {
    return res.type('text/html').send('Schoodic Mailer / powered by Fastify')
})