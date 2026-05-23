/**
 * Invoice Traceability Test Validation Helper
 *
 * Purpose: Validate test execution prerequisites and provide diagnostic insights
 * Usage: npx ts-node scripts/validate_traceability_test.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

interface DataQualityMetrics {
  total_invoices: number;
  invoices_with_gl_entries: number;
  invoices_without_gl_entries: number;
  invoices_by_type: Record<string, number>;
  date_range: {
    earliest: string;
    latest: string;
  };
  amount_statistics: {
    min: number;
    max: number;
    avg: number;
    median: number;
  };
  tax_rate_distribution: Record<string, number>;
  missing_required_fields: Record<string, number>;
}

async function validateTestPrerequisites(): Promise<void> {
  console.log('='.repeat(70));
  console.log('INVOICE TRACEABILITY TEST - VALIDATION & DIAGNOSTICS');
  console.log('='.repeat(70));
  console.log();

  const client = createClient(supabaseUrl, supabaseKey);

  try {
    // Check 1: Database connectivity
    console.log('✓ Checking database connectivity...');
    const { data: test, error: connError } = await client
      .from('factures')
      .select('id')
      .limit(1);

    if (connError) {
      throw new Error(`Database connection failed: ${connError.message}`);
    }
    console.log('  ✓ Database connected\n');

    // Check 2: Invoice count
    console.log('✓ Analyzing invoice population...');
    const { data: invoices, error: invoiceError } = await client
      .from('factures')
      .select('id, numero_facture, type_facture, date_facture, montant_ht, montant_tva, montant_ttc, taux_tva, tiers, created_by');

    if (invoiceError) {
      throw new Error(`Failed to fetch invoices: ${invoiceError.message}`);
    }

    if (!invoices || invoices.length === 0) {
      console.error('  ❌ No invoices found in database');
      console.error('     Please populate test data before running traceability tests');
      process.exit(1);
    }

    console.log(`  ✓ Found ${invoices.length} invoices\n`);

    // Check 3: GL entries
    console.log('✓ Analyzing GL entry coverage...');
    const { data: glEntries, error: glError } = await client
      .from('ecritures_comptables_v2')
      .select('id, facture_id, ref_folio, numero_compte, debit_mur, credit_mur');

    if (glError) {
      throw new Error(`Failed to fetch GL entries: ${glError.message}`);
    }

    const invoicesWithGL = new Set(
      (glEntries || [])
        .map((e: any) => e.facture_id)
        .filter(Boolean)
    );

    console.log(`  ✓ Found ${glEntries?.length || 0} GL entries`);
    console.log(`  ✓ ${invoicesWithGL.size} invoices have GL entries (${((invoicesWithGL.size / invoices.length) * 100).toFixed(2)}%)\n`);

    // Check 4: Data quality metrics
    console.log('✓ Computing data quality metrics...');

    const metrics: DataQualityMetrics = {
      total_invoices: invoices.length,
      invoices_with_gl_entries: invoicesWithGL.size,
      invoices_without_gl_entries: invoices.length - invoicesWithGL.size,
      invoices_by_type: {},
      date_range: {
        earliest: '',
        latest: '',
      },
      amount_statistics: {
        min: Infinity,
        max: -Infinity,
        avg: 0,
        median: 0,
      },
      tax_rate_distribution: {},
      missing_required_fields: {
        missing_numero: 0,
        missing_date: 0,
        missing_tiers: 0,
        missing_ht: 0,
        missing_creator: 0,
      },
    };

    let totalAmount = 0;
    const amounts: number[] = [];

    (invoices || []).forEach((inv: any) => {
      // Type distribution
      metrics.invoices_by_type[inv.type_facture] =
        (metrics.invoices_by_type[inv.type_facture] || 0) + 1;

      // Date range
      if (!metrics.date_range.earliest || inv.date_facture < metrics.date_range.earliest) {
        metrics.date_range.earliest = inv.date_facture;
      }
      if (!metrics.date_range.latest || inv.date_facture > metrics.date_range.latest) {
        metrics.date_range.latest = inv.date_facture;
      }

      // Amount statistics
      const ttc = inv.montant_ttc || 0;
      if (ttc > 0) {
        metrics.amount_statistics.min = Math.min(
          metrics.amount_statistics.min,
          ttc
        );
        metrics.amount_statistics.max = Math.max(
          metrics.amount_statistics.max,
          ttc
        );
        totalAmount += ttc;
        amounts.push(ttc);
      }

      // Tax rate distribution
      const taxKey = `${inv.taux_tva || 0}%`;
      metrics.tax_rate_distribution[taxKey] =
        (metrics.tax_rate_distribution[taxKey] || 0) + 1;

      // Missing fields
      if (!inv.numero_facture) metrics.missing_required_fields.missing_numero++;
      if (!inv.date_facture) metrics.missing_required_fields.missing_date++;
      if (!inv.tiers) metrics.missing_required_fields.missing_tiers++;
      if (!inv.montant_ht || inv.montant_ht <= 0)
        metrics.missing_required_fields.missing_ht++;
      if (!inv.created_by) metrics.missing_required_fields.missing_creator++;
    });

    metrics.amount_statistics.avg =
      totalAmount / Math.max(amounts.length, 1);
    amounts.sort((a, b) => a - b);
    metrics.amount_statistics.median =
      amounts.length % 2 === 0
        ? (amounts[amounts.length / 2 - 1] + amounts[amounts.length / 2]) / 2
        : amounts[Math.floor(amounts.length / 2)];

    // Display metrics
    console.log('  Data Quality Metrics:');
    console.log(`    Total Invoices: ${metrics.total_invoices}`);
    console.log(`    With GL Entries: ${metrics.invoices_with_gl_entries}`);
    console.log(`    Missing GL Entries: ${metrics.invoices_without_gl_entries}`);
    console.log();

    console.log('  Invoice Distribution by Type:');
    Object.entries(metrics.invoices_by_type).forEach(([type, count]) => {
      console.log(`    - ${type}: ${count}`);
    });
    console.log();

    console.log(`  Date Range: ${metrics.date_range.earliest} to ${metrics.date_range.latest}`);
    console.log();

    console.log('  Amount Statistics (TTC):');
    console.log(`    Min: ${metrics.amount_statistics.min.toFixed(2)} MUR`);
    console.log(`    Max: ${metrics.amount_statistics.max.toFixed(2)} MUR`);
    console.log(`    Avg: ${metrics.amount_statistics.avg.toFixed(2)} MUR`);
    console.log(`    Median: ${metrics.amount_statistics.median.toFixed(2)} MUR`);
    console.log();

    console.log('  Tax Rate Distribution:');
    Object.entries(metrics.tax_rate_distribution)
      .sort((a, b) => b[1] - a[1])
      .forEach(([rate, count]) => {
        console.log(
          `    - ${rate}: ${count} (${((count / metrics.total_invoices) * 100).toFixed(2)}%)`
        );
      });
    console.log();

    console.log('  Missing Required Fields:');
    Object.entries(metrics.missing_required_fields).forEach(([field, count]) => {
      if (count > 0) {
        console.log(
          `    ❌ ${field}: ${count} (${((count / metrics.total_invoices) * 100).toFixed(2)}%)`
        );
      }
    });
    if (
      Object.values(metrics.missing_required_fields).every(
        (count) => count === 0
      )
    ) {
      console.log('    ✓ All required fields present');
    }
    console.log();

    // Check 5: Sample size verification
    console.log('✓ Verifying sample size sufficiency...');
    const minSampleSize = 50;
    if (metrics.total_invoices < minSampleSize) {
      console.log(
        `  ⚠ Only ${metrics.total_invoices} invoices available (need ${minSampleSize})`
      );
      console.log(`    Test will proceed with available data`);
    } else {
      console.log(
        `  ✓ Sufficient invoices for 50-item stratified sample (${metrics.total_invoices} available)`
      );
    }
    console.log();

    // Check 6: GL table structure
    console.log('✓ Verifying GL table structure...');
    const { data: glSample, error: glStructError } = await client
      .from('ecritures_comptables_v2')
      .select(
        'id, facture_id, ref_folio, numero_compte, debit_mur, credit_mur, created_at'
      )
      .limit(1);

    if (glStructError) {
      console.error(
        `  ❌ GL table structure check failed: ${glStructError.message}`
      );
      console.error('    Ensure ecritures_comptables_v2 table exists');
      process.exit(1);
    }

    console.log('  ✓ GL table structure valid');
    if (glSample && glSample[0]) {
      const sample = glSample[0];
      console.log(`    - facture_id populated: ${sample.facture_id ? 'YES' : 'NO'}`);
      console.log(`    - ref_folio populated: ${sample.ref_folio ? 'YES' : 'NO'}`);
      console.log(
        `    - Both facture_id and ref_folio: ${sample.facture_id && sample.ref_folio ? 'YES' : 'NO'}`
      );
    }
    console.log();

    // Final readiness assessment
    console.log('='.repeat(70));
    console.log('READINESS ASSESSMENT');
    console.log('='.repeat(70));

    const readinessChecks = [
      {
        name: 'Database Connectivity',
        status: true,
        warning: null,
      },
      {
        name: 'Invoice Data Present',
        status: metrics.total_invoices > 0,
        warning: `${metrics.total_invoices} invoices found`,
      },
      {
        name: 'Sufficient Sample Size',
        status: metrics.total_invoices >= minSampleSize,
        warning: `${metrics.total_invoices}/${minSampleSize} invoices`,
      },
      {
        name: 'GL Integration',
        status: metrics.invoices_with_gl_entries > 0,
        warning: `${metrics.invoices_with_gl_entries}/${metrics.total_invoices} have GL entries`,
      },
      {
        name: 'Required Fields Populated',
        status: Object.values(metrics.missing_required_fields).every(
          (count) => count === 0
        ),
        warning: `Some missing fields detected`,
      },
      {
        name: 'GL Table Structure',
        status: !glStructError,
        warning: 'Table accessible',
      },
    ];

    const allPassed = readinessChecks.every((check) => check.status);

    readinessChecks.forEach((check) => {
      const icon = check.status ? '✓' : '❌';
      console.log(`${icon} ${check.name.padEnd(30)} ${check.warning || ''}`);
    });

    console.log();
    console.log('='.repeat(70));

    if (allPassed) {
      console.log('✓ ALL CHECKS PASSED - READY FOR TESTING');
      console.log();
      console.log('Next steps:');
      console.log('1. Review test plan: /exports/PHASE4_TASK4C_TEST_PLAN.md');
      console.log('2. Execute test: npx ts-node scripts/invoice_traceability_report.ts');
      console.log('3. Review outputs in /exports directory');
    } else {
      console.log('❌ SOME CHECKS FAILED - ADDRESS BEFORE TESTING');
      console.log();
      console.log('Issues to address:');
      readinessChecks
        .filter((check) => !check.status)
        .forEach((check) => {
          console.log(`- ${check.name}`);
        });
    }

    console.log('='.repeat(70));
  } catch (err) {
    console.error('\n❌ Validation failed:', err);
    process.exit(1);
  }
}

validateTestPrerequisites();
