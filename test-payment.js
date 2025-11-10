const paymentInstructionsService = require('./services/onboarding/payment-instructions');

async function runTests() {
  console.log('=== Running Payment Instruction Tests ===\n');

  // Test Case 1 - DEBIT format
  console.log('Test 1: DEBIT format - Valid');
  const test1 = await paymentInstructionsService({
    accounts: [
      { id: 'N90394', balance: 1000, currency: 'USD' },
      { id: 'N9122', balance: 500, currency: 'USD' },
    ],
    instruction: 'DEBIT 500 USD FROM ACCOUNT N90394 FOR CREDIT TO ACCOUNT N9122',
  });
  console.log(JSON.stringify(test1.data, null, 2));
  console.log('\n---\n');

  // Test Case 2 - CREDIT format with future date
  console.log('Test 2: CREDIT format with future date - Pending');
  const test2 = await paymentInstructionsService({
    accounts: [
      { id: 'acc-001', balance: 1000, currency: 'NGN' },
      { id: 'acc-002', balance: 500, currency: 'NGN' },
    ],
    instruction: 'CREDIT 300 NGN TO ACCOUNT acc-002 FOR DEBIT FROM ACCOUNT acc-001 ON 2026-12-31',
  });
  console.log(JSON.stringify(test2.data, null, 2));
  console.log('\n---\n');

  // Test Case 3 - Case insensitive
  console.log('Test 3: Case insensitive keywords');
  const test3 = await paymentInstructionsService({
    accounts: [
      { id: 'a', balance: 500, currency: 'GBP' },
      { id: 'b', balance: 200, currency: 'GBP' },
    ],
    instruction: 'debit 100 gbp from account a for credit to account b',
  });
  console.log(JSON.stringify(test3.data, null, 2));
  console.log('\n---\n');

  // Test Case 4 - Past date (immediate execution)
  console.log('Test 4: Past date - Execute immediately');
  const test4 = await paymentInstructionsService({
    accounts: [
      { id: 'x', balance: 500, currency: 'NGN' },
      { id: 'y', balance: 200, currency: 'NGN' },
    ],
    instruction: 'DEBIT 100 NGN FROM ACCOUNT x FOR CREDIT TO ACCOUNT y ON 2024-01-15',
  });
  console.log(JSON.stringify(test4.data, null, 2));
  console.log('\n---\n');

  // Test Case 5 - Currency mismatch
  console.log('Test 5: Currency mismatch - CU01');
  const test5 = await paymentInstructionsService({
    accounts: [
      { id: 'a', balance: 100, currency: 'USD' },
      { id: 'b', balance: 500, currency: 'GBP' },
    ],
    instruction: 'DEBIT 50 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT b',
  });
  console.log(JSON.stringify(test5.data, null, 2));
  console.log('\n---\n');

  // Test Case 6 - Insufficient funds
  console.log('Test 6: Insufficient funds - AC01');
  const test6 = await paymentInstructionsService({
    accounts: [
      { id: 'a', balance: 100, currency: 'USD' },
      { id: 'b', balance: 500, currency: 'USD' },
    ],
    instruction: 'DEBIT 500 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT b',
  });
  console.log(JSON.stringify(test6.data, null, 2));
  console.log('\n---\n');

  // Test Case 7 - Unsupported currency
  console.log('Test 7: Unsupported currency - CU02');
  const test7 = await paymentInstructionsService({
    accounts: [
      { id: 'a', balance: 100, currency: 'EUR' },
      { id: 'b', balance: 500, currency: 'EUR' },
    ],
    instruction: 'DEBIT 50 EUR FROM ACCOUNT a FOR CREDIT TO ACCOUNT b',
  });
  console.log(JSON.stringify(test7.data, null, 2));
  console.log('\n---\n');

  // Test Case 8 - Same account
  console.log('Test 8: Same account - AC02');
  const test8 = await paymentInstructionsService({
    accounts: [{ id: 'a', balance: 500, currency: 'USD' }],
    instruction: 'DEBIT 100 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT a',
  });
  console.log(JSON.stringify(test8.data, null, 2));
  console.log('\n---\n');

  // Test Case 9 - Negative amount
  console.log('Test 9: Negative amount - AM01');
  const test9 = await paymentInstructionsService({
    accounts: [
      { id: 'a', balance: 500, currency: 'USD' },
      { id: 'b', balance: 200, currency: 'USD' },
    ],
    instruction: 'DEBIT -100 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT b',
  });
  console.log(JSON.stringify(test9.data, null, 2));
  console.log('\n---\n');

  // Test Case 10 - Account not found
  console.log('Test 10: Account not found - AC03');
  const test10 = await paymentInstructionsService({
    accounts: [{ id: 'a', balance: 500, currency: 'USD' }],
    instruction: 'DEBIT 100 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT xyz',
  });
  console.log(JSON.stringify(test10.data, null, 2));
  console.log('\n---\n');

  // Test Case 11 - Decimal amount
  console.log('Test 11: Decimal amount - AM01');
  const test11 = await paymentInstructionsService({
    accounts: [
      { id: 'a', balance: 500, currency: 'USD' },
      { id: 'b', balance: 200, currency: 'USD' },
    ],
    instruction: 'DEBIT 100.50 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT b',
  });
  console.log(JSON.stringify(test11.data, null, 2));
  console.log('\n---\n');

  // Test Case 12 - Malformed instruction
  console.log('Test 12: Malformed instruction - SY03');
  const test12 = await paymentInstructionsService({
    accounts: [
      { id: 'a', balance: 500, currency: 'USD' },
      { id: 'b', balance: 200, currency: 'USD' },
    ],
    instruction: 'SEND 100 USD TO ACCOUNT b',
  });
  console.log(JSON.stringify(test12.data, null, 2));
  console.log('\n---\n');

  console.log('=== All Tests Completed ===');
}

runTests().catch(console.error);
