import * as dotenv from "dotenv";
dotenv.config();

import { app } from './app';

app.listen({
    port: 3000
}).then(
    () => console.log('Server is running on port 3000')
).catch(
    (err) => {
        console.error(err);
        process.exit(1);
    }
);