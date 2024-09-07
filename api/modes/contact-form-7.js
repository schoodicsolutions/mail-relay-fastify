"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formCriticalFailureResponse = exports.formSuccessResponse = exports.formInvalidResponse = void 0;
const strings_1 = require("../local/strings");
const formInvalidResponse = (message, errors) => ({
    code: 200,
    data: {
        status: "validation_failed",
        message: message ?? strings_1.VALIDATION_ERROR,
        invalid_fields: Object.entries(errors ?? {}).map(([field, message]) => ({ field, message })),
    }
});
exports.formInvalidResponse = formInvalidResponse;
const formSuccessResponse = (message, form) => ({
    code: 200,
    data: {
        contact_form_id: form?.formId,
        status: "mail_sent",
        message: message ?? strings_1.SUCCESSFUL_SUBMISSION,
        invalid_fields: [],
    },
});
exports.formSuccessResponse = formSuccessResponse;
const formCriticalFailureResponse = (message, form) => ({
    code: 200,
    data: {
        contact_form_id: form?.formId,
        status: "mail_failed",
        message: message ?? strings_1.FAILED_SUBMISSION,
    },
});
exports.formCriticalFailureResponse = formCriticalFailureResponse;
