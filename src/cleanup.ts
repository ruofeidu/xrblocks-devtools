export async function runCleanupStep<T>(
  operation: () => Promise<T>,
  errors: unknown[]
) {
  try {
    return await operation();
  } catch (error) {
    errors.push(error);
    return undefined;
  }
}

export function throwCleanupErrors(errors: unknown[], message: string) {
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, message);
}
