import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ParseAmountError, parseAmount, parseAmountSafe, resolveTransactionAmounts } from "./bank-amount"

describe("parseAmount — Anglo-Saxon format (1,234.56)", () => {
  it("parses US standard '1,234.56'", () => {
    expect(parseAmount("1,234.56")).toBe(1234.56)
  })

  it("parses US with multiple thousands groups '1,234,567.89'", () => {
    expect(parseAmount("1,234,567.89")).toBe(1234567.89)
  })

  it("parses US decimal only '50.00'", () => {
    expect(parseAmount("50.00")).toBe(50)
  })
})

describe("parseAmount — European format (1.234,56)", () => {
  it("parses EU standard '1.234,56'", () => {
    expect(parseAmount("1.234,56")).toBe(1234.56)
  })

  it("parses EU with multiple thousands groups '1.234.567,89'", () => {
    expect(parseAmount("1.234.567,89")).toBe(1234567.89)
  })

  it("parses EU decimal only '0,5'", () => {
    expect(parseAmount("0,5")).toBe(0.5)
  })

  it("parses EU '0,00'", () => {
    expect(parseAmount("0,00")).toBe(0)
  })
})

describe("parseAmount — FR/BE format with spaces (1 234 567,89)", () => {
  it("parses '1 234 567,89'", () => {
    expect(parseAmount("1 234 567,89")).toBe(1234567.89)
  })

  it("parses '1 234,56 MUR'", () => {
    expect(parseAmount("1 234,56 MUR")).toBe(1234.56)
  })
})

describe("parseAmount — ambiguous single-separator cases", () => {
  it("treats '50,000' as 50000 (no decimal, 3-digit group)", () => {
    expect(parseAmount("50,000")).toBe(50000)
  })

  it("treats '1,234' as 1234 (3-digit group after comma)", () => {
    expect(parseAmount("1,234")).toBe(1234)
  })

  it("treats '50,00' as 50 (2-digit group → decimal)", () => {
    expect(parseAmount("50,00")).toBe(50)
  })

  it("treats '1234,5' as 1234.5 (1-digit group → decimal)", () => {
    expect(parseAmount("1234,5")).toBe(1234.5)
  })
})

describe("parseAmount — negatives", () => {
  it("parses leading minus '-1,234.50'", () => {
    expect(parseAmount("-1,234.50")).toBe(-1234.5)
  })

  it("parses EU leading minus '-1.234,50'", () => {
    expect(parseAmount("-1.234,50")).toBe(-1234.5)
  })

  it("parses accounting parentheses '(1,234.56)' as -1234.56", () => {
    expect(parseAmount("(1,234.56)")).toBe(-1234.56)
  })

  it("parses parentheses EU '(1.234,56)' as -1234.56", () => {
    expect(parseAmount("(1.234,56)")).toBe(-1234.56)
  })
})

describe("parseAmount — empty & nullish inputs", () => {
  it("returns 0 for empty string", () => {
    expect(parseAmount("")).toBe(0)
  })

  it("returns 0 for whitespace-only string", () => {
    expect(parseAmount("   ")).toBe(0)
  })

  it("returns 0 for null", () => {
    expect(parseAmount(null)).toBe(0)
  })

  it("returns 0 for undefined", () => {
    expect(parseAmount(undefined)).toBe(0)
  })

  it("returns 0 for '0'", () => {
    expect(parseAmount("0")).toBe(0)
  })

  it("returns 0 for '0.0'", () => {
    expect(parseAmount("0.0")).toBe(0)
  })
})

describe("parseAmount — already-number input", () => {
  it("returns the number as-is", () => {
    expect(parseAmount(1234.56)).toBe(1234.56)
  })

  it("returns 0 as 0", () => {
    expect(parseAmount(0)).toBe(0)
  })

  it("returns negative numbers as-is", () => {
    expect(parseAmount(-42.5)).toBe(-42.5)
  })

  it("throws on NaN number", () => {
    expect(() => parseAmount(NaN)).toThrow(ParseAmountError)
  })

  it("throws on Infinity", () => {
    expect(() => parseAmount(Infinity)).toThrow(ParseAmountError)
  })
})

describe("parseAmount — noisy inputs (currency symbols, codes)", () => {
  it("strips leading '$' on '$1,234.56'", () => {
    expect(parseAmount("$1,234.56")).toBe(1234.56)
  })

  it("strips leading 'EUR ' on 'EUR 1.234,56'", () => {
    expect(parseAmount("EUR 1.234,56")).toBe(1234.56)
  })

  it("strips trailing 'MUR' on '1 234,56 MUR'", () => {
    expect(parseAmount("1 234,56 MUR")).toBe(1234.56)
  })

  it("strips 'Rs' prefix on 'Rs 50,000'", () => {
    expect(parseAmount("Rs 50,000")).toBe(50000)
  })
})

