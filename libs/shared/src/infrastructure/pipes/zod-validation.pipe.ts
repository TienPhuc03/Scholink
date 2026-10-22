import { PipeTransform, Injectable } from '@nestjs/common';
import { ZodSchema } from 'zod';
import { DomainException, ErrorCode } from '../../domain/domain.exception';

const HTML_TAG_REGEX = /<\/?[a-z][\s\S]*?>/gi;

export function sanitizeInput(input: unknown): unknown {
  if (typeof input === 'string') {
    return input.replace(HTML_TAG_REGEX, '').trim();
  }

  if (Array.isArray(input)) {
    return input.map((item) => sanitizeInput(item));
  }

  if (input !== null && typeof input === 'object') {
    const record = input as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(record)) {
      if (key.startsWith('$') || key.includes('.')) {
        throw new DomainException(
          ErrorCode.VALIDATION_ERROR,
          `Trường dữ liệu "${key}" chứa ký tự không hợp lệ`,
          400,
        );
      }
      sanitized[key] = sanitizeInput(value);
    }

    return Object.freeze(sanitized);
  }

  return input;
}

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    const cleanValue = sanitizeInput(value);
    const result = this.schema.safeParse(cleanValue);

    if (!result.success) {
      const details = result.error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));

      throw new DomainException(
        ErrorCode.VALIDATION_ERROR,
        'Dữ liệu đầu vào không hợp lệ',
        400,
        details,
      );
    }

    return Object.freeze(result.data);
  }
}
