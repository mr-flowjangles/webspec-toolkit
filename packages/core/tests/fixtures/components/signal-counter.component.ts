/**
 * Fixture component — modern Angular 19+ signal API.
 *
 * Exercises:
 *   - input() + input.required<T>() — signal inputs
 *   - output<T>() — signal output
 *   - inject() — modern DI pattern
 *   - a computed-signal pattern via internal state
 */
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-signal-counter',
  standalone: true,
  template: `
    <div class="counter">
      <span data-testid="value">{{ value() }}</span>
      <button type="button" (click)="increment()">+1</button>
    </div>
  `,
})
export class SignalCounterComponent {
  initial = input<number>(0);
  step = input.required<number>();

  changed = output<{ next: number }>();

  private http = inject(HttpClient);
  private internalValue = signal(0);

  readonly value = computed(() => this.initial() + this.internalValue());

  increment(): void {
    this.internalValue.update((v) => v + this.step());
    this.changed.emit({ next: this.value() });
  }

  reset(): void {
    this.internalValue.set(0);
    this.http.post('/api/counter/reset', {}).subscribe();
  }
}
