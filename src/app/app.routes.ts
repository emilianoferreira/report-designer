import { Routes } from '@angular/router';
import { unsavedChangesGuard } from './features/template-designer/guards/unsaved-changes.guard';

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
