import { app } from "./app.js";
import { config } from "./config.js";
import { startAuditLogCron } from "./audit.js";

app.listen(config.port, () => console.log(`T-RED Booking API listening on http://localhost:${config.port}`));
startAuditLogCron();
