import { bootstrapApplication } from '@angular/platform-browser';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { AppComponent } from './app.component';
import { APP_BASE_HREF } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { routes } from './app/app.routes';

bootstrapApplication(AppComponent, {
  providers: [
    provideZonelessChangeDetection(),
    provideHttpClient(),
    provideRouter(routes, withHashLocation()),
    { provide: APP_BASE_HREF, useValue: '/' }
  ]
}).catch(err => console.error(err));
