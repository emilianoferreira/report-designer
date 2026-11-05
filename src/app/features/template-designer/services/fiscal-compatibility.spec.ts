import { TestBed } from '@angular/core/testing';
import { FiscalProfile } from '../../../core/models/fiscal.model';
import { createDefaultTemplate } from '../data/default-template';
import { SAMPLE_INVOICE_DATA } from '../data/sample-invoice';
import { cloneElement } from '../utils/element-factory';
import { HtmlRendererService } from './html-renderer.service';
import { TemplateStateService } from './template-state.service';

describe('Fiscal metadata compatibility', () => {
  const profile: FiscalProfile = { schemaVersion: '1.0', jurisdiction: 'UY', output: 'browser', cfeType: 111 };
  it('does not add optional metadata when loading a legacy mold', () => {
    const state = TestBed.inject(TemplateStateService);
    const legacy = createDefaultTemplate();
    const json = JSON.stringify(legacy);
    state.setTemplate(legacy);
    expect(JSON.stringify(state.getCurrentTemplate())).toBe(json);
    expect('compliance' in state.getCurrentTemplate()).toBeFalse();
    expect(state.getElements('header').some(e => 'fiscalRoles' in e)).toBeFalse();
  });
  it('undoes and redoes profile and role changes without altering the layout', () => {
    const state = TestBed.inject(TemplateStateService);
    const before = JSON.stringify(state.getCurrentTemplate());
    const id = state.getElements('header')[0].id;
    state.updateFiscalProfile(profile);
    state.updateElement('header', id, { fiscalRoles: ['issuer.name', 'issuer.rut'] });
    const edited = JSON.stringify(state.getCurrentTemplate());
    state.undo(); state.undo();
    expect(JSON.stringify(state.getCurrentTemplate())).toBe(before);
    state.redo(); state.redo();
    expect(JSON.stringify(state.getCurrentTemplate())).toBe(edited);
    state.updateFiscalProfile(undefined);
    expect('compliance' in state.getCurrentTemplate()).toBeFalse();
    state.undo();
    expect(JSON.stringify(state.getCurrentTemplate())).toBe(edited);
  });
  it('preserves declared roles during duplication and movement, with independent arrays', () => {
    const state = TestBed.inject(TemplateStateService);
    const id = state.getElements('header')[0].id;
    state.updateElement('header', id, { fiscalRoles: ['issuer.name'] });
    const original = state.getElement('header', id)!;
    const copy = cloneElement(original);
    expect(copy.id).not.toBe(id);
    copy.fiscalRoles!.push('issuer.rut');
    expect(original.fiscalRoles).toEqual(['issuer.name']);
    state.moveElementToSection('header', 'footer', id, { x: 4, y: 5 });
    expect(state.getElement('footer', id)!.fiscalRoles).toEqual(['issuer.name']);
  });
  it('leaves both render and Zureo export unchanged when only fiscal metadata is added', () => {
    const template = createDefaultTemplate();
    const renderer = TestBed.inject(HtmlRendererService);
    const beforeHtml = renderer.renderPreview(template, SAMPLE_INVOICE_DATA);
    const beforeZureo = renderer.exportAsZureoTemplate(template);
    template.compliance = profile;
    template.sections.header.elements[0].fiscalRoles = ['issuer.name'];
    expect(renderer.renderPreview(template, SAMPLE_INVOICE_DATA)).toBe(beforeHtml);
    expect(renderer.exportAsZureoTemplate(template)).toBe(beforeZureo);
    const exported = JSON.parse(JSON.stringify(template));
    expect(exported.compliance).toEqual(profile);
    expect(exported.fiscal).toBeUndefined();
  });
});
