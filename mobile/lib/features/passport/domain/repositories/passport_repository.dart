import '../../../../core/errors/failures.dart';
import '../../../../core/errors/result.dart';
import '../entities/passport_entity.dart';

abstract interface class PassportRepository {
  Future<Result<PassportEntity, Failure>> getMyPassport();
}
