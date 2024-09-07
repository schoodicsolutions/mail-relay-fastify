import { Form } from "../config";
import { SubmissionResponse } from "./submission-response";

export interface FormModeDefinition {
    preferences?: Partial<Form>,
    getFormIdentifier: (body: Record<string, any>) => string,
    formInvalidResponse: (message?: string | null, errors?: Record<string, string>) => SubmissionResponse,
    formSuccessResponse: (message?: string | null, form?: Form) => SubmissionResponse,
    formCriticalFailureResponse: (message?: string | null, form?: Form) => SubmissionResponse,
}