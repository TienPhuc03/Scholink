import '../../../../core/errors/failures.dart';
import '../../../../core/errors/result.dart';
import '../entities/passport_entity.dart';
import '../repositories/passport_repository.dart';

class GetPassportUseCase {
  final PassportRepository _repository;

  GetPassportUseCase(this._repository);

  Future<Result<PassportEntity, Failure>> call() => _repository.getMyPassport();
}
