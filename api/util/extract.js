"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractFields = void 0;
const extractFields = (body, fieldKey) => {
    const fields = {};
    for (const [key, value] of Object.entries(body)) {
        const match = key.substring(0, fieldKey.length + 1) === fieldKey + '[' && key[key.length - 1] === ']';
        if (match) {
            fields[key.substring(fieldKey.length + 1, key.length - 1)] = value;
        }
    }
    return fields;
};
exports.extractFields = extractFields;
