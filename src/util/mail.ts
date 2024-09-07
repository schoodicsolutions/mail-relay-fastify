import { GENERIC_FROM_NAME } from "../local/strings";
import { Form } from "../types/form";
import { createTransport } from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";
import { env } from "process";
import { generateHtmlBody } from "./generateHtmlBody";

export const nodeMailerWrapper = (mailOptions: SMTPTransport.Options) => {
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

export interface SendEmailOptions {
    fields: Record<string, any>;
    form: Form;
};

export const sendEmail = async ({ fields, form }: SendEmailOptions) => {
    const { recipient, subject, fields: fieldDefinitions } = form;
    const html = generateHtmlBody({ fields, form });

    const nameFieldKey: string = Object.entries(fieldDefinitions).find(([, { as }]) => as === 'name')?.[0] ?? 'name';
    const emailFieldKey: string = Object.entries(fieldDefinitions).find(([, { as }]) => as === 'email')?.[0] ?? 'email';

    let fromName = fields.name ?? fields[nameFieldKey] ?? GENERIC_FROM_NAME;
    let replyToAddress = fields.email ?? fields[emailFieldKey] ?? env.SMTP_FROM!;

    if (fromName.value) fromName = fromName.value;
    if (replyToAddress.value) replyToAddress = replyToAddress.value;

    await nodeMailerWrapper({
        from: `${fromName} <${env.SMTP_FROM}>`,
        to: recipient ?? env.SMTP_RCPT,
        subject: subject ?? env.SMTP_SUBJECT,
        headers: {
            'Reply-To': `${fromName} <${replyToAddress}>`,
        },
        html,
        // attachments: file ? [{
        //     filename: file,
        //      content: data.file,
        // }] : undefined,
    });
}