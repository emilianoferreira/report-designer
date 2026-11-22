/**
 * Unsaved Changes Guard
 * Prevents navigation away from the designer when there are unsaved changes.
 * Works with both Angular Router navigation and browser tab close/refresh.
 */
import { CanDeactivateFn } from '@angular/router';

export interface HasUnsavedChanges {
  hasUnsavedChanges(nextUrl?: string): boolean;
}

export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component, _route, _current, next) => {
  if (component.hasUnsavedChanges(next.url)) {
    return confirm('Hay cambios sin guardar. ¿Desea salir sin guardar?');
  }
  return true;
};
