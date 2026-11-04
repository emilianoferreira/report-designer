import { Routes } from '@angular/router';
import { unsavedChangesGuard } from './features/template-designer/guards/unsaved-changes.guard';
import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from './core/auth/auth.service';
import { TemplateStorageService } from './features/template-designer/services/template-storage.service';

const authenticated: CanActivateFn = () => inject(AuthService).session ? true : inject(Router).createUrlTree(['/login']);
const reportLoaded: CanActivateFn = () => inject(TemplateStorageService).ready.then(() => true);

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./core/auth/login.component').then(m => m.LoginComponent) },
  {
    path: '',
    redirectTo: 'templates',
    pathMatch: 'full'
  },
  {
    path: 'templates',
    canActivate: [authenticated],
    loadComponent: () =>
      import('./features/template-designer/components/template-list/template-list.component')
        .then(m => m.TemplateListComponent)
  },
  {
    path: 'price-labels',
    canActivate: [authenticated],
    loadComponent: () =>
      import('./features/price-label-designer/components/price-label-designer/price-label-designer.component')
        .then(m => m.PriceLabelDesignerComponent)
  },
  {
    path: 'designer/:id',
    canActivate: [authenticated, reportLoaded],
    loadComponent: () =>
      import('./features/template-designer/components/designer-page/designer-page.component')
        .then(m => m.DesignerPageComponent),
    canDeactivate: [unsavedChangesGuard]
  },
  // Legacy route redirect
  {
    path: 'designer',
    redirectTo: 'templates',
    pathMatch: 'full'
  }
];
