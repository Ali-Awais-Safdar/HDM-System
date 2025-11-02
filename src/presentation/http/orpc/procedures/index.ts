import { documentProcedures } from "./document"
import { uploadProcedures } from "./upload"
import { documentVersionProcedures } from "./document-version"
import { downloadTokenProcedures } from "./download-token"
import { accessPolicyProcedures } from "./access-policy"
import { userProcedures } from "./user"

export const router = {
  document: documentProcedures,
  upload: uploadProcedures,
  "document-version": documentVersionProcedures,
  "download-token": downloadTokenProcedures,
  "access-policy": accessPolicyProcedures,
  user: userProcedures
}

export type Router = typeof router
