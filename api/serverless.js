"use strict";

// Read the .env file.
import * as dotenv from "dotenv";

dotenv.config();
import { app, fetchRemoteConfig } from "./app.js";

export default async (req, res) => {
    await app.ready();
    app.server.emit('request', req, res);
}