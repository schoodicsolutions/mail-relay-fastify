import { createTransport } from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";
import { env } from "process";

export const sendMailPromise = (mailOptions: SMTPTransport.Options) => {
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