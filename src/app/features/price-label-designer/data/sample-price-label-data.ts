import {
  PriceLabelArticle,
  PriceLabelCompany
} from '../../../core/models/price-label-template.model';

export const SAMPLE_PRICE_LABEL_COMPANY: PriceLabelCompany = {
  name: 'SolTech',
  currencySymbol: '$',
  logo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80" viewBox="0 0 160 80"><rect width="160" height="80" rx="10" fill="%2366164b"/><text x="80" y="47" text-anchor="middle" font-family="Arial" font-size="28" font-weight="700" fill="white">SolTech</text></svg>'
};

export const SAMPLE_PRICE_LABEL_ARTICLES: PriceLabelArticle[] = [
  {
    id: 'sample-001',
    name: 'Teclado mecanico Logitech',
    price: 4200,
    barcode: '779000100001'
  },
  {
    id: 'sample-002',
    name: 'Cable HDMI 2m',
    price: 350,
    barcode: '779000100002'
  },
  {
    id: 'sample-003',
    name: 'Mouse inalambrico',
    price: 1800,
    barcode: '779000100003'
  },
  {
    id: 'sample-004',
    name: 'Webcam HD 1080p',
    price: 2800,
    barcode: '779000100004'
  }
].map((article, index) => ({
  ...article,
  code: `MUESTRA-${index + 1}`,
  currencyCode: 'UYU',
  currencySymbol: '$',
  image: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80"><rect width="160" height="80" fill="#eee"/><text x="80" y="47" text-anchor="middle" font-family="Arial" font-size="22">Artículo</text></svg>')
}));

export const LABEL_SIMULATIONS = [
  { label: 'Artículos de ejemplo', changes: undefined },
  { label: 'Nombre largo', changes: { name: 'Juego de herramientas para mantenimiento doméstico con estuche, accesorios y adaptadores incluidos' } },
  { label: 'Precio cero', changes: { price: 0 } },
  { label: 'Precio largo', changes: { price: 123456789.99 } },
  { label: 'Código ausente', changes: { barcode: '' } }
];
