import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * Checks that a YYYY-MM-DD date is the same day as, or later than, another field.
 * Comparing the ISO strings directly is fine because the format sorts lexically.
 */
export function IsOnOrAfter(property: string, options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isOnOrAfter',
      target: object.constructor,
      propertyName,
      constraints: [property],
      options: {
        message: `${propertyName} must be on or after ${property}`,
        ...options,
      },
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [relatedName] = args.constraints as [string];
          const related = (args.object as Record<string, unknown>)[relatedName];

          // Let @IsDateString report bad formats; only compare valid strings
          if (typeof value !== 'string' || typeof related !== 'string') {
            return true;
          }
          return isOnOrAfter(value, related);
        },
      },
    });
  };
}

export function isOnOrAfter(date: string, other: string): boolean {
  return date.slice(0, 10) >= other.slice(0, 10);
}