describe("parseAmount — invalid inputs throw ParseAmountError", () => {
  it("throws on 'abc'", () => {
    expect(() => parseAmount("abc")).toThrow(ParseAmountError)
  })

  it("throws on 'NaN' string", () => {
    expect(() => parseAmount("NaN")).toThrow(ParseAmountError)
  })

  it("throws on '--123' (double negative)", () => {
    expect(() => parseAmount("--123")).toThrow(ParseAmountError)
  })

  it("throws on '1-2' (sign inside number)", () => {
    expect(() => parseAmount("1-2")).toThrow(ParseAmountError)
  })

  it("throws on pure symbol '$$$'", () => {
    expect(() => parseAmount("$$$")).toThrow(ParseAmountError)
  })

  it("error exposes raw value via .raw", () => {
    try {
      parseAmount("abc")
      expect.fail("should have thrown")
    } catch (err) {
      expect(err).toBeInstanceOf(ParseAmountError)
      expect((err as ParseAmountError).raw).toBe("abc")
      expect((err as ParseAmountError).message).toContain("abc")
    }
  })

  it("throws on non-string non-number input (object)", () => {
    expect(() => parseAmount({} as unknown)).toThrow(ParseAmountError)
  })

  it("throws on boolean input", () => {
    expect(() => parseAmount(true as unknown)).toThrow(ParseAmountError)
  })
})

describe("parseAmount — regression guards for F4 / F5 bugs", () => {
  it("F4: parseAmount('1.234,56') must NOT be 1.234 like parseFloat", () => {
    // parseFloat("1.234,56") === 1.234 — that's the bug we are fixing
    expect(parseAmount("1.234,56")).toBe(1234.56)
  })

  it("F5: parseAmount('1,234.56') must NOT be NaN like Number()", () => {
    // Number("1,234.56") === NaN — the bug that led to `|| 0` silent failures
    expect(parseAmount("1,234.56")).toBe(1234.56)
    expect(Number.isFinite(parseAmount("1,234.56"))).toBe(true)
  })
})

describe("parseAmountSafe", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it("returns the parsed value on good input, without logging", () => {
    expect(parseAmountSafe("1,234.56")).toBe(1234.56)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it("returns 0 on bad input and logs a warning", () => {
    expect(parseAmountSafe("abc")).toBe(0)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toContain("parseAmountSafe")
    expect(warnSpy.mock.calls[0][0]).toContain("abc")
  })

  it("includes context in the log message when provided", () => {
    parseAmountSafe("--123", "solde_cloture row 42")
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toContain("solde_cloture row 42")
  })

  it("returns 0 for empty string WITHOUT warning (not an error)", () => {
    expect(parseAmountSafe("")).toBe(0)
    expect(parseAmountSafe(null)).toBe(0)
    expect(warnSpy).not.toHaveBeenCalled()
  })
})

describe("resolveTransactionAmounts — multi-currency fallbacks", () => {
  it("uses explicit debit/credit when present (MUR statement)", () => {
    expect(resolveTransactionAmounts({ debit: 1500, credit: 0 })).toEqual({ debit: 1500, credit: 0 })
    expect(resolveTransactionAmounts({ debit: 0, credit: "2 000,50" })).toEqual({ debit: 0, credit: 2000.5 })
  })

  it("falls back to debit_devise/credit_devise when debit/credit are 0 (shape A)", () => {
    // EUR statement, fee line: debit_devise filled, credit_devise null
    expect(resolveTransactionAmounts({
      debit: 0, credit: 0, debit_devise: 0.17, credit_devise: null, montant_origine: 0.17,
    })).toEqual({ debit: 0.17, credit: 0 })
    expect(resolveTransactionAmounts({
      debit: 0, credit: 0, debit_devise: 0, credit_devise: 250, montant_origine: 250,
    })).toEqual({ debit: 0, credit: 250 })
  })

  it("falls back to montant_origine + sens when no split columns (shape B)", () => {
    expect(resolveTransactionAmounts({
      debit: 0, credit: 0, sens: "credit", montant_origine: 12000,
    })).toEqual({ debit: 0, credit: 12000 })
    expect(resolveTransactionAmounts({
      debit: 0, credit: 0, sens: "debit", montant_origine: 11500,
    })).toEqual({ debit: 11500, credit: 0 })
  })

  it("prefers debit_devise/credit_devise over montant_origine+sens", () => {
    expect(resolveTransactionAmounts({
      debit: 0, credit: 0, debit_devise: 8.52, credit_devise: 0, sens: "credit", montant_origine: 8.52,
    })).toEqual({ debit: 8.52, credit: 0 })
  })

  it("returns {0,0} when no amount or sens can be resolved", () => {
    expect(resolveTransactionAmounts({ debit: 0, credit: 0 })).toEqual({ debit: 0, credit: 0 })
    expect(resolveTransactionAmounts({ debit: 0, credit: 0, montant_origine: 50 })).toEqual({ debit: 0, credit: 0 })
  })

  it("takes the absolute value of native amounts (sign carried by side)", () => {
    expect(resolveTransactionAmounts({
      debit: 0, credit: 0, debit_devise: -0.3, credit_devise: 0, montant_origine: -0.3,
    })).toEqual({ debit: 0.3, credit: 0 })
  })
})
