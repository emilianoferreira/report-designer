import { Injectable } from '@angular/core';
import { NavigationEnd, PRIMARY_OUTLET, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { LabelPrintProfileId } from '../../core/models/price-label-template.model';
import { PriceList } from './label-print-api.service';
import { LabelPrintLine } from './label-print-session.service';

export interface LabelPrintDraft {
  templateId: string;
  profile: LabelPrintProfileId;
  lines: LabelPrintLine[];
  listId: string;
  selectedList?: PriceList;
  query: string;
}

@Injectable({ providedIn: 'root' })
export class LabelPrintDraftService {
  private sequence = 0;
  private handoff?: { token: string; companyId: string; userId: string; editorTemplateId: string; draft: LabelPrintDraft };

  constructor(private auth: AuthService, router: Router) {
    auth.session$.subscribe(session => {
      if (session?.company_id !== this.handoff?.companyId || session?.user.id !== this.handoff?.userId) {
        this.handoff = undefined;
      }
    });
    router.events.subscribe(event => {
      if (!(event instanceof NavigationEnd) || !this.handoff) return;
      const url = router.parseUrl(event.urlAfterRedirects);
      const path = url.root.children[PRIMARY_OUTLET]?.segments.map(segment => segment.path).join('/');
      if (url.queryParams['batch'] !== this.handoff.token ||
          (path !== `price-labels/${this.handoff.editorTemplateId}/edit` && path !== 'price-labels/print')) {
        this.handoff = undefined;
      }
    });
  }

  stage(draft: LabelPrintDraft): string | undefined {
    const session = this.auth.session;
    if (!session || this.auth.leavingSession || !draft.lines.length) return undefined;
    const token = String(++this.sequence);
    this.handoff = { token, companyId: session.company_id, userId: session.user.id,
      editorTemplateId: draft.templateId, draft: structuredClone(draft) };
    return token;
  }

  canResume(token: string | null, templateId: string | null): boolean {
    return !this.auth.leavingSession && token !== null && token === this.handoff?.token &&
      templateId === this.handoff.editorTemplateId;
  }

  retarget(token: string, from: string, to: string): void {
    if (this.handoff && this.canResume(token, from)) this.handoff.editorTemplateId = to;
  }

  take(token: string | null, templateId: string): LabelPrintDraft | undefined {
    const handoff = this.handoff;
    if (!handoff || !this.canResume(token, handoff.editorTemplateId) ||
        (templateId !== handoff.editorTemplateId && templateId !== handoff.draft.templateId)) return undefined;
    const draft = handoff.draft;
    this.handoff = undefined;
    return draft;
  }

  discard(token: string): void {
    if (this.handoff?.token === token) this.handoff = undefined;
  }
}
