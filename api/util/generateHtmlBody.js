"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateHtmlBody = void 0;
const sanitize_html_1 = __importDefault(require("sanitize-html"));
const generateHtmlBody = ({ fields, form: { fields: fieldDefinitions } }) => {
    return Object.entries(fields).filter(([key]) => Object.keys(fieldDefinitions).includes(key)).map(([key, value]) => {
        const label = fieldDefinitions[key].label ?? key;
        const realValue = value?.value ?? (value?.toString ? value.toString() : '');
        const cleanValue = (0, sanitize_html_1.default)(realValue);
        if (key === 'message') {
            return `<br><b>${label}</b>:<br> ${cleanValue}<br>`;
        }
        else {
            return `<b>${label}</b>: ${cleanValue}<br>`;
        }
    }).join('\n');
};
exports.generateHtmlBody = generateHtmlBody;
