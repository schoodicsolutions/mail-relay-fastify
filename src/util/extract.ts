export const extractFields = (body: Record<string, any>, fieldKey: string) => {
    const fields: Record<string, any> = {};

    for (const [key, value] of Object.entries(body)) {
        const match = key.substring(0, fieldKey.length + 1) === fieldKey + '[' && key[key.length - 1] === ']';
        if (match) {
            fields[key.substring(fieldKey.length + 1, key.length - 1)] = value;
        }
    }

    return fields;
}
