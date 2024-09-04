"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMailPromise = void 0;
const nodemailer_1 = require("nodemailer");
const process_1 = require("process");
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
exports.sendMailPromise = sendMailPromise;
