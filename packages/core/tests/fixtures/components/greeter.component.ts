/**
 * Fixture component — presentational, decorator-based @Input/@Output.
 *
 * Used by parser + renderer integration tests. Should look like a typical
 * Angular 19+ standalone component a Bellese team would write.
 */
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-greeter',
  standalone: true,
  template: `
    <div class="greeter">
      <h1>Hello, {{ name }}!</h1>
      <button type="button" (click)="dismiss()">Dismiss</button>
    </div>
  `,
})
export class GreeterComponent {
  @Input() name = 'World';
  @Input({ required: true }) tone!: 'formal' | 'casual';

  @Output() dismissed = new EventEmitter<void>();

  dismiss(): void {
    this.dismissed.emit();
  }
}
