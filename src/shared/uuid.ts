import { v4 as uuid } from "uuid";
/** App-generated IDs (no DB-generated ids). */
export const newId = () => uuid();
