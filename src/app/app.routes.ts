import { Routes, UrlMatcher } from '@angular/router';
import { unsavedChangesGuard } from './features/template-designer/guards/unsaved-changes.guard';
import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from './core/auth/auth.service';
import { TemplateStorageService } from './features/template-designer/services/template-storage.service';

const authenticated: CanActivateFn = () => inject(AuthService).session ? true : inject(Router).createUrlTree(['/login']);
const reportLoaded: CanActivateFn = () => inject(TemplateStorageService).ready.then(() => true);
const canOpenLabelDesigner: CanActivateFn = route => route.paramMap.has('id') || inject(AuthService).session?.role === 'editor' || inject(Router).createUrlTree(['/templates']);
const labelDesignerRoute: UrlMatcher = segments => {
  if (segments[0]?.path !== 'price-labels') return null;
  if (segments.length === 2 && segments[1].path === 'new') return { consumed: segments };
  if (segments.length === 3 && segments[2].path === 'edit') return { consumed: segments, posParams: { id: segments[1] } };
  return null;
};
const loadLabelDesigner = () => import('./features/price-label-designer/components/price-label-designer/price-label-designer.component')
  .then(m => m.PriceLabelDesignerComponent);

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
    path: 'price-labels/print',
    canActivate: [authenticated],
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./features/price-label-print/label-print-page.component').then(m => m.LabelPrintPageComponent)
  },
  {
    matcher: labelDesignerRoute,
    canActivate: [authenticated, canOpenLabelDesigner],
    canDeactivate: [unsavedChangesGuard],
    loadComponent: loadLabelDesigner
  },
  {
    path: 'price-labels',
    canDeactivate: [unsavedChangesGuard],
    canActivate: [authenticated],
    loadComponent: loadLabelDesigner
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
