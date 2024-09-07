import { Form } from "@/types/form";
import sanitizeHtml from "sanitize-html";

export interface GenerateHtmlBodyOptions {
    fields: Record<string, any>;
    form: Form;
}

export const generateHtmlBody = ({ fields, form: { fields: fieldDefinitions } }: GenerateHtmlBodyOptions): string => {
    return Object.entries(fields).filter(
        ([key]) => Object.keys(fieldDefinitions).includes(key)
    ).map(
        ([key, value]) => {
            const label = fieldDefinitions[key].label ?? key;
            const realValue = value?.value ?? (value?.toString ? value.toString() : '');
            const cleanValue = sanitizeHtml(realValue);
            if (key === 'message') {
                return `<br><b>${label}</b>:<br> ${cleanValue}<br>`;
            } else {
                return `<b>${label}</b>: ${cleanValue}<br>`;
            }
        }
    ).join('\n');
}