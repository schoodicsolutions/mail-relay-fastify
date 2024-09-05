"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateFields = exports.validateField = void 0;
const strings_1 = require("../local/strings");
const SPECIAL_TYPE_NAMES = [
    "tel",
    "email",
];
const SPECIAL_TYPES = {
    "tel": {
        "pattern": /^[0-9-+() ]+$/,
        "message": "The field accepts only numbers and phone characters (#, -, *, etc).",
    },
    "email": {
        "pattern": /^.+@[^.]+\.\w\w+$/,
        "message": "Please enter a valid email address.",
    },
};
const validateField = (fieldDefinition, value) => {
    if (fieldDefinition.maxLength && value.length > fieldDefinition.maxLength) {
        return { valid: false, message: `This field must be at most ${fieldDefinition.maxLength} characters long.` };
    }
    if (fieldDefinition.type in SPECIAL_TYPES) {
        const specialType = SPECIAL_TYPES[fieldDefinition.type];
        const matches = specialType.pattern.test(value);
        if (!matches) {
            return { valid: false, message: specialType.message };
        }
    }
    else if (fieldDefinition.type === 'number') {
        const casted = Number(value);
        return { valid: !isNaN(casted) };
    }
    else {
        return { valid: typeof value === fieldDefinition.type };
    }
    return { valid: true };
};
exports.validateField = validateField;
const validateFields = function (fields, fieldDefinitions) {
    const errors = {};
    for (const [name, fieldDefinition] of Object.entries(fieldDefinitions)) {
        const value = fields[name]?.value ?? (fields[name]?.toString ? fields[name].toString() : '');
        if (fieldDefinition.required && (value.trim() === '')) {
            errors[name] = strings_1.REQUIRED_FIELD_ERROR;
        }
        const { valid, message } = (0, exports.validateField)(fieldDefinition, value);
        if (!valid) {
            errors[name] = message ?? strings_1.INVALID_FIELD_ERROR;
        }
    }
    return errors;
};
exports.validateFields = validateFields;
