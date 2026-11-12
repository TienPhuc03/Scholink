import { MediaUseCase } from './media.use-case';

describe('MediaUseCase.fileLink (links to Passport files)', () => {
  const asset = (status: string) => ({
    id: 'ast_cv',
    status,
    objectKey: 'uploads/u1/cv/ast_cv-cv.pdf',
    fileName: 'cv.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1234,
  });

  const build = (status: string, storage?: { enabled: boolean; exists: jest.Mock }) =>
    new MediaUseCase(
      { findMediaAssetById: jest.fn(async () => asset(status)) } as never,
      {} as never,
      storage
        ? ({ ...storage, presignDownload: (_k: string, _t: number, _n: string, inline: boolean) => `url?inline=${inline}` } as never)
        : undefined,
    );

  it('never links a file that failed the scan or is still uploading', async () => {
    const storage = { enabled: true, exists: jest.fn(async () => true) };
    expect(await build('REJECTED', storage).fileLink('ast_cv')).toBeUndefined();
    expect(await build('UPLOADING', storage).fileLink('ast_cv')).toBeUndefined();
  });

  it('links a READY file that is in the bucket, inline for viewing and as a download', async () => {
    const link = await build('READY', { enabled: true, exists: jest.fn(async () => true) }).fileLink('ast_cv');
    expect(link).toEqual(expect.objectContaining({ fileName: 'cv.pdf', viewUrl: 'url?inline=true', downloadUrl: 'url?inline=false' }));
  });

  it('gives no URL when the bytes are not in the bucket or there is no bucket', async () => {
    const missing = await build('READY', { enabled: true, exists: jest.fn(async () => false) }).fileLink('ast_cv');
    expect(missing).toEqual(expect.objectContaining({ fileName: 'cv.pdf', viewUrl: '', downloadUrl: '' }));
    expect((await build('READY').fileLink('ast_cv'))?.viewUrl).toBe('');
  });
});
