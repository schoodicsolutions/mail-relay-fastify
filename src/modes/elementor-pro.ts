import { FAILED_SUBMISSION, SUCCESSFUL_SUBMISSION } from "../local/strings";
import { SubmissionResponse } from "../types/submission-response";

interface ElementorProSubmissionResponse extends SubmissionResponse {
    data: {
        success: boolean;
        data: {
            message: string;
            errors?: Record<string, string>;
            data?: any[];
        };
    }
}

export const preferences = {
    fieldKey: "form_fields"
}

export const getFormIdentifier = (body: any): string => {
    return body.form_id;
}

export const formInvalidResponse = (message?: string, errors?: Record<string, string>): ElementorProSubmissionResponse => ({
    code: 200,
    data: {
        success: false,
        data: {
            message: message ?? FAILED_SUBMISSION,
            errors,
            data: [],
        }
    }
});

export const formSuccessResponse = (message?: string): ElementorProSubmissionResponse => ({
    code: 200,
    data: {
        success: true,
        data: {
            message: message ?? SUCCESSFUL_SUBMISSION,
            data: [],
        }
    },
});

export const formCriticalFailureResponse = (message?: string): ElementorProSubmissionResponse => ({
    code: 200,
    data: {
        success: false,
        data: {
            message: message ?? FAILED_SUBMISSION,
            data: [],
        }
    }
});


