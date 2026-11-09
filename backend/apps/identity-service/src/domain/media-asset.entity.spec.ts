import { MediaAsset } from './media-asset.entity';

describe('MediaAsset.inspectAndComplete (F13)', () => {
  const owner = 'stu_1';
  const pdfHeader = '255044462d312e37';

  const uploading = (mimeType = 'application/pdf', category: 'CV' | 'CERTIFICATE' | 'PITCH_VIDEO' = 'CV') =>
    MediaAsset.createInitiated({
      id: 'ast_1',
      ownerId: owner,
      category,
      fileName: 'file.bin',
      mimeType,
      sizeBytes: 1000,
    });

  const complete = (asset: MediaAsset, fileHeaderHex?: string, sampleContent: string | undefined = 'clean') =>
    asset.inspectAndComplete({ actorId: owner, fileHeaderHex, sampleContent });

  it('marks a clean file READY', () => {
    expect(complete(uploading(), pdfHeader).updatedAsset.status).toBe('READY');
  });

  it('cannot turn a REJECTED file into READY by completing it again', () => {
    const rejected = complete(uploading(), pdfHeader, 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE').updatedAsset;
    expect(rejected.status).toBe('REJECTED');
    expect(() => complete(rejected, pdfHeader)).toThrow(/tải lên một tệp mới/);
  });

  it('leaves a READY file unchanged when complete is sent again', () => {
    const ready = complete(uploading(), pdfHeader).updatedAsset;
    expect(complete(ready, pdfHeader, 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE').updatedAsset).toBe(ready);
  });

  it('requires the file header and content sample', () => {
    expect(() => complete(uploading(), undefined)).toThrow(/fileHeaderHex/);
    expect(() => uploading().inspectAndComplete({ actorId: owner, fileHeaderHex: pdfHeader })).toThrow(/sampleContent/);
  });

  it('rejects a signature that is not at the start of the file', () => {
    const { updatedAsset } = complete(uploading(), `00112233${pdfHeader}`);
    expect(updatedAsset.status).toBe('REJECTED');
  });

  it('checks WebP and MP4 signatures at their real offsets', () => {
    const webp = uploading('image/webp', 'CERTIFICATE');
    expect(complete(webp, '52494646aabbccdd57454250').updatedAsset.status).toBe('READY');
    expect(complete(webp, '52494646aabbccdd41564920').updatedAsset.status).toBe('REJECTED');

    const mp4 = uploading('video/mp4', 'PITCH_VIDEO');
    expect(complete(mp4, '0000001466747970').updatedAsset.status).toBe('READY');
  });
});
