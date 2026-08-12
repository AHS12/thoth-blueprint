import { zodToJsonSchema } from "zod-to-json-schema";
import { aiPatchSchema } from "./diagramPatchSchema";

/** Provider-facing schema generated from the runtime Zod contract. */
export const AI_PATCH_JSON_SCHEMA = zodToJsonSchema(aiPatchSchema, {
  name: "thoth_diagram_patch",
  $refStrategy: "root",
});
