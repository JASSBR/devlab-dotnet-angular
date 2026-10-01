import { Pipe, PipeTransform } from '@angular/core';

/** Pretty-prints any value — used everywhere to show raw API responses. */
@Pipe({ name: 'json2' })
export class Json2Pipe implements PipeTransform {
  transform(value: unknown): string {
    if (value === undefined) return '';
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  }
}
