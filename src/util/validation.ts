import { FieldDefinition } from "../types/form";
import { INVALID_FIELD_ERROR, REQUIRED_FIELD_ERROR } from "../local/strings";

const SPECIAL_TYPE_NAMES = [
    "tel",
    "email",
] as const;

type SpecialTypeName = typeof SPECIAL_TYPE_NAMES[number];
type SpecialType = {
    pattern: RegExp;
    message: string;
}

const SPECIAL_TYPES: Record<SpecialTypeName, SpecialType> = {
    "tel": {
        "pattern": /^[0-9-+() ]+$/,
        "message": "The field accepts only numbers and phone characters (#, -, *, etc).",
    },
    "email": {
        "pattern": /^.+@[^.]+\.\w\w+$/,
        "message": "Please enter a valid email address.",
    },
} as const;

export const validateField = (fieldDefinition: FieldDefinition, value: string) => {
    if (fieldDefinition.maxLength && value.length > fieldDefinition.maxLength) {
        return {valid: false, message: `This field must be at most ${fieldDefinition.maxLength} characters long.`};
    }
    if (fieldDefinition.type in SPECIAL_TYPES) {
        const specialType = SPECIAL_TYPES[fieldDefinition.type as SpecialTypeName];
        const matches = specialType.pattern.test(value);

        if (!matches) {
            return {valid: false, message: specialType.message};
        }
    } else if (fieldDefinition.type === 'number') {
        const casted = Number(value);
        return {valid: !isNaN(casted)}
    } else {
        return {valid: typeof value === fieldDefinition.type};
    }
    
    return {valid: true};
}

export const validateFields = function(fields: Record<string, any>, fieldDefinitions: Record<string, FieldDefinition>) {
    const errors: Record<string, string> = {};

    for (const [name, fieldDefinition] of Object.entries(fieldDefinitions)) {
        const value = fields[name]?.value ?? (fields[name]?.toString ? fields[name].toString() : '');

        if (fieldDefinition.required && (value.trim() === '')) {
            errors[name] = REQUIRED_FIELD_ERROR;
        }

        const { valid, message } = validateField(fieldDefinition, value);

        if (!valid) {
            errors[name] = message ?? INVALID_FIELD_ERROR;
        }
    }

    return errors;
}