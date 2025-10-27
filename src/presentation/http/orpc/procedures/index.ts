import { documentProcedures } from "./document"
import { uploadProcedures } from "./upload"
import { documentVersionProcedures } from "./document-version"
import { downloadTokenProcedures } from "./download-token"
import { accessPolicyProcedures } from "./access-policy"

export const procedures = {
  document: documentProcedures,
  upload: uploadProcedures,
  "document-version": documentVersionProcedures,
  "download-token": downloadTokenProcedures,
  "access-policy": accessPolicyProcedures
}

export type Procedures = typeof procedures
