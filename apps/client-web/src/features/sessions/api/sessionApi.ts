import { createSessionApi, type SessionApi } from "@elevenhouse/session-web-client/api";
import { application } from "../../../Application";

export const sessionApi: SessionApi = createSessionApi(application.http);
