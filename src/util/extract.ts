export const extractFields = (body: Record<string, any>, fieldKey: string) => {
    const fieldEntries: [string, string][] = [];
    
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
    
    return Object.fromEntries(fieldEntries) as Record<string, any>;
}
