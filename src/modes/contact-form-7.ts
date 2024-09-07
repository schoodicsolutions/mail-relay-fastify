import { Form } from "@/config";
import { FAILED_SUBMISSION, SUCCESSFUL_SUBMISSION, VALIDATION_ERROR } from "../local/strings";
import { SubmissionResponse } from "../types/submission-response";

interface ContactForm7InvalidField {
    field: string,
    message: string,
    error_id?: string,
}

interface ContactForm7SubmissionResponse extends SubmissionResponse {
    data: {
        contact_form_id?: Form["formId"],
        status: "mail_sent" | "validation_failed" | "mail_failed";
        message: string,
        invalid_fields?: ContactForm7InvalidField[],
    }
}

export const formInvalidResponse = (message?: string, errors?: Record<string, string>): ContactForm7SubmissionResponse => ({
    code: 200,
    data: {
        status: "validation_failed",
        message: message ?? VALIDATION_ERROR,
        invalid_fields: Object.entries(errors ?? {}).map(([field, message]) => ({ field, message })),
    }
});

export const formSuccessResponse = (message?: string, form?: Form): ContactForm7SubmissionResponse => ({
    code: 200,
    data: {
        contact_form_id: form?.formId,
        status: "mail_sent",
        message: message ?? SUCCESSFUL_SUBMISSION,
        invalid_fields: [],
    },
});

export const formCriticalFailureResponse = (message?: string, form?: Form): ContactForm7SubmissionResponse => ({
    code: 200,
    data: {
        contact_form_id: form?.formId,
        status: "mail_failed",
        message: message ?? FAILED_SUBMISSION,
    },
});