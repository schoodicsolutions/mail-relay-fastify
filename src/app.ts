import Fastify, { FastifyReply, FastifyRequest } from "fastify";
import dotenv from "dotenv";
import { env } from "process";
import { kv } from "@vercel/kv"
import { list, put, del, ListBlobResultBlob } from "@vercel/blob"
// import multipart from "@fastify/multipart";
import { Ratelimit } from '@upstash/ratelimit';
import { createTransport } from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";
import { Client } from "node-scp";

interface Field {
    type: string;
    label: string;
    required: boolean;
}

interface Form {
    name: string;
    fields: Record<string, Field>;
    validOrigin: string | string[];
    recipient: string;
    successMessage: string;
    errorMessage: string;
    fieldKey?: string;
}

interface Config {
    forms: Record<string, Form>;
}

dotenv.config();

let config: Config;
function getConfig() {
    return config;
}

export const fetchRemoteConfig = async (): Promise<void> => {
    if (env.JSON_CONFIG_SSH_PATH && env.JSON_CONFIG_SSH_KEY) {
        const privateKey = Buffer.from(env.JSON_CONFIG_SSH_KEY, 'base64').toString('utf-8');

        const client = await Client({
            host: env.JSON_CONFIG_SSH_PATH.split("@")[1].split(":")[0],
            port: env.JSON_CONFIG_SSH_PORT ?? "22",
            username: env.JSON_CONFIG_SSH_PATH.split("@")[0],
            privateKey: privateKey,
        });
        
        const remotePath = env.JSON_CONFIG_SSH_PATH.split(":")[1];

        try {
            let allBlobs: ListBlobResultBlob[] = [];
            let { blobs, hasMore, cursor } = await list();
            allBlobs.push(...blobs);

            while (hasMore) {
                const listResult = await list({
                    cursor,
                  });
                  allBlobs.push(...listResult.blobs);
                  hasMore = listResult.hasMore;
                  cursor = listResult.cursor;
            }

            const mostRecent = blobs.length ? blobs.reduce((a, b) => a.uploadedAt > b.uploadedAt ? a : b) : null;
            if (mostRecent) {
                const restBlobs = blobs.filter(blob => blob.url !== mostRecent.url);

                for (const blob of restBlobs) {
                    await del(blob.url);
                }    
                config = await (await fetch(mostRecent.url)).json();
            } else {
                
                try {
                    const data = (await client.readFile(remotePath)).toString('utf-8');
                    config = JSON.parse(data) as Config;
                    try {
                        await put('mail-relay-config-' + Date.now() + '.json', data, {contentType: 'application/json', access: 'public'});
                        console.log('Config data loaded from remote server, saved to blob storage');
                    } catch (e) {
                        console.error("Failed to save config file to blob storage:", (e as any).message ?? 'Unknown error occurred');
                        process.exit(1);
                    }
                } catch (e) {
                    if (!mostRecent) {
                        console.error("Failed to retrieve config file from remote SSH:", (e as any).message ?? 'Unknown error occurred', e);
                        process.exit(1);
                    }
                }
            }

            console.log("Config file loaded successfully.");
        } catch (error) {
            console.error("Error communicating with Vercel Blob:", (error as any).message ?? 'Unknown error occurred');
            process.exit(1);
        } finally {
            client.close();
        }
    } else {
        console.error("Config must be pulled intially from remote server. Please set env vars JSON_CONFIG_SSH_PATH and JSON_CONFIG_SSH_KEY.");
        process.exit(1);
    }
};

const sendMailPromise = (mailOptions: SMTPTransport.Options) => {
    if (!env.SMTP_SERVER) throw new Error("SMTP_SERVER is not defined");
    if (!env.SMTP_FROM) throw new Error("SMTP_FROM is not defined");
    if (!env.SMTP_PORT) throw new Error("SMTP_PORT is not defined");
    if (!env.SMTP_USERNAME) throw new Error("SMTP_USERNAME is not defined");
    if (!env.SMTP_PASSWORD) throw new Error("SMTP_PASSWORD is not defined");

    const transport = createTransport({
        host: env.SMTP_SERVER,
        port: Number(env.SMTP_PORT),
        authMethod: 'LOGIN',
        auth: {
            user: env.SMTP_USERNAME,
            pass: env.SMTP_PASSWORD,
        }
    });

    return new Promise<SMTPTransport.SentMessageInfo>(
        (resolve, reject) => {
            transport.sendMail(
                mailOptions,
                (err, info) => {
                    if (err) reject(err);
                    resolve(info);
                }
            );
        }
    );
};

const validateCaptcha = (token: string) => {
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

const ratelimit = new Ratelimit({
    redis: kv,
    limiter: Ratelimit.slidingWindow(5, '1 m')
});

export const app = Fastify();

//app.register(multipart);

app.options("/submit/:formId", async (request: FastifyRequest, reply: FastifyReply) => {
    const { success, reset, remaining } = await ratelimit.limit(
        request.ip + (request.headers['origin'] ?? 'no-origin'),
    )

    if (!success) {
        reply.status(429).send({ error: "Rate limit exceeded", remaining, reset });
        return;
    }

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
app.post("/submit/:formId", async (req: FastifyRequest<{ Params: { formId: string }, Body: Record<string, any>}>, res) => {
    await fetchRemoteConfig();

    const formId = req.params.formId;
    const form = getConfig().forms[formId];

    if (!form) {
        res.status(404).send({ error: "Form not found" });
        return;
    }

    if (form.validOrigin.includes(req.headers.origin!)) {
        res.header('Access-Control-Allow-Origin', req.headers.origin!);
        res.header('Access-Control-Allow-Headers', 'Content-Type');
    } else {
        res.status(403).send({ error: "Invalid origin" });
        return;
    }

    const { success, reset, remaining } = await ratelimit.limit(
        req.ip + (req.headers['origin'] ?? 'no-origin'),
    )

    if (!success) {
        res.status(429).send({ error: "Rate limit exceeded", remaining, reset });
        return;
    }

    const formFields = form.fieldKey ? req.body[form.fieldKey] ?? extractFields(req.body, form.fieldKey) : req.body;

    if (!formFields) {
        res.status(400).send({ error: "Invalid form data" });
        return;
    }

    if (Object.entries(form.fields).some(([name, field]) => field.required && !formFields[name])) {
        res.status(400).send({ error: "Required fields missing" });
        return;
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
            if (key === 'message') {
                return `<br><br>${value}`;
            } else {
                return `<b>${key[0].toUpperCase() + key.slice(1)}</b>: ${value}<br>`;
            }
        }
    ).join('\n');

    const fromName = formFields.name?.toString() || 'Contact Form';
    const replyToAddress = formFields.email?.toString() || env.SMTP_FROM!;

    try {
        // const data = await req.file();

        await sendMailPromise({
            from: `${fromName} <${env.SMTP_FROM}>`,
            to: form.recipient ?? env.SMTP_RCPT,
            subject: env.SMTP_SUBJECT,
            headers: {
                'Reply-To': `${fromName} <${replyToAddress}>`,
            },
            html,
            // attachments: data.file ? [{
            //     filename: data.filename,
            //     content: data.file,
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