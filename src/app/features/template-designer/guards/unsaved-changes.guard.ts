/**
 * Unsaved Changes Guard
 * Prevents navigation away from the designer when there are unsaved changes.
 * Works with both Angular Router navigation and browser tab close/refresh.
 */
import { CanDeactivateFn } from '@angular/router';

export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) => {
  if (component.hasUnsavedChanges()) {
    return confirm('Hay cambios sin guardar. ¿Desea salir sin guardar?');
  }
  return true;
};
