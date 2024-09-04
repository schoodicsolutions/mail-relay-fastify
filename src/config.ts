import { env } from "process";
import { list, put, del, ListBlobResultBlob } from "@vercel/blob"
import { Client } from "node-scp";

export interface Field {
    type: string;
    label: string;
    required: boolean;
    maxLength?: number;
}

export interface Form {
    name: string;
    fields: Record<string, Field>;
    validOrigin: string | string[];
    recipient: string;
    subject?: string;
    successMessage: string;
    errorMessage: string;
    fieldKey?: string;
}

export interface Config {
    forms: Record<string, Form>;
}

let config: Config;

export function getConfig() {
    return config;
}

export const fetchRemoteConfig = async (): Promise<void> => {
    if (env.JSON_CONFIG_SSH_PATH && env.JSON_CONFIG_SSH_KEY) {
        const privateKey = Buffer.from(env.JSON_CONFIG_SSH_KEY, 'base64').toString('utf-8');
        const client = await Client({
            host: env.JSON_CONFIG_SSH_PATH.split("@")[1].split(":")[0],
            port: env.JSON_CONFIG_SSH_PORT ?? "22",
            username: env.JSON_CONFIG_SSH_PATH.split("@")[0],
            privateKey: privateKey,
        });
        const remotePath = env.JSON_CONFIG_SSH_PATH.split(":")[1];

        try {
            let allBlobs: ListBlobResultBlob[] = [];
            let { blobs, hasMore, cursor } = await list();
            allBlobs.push(...blobs);

            while (hasMore) {
                const listResult = await list({ cursor });
                allBlobs.push(...listResult.blobs);
                hasMore = listResult.hasMore;
                cursor = listResult.cursor;
            }

            const mostRecent = blobs.length ? blobs.reduce((a, b) => a.uploadedAt > b.uploadedAt ? a : b) : null;
            if (mostRecent) {
                const restBlobs = blobs.filter(blob => blob.url !== mostRecent.url);
                for (const blob of restBlobs) {
                    await del(blob.url);
                }
                config = await (await fetch(mostRecent.url)).json();
            } else {
                try {
                    const data = (await client.readFile(remotePath)).toString('utf-8');
                    config = JSON.parse(data) as Config;
                    try {
                        await put('mail-relay-config-' + Date.now() + '.json', data, { contentType: 'application/json', access: 'public' });
                        console.log('Config data loaded from remote server, saved to blob storage');
                    } catch (e) {
                        console.error("Failed to save config file to blob storage:", (e as any).message ?? 'Unknown error occurred');
                        process.exit(1);
                    }
                } catch (e) {
                    if (!mostRecent) {
                        console.error("Failed to retrieve config file from remote SSH:", (e as any).message ?? 'Unknown error occurred', e);
                        process.exit(1);
                    }
                }
            }

            console.log("Config file loaded successfully.");
        } catch (error) {
            console.error("Error communicating with Vercel Blob:", (error as any).message ?? 'Unknown error occurred');
            process.exit(1);
        } finally {
            client.close();
        }
    } else {
        console.error("Config must be pulled intially from remote server. Please set env vars JSON_CONFIG_SSH_PATH and JSON_CONFIG_SSH_KEY.");
        process.exit(1);
    }
};
