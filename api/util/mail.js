"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = exports.nodeMailerWrapper = void 0;
const strings_1 = require("@/local/strings");
const nodemailer_1 = require("nodemailer");
const process_1 = require("process");
const generateHtmlBody_1 = require("./generateHtmlBody");
const nodeMailerWrapper = (mailOptions) => {
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
exports.nodeMailerWrapper = nodeMailerWrapper;
;
const sendEmail = async ({ fields, form }) => {
    const { recipient, subject, fields: fieldDefinitions } = form;
    const html = (0, generateHtmlBody_1.generateHtmlBody)({ fields, form });
    const nameFieldKey = Object.entries(fieldDefinitions).find(([, { as }]) => as === 'name')?.[0] ?? 'name';
    const emailFieldKey = Object.entries(fieldDefinitions).find(([, { as }]) => as === 'email')?.[0] ?? 'email';
    let fromName = fields.name ?? fields[nameFieldKey] ?? strings_1.GENERIC_FROM_NAME;
    let replyToAddress = fields.email ?? fields[emailFieldKey] ?? process_1.env.SMTP_FROM;
    if (fromName.value)
        fromName = fromName.value;
    if (replyToAddress.value)
        replyToAddress = replyToAddress.value;
    await (0, exports.nodeMailerWrapper)({
        from: `${fromName} <${process_1.env.SMTP_FROM}>`,
        to: recipient ?? process_1.env.SMTP_RCPT,
        subject: subject ?? process_1.env.SMTP_SUBJECT,
        headers: {
            'Reply-To': `${fromName} <${replyToAddress}>`,
        },
        html,
    });
};
exports.sendEmail = sendEmail;
