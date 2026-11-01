import '../../../../core/errors/failures.dart';
import '../../../../core/errors/result.dart';
import '../../domain/entities/passport_entity.dart';
import '../../domain/repositories/passport_repository.dart';
import '../datasources/passport_remote_data_source.dart';
import '../dtos/passport_dtos.dart';
import '../mappers/passport_mapper.dart';

class PassportRepositoryImpl implements PassportRepository {
  final PassportRemoteDataSource _remoteDataSource;

  PassportRepositoryImpl(this._remoteDataSource);

  @override
  Future<Result<PassportEntity, Failure>> getMyPassport() async {
    try {
      final PassportDetailDto dto = await _remoteDataSource.getMyPassport();
      final PassportEntity entity = PassportMapper.toEntity(dto);
      return SuccessResult<PassportEntity, Failure>(entity);
    } on Failure catch (failure) {
      return FailureResult<PassportEntity, Failure>(failure);
    } catch (e) {
      return FailureResult<PassportEntity, Failure>(ServerFailure(message: e.toString()));
    }
  }
}
