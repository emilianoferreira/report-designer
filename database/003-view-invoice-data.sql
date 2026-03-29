-- ============================================================================
-- Vista que transforma los datos relacionales al formato InvoiceData
-- que espera el HtmlRendererService del frontend.
--
-- Uso: SELECT build_invoice_data('f1000000-0000-0000-0000-000000000001');
-- ============================================================================

CREATE OR REPLACE FUNCTION build_invoice_data(p_invoice_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_invoice RECORD;
  v_company RECORD;
  v_contact RECORD;
  v_currency RECORD;
  v_invoice_type RECORD;
  v_branch RECORD;
  v_lines JSONB;
  v_taxes JSONB;
  v_has_contacto BOOLEAN;
  v_has_dto_global BOOLEAN;
  v_has_redondeo BOOLEAN;
BEGIN
  -- Cargar factura
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RETURN '{"error": "Invoice not found"}'::JSONB;
  END IF;

  -- Cargar relaciones
  SELECT * INTO v_company FROM companies WHERE id = v_invoice.company_id;
  SELECT * INTO v_invoice_type FROM invoice_types WHERE id = v_invoice.type_id;
  SELECT * INTO v_currency FROM currencies WHERE id = v_invoice.currency_id;
  SELECT * INTO v_branch FROM branches WHERE id = v_invoice.branch_id;

  -- Contacto (puede ser null)
  v_has_contacto := v_invoice.contact_id IS NOT NULL;
  IF v_has_contacto THEN
    SELECT * INTO v_contact FROM contacts WHERE id = v_invoice.contact_id;
  END IF;

  -- Flags
  v_has_dto_global := v_invoice.porcentaje_desc_global > 0;
  v_has_redondeo := v_invoice.redondeo != 0;

  -- Lineas de factura
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'Articulo', jsonb_build_object(
        'Codigo', il.articulo_codigo,
        'Nombre', il.articulo_nombre
      ),
      'Cantidad', il.cantidad,
      'PrecioUnitario', il.precio_unitario,
      'PrecioUnitarioNeto', il.precio_unitario_neto,
      'Descuento', il.descuento,
      'SubTotal', il.subtotal
    ) ORDER BY il.linea_nro
  ), '[]'::JSONB)
  INTO v_lines
  FROM invoice_lines il WHERE il.invoice_id = p_invoice_id;

  -- Impuestos
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'Nombre', it.nombre,
      'Valor', it.valor
    )
  ), '[]'::JSONB)
  INTO v_taxes
  FROM invoice_taxes it WHERE it.invoice_id = p_invoice_id;

  -- Construir el JSON completo en formato InvoiceData
  v_result := jsonb_build_object(
    'invoice', jsonb_build_object(
      'Tipo', jsonb_build_object(
        'Nombre', v_invoice_type.nombre,
        'Clasificacion', jsonb_build_object(
          'OperaContado', v_invoice_type.opera_contado
        )
      ),
      'Numero', jsonb_build_object(
        'Serie', v_invoice.serie,
        'Numero', v_invoice.numero::TEXT,
        'CAEIdentificador', COALESCE(v_invoice.cae_identificador, ''),
        'CAEDesde', COALESCE(v_invoice.cae_desde, ''),
        'CAEHasta', COALESCE(v_invoice.cae_hasta, ''),
        'CAEFechaVto', COALESCE(v_invoice.cae_fecha_vto::TEXT, '')
      ),
      'Fecha', v_invoice.fecha,
      'Comentario', COALESCE(v_invoice.comentario, ''),
      'TipoCambio', v_invoice.tipo_cambio,
      'PorcentajeDescGlobal', v_invoice.porcentaje_desc_global,
      'DireccionFactura', jsonb_build_object(
        'Domicilio', COALESCE(v_invoice.direccion_factura, CASE WHEN v_has_contacto THEN v_contact.direccion ELSE '' END)
      ),
      'Empresa', jsonb_build_object(
        'Parametros', v_company.parametros
      ),
      'Sucursal', jsonb_build_object(
        'Direccion', COALESCE(v_branch.direccion, '')
      )
    ),
    'invoiceLines', v_lines,
    'company', jsonb_build_object(
      'Nombre', v_company.nombre,
      'NombreComercial', v_company.nombre_comercial,
      'RUT', v_company.rut,
      'Direccion', v_company.direccion,
      'Ciudad', v_company.ciudad,
      'logoUrl', COALESCE(v_company.logo_url, '')
    ),
    'Moneda', jsonb_build_object(
      'ISO4217', v_currency.iso4217,
      'Simbolo', v_currency.simbolo
    ),
    'Contacto', jsonb_build_object(
      'GuardarComo', CASE WHEN v_has_contacto THEN v_contact.guardar_como ELSE '' END
    ),
    'CFE', jsonb_build_object(
      'TipoComprobanteFiscal', jsonb_build_object('Nombre', ''),
      'CodSeguridad', COALESCE(v_invoice.cfe_cod_seguridad, ''),
      'Adenda', COALESCE(v_invoice.cfe_adenda, '')
    ),
    'Articulos', v_lines,
    'Impuestos', v_taxes,
    'SubtotalesDesglosados', '[]'::JSONB,
    'Subtotal', v_invoice.subtotal,
    'Total', v_invoice.total,
    'Redondeo', v_invoice.redondeo,
    'MontoDtoGlobal', v_invoice.monto_dto_global,
    'isCFE', v_invoice_type.es_cfe,
    'isConsumoFinal', v_invoice.is_consumo_final,
    'isImpIncluidos', v_invoice.is_imp_incluidos,
    'hasContacto', v_has_contacto,
    'hasDtoGlobal', v_has_dto_global,
    'hasRedondeo', v_has_redondeo,
    'logoBase64', '',
    'QRBase64', ''
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ─── Ejemplos de uso ───
-- SELECT build_invoice_data('f1000000-0000-0000-0000-000000000001');  -- Factura simple
-- SELECT build_invoice_data('f1000000-0000-0000-0000-000000000002');  -- Con cliente y varias lineas
-- SELECT build_invoice_data('f1000000-0000-0000-0000-000000000003');  -- Con dto global
-- SELECT build_invoice_data('f1000000-0000-0000-0000-000000000004');  -- Empresa 2
-- SELECT build_invoice_data('f1000000-0000-0000-0000-000000000005');  -- En USD con redondeo
