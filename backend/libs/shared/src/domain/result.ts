export class Result<T, E = Error> {
  public isSuccess: boolean;
  public isFailure: boolean;
  private readonly _error?: E;
  private readonly _value?: T;

  private constructor(isSuccess: boolean, error?: E, value?: T) {
    if (isSuccess && error) {
      throw new Error('InvalidOperation: A result cannot be successful and contain an error');
    }
    if (!isSuccess && !error) {
      throw new Error('InvalidOperation: A failing result needs to contain an error message');
    }

    this.isSuccess = isSuccess;
    this.isFailure = !isSuccess;
    this._error = error;
    this._value = value;

    Object.freeze(this);
  }

  public getValue(): T {
    if (!this.isSuccess) {
      throw new Error('Can not get the value of an error result. Use errorValue instead.');
    }
    return this._value as T;
  }

  public getError(): E {
    return this._error as E;
  }

  public static ok<U, F = Error>(value?: U): Result<U, F> {
    return new Result<U, F>(true, undefined, value);
  }

  public static fail<U, F = Error>(error: F): Result<U, F> {
    return new Result<U, F>(false, error);
  }
}
