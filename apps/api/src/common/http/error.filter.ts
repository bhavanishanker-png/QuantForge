import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown; requestId?: string };
}

const DEFAULT_CODES: Record<number, string> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE',
  429: 'RATE_LIMITED',
};

/** Throw this for a specific error code (API_DESIGN.md §3). */
export class ApiError extends HttpException {
  constructor(status: number, code: string, message: string, details?: unknown) {
    super({ code, message, details }, status);
  }
}

/** One error envelope for every failure. Never leaks internals on 5xx. */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly log = new Logger('ErrorFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: string }>();
    const res = ctx.getResponse<Response>();
    const requestId = req?.id ? String(req.id) : undefined;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorBody['error'] = { code: 'INTERNAL', message: 'Internal server error' };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      const obj = typeof r === 'object' && r !== null ? (r as Record<string, unknown>) : {};
      body = {
        code: typeof obj.code === 'string' ? obj.code : (DEFAULT_CODES[status] ?? 'ERROR'),
        message:
          typeof obj.code === 'string' && typeof obj.message === 'string'
            ? obj.message
            : exception.message,
        details: obj.details,
      };
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2002') {
      status = HttpStatus.CONFLICT;
      body = { code: 'CONFLICT', message: 'Resource already exists' };
    } else {
      this.log.error(exception);
    }

    if (status >= 500) body = { code: 'INTERNAL', message: 'Internal server error' };
    res.status(status).json({ error: { ...body, requestId } } satisfies ErrorBody);
  }
}
