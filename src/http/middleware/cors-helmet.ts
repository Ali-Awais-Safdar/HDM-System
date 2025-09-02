import cors from "cors";
import helmet from "helmet";
import { Express } from "express";

export function useSecurity(app: Express) {
  app.use(cors());
  app.use(helmet());
}
