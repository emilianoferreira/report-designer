import { unsavedChangesGuard, HasUnsavedChanges } from './unsaved-changes.guard';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';

describe('unsavedChangesGuard', () => {
  let mockComponent: HasUnsavedChanges;
  let mockCurrentRoute: ActivatedRouteSnapshot;
  let mockCurrentState: RouterStateSnapshot;
  let mockNextState: RouterStateSnapshot;

  beforeEach(() => {
    mockCurrentRoute = {} as ActivatedRouteSnapshot;
    mockCurrentState = {} as RouterStateSnapshot;
    mockNextState = {} as RouterStateSnapshot;
  });

  it('should return true when there are no unsaved changes', () => {
    mockComponent = { hasUnsavedChanges: () => false };
    const result = unsavedChangesGuard(
      mockComponent,
      mockCurrentRoute,
      mockCurrentState,
      mockNextState
    );
    expect(result).toBe(true);
  });

  it('should call confirm when there are unsaved changes', () => {
    mockComponent = { hasUnsavedChanges: () => true };
    spyOn(window, 'confirm').and.returnValue(true);

    unsavedChangesGuard(
      mockComponent,
      mockCurrentRoute,
      mockCurrentState,
      mockNextState
    );

    expect(window.confirm).toHaveBeenCalled();
  });

  it('should return true when user confirms leaving', () => {
    mockComponent = { hasUnsavedChanges: () => true };
    spyOn(window, 'confirm').and.returnValue(true);

    const result = unsavedChangesGuard(
      mockComponent,
      mockCurrentRoute,
      mockCurrentState,
      mockNextState
    );
    expect(result).toBe(true);
  });

  it('should return false when user cancels leaving', () => {
    mockComponent = { hasUnsavedChanges: () => true };
    spyOn(window, 'confirm').and.returnValue(false);

    const result = unsavedChangesGuard(
      mockComponent,
      mockCurrentRoute,
      mockCurrentState,
      mockNextState
    );
    expect(result).toBe(false);
  });

  it('should display the correct confirmation message in Spanish', () => {
    mockComponent = { hasUnsavedChanges: () => true };
    spyOn(window, 'confirm').and.returnValue(false);

    unsavedChangesGuard(
      mockComponent,
      mockCurrentRoute,
      mockCurrentState,
      mockNextState
    );

    expect(window.confirm).toHaveBeenCalledWith(
      'Hay cambios sin guardar. ¿Desea salir sin guardar?'
    );
  });

  it('should not call confirm when there are no unsaved changes', () => {
    mockComponent = { hasUnsavedChanges: () => false };
    spyOn(window, 'confirm');

    unsavedChangesGuard(
      mockComponent,
      mockCurrentRoute,
      mockCurrentState,
      mockNextState
    );

    expect(window.confirm).not.toHaveBeenCalled();
  });
});
