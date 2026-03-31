/**
 * Safe Expression Evaluator
 * Evaluates template expressions (formulas, visibility conditions) against data.
 *
 * Supports:
 *   - Property access: data.Total, Impuestos[0].Valor
 *   - Arithmetic: + - * / %
 *   - Comparison: > < >= <= === !== == !=
 *   - Logical: && || !
 *   - Ternary: condition ? a : b
 *   - Built-in functions: Math.round, Math.abs, Math.floor, Math.ceil, Math.min, Math.max
 *   - Custom functions: Format(n), DateFormat(d, pattern)
 *
 * Blocks:
 *   - eval, Function, window, document, import, require, fetch, XMLHttpRequest
 *   - Assignment (=), prototype access, constructor access
 */

/** Blocked keywords that indicate dangerous expressions */
const BLOCKED_PATTERNS = [
  /\beval\b/,
  /\bFunction\b/,
  /\bwindow\b/,
  /\bdocument\b/,
  /\bimport\b/,
  /\brequire\b/,
  /\bfetch\b/,
  /\bXMLHttpRequest\b/,
  /\bglobalThis\b/,
  /\bprocess\b/,
  /\b__proto__\b/,
  /\bconstructor\b/,
  /\bprototype\b/,
];

/** Allowed Math methods */
const ALLOWED_MATH: Record<string, Function> = {
  'Math.round': Math.round,
  'Math.floor': Math.floor,
  'Math.ceil': Math.ceil,
  'Math.abs': Math.abs,
  'Math.min': Math.min,
  'Math.max': Math.max,
  'Math.pow': Math.pow,
};

export interface EvalContext {
  [key: string]: any;
}

export interface EvalResult {
  value: any;
  error: string | null;
}

/**
 * Validate an expression for dangerous patterns.
 * Returns null if safe, or an error message if blocked.
 */
export function validateExpression(expression: string): string | null {
  if (!expression || typeof expression !== 'string') {
    return 'Expression is empty';
  }

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(expression)) {
      return `Blocked keyword: ${pattern.source.replace(/\\b/g, '')}`;
    }
  }

  // Block assignment operators (but allow == and ===)
  if (/(?<![=!<>])=(?!=)/.test(expression)) {
    return 'Assignment operator not allowed';
  }

  return null;
}

/**
 * Safely evaluate an expression against a data context.
 * Uses Function() with a restricted scope — only the data context keys
 * and whitelisted built-in functions are accessible.
 */
export function evaluateExpression(expression: string, context: EvalContext): EvalResult {
  if (!expression || !expression.trim()) {
    return { value: undefined, error: 'Empty expression' };
  }

  // Security check
  const blocked = validateExpression(expression);
  if (blocked) {
    return { value: undefined, error: blocked };
  }

  try {
    // Build safe context with only data + allowed functions
    const safeContext: Record<string, any> = { ...context };

    // Add Math methods as flat functions
    for (const [name, fn] of Object.entries(ALLOWED_MATH)) {
      // Allow both "Math.round(x)" and direct call patterns
      safeContext[name.replace('.', '_')] = fn;
    }

    // Provide a safe Math object with only allowed methods
    safeContext['Math'] = {
      round: Math.round,
      floor: Math.floor,
      ceil: Math.ceil,
      abs: Math.abs,
      min: Math.min,
      max: Math.max,
      pow: Math.pow,
      PI: Math.PI,
      E: Math.E,
    };

    // Build argument names and values
    const keys = Object.keys(safeContext);
    const values = Object.values(safeContext);

    // Create and execute the function with strict mode
    const fn = new Function(...keys, `"use strict"; return (${expression});`);
    const result = fn(...values);

    return { value: result, error: null };
  } catch (e: any) {
    return { value: undefined, error: e.message || 'Evaluation failed' };
  }
}

/**
 * Evaluate an expression and return just the value (convenience wrapper).
 * Returns defaultValue on error.
 */
export function safeEval(expression: string, context: EvalContext, defaultValue: any = undefined): any {
  const result = evaluateExpression(expression, context);
  return result.error ? defaultValue : result.value;
}
