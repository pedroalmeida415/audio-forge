import { parseAsString } from "nuqs";
import { createSearchParamsCache } from "nuqs/server";

export const workspaceParams = {
  sourceId: parseAsString,
  speakerId: parseAsString,
};

export const workspaceParamsCache = createSearchParamsCache(workspaceParams);
