import { parseAsString } from "nuqs";
import { createSearchParamsCache } from "nuqs/server";

export const SEGMENTS_PAGE_LIMIT = 100;

export const workspaceParams = {
  sourceId: parseAsString,
  speakerId: parseAsString,
};

export const workspaceParamsCache = createSearchParamsCache(workspaceParams);
