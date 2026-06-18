import { application } from "../../../Application";

export async function logout(): Promise<void> {
  await application.http.post<void>("/identity/logout");
}
