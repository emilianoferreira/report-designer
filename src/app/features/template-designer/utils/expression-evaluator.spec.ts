import { validateExpression, evaluateExpression, safeEval, EvalContext } from './expression-evaluator';

describe('Expression Evaluator', () => {

  // ─── validateExpression ───

  describe('validateExpression', () => {

    describe('should block dangerous patterns', () => {
      const dangerousExpressions = [
        { expr: 'eval("alert(1)")', keyword: 'eval' },
        { expr: 'new Function("return 1")', keyword: 'Function' },
        { expr: 'window.location', keyword: 'window' },
        { expr: 'document.cookie', keyword: 'document' },
        { expr: 'import("module")', keyword: 'import' },
        { expr: 'require("fs")', keyword: 'require' },
        { expr: 'fetch("http://evil.com")', keyword: 'fetch' },
        { expr: 'new XMLHttpRequest()', keyword: 'XMLHttpRequest' },
        { expr: 'globalThis.alert()', keyword: 'globalThis' },
        { expr: 'process.env', keyword: 'process' },
        { expr: 'obj.__proto__', keyword: '__proto__' },
        { expr: 'obj.constructor', keyword: 'constructor' },
        { expr: 'obj.prototype', keyword: 'prototype' },
      ];

      dangerousExpressions.forEach(({ expr, keyword }) => {
        it(`should block "${keyword}"`, () => {
          const result = validateExpression(expr);
          expect(result).not.toBeNull();
          expect(result).toContain(keyword);
        });
      });
    });

    describe('should allow safe expressions', () => {
      const safeExpressions = [
        'Total * 0.21',
        'price > 100 ? "expensive" : "cheap"',
        'a + b - c',
        'Math.round(value)',
        'data.Total >= 0',
        'a === b',
        'a !== b',
        '!isActive',
        'a && b || c',
        'items.length',
        'x % 2',
      ];

      safeExpressions.forEach(expr => {
        it(`should allow "${expr}"`, () => {
          const result = validateExpression(expr);
          expect(result).toBeNull();
        });
      });
    });

    it('should block assignment operator =', () => {
      const result = validateExpression('x = 5');
      expect(result).not.toBeNull();
      expect(result).toContain('Assignment');
    });

    it('should block += assignment', () => {
      // += contains a single = not preceded by =, !, <, >
      const result = validateExpression('x += 5');
      expect(result).not.toBeNull();
    });

    it('should allow == comparison', () => {
      const result = validateExpression('a == b');
      expect(result).toBeNull();
    });

    it('should allow === strict comparison', () => {
      const result = validateExpression('a === b');
      expect(result).toBeNull();
    });

    it('should allow != comparison', () => {
      const result = validateExpression('a != b');
      expect(result).toBeNull();
    });

    it('should allow !== strict comparison', () => {
      const result = validateExpression('a !== b');
      expect(result).toBeNull();
    });

    it('should allow >= comparison', () => {
      const result = validateExpression('a >= b');
      expect(result).toBeNull();
    });

    it('should allow <= comparison', () => {
      const result = validateExpression('a <= b');
      expect(result).toBeNull();
    });

    it('should return error for empty expression', () => {
      const result = validateExpression('');
      expect(result).not.toBeNull();
      expect(result).toContain('empty');
    });

    it('should return error for null expression', () => {
      const result = validateExpression(null as any);
      expect(result).not.toBeNull();
    });
  });

  // ─── evaluateExpression ───

  describe('evaluateExpression', () => {

    describe('arithmetic operations', () => {
      it('should evaluate addition', () => {
        const result = evaluateExpression('a + b', { a: 10, b: 20 });
        expect(result.value).toBe(30);
        expect(result.error).toBeNull();
      });

      it('should evaluate subtraction', () => {
        const result = evaluateExpression('a - b', { a: 50, b: 20 });
        expect(result.value).toBe(30);
        expect(result.error).toBeNull();
      });

      it('should evaluate multiplication', () => {
        const result = evaluateExpression('a * b', { a: 5, b: 6 });
        expect(result.value).toBe(30);
        expect(result.error).toBeNull();
      });

      it('should evaluate division', () => {
        const result = evaluateExpression('a / b', { a: 100, b: 4 });
        expect(result.value).toBe(25);
        expect(result.error).toBeNull();
      });

      it('should evaluate modulo', () => {
        const result = evaluateExpression('a % b', { a: 10, b: 3 });
        expect(result.value).toBe(1);
        expect(result.error).toBeNull();
      });

      it('should evaluate complex arithmetic', () => {
        const result = evaluateExpression('(a + b) * c - d', { a: 2, b: 3, c: 4, d: 1 });
        expect(result.value).toBe(19);
        expect(result.error).toBeNull();
      });
    });

    describe('comparison operations', () => {
      it('should evaluate greater than', () => {
        const result = evaluateExpression('a > b', { a: 10, b: 5 });
        expect(result.value).toBe(true);
      });

      it('should evaluate less than', () => {
        const result = evaluateExpression('a < b', { a: 3, b: 7 });
        expect(result.value).toBe(true);
      });

      it('should evaluate strict equality', () => {
        const result = evaluateExpression('a === b', { a: 5, b: 5 });
        expect(result.value).toBe(true);
      });

      it('should evaluate strict inequality', () => {
        const result = evaluateExpression('a !== b', { a: 5, b: 10 });
        expect(result.value).toBe(true);
      });
    });

    describe('ternary operator', () => {
      it('should evaluate ternary true branch', () => {
        const result = evaluateExpression('active ? "yes" : "no"', { active: true });
        expect(result.value).toBe('yes');
      });

      it('should evaluate ternary false branch', () => {
        const result = evaluateExpression('active ? "yes" : "no"', { active: false });
        expect(result.value).toBe('no');
      });

      it('should evaluate nested ternary', () => {
        const result = evaluateExpression('a > 10 ? "high" : a > 5 ? "medium" : "low"', { a: 7 });
        expect(result.value).toBe('medium');
      });
    });

    describe('data context (property access)', () => {
      it('should access simple context properties', () => {
        const result = evaluateExpression('Total', { Total: 122 });
        expect(result.value).toBe(122);
      });

      it('should access nested object properties', () => {
        const ctx: EvalContext = {
          invoice: { Tipo: { Nombre: 'Venta Contado' } }
        };
        const result = evaluateExpression('invoice.Tipo.Nombre', ctx);
        expect(result.value).toBe('Venta Contado');
      });

      it('should access array elements', () => {
        const ctx: EvalContext = {
          items: [10, 20, 30]
        };
        const result = evaluateExpression('items[1]', ctx);
        expect(result.value).toBe(20);
      });

      it('should use context values in arithmetic', () => {
        const ctx: EvalContext = { Subtotal: 100, TaxRate: 0.22 };
        const result = evaluateExpression('Subtotal * TaxRate', ctx);
        expect(result.value).toBeCloseTo(22, 2);
      });
    });

    describe('Math functions', () => {
      it('should evaluate Math.round', () => {
        const result = evaluateExpression('Math.round(value)', { value: 3.7 });
        expect(result.value).toBe(4);
      });

      it('should evaluate Math.floor', () => {
        const result = evaluateExpression('Math.floor(value)', { value: 3.9 });
        expect(result.value).toBe(3);
      });

      it('should evaluate Math.ceil', () => {
        const result = evaluateExpression('Math.ceil(value)', { value: 3.1 });
        expect(result.value).toBe(4);
      });

      it('should evaluate Math.abs', () => {
        const result = evaluateExpression('Math.abs(value)', { value: -42 });
        expect(result.value).toBe(42);
      });

      it('should evaluate Math.min', () => {
        const result = evaluateExpression('Math.min(a, b)', { a: 5, b: 3 });
        expect(result.value).toBe(3);
      });

      it('should evaluate Math.max', () => {
        const result = evaluateExpression('Math.max(a, b)', { a: 5, b: 3 });
        expect(result.value).toBe(5);
      });

      it('should evaluate Math.pow', () => {
        const result = evaluateExpression('Math.pow(base, exp)', { base: 2, exp: 10 });
        expect(result.value).toBe(1024);
      });

      it('should access Math.PI', () => {
        const result = evaluateExpression('Math.PI', {});
        expect(result.value).toBeCloseTo(3.14159, 4);
      });
    });

    describe('error handling', () => {
      it('should return error for empty expression', () => {
        const result = evaluateExpression('', {});
        expect(result.error).not.toBeNull();
        expect(result.value).toBeUndefined();
      });

      it('should return error for whitespace-only expression', () => {
        const result = evaluateExpression('   ', {});
        expect(result.error).not.toBeNull();
      });

      it('should return error for blocked expression', () => {
        const result = evaluateExpression('eval("1")', {});
        expect(result.error).not.toBeNull();
        expect(result.error).toContain('eval');
      });

      it('should return error for syntax errors', () => {
        const result = evaluateExpression('a +* b', { a: 1, b: 2 });
        expect(result.error).not.toBeNull();
        expect(result.value).toBeUndefined();
      });

      it('should return error for undefined variable access', () => {
        const result = evaluateExpression('nonExistent.property', {});
        expect(result.error).not.toBeNull();
      });
    });
  });

  // ─── safeEval ───

  describe('safeEval', () => {
    it('should return the evaluated value on success', () => {
      const result = safeEval('a + b', { a: 10, b: 5 });
      expect(result).toBe(15);
    });

    it('should return undefined by default on error', () => {
      const result = safeEval('eval("1")', {});
      expect(result).toBeUndefined();
    });

    it('should return the provided defaultValue on error', () => {
      const result = safeEval('eval("1")', {}, 0);
      expect(result).toBe(0);
    });

    it('should return the provided defaultValue for syntax errors', () => {
      const result = safeEval('a +* b', { a: 1, b: 2 }, -1);
      expect(result).toBe(-1);
    });

    it('should return string defaultValue on error', () => {
      const result = safeEval('nonExistent.x', {}, 'N/A');
      expect(result).toBe('N/A');
    });

    it('should work with complex expressions and context', () => {
      const ctx = { price: 100, qty: 3, discount: 0.1 };
      const result = safeEval('price * qty * (1 - discount)', ctx);
      expect(result).toBeCloseTo(270, 2);
    });
  });
});
