import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, AsyncValidatorFn, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { catchError, debounceTime, map, of, switchMap } from 'rxjs';
import { LessonShell } from '../../shared/lesson-shell';
import { Json2Pipe } from '../../shared/json-view';
import { lessonById } from '../catalog';

// ── Custom validators are plain functions ────────────────────────────────────
export const strongPassword: ValidatorFn = control => {
  const v: string = control.value ?? '';
  const errors: ValidationErrors = {};
  if (!/[0-9]/.test(v)) errors['digit'] = true;
  if (!/[A-Z]/.test(v)) errors['upper'] = true;
  return Object.keys(errors).length ? errors : null;
};

// Cross-field validator: attached to the GROUP, reads two controls.
export const passwordsMatch: ValidatorFn = group =>
  group.get('password')?.value === group.get('confirmPassword')?.value ? null : { mismatch: true };

// Async validator: returns an observable; the control is "pending" meanwhile.
const emailAvailable = (http: HttpClient): AsyncValidatorFn => control =>
  of(control.value).pipe(
    debounceTime(400),
    switchMap(email => http.get<{ userName: string }[]>('/api/auth/jwt/users').pipe(
      map(users => users.some(u => `${u.userName}@devlab.local` === email) ? { taken: true } : null),
      catchError(() => of(null)),
    )),
  );

@Component({
  selector: 'lesson-forms',
  imports: [LessonShell, ReactiveFormsModule, Json2Pipe],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>Reactive forms typés</h3>
        <p>Avec <code>fb.nonNullable.group(...)</code>, <code>form.value</code> est typé et <code>reset()</code> revient aux valeurs initiales
        plutôt qu'à <code>null</code>. Les validateurs sont des <strong>fonctions pures</strong> : faciles à tester, composables.</p>
        <ul>
          <li><strong>Sync</strong> : <code>Validators.required</code>, <code>strongPassword</code> (custom).</li>
          <li><strong>Cross-field</strong> : <code>passwordsMatch</code> posé sur le groupe.</li>
          <li><strong>Async</strong> : <code>emailAvailable</code> interroge l'API (alice&#64;devlab.local est pris) → état <code>pending</code>.</li>
          <li><strong>FormArray</strong> : liste dynamique de compétences.</li>
          <li><strong>Erreurs serveur</strong> : le 400 <code>ProblemDetails</code> de FluentValidation est mappé sur les contrôles avec <code>setErrors</code>.</li>
        </ul>
        <div class="callout">Note : Angular 21+ propose aussi les <em>Signal Forms</em> (expérimental). Les Reactive Forms restent le standard en entreprise.</div>
      </div>

      <div demo class="grid-2">
        <form class="card col" [formGroup]="form" (ngSubmit)="submit()">
          <div>
            <label>Email</label>
            <input formControlName="email" placeholder="you@devlab.local">
            @if (form.controls.email.pending) { <small class="muted pulse">vérification…</small> }
            @if (form.controls.email.hasError('taken')) { <small class="err">déjà utilisé côté serveur</small> }
            @if (form.controls.email.touched && form.controls.email.hasError('email')) { <small class="err">format invalide</small> }
          </div>
          <div>
            <label>Mot de passe</label>
            <input formControlName="password" type="password">
            @if (form.controls.password.hasError('minlength')) { <small class="err">8 caractères min</small> }
            @if (form.controls.password.hasError('digit')) { <small class="err">un chiffre</small> }
            @if (form.controls.password.hasError('upper')) { <small class="err">une majuscule</small> }
          </div>
          <div>
            <label>Confirmation</label>
            <input formControlName="confirmPassword" type="password">
            @if (form.hasError('mismatch') && form.controls.confirmPassword.touched) { <small class="err">ne correspond pas</small> }
          </div>
          <div>
            <label>Âge</label>
            <input formControlName="age" type="number">
          </div>
          <div formArrayName="skills">
            <label>Compétences (FormArray) <button type="button" class="sm" (click)="addSkill()">+</button></label>
            @for (s of form.controls.skills.controls; track $index) {
              <div class="row"><input [formControlName]="$index" placeholder="Angular, .NET…"><button type="button" class="sm" (click)="form.controls.skills.removeAt($index)">✕</button></div>
            }
          </div>
          <div class="row">
            <button class="primary" type="submit" [disabled]="form.invalid || form.pending">Envoyer à l'API</button>
            <button type="button" (click)="form.reset()">reset()</button>
            <span class="badge" [class.ok]="form.valid" [class.warn]="form.pending" [class.err]="form.invalid">{{ form.status }}</span>
          </div>
          @if (serverMessage()) { <div class="callout ok">{{ serverMessage() }}</div> }
          @if (serverErrors()) { <div class="callout err"><strong>400 ProblemDetails</strong><pre class="json">{{ serverErrors() | json2 }}</pre></div> }
        </form>

        <div class="card">
          <h3>form.value (typé, live)</h3>
          <pre class="json">{{ value() | json2 }}</pre>
          <h3>Erreurs</h3>
          <pre class="json">{{ errors() | json2 }}</pre>
        </div>
      </div>
    </lesson-shell>
  `,
  styles: [`.err { color: #fca5a5; font-size: .8rem; display: block; }`],
})
export class FormsLesson {
  readonly lesson = lessonById('forms')!;
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email], [emailAvailable(this.http)]],
    password: ['', [Validators.required, Validators.minLength(8), strongPassword]],
    confirmPassword: [''],
    age: [18, [Validators.required, Validators.min(13), Validators.max(120)]],
    skills: this.fb.array<string>(['Angular']),
  }, { validators: passwordsMatch });

  readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.value });
  readonly errors = toSignal(this.form.statusChanges.pipe(map(() => this.collectErrors())), { initialValue: {} });
  readonly serverMessage = signal<string | null>(null);
  readonly serverErrors = signal<Record<string, string[]> | null>(null);

  addSkill() { this.form.controls.skills.push(this.fb.nonNullable.control('')); }

  submit() {
    this.serverMessage.set(null); this.serverErrors.set(null);
    const { email, password, confirmPassword, age } = this.form.getRawValue();
    this.http.post<{ message: string }>('/api/validation/register', { email, password, confirmPassword, age }).subscribe({
      next: r => this.serverMessage.set(r.message),
      error: (e: HttpErrorResponse) => {
        const errors = e.error?.errors as Record<string, string[]> | undefined;
        if (!errors) return;
        this.serverErrors.set(errors);
        for (const [field, messages] of Object.entries(errors))
          this.form.get(field)?.setErrors({ server: messages.join(' ') });
      },
    });
  }

  private collectErrors() {
    const out: Record<string, ValidationErrors | null> = {};
    for (const [name, ctrl] of Object.entries(this.form.controls) as [string, AbstractControl][])
      if (ctrl.errors) out[name] = ctrl.errors;
    if (this.form.errors) out['_group'] = this.form.errors;
    return out;
  }
}
