import { FAILED_SUBMISSION, SUCCESSFUL_SUBMISSION } from "@/strings";
import { SubmissionResponse } from "@/types/submission-response";

interface GenericSubmissionResponse extends SubmissionResponse {
    data: {
        success: boolean;
        message: string;
        errors?: Record<string, string>;
    }
}

export const formInvalidResponse = (message: string, errors?: Record<string, string>): GenericSubmissionResponse => ({
    code: 400,
    data: {
        success: false,
        message: message ?? FAILED_SUBMISSION,
        errors,
    }
});

export const formSuccessResponse = (message?: string): GenericSubmissionResponse => ({
    code: 200,
    data: {
        success: true,
        message: message ?? SUCCESSFUL_SUBMISSION,
    },
});

export const formCriticalFailureResponse = (message?: string): GenericSubmissionResponse => ({
    code: 500,
    data: {
        success: false,
        message: message ?? FAILED_SUBMISSION,
    },
});