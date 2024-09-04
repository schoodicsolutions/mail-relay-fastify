import Fastify, { FastifyReply, FastifyRequest } from "fastify";
import multipart from '@fastify/multipart';

import sanitizeHtml from "sanitize-html";

import { env } from "process";
import { kv } from "@vercel/kv"
import { Ratelimit } from '@upstash/ratelimit';

import { fetchRemoteConfig, getConfig } from "./config";
import { sendMailPromise } from "./util/mail";
import { validateCaptcha } from "./util/captcha";
import { validateField } from "./util/validation";


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
            }
        };
        reply.status(429).send(response);
        return;
    }
});

app.options("/submit/:formId", async (_, reply: FastifyReply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Headers', 'Content-Type');
    return reply.status(200).send();
});

const extractFields = (body: Record<string, any>, fieldKey: string) => {
    const fields: Record<string, any> = {};

    for (const [key, value] of Object.entries(body)) {
        const match = key.substring(0, fieldKey.length + 1) === fieldKey + '[' && key[key.length - 1] === ']';
        if (match) {
            fields[key.substring(fieldKey.length + 1, key.length - 1)] = value;
        }
    }

    return fields;
}

app.post<{ Params: { formId: string }, Body: Record<string, any> }>("/submit/:formId", async (req, res) => {
    await fetchRemoteConfig();

    const formId = req.params.formId;
    const form = getConfig().forms[formId];

    if (!form) {
        const response = {
            success: false,
            data: {
                message: "The form you're trying to submit wasn't found.",
            }
        }
        res.status(404).send(response);
        return;
    }

    if (form.validOrigin.includes(req.headers.origin!)) {
        res.header('Access-Control-Allow-Origin', req.headers.origin!);
        res.header('Access-Control-Allow-Headers', 'Content-Type');
    } else {
        const response = {
            success: false,
            data: {
                message: "Invalid origin.",
            }
        }
        res.status(403).send(response);
        return;
    }

    const body = Object.fromEntries(
      Object.keys(req.body).map((key) => [key, req.body[key].value])
    )
  
    const formFields = form.fieldKey ? body[form.fieldKey] ?? extractFields(body, form.fieldKey) : req.body;

    if (!formFields || typeof formFields !== 'object' || Object.keys(formFields).length === 0) {
        const requiredFields = Object.entries(form.fields).filter(([, field]) => !!field.required).map(([name]) => name);
        const response: FormSubmissionResponse = {
            "success": false,
            "data": {
                "message": "Your submission failed because of an error.",
                "errors": Object.fromEntries(requiredFields.map(name => [name, "This field is required."])),
            }
        }
        res.status(400).send(response);
        return;
    }

    const errors: Record<string, string> = {};
    for (const [name, field] of Object.entries(form.fields)) {
        if (field.required && (!formFields[name] || formFields[name].toString().trim() === '')) {
            errors[name] = "This field is required.";
        }

        const { valid, message } = validateField(field, formFields[name]);
        if (!valid) {
            errors[name] = message ?? 'Invalid field value';
        }
    }

    if (Object.keys(errors).length > 0) {
        const response: FormSubmissionResponse = {
            "success": false,
            "data": {
                "message": "Your submission failed because of an error.",
                "errors": errors,
            }
        }
        res.status(400).send(response);
        return;
    }

    if (Object.keys(formFields).some((name) => !form.fields[name])) {
        const response: FormSubmissionResponse = {
            "success": false,
            "data": {
                "message": "Your submission failed because of an error.",
            }
        }
        res.status(400).send(response);
    }

    if (env.HCAPTCHA_ENABLED === 'true') {
        const { "h-captcha-response": token } = req.body;

        const result = await validateCaptcha(token);
        if (!result.success) {
            res.status(400).send({ error: "Invalid captcha" });
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

    const fromName = formFields.name?.toString() || 'Contact Form';
    const replyToAddress = formFields.email?.toString() || env.SMTP_FROM!;

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

        res.status(200).send({ success: true, message: form.successMessage });
    } catch (e: unknown) {
        console.error(e);
        res.status(500).send({ success: false, message: form.errorMessage });
    }
});

app.get('/', async (_, res) => {
    return res.status(200).type('text/html').send('Schoodic Mailer / powered by Fastify')
})