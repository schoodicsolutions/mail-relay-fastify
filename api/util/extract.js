"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractFields = void 0;
const extractFields = (body, fieldKey) => {
    const fieldEntries = [];
    for (const [key, value] of Object.entries(body)) {
        const match = key.substring(0, fieldKey.length + 1) === fieldKey + '[' && key[key.length - 1] === ']';
        if (match) {
            const innerKey = key.substring(fieldKey.length + 1, key.length - 1);
            fieldEntries.push([innerKey, value]);
        }
    }
    if (fieldEntries.length === 0) {
        return body;
    }
    return Object.fromEntries(fieldEntries);
};
exports.extractFields = extractFields;
