import { z } from 'zod';
import { ZodValidationPipe, sanitizeInput } from './zod-validation.pipe';
import { DomainException, ErrorCode } from '../../domain/domain.exception';

describe('ZodValidationPipe & Input Sanitization (Security & XSS/NoSQL Prevention)', () => {
  describe('sanitizeInput', () => {
    it('should strip dangerous HTML tags from strings', () => {
      const dirty = '<script>alert("xss")</script>Hello <b>World</b>';
      const clean = sanitizeInput(dirty);
      expect(clean).toBe('alert("xss")Hello World');
    });

    it('should recursively sanitize objects and arrays', () => {
      const payload = {
        title: '   Scholarship <i>2026</i>   ',
        tags: ['<img src="x" onerror="alert(1)"/>AI', '  NodeJS  '],
      };
      const sanitized = sanitizeInput(payload) as any;
      expect(sanitized.title).toBe('Scholarship 2026');
      expect(sanitized.tags[0]).toBe('AI');
      expect(sanitized.tags[1]).toBe('NodeJS');
    });

    it('should block NoSQL injection attempt when key begins with $ or contains dot', () => {
      const maliciousPayload = {
        $gt: '',
      };
      expect(() => sanitizeInput(maliciousPayload)).toThrow(DomainException);

      const nestedDotPayload = {
        'user.role': 'ADMIN',
      };
      expect(() => sanitizeInput(nestedDotPayload)).toThrow(DomainException);
    });
  });

  describe('ZodValidationPipe.transform', () => {
    const testSchema = z.object({
      email: z.string().email('Email không đúng định dạng'),
      age: z.number().min(18, 'Phải từ 18 tuổi trở lên'),
    });

    const pipe = new ZodValidationPipe(testSchema);

    it('should pass valid data successfully', () => {
      const result = pipe.transform({
        email: 'student@scholink.edu.vn',
        age: 21,
      });

      expect(result).toEqual({
        email: 'student@scholink.edu.vn',
        age: 21,
      });
    });

    it('should throw DomainException (400) when schema validation fails', () => {
      try {
        pipe.transform({
          email: 'not-an-email',
          age: 15,
        });
        fail('Expected validation error');
      } catch (err: any) {
        expect(err).toBeInstanceOf(DomainException);
        expect(err.code).toBe(ErrorCode.VALIDATION_ERROR);
        expect(err.statusCode).toBe(400);
        expect(err.details.length).toBe(2);
      }
    });
  });
});
