import { presignS3Url } from './object-storage.service';

describe('presignS3Url (SigV4 query-string signing for MinIO)', () => {
  it('matches the published AWS SigV4 presigned GET example', () => {
    // AWS docs "Authenticating Requests: Using Query Parameters" example (virtual-host style, so
    // the bucket host is the origin and "test.txt" is the whole path).
    const url = presignS3Url({
      method: 'GET',
      origin: 'https://examplebucket.s3.amazonaws.com',
      bucket: 'test.txt',
      accessKey: 'AKIAIOSFODNN7EXAMPLE',
      secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      expiresInSeconds: 86400,
      now: new Date('2013-05-24T00:00:00Z'),
    });

    expect(url).toContain('X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404');
  });

  it('keeps the object key path and expiry for an upload URL', () => {
    const url = new URL(
      presignS3Url({
        method: 'PUT',
        origin: 'http://10.0.2.2:9000',
        bucket: 'scholink-documents',
        objectKey: 'uploads/usr_1/cv/ast_1-cv.pdf',
        accessKey: 'k',
        secretKey: 's',
        expiresInSeconds: 900,
      }),
    );

    expect(url.pathname).toBe('/scholink-documents/uploads/usr_1/cv/ast_1-cv.pdf');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });
});
