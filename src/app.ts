import Fastify, { FastifyReply, FastifyRequest } from "fastify";
import multipart from '@fastify/multipart';

import { env } from "process";
import { kv } from "@vercel/kv"
import { Ratelimit } from '@upstash/ratelimit';

import { fetchRemoteConfig, getConfig } from "./config";
import { sendEmail } from "./util/mail";
import { validateCaptcha } from "./util/captcha";
import { validateFields } from "./util/validation";
import { extractFields } from "./util/extract";
import { REQUIRED_FIELD_ERROR } from "./local/strings";
import { loadModeDefinition } from "./util/loadModeDefinition";
import { GenericSubmissionResponse } from "./modes/generic";

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
        const { code, data }: GenericSubmissionResponse = {
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

    let { preferences, formInvalidResponse, formSuccessResponse, formCriticalFailureResponse } = loadModeDefinition(form.mode);

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

    if (env.HCAPTCHA_ENABLED === 'true') {
        const { "h-captcha-response": token } = req.body;

        const result = await validateCaptcha(token);
        if (!result.success) {
            const { code, data }= formInvalidResponse();
            res.status(code).send(data);
            return;
        }
    }
    
    try {
        await sendEmail({ fields, form });
        const { code, data } = formSuccessResponse(form.successMessage, form);
        res.status(code).send(data);
    } catch (e: unknown) {
        console.error(e);
        const { code, data } = formCriticalFailureResponse(form.successMessage, form);
        res.status(code).send(data);
    }
});

app.get('/', async (_, res) => {
    return res.type('text/html').send('Schoodic Mailer / powered by Fastify')
})