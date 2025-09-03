import { v7 as uuidv7 } from "uuid";
/** App-generated UUIDs using v7 for better database performance and ordering */
export const newId = () => uuidv7();
