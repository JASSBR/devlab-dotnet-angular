import { FormControl, FormGroup } from '@angular/forms';
import { describe, expect, it } from 'vitest';
import { passwordsMatch, strongPassword } from './forms';

describe('form validators (pure functions)', () => {
  it('strongPassword requires a digit and an uppercase letter', () => {
    expect(strongPassword(new FormControl('abcdefgh'))).toEqual({ digit: true, upper: true });
    expect(strongPassword(new FormControl('Abcdefg1'))).toBeNull();
  });

  it('passwordsMatch compares two controls of the group', () => {
    const group = new FormGroup({ password: new FormControl('a'), confirmPassword: new FormControl('b') });
    expect(passwordsMatch(group)).toEqual({ mismatch: true });
    group.controls.confirmPassword.setValue('a');
    expect(passwordsMatch(group)).toBeNull();
  });
});
