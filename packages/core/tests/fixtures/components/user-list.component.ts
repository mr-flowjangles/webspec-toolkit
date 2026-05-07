/**
 * Fixture component — service-injecting (constructor DI).
 *
 * Exercises HttpClient + Router as standard providers the renderer must
 * recognize, plus a custom service that should fall through to the
 * generic { provide, useValue: {} } stub.
 */
import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

interface User {
  id: string;
  name: string;
}

class UserService {
  resolve(_id: string): User {
    return { id: _id, name: '' };
  }
}

@Component({
  selector: 'app-user-list',
  standalone: true,
  template: `
    <ul>
      <li *ngFor="let user of users">{{ user.name }}</li>
    </ul>
  `,
})
export class UserListComponent implements OnInit {
  users: User[] = [];

  constructor(
    private http: HttpClient,
    private router: Router,
    private userService: UserService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.http.get<User[]>('/api/users').subscribe((users) => {
      this.users = users;
    });
  }

  open(id: string): void {
    this.router.navigate(['/users', id]);
  }
}
