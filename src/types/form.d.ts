
export interface FieldDefinition {
    type: string;
    label: string;
    required: boolean;
    maxLength?: number;
    as?: 'name' | 'email';
}

export const FormModes = ['generic', 'elementor-pro', 'contact-form-7'] as const;
export type FormMode = typeof FormModes[number];

export interface Form {
    mode?: FormMode;
    name: string;
    fields: Record<string, FieldDefinition>;
    validOrigin: string | string[];
    recipient: string;
    subject?: string;
    successMessage: string;
    errorMessage: string;
    fieldKey?: string;
    formId?: string | number;
}