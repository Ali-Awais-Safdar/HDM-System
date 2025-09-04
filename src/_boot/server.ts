import { buildApp } from "../app/app";
import { env } from "../env/env";
import { logger } from "../shared/logging/logger";

const app = buildApp();
app.listen(env.PORT, () => {
  logger.info(`HTTP server listening on :${env.PORT}`);
});
