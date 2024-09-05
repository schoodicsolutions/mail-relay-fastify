"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formCriticalFailureResponse = exports.formSuccessResponse = exports.formInvalidResponse = exports.getFormIdentifier = exports.preferences = void 0;
const strings_1 = require("@/strings");
exports.preferences = {
    fieldKey: "form_fields"
};
const getFormIdentifier = (body) => {
    return body.form_id;
};
exports.getFormIdentifier = getFormIdentifier;
const formInvalidResponse = (message, errors) => ({
    code: 200,
    data: {
        success: false,
        data: {
            message: message ?? strings_1.FAILED_SUBMISSION,
            errors,
            data: [],
        }
    }
});
exports.formInvalidResponse = formInvalidResponse;
const formSuccessResponse = (message) => ({
    code: 200,
    data: {
        success: true,
        data: {
            message: message ?? strings_1.SUCCESSFUL_SUBMISSION,
            data: [],
        }
    },
});
exports.formSuccessResponse = formSuccessResponse;
const formCriticalFailureResponse = (message) => ({
    code: 200,
    data: {
        success: false,
        data: {
            message: message ?? strings_1.FAILED_SUBMISSION,
            data: [],
        }
    }
});
exports.formCriticalFailureResponse = formCriticalFailureResponse;
