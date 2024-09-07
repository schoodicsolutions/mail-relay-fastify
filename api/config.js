"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchRemoteConfig = void 0;
exports.getConfig = getConfig;
const process_1 = require("process");
const blob_1 = require("@vercel/blob");
const node_scp_1 = require("node-scp");
let config;
function getConfig() {
    return config;
}
const fetchRemoteConfig = async () => {
    if (process_1.env.JSON_CONFIG_SSH_PATH && process_1.env.JSON_CONFIG_SSH_KEY) {
        const privateKey = Buffer.from(process_1.env.JSON_CONFIG_SSH_KEY, 'base64').toString('utf-8');
        const client = await (0, node_scp_1.Client)({
            host: process_1.env.JSON_CONFIG_SSH_PATH.split("@")[1].split(":")[0],
            port: process_1.env.JSON_CONFIG_SSH_PORT ?? "22",
            username: process_1.env.JSON_CONFIG_SSH_PATH.split("@")[0],
            privateKey: privateKey,
        });
        const remotePath = process_1.env.JSON_CONFIG_SSH_PATH.split(":")[1];
        try {
            let allBlobs = [];
            let { blobs, hasMore, cursor } = await (0, blob_1.list)();
            allBlobs.push(...blobs);
            while (hasMore) {
                const listResult = await (0, blob_1.list)({ cursor });
                allBlobs.push(...listResult.blobs);
                hasMore = listResult.hasMore;
                cursor = listResult.cursor;
            }
            const mostRecent = blobs.length ? blobs.reduce((a, b) => a.uploadedAt > b.uploadedAt ? a : b) : null;
            if (mostRecent) {
                const restBlobs = blobs.filter(blob => blob.url !== mostRecent.url);
                for (const blob of restBlobs) {
                    await (0, blob_1.del)(blob.url);
                }
                config = await (await fetch(mostRecent.url)).json();
            }
            else {
                try {
                    const data = (await client.readFile(remotePath)).toString('utf-8');
                    config = JSON.parse(data);
                    try {
                        await (0, blob_1.put)('mail-relay-config-' + Date.now() + '.json', data, { contentType: 'application/json', access: 'public' });
                        console.log('Config data loaded from remote server, saved to blob storage');
                    }
                    catch (e) {
                        console.error("Failed to save config file to blob storage:", e.message ?? 'Unknown error occurred');
                        process.exit(1);
                    }
                }
                catch (e) {
                    if (!mostRecent) {
                        console.error("Failed to retrieve config file from remote SSH:", e.message ?? 'Unknown error occurred', e);
                        process.exit(1);
                    }
                }
            }
            console.log("Config file loaded successfully.");
        }
        catch (error) {
            console.error("Error communicating with Vercel Blob:", error.message ?? 'Unknown error occurred');
            process.exit(1);
        }
        finally {
            client.close();
        }
    }
    else {
        console.error("Config must be pulled intially from remote server. Please set env vars JSON_CONFIG_SSH_PATH and JSON_CONFIG_SSH_KEY.");
        process.exit(1);
    }
};
exports.fetchRemoteConfig = fetchRemoteConfig;
