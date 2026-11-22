import { AfterViewInit, Component, ElementRef, EventEmitter, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LabelPrintProfileId, LabelTemplate } from '../../../../core/models/price-label-template.model';
import { PRICE_LABEL_PRESETS, createGuidedLabelTemplate } from '../../data/new-label-template';
import { resolveLabelLayout } from '../../utils/label-layout';

@Component({
  selector: 'app-price-label-setup',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './price-label-setup.component.html',
  styleUrl: './price-label-setup.component.scss'
})
export class PriceLabelSetupComponent implements AfterViewInit {
  @Output() configured = new EventEmitter<LabelTemplate>();
  @ViewChild('nameField') private nameField!: ElementRef<HTMLInputElement>;
  @ViewChild('widthField') private widthField?: ElementRef<HTMLInputElement>;
  @ViewChild('heightField') private heightField?: ElementRef<HTMLInputElement>;

  readonly presets = PRICE_LABEL_PRESETS;
  name = '';
  presetId = '50x30';
  width: number | null = 50;
  height: number | null = 30;
  support: LabelPrintProfileId = 'sheet';
  error = '';

  ngAfterViewInit(): void { this.nameField.nativeElement.focus(); }

  submit(): void {
    const name = this.name.trim();
    const preset = this.presets.find(item => item.id === this.presetId);
    const width = this.presetId === 'custom' ? this.width : preset?.width;
    const height = this.presetId === 'custom' ? this.height : preset?.height;
    if (!name) {
      this.error = 'Ingresá un nombre para el molde.';
      this.nameField.nativeElement.focus();
      return;
    }
    if (!this.validDimension(width) || !this.validDimension(height)) {
      this.error = 'Ingresá un ancho y un alto de al menos 10 mm.';
      const invalidField = this.validDimension(width) ? this.heightField : this.widthField;
      invalidField?.nativeElement.focus();
      return;
    }
    const template = createGuidedLabelTemplate(name, width, height, this.support);
    const { error } = resolveLabelLayout(template, this.support);
    if (error) {
      this.error = error;
      const { page } = template;
      const field = width > page.width - page.marginLeft - page.marginRight ? this.widthField : this.heightField;
      field?.nativeElement.focus();
      return;
    }
    this.error = '';
    this.configured.emit(template);
  }

  private validDimension(value: number | null | undefined): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 10;
  }
}
