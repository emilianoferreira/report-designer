import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'templates',
    pathMatch: 'full'
  },
  {
    path: 'templates',
    loadComponent: () =>
      import('./features/template-designer/components/template-list/template-list.component')
        .then(m => m.TemplateListComponent)
  },
  {
    path: 'designer/:id',
    loadComponent: () =>
      import('./features/template-designer/components/designer-page/designer-page.component')
        .then(m => m.DesignerPageComponent)
  },
  // Legacy route redirect
  {
    path: 'designer',
    redirectTo: 'templates',
    pathMatch: 'full'
  }
];
