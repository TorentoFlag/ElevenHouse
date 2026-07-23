import { HttpException } from "@nestjs/common";

export function messagingHttpError(status: number, code: string, message: string): HttpException {
  return new HttpException({ statusCode: status, error: code, code, message }, status);
}
