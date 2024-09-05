"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formCriticalFailureResponse = exports.formSuccessResponse = exports.formInvalidResponse = void 0;
const strings_1 = require("../local/strings");
const formInvalidResponse = (message, errors) => ({
    code: 400,
    data: {
        success: false,
        message: message ?? strings_1.FAILED_SUBMISSION,
        errors,
    }
});
exports.formInvalidResponse = formInvalidResponse;
const formSuccessResponse = (message) => ({
    code: 200,
    data: {
        success: true,
        message: message ?? strings_1.SUCCESSFUL_SUBMISSION,
    },
});
exports.formSuccessResponse = formSuccessResponse;
const formCriticalFailureResponse = (message) => ({
    code: 500,
    data: {
        success: false,
        message: message ?? strings_1.FAILED_SUBMISSION,
    },
});
exports.formCriticalFailureResponse = formCriticalFailureResponse;
