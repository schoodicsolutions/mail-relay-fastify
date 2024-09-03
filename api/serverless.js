"use strict";

// Read the .env file.
import * as dotenv from "dotenv";

dotenv.config();
import { app, fetchRemoteConfig } from "./app.js";

export default async (req, res) => {
    const config = await fetchRemoteConfig();
    console.log(process.env.JSON_CONFIG_SSH_PATH);
    await app.ready();
    app.server.emit('request', req, res);
}