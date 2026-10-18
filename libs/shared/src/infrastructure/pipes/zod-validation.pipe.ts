import { PipeTransform, ArgumentMetadata, Injectable } from '@nestjs/common';
import { ZodSchema, ZodError } from 'zod';
import { DomainException, ErrorCode } from '../../domain/domain.exception';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema<any>) {}

  transform(value: any, metadata: ArgumentMetadata) {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          rule: err.code,
        }));
        throw new DomainException(
          ErrorCode.VALIDATION_ERROR,
          'Dữ liệu đầu vào không hợp lệ',
          400,
          details,
        );
      }
      throw error;
    }
  }
}
