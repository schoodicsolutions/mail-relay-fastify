"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateField = void 0;
const SPECIAL_TYPE_NAMES = [
    "tel",
    "email",
];
const SPECIAL_TYPES = {
    "tel": {
        "primitiveType": "string",
        "pattern": /^[0-9-+() ]+$/,
        "message": "The field accepts only numbers and phone characters (#, -, *, etc).",
    },
    "email": {
        "primitiveType": "string",
        "pattern": /^.+@[^.]+\.\w\w+$/,
        "message": "Please enter a valid email address.",
    },
};
const validateField = (field, value) => {
    if (field.maxLength && value.length > field.maxLength) {
        return { valid: false, message: `This field must be at most ${field.maxLength} characters long.` };
    }
    if (field.type in SPECIAL_TYPES) {
        const specialType = SPECIAL_TYPES[field.type];
        if (specialType.primitiveType === 'string') {
            const matches = (typeof value == specialType.primitiveType) && specialType.pattern.test(value);
            if (!matches) {
                return { valid: false, message: specialType.message };
            }
        }
    }
    else if (field.type === 'number') {
        const casted = Number(value);
        return { valid: !isNaN(casted) };
    }
    else {
        return { valid: typeof value === field.type };
    }
    return { valid: true };
};
exports.validateField = validateField;
