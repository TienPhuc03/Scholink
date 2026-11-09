import { join } from 'path';
import * as protoLoader from '@grpc/proto-loader';
import { MediaUseCase } from '../application/use-cases/media.use-case';
import { ProfileController } from './profile.controller';

describe('ProfileController.updateMyPassport (empty lists over gRPC)', () => {
  it('turns the lists named in clearFields into empty lists', async () => {
    const updateMyPassport = jest.fn(async () => ({}));
    const controller = new ProfileController({ updateMyPassport } as never, {} as never);

    await controller.updateMyPassport({
      studentId: 'stu_1',
      fullName: 'Nguyễn Văn A',
      clearFields: ['skills', 'certificates', 'fullName'],
    });

    expect(updateMyPassport).toHaveBeenCalledWith('stu_1', {
      fullName: 'Nguyễn Văn A',
      skills: [],
      certificates: [],
    });
  });

  it('clearFields survives the real proto while the empty list itself does not', () => {
    const method = protoLoader.loadSync(join(process.cwd(), 'libs/shared/src/protos/identity.proto'))[
      'scholink.identity.IdentityGrpcService'
    ] as protoLoader.ServiceDefinition;
    const { requestSerialize, requestDeserialize } = method.UpdateMyPassport;

    const received = requestDeserialize(
      requestSerialize({ studentId: 'stu_1', skills: [], clearFields: ['skills'] }) as Buffer,
    ) as Record<string, unknown>;

    expect(received.skills).toBeUndefined();
    expect(received.clearFields).toEqual(['skills']);
  });
});

describe('MediaUseCase.verifyAssetsUsableByStudent', () => {
  it('rejects an id with no media record, whatever its prefix', async () => {
    const useCase = new MediaUseCase({ findMediaAssetsByIds: jest.fn(async () => []) } as never, {} as never);

    await expect(useCase.verifyAssetsUsableByStudent('stu_1', ['asset_fake.pdf'])).rejects.toMatchObject({
      code: 'ASSET_NOT_AVAILABLE',
    });
  });
});
