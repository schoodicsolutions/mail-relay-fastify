"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = exports.fetchRemoteConfig = void 0;
const fastify_1 = __importDefault(require("fastify"));
const dotenv_1 = __importDefault(require("dotenv"));
const process_1 = require("process");
const kv_1 = require("@vercel/kv");
const blob_1 = require("@vercel/blob");
const ratelimit_1 = require("@upstash/ratelimit");
const nodemailer_1 = require("nodemailer");
const node_scp_1 = require("node-scp");
dotenv_1.default.config();
let config;
function getConfig() {
    return config;
}
const fetchRemoteConfig = async () => {
    if (process_1.env.JSON_CONFIG_SSH_PATH && process_1.env.JSON_CONFIG_SSH_KEY) {
        const privateKey = Buffer.from(process_1.env.JSON_CONFIG_SSH_KEY, 'base64').toString('utf-8');
        const client = await (0, node_scp_1.Client)({
            host: process_1.env.JSON_CONFIG_SSH_PATH.split("@")[1].split(":")[0],
            port: process_1.env.JSON_CONFIG_SSH_PORT ?? "22",
            username: process_1.env.JSON_CONFIG_SSH_PATH.split("@")[0],
            privateKey: privateKey,
        });
        const remotePath = process_1.env.JSON_CONFIG_SSH_PATH.split(":")[1];
        try {
            let allBlobs = [];
            let { blobs, hasMore, cursor } = await (0, blob_1.list)();
            allBlobs.push(...blobs);
            while (hasMore) {
                const listResult = await (0, blob_1.list)({
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
                    await (0, blob_1.del)(blob.url);
                }
                config = await (await fetch(mostRecent.url)).json();
            }
            else {
                try {
                    const data = (await client.readFile(remotePath)).toString('utf-8');
                    config = JSON.parse(data);
                    try {
                        await (0, blob_1.put)('mail-relay-config-' + Date.now() + '.json', data, { contentType: 'application/json', access: 'public' });
                        console.log('Config data loaded from remote server, saved to blob storage');
                    }
                    catch (e) {
                        console.error("Failed to save config file to blob storage:", e.message ?? 'Unknown error occurred');
                        process.exit(1);
                    }
                }
                catch (e) {
                    if (!mostRecent) {
                        console.error("Failed to retrieve config file from remote SSH:", e.message ?? 'Unknown error occurred', e);
                        process.exit(1);
                    }
                }
            }
            console.log("Config file loaded successfully.");
        }
        catch (error) {
            console.error("Error communicating with Vercel Blob:", error.message ?? 'Unknown error occurred');
            process.exit(1);
        }
        finally {
            client.close();
        }
    }
    else {
        console.error("Config must be pulled intially from remote server. Please set env vars JSON_CONFIG_SSH_PATH and JSON_CONFIG_SSH_KEY.");
        process.exit(1);
    }
};
exports.fetchRemoteConfig = fetchRemoteConfig;
const sendMailPromise = (mailOptions) => {
    if (!process_1.env.SMTP_SERVER)
        throw new Error("SMTP_SERVER is not defined");
    if (!process_1.env.SMTP_FROM)
        throw new Error("SMTP_FROM is not defined");
    if (!process_1.env.SMTP_PORT)
        throw new Error("SMTP_PORT is not defined");
    if (!process_1.env.SMTP_USERNAME)
        throw new Error("SMTP_USERNAME is not defined");
    if (!process_1.env.SMTP_PASSWORD)
        throw new Error("SMTP_PASSWORD is not defined");
    const transport = (0, nodemailer_1.createTransport)({
        host: process_1.env.SMTP_SERVER,
        port: Number(process_1.env.SMTP_PORT),
        authMethod: 'LOGIN',
        auth: {
            user: process_1.env.SMTP_USERNAME,
            pass: process_1.env.SMTP_PASSWORD,
        }
    });
    return new Promise((resolve, reject) => {
        transport.sendMail(mailOptions, (err, info) => {
            if (err)
                reject(err);
            resolve(info);
        });
    });
};
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
const ratelimit = new ratelimit_1.Ratelimit({
    redis: kv_1.kv,
    limiter: ratelimit_1.Ratelimit.slidingWindow(5, '1 m')
});
exports.app = (0, fastify_1.default)();
exports.app.options("/submit/:formId", async (request, reply) => {
    const { success, reset, remaining } = await ratelimit.limit(request.ip + (request.headers['origin'] ?? 'no-origin'));
    if (!success) {
        reply.status(429).send({ error: "Rate limit exceeded", remaining, reset });
        return;
    }
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
    await (0, exports.fetchRemoteConfig)();
    const formId = req.params.formId;
    const form = getConfig().forms[formId];
    if (!form) {
        res.status(404).send({ error: "Form not found" });
        return;
    }
    if (form.validOrigin.includes(req.headers.origin)) {
        res.header('Access-Control-Allow-Origin', req.headers.origin);
        res.header('Access-Control-Allow-Headers', 'Content-Type');
    }
    else {
        res.status(403).send({ error: "Invalid origin" });
        return;
    }
    const { success, reset, remaining } = await ratelimit.limit(req.ip + (req.headers['origin'] ?? 'no-origin'));
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
    if (process_1.env.HCAPTCHA_ENABLED === 'true') {
        const { "h-captcha-response": token } = req.body;
        const result = await validateCaptcha(token);
        if (!result.success) {
            res.status(400).send({ error: "Invalid captcha" });
            return;
        }
    }
    const html = Object.entries(formFields).map(([key, value]) => {
        if (key === 'message') {
            return `<br><br>${value}`;
        }
        else {
            return `<b>${key[0].toUpperCase() + key.slice(1)}</b>: ${value}<br>`;
        }
    }).join('\n');
    const fromName = formFields.name?.toString() || 'Contact Form';
    const replyToAddress = formFields.email?.toString() || process_1.env.SMTP_FROM;
    try {
        await sendMailPromise({
            from: `${fromName} <${process_1.env.SMTP_FROM}>`,
            to: form.recipient ?? process_1.env.SMTP_RCPT,
            subject: process_1.env.SMTP_SUBJECT,
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
