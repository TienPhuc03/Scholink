/// Monad Result<Success, Failure> for OOP functional error handling.
/// Eliminates runtime NullPointerExceptions and unhandled null crashes.
sealed class Result<S, F> {
  const Result();

  /// Pattern-matching fold method that exhaustively processes success or failure.
  R fold<R>({
    required R Function(S success) onSuccess,
    required R Function(F failure) onFailure,
  });

  bool get isSuccess => this is SuccessResult<S, F>;
  bool get isFailure => this is FailureResult<S, F>;

  S? get dataOrNull => switch (this) {
        SuccessResult<S, F>(data: final d) => d,
        FailureResult<S, F>() => null,
      };

  F? get errorOrNull => switch (this) {
        SuccessResult<S, F>() => null,
        FailureResult<S, F>(error: final e) => e,
      };
}

final class SuccessResult<S, F> extends Result<S, F> {
  final S data;
  const SuccessResult(this.data);

  @override
  R fold<R>({
    required R Function(S success) onSuccess,
    required R Function(F failure) onFailure,
  }) =>
      onSuccess(data);
}

final class FailureResult<S, F> extends Result<S, F> {
  final F error;
  const FailureResult(this.error);

  @override
  R fold<R>({
    required R Function(S success) onSuccess,
    required R Function(F failure) onFailure,
  }) =>
      onFailure(error);
}
