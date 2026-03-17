import { parseAsString } from "nuqs";
import { createSearchParamsCache } from "nuqs/server";

export const workspaceParams = {
  sourceId: parseAsString,
  speakerId: parseAsString,
  activeSegmentId: parseAsString,
};

export const workspaceParamsCache = createSearchParamsCache(workspaceParams);
