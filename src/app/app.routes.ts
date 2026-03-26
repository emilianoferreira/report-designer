import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'designer',
    pathMatch: 'full'
  },
  {
    path: 'designer',
    loadComponent: () =>
      import('./features/template-designer/components/designer-page/designer-page.component')
        .then(m => m.DesignerPageComponent)
  }
];
