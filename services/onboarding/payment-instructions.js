// Payment Instruction Parser and Executor
// No regex allowed - using string manipulation only

const SUPPORTED_CURRENCIES = ['NGN', 'USD', 'GBP', 'GHS'];

// Status codes
const STATUS_CODES = {
  AM01: 'Amount must be a positive integer',
  CU01: 'Account currency mismatch',
  CU02: 'Unsupported currency. Only NGN, USD, GBP, and GHS are supported',
  AC01: 'Insufficient funds in debit account',
  AC02: 'Debit and credit accounts cannot be the same',
  AC03: 'Account not found',
  AC04: 'Invalid account ID format',
  DT01: 'Invalid date format',
  SY01: 'Missing required keyword',
  SY02: 'Invalid keyword order',
  SY03: 'Malformed instruction: unable to parse keywords',
  AP00: 'Transaction executed successfully',
  AP02: 'Transaction scheduled for future execution',
};

/**
 * Parse payment instruction using string manipulation only (no regex)
 */
function parseInstruction(instruction) {
  if (!instruction || typeof instruction !== 'string') {
    return {
      error: true,
      statusCode: 'SY03',
      statusReason: STATUS_CODES.SY03,
    };
  }

  // Trim and normalize whitespace
  const normalized = instruction
    .trim()
    .split(' ')
    .filter((word) => word.length > 0)
    .join(' ');
  const upper = normalized.toUpperCase();

  // Determine instruction type
  let type = null;
  if (upper.indexOf('DEBIT') === 0) {
    type = 'DEBIT';
  } else if (upper.indexOf('CREDIT') === 0) {
    type = 'CREDIT';
  } else {
    return {
      error: true,
      statusCode: 'SY01',
      statusReason: 'Missing required keyword: DEBIT or CREDIT',
    };
  }

  let result = {
    type,
    amount: null,
    currency: null,
    debitAccount: null,
    creditAccount: null,
    executeBy: null,
  };

  try {
    if (type === 'DEBIT') {
      result = parseDebitInstruction(normalized);
    } else {
      result = parseCreditInstruction(normalized);
    }

    return result;
  } catch (error) {
    return {
      error: true,
      statusCode: 'SY03',
      statusReason: error.message || STATUS_CODES.SY03,
    };
  }
}

/**
 * Parse DEBIT instruction format:
 * DEBIT [amount] [currency] FROM ACCOUNT [account_id] FOR CREDIT TO ACCOUNT [account_id] [ON [date]]
 */
function parseDebitInstruction(instruction) {
  const upper = instruction.toUpperCase();

  // Find keyword positions
  const debitPos = upper.indexOf('DEBIT');
  const fromPos = upper.indexOf('FROM');
  const accountPos1 = upper.indexOf('ACCOUNT', fromPos);
  const forPos = upper.indexOf('FOR');
  const creditPos = upper.indexOf('CREDIT', forPos);
  const toPos = upper.indexOf('TO', creditPos);
  const accountPos2 = upper.indexOf('ACCOUNT', toPos);
  const onPos = upper.indexOf('ON', accountPos2);

  // Validate keyword presence
  if (debitPos === -1) {
    throw new Error('Missing required keyword: DEBIT');
  }
  if (fromPos === -1) {
    throw new Error('Missing required keyword: FROM');
  }
  if (accountPos1 === -1) {
    throw new Error('Missing required keyword: ACCOUNT after FROM');
  }
  if (forPos === -1) {
    throw new Error('Missing required keyword: FOR');
  }
  if (creditPos === -1) {
    throw new Error('Missing required keyword: CREDIT');
  }
  if (toPos === -1) {
    throw new Error('Missing required keyword: TO');
  }
  if (accountPos2 === -1) {
    throw new Error('Missing required keyword: ACCOUNT after TO');
  }

  // Validate keyword order
  if (
    !(
      debitPos < fromPos &&
      fromPos < accountPos1 &&
      accountPos1 < forPos &&
      forPos < creditPos &&
      creditPos < toPos &&
      toPos < accountPos2
    )
  ) {
    throw new Error(STATUS_CODES.SY02);
  }

  // Extract amount and currency (between DEBIT and FROM)
  const amountCurrencyPart = instruction.substring(debitPos + 5, fromPos).trim();
  const amountCurrencyTokens = amountCurrencyPart.split(' ').filter((t) => t.length > 0);

  if (amountCurrencyTokens.length !== 2) {
    throw new Error('Invalid format: expected amount and currency after DEBIT');
  }

  const amount = amountCurrencyTokens[0];
  const currency = amountCurrencyTokens[1].toUpperCase();

  // Extract debit account (between first ACCOUNT and FOR)
  const debitAccount = instruction.substring(accountPos1 + 7, forPos).trim();

  // Extract credit account (between second ACCOUNT and ON/end)
  let creditAccount;
  if (onPos > accountPos2) {
    creditAccount = instruction.substring(accountPos2 + 7, onPos).trim();
  } else {
    creditAccount = instruction.substring(accountPos2 + 7).trim();
  }

  // Extract date if present
  let executeBy = null;
  if (onPos > accountPos2) {
    executeBy = instruction.substring(onPos + 2).trim();
  }

  return {
    type: 'DEBIT',
    amount,
    currency,
    debitAccount,
    creditAccount,
    executeBy,
  };
}

/**
 * Parse CREDIT instruction format:
 * CREDIT [amount] [currency] TO ACCOUNT [account_id] FOR DEBIT FROM ACCOUNT [account_id] [ON [date]]
 */
function parseCreditInstruction(instruction) {
  const upper = instruction.toUpperCase();

  // Find keyword positions
  const creditPos = upper.indexOf('CREDIT');
  const toPos = upper.indexOf('TO');
  const accountPos1 = upper.indexOf('ACCOUNT', toPos);
  const forPos = upper.indexOf('FOR');
  const debitPos = upper.indexOf('DEBIT', forPos);
  const fromPos = upper.indexOf('FROM', debitPos);
  const accountPos2 = upper.indexOf('ACCOUNT', fromPos);
  const onPos = upper.indexOf('ON', accountPos2);

  // Validate keyword presence
  if (creditPos === -1) {
    throw new Error('Missing required keyword: CREDIT');
  }
  if (toPos === -1) {
    throw new Error('Missing required keyword: TO');
  }
  if (accountPos1 === -1) {
    throw new Error('Missing required keyword: ACCOUNT after TO');
  }
  if (forPos === -1) {
    throw new Error('Missing required keyword: FOR');
  }
  if (debitPos === -1) {
    throw new Error('Missing required keyword: DEBIT');
  }
  if (fromPos === -1) {
    throw new Error('Missing required keyword: FROM');
  }
  if (accountPos2 === -1) {
    throw new Error('Missing required keyword: ACCOUNT after FROM');
  }

  // Validate keyword order
  if (
    !(
      creditPos < toPos &&
      toPos < accountPos1 &&
      accountPos1 < forPos &&
      forPos < debitPos &&
      debitPos < fromPos &&
      fromPos < accountPos2
    )
  ) {
    throw new Error(STATUS_CODES.SY02);
  }

  // Extract amount and currency (between CREDIT and TO)
  const amountCurrencyPart = instruction.substring(creditPos + 6, toPos).trim();
  const amountCurrencyTokens = amountCurrencyPart.split(' ').filter((t) => t.length > 0);

  if (amountCurrencyTokens.length !== 2) {
    throw new Error('Invalid format: expected amount and currency after CREDIT');
  }

  const amount = amountCurrencyTokens[0];
  const currency = amountCurrencyTokens[1].toUpperCase();

  // Extract credit account (between first ACCOUNT and FOR)
  const creditAccount = instruction.substring(accountPos1 + 7, forPos).trim();

  // Extract debit account (between second ACCOUNT and ON/end)
  let debitAccount;
  if (onPos > accountPos2) {
    debitAccount = instruction.substring(accountPos2 + 7, onPos).trim();
  } else {
    debitAccount = instruction.substring(accountPos2 + 7).trim();
  }

  // Extract date if present
  let executeBy = null;
  if (onPos > accountPos2) {
    executeBy = instruction.substring(onPos + 2).trim();
  }

  return {
    type: 'CREDIT',
    amount,
    currency,
    debitAccount,
    creditAccount,
    executeBy,
  };
}

/**
 * Validate parsed instruction
 */
function validateInstruction(parsed, accounts) {
  // Validate amount
  if (!parsed.amount || parsed.amount.indexOf('.') !== -1 || parsed.amount.indexOf('-') !== -1) {
    return {
      error: true,
      statusCode: 'AM01',
      statusReason: STATUS_CODES.AM01,
    };
  }

  const amountNum = parseInt(parsed.amount, 10);
  if (isNaN(amountNum) || amountNum <= 0 || parsed.amount !== String(amountNum)) {
    return {
      error: true,
      statusCode: 'AM01',
      statusReason: STATUS_CODES.AM01,
    };
  }

  // Validate currency
  if (!SUPPORTED_CURRENCIES.includes(parsed.currency)) {
    return {
      error: true,
      statusCode: 'CU02',
      statusReason: STATUS_CODES.CU02,
    };
  }

  // Validate account ID format (letters, numbers, hyphens, periods, at symbols)
  const isValidAccountId = (id) => {
    if (!id || id.length === 0) return false;
    for (let i = 0; i < id.length; i++) {
      const char = id[i];
      const isValid =
        (char >= 'a' && char <= 'z') ||
        (char >= 'A' && char <= 'Z') ||
        (char >= '0' && char <= '9') ||
        char === '-' ||
        char === '.' ||
        char === '@';
      if (!isValid) return false;
    }
    return true;
  };

  if (!isValidAccountId(parsed.debitAccount)) {
    return {
      error: true,
      statusCode: 'AC04',
      statusReason: 'Invalid account ID format for debit account',
    };
  }

  if (!isValidAccountId(parsed.creditAccount)) {
    return {
      error: true,
      statusCode: 'AC04',
      statusReason: 'Invalid account ID format for credit account',
    };
  }

  // Validate accounts are different
  if (parsed.debitAccount === parsed.creditAccount) {
    return {
      error: true,
      statusCode: 'AC02',
      statusReason: STATUS_CODES.AC02,
    };
  }

  // Find accounts
  const debitAcc = accounts.find((acc) => acc.id === parsed.debitAccount);
  const creditAcc = accounts.find((acc) => acc.id === parsed.creditAccount);

  if (!debitAcc) {
    return {
      error: true,
      statusCode: 'AC03',
      statusReason: `Account not found: ${parsed.debitAccount}`,
    };
  }

  if (!creditAcc) {
    return {
      error: true,
      statusCode: 'AC03',
      statusReason: `Account not found: ${parsed.creditAccount}`,
    };
  }

  // Validate currencies match
  if (debitAcc.currency.toUpperCase() !== parsed.currency) {
    return {
      error: true,
      statusCode: 'CU01',
      statusReason: STATUS_CODES.CU01,
    };
  }

  if (creditAcc.currency.toUpperCase() !== parsed.currency) {
    return {
      error: true,
      statusCode: 'CU01',
      statusReason: STATUS_CODES.CU01,
    };
  }

  // Validate sufficient funds
  if (debitAcc.balance < amountNum) {
    return {
      error: true,
      statusCode: 'AC01',
      statusReason: `Insufficient funds in account ${parsed.debitAccount}: has ${debitAcc.balance} ${parsed.currency}, needs ${amountNum} ${parsed.currency}`,
    };
  }

  // Validate date format if present
  if (parsed.executeBy) {
    const dateValidation = validateDate(parsed.executeBy);
    if (dateValidation.error) {
      return dateValidation;
    }
  }

  return { error: false };
}

/**
 * Validate date format (YYYY-MM-DD)
 */
function validateDate(dateStr) {
  if (!dateStr || dateStr.length !== 10) {
    return {
      error: true,
      statusCode: 'DT01',
      statusReason: 'Invalid date format. Expected YYYY-MM-DD',
    };
  }

  // Check format manually
  if (dateStr[4] !== '-' || dateStr[7] !== '-') {
    return {
      error: true,
      statusCode: 'DT01',
      statusReason: 'Invalid date format. Expected YYYY-MM-DD',
    };
  }

  const year = dateStr.substring(0, 4);
  const month = dateStr.substring(5, 7);
  const day = dateStr.substring(8, 10);

  // Validate parts are numbers
  for (let i = 0; i < year.length; i++) {
    if (year[i] < '0' || year[i] > '9') {
      return {
        error: true,
        statusCode: 'DT01',
        statusReason: 'Invalid date format. Expected YYYY-MM-DD',
      };
    }
  }
  for (let i = 0; i < month.length; i++) {
    if (month[i] < '0' || month[i] > '9') {
      return {
        error: true,
        statusCode: 'DT01',
        statusReason: 'Invalid date format. Expected YYYY-MM-DD',
      };
    }
  }
  for (let i = 0; i < day.length; i++) {
    if (day[i] < '0' || day[i] > '9') {
      return {
        error: true,
        statusCode: 'DT01',
        statusReason: 'Invalid date format. Expected YYYY-MM-DD',
      };
    }
  }

  // Validate date is valid
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  if (isNaN(date.getTime())) {
    return {
      error: true,
      statusCode: 'DT01',
      statusReason: 'Invalid date',
    };
  }

  return { error: false, date };
}

/**
 * Check if transaction should be executed immediately or pending
 */
function shouldExecuteImmediately(executeBy) {
  if (!executeBy) {
    return true; // No date specified, execute immediately
  }

  const dateValidation = validateDate(executeBy);
  if (dateValidation.error) {
    return false;
  }

  const targetDate = dateValidation.date;
  const now = new Date();

  // Compare dates only (ignore time)
  const nowDateOnly = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const targetDateOnly = new Date(
    Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate())
  );

  return targetDateOnly <= nowDateOnly;
}

/**
 * Execute transaction
 */
function executeTransaction(parsed, accounts) {
  const amountNum = parseInt(parsed.amount, 10);
  const debitAcc = accounts.find((acc) => acc.id === parsed.debitAccount);
  const creditAcc = accounts.find((acc) => acc.id === parsed.creditAccount);

  const debitBalanceBefore = debitAcc.balance;
  const creditBalanceBefore = creditAcc.balance;

  // Update balances
  debitAcc.balance -= amountNum;
  creditAcc.balance += amountNum;

  return {
    debitAcc: {
      ...debitAcc,
      balance_before: debitBalanceBefore,
      currency: debitAcc.currency.toUpperCase(),
    },
    creditAcc: {
      ...creditAcc,
      balance_before: creditBalanceBefore,
      currency: creditAcc.currency.toUpperCase(),
    },
  };
}

/**
 * Main service function
 */
async function paymentInstructionsService(serviceData) {
  const { accounts, instruction } = serviceData;

  // Parse instruction
  const parsed = parseInstruction(instruction);

  // Handle parsing errors
  if (parsed.error) {
    return {
      httpStatus: 400,
      data: {
        type: null,
        amount: null,
        currency: null,
        debit_account: null,
        credit_account: null,
        execute_by: null,
        status: 'failed',
        status_reason: parsed.statusReason,
        status_code: parsed.statusCode,
        accounts: [],
      },
    };
  }

  // Validate instruction
  const validation = validateInstruction(parsed, accounts);

  if (validation.error) {
    // Find accounts for response (even on error)
    const debitAcc = accounts.find((acc) => acc.id === parsed.debitAccount);
    const creditAcc = accounts.find((acc) => acc.id === parsed.creditAccount);

    const responseAccounts = [];

    // Maintain original order from request
    accounts.forEach((acc) => {
      if (acc.id === parsed.debitAccount || acc.id === parsed.creditAccount) {
        responseAccounts.push({
          id: acc.id,
          balance: acc.balance,
          balance_before: acc.balance,
          currency: acc.currency.toUpperCase(),
        });
      }
    });

    return {
      httpStatus: 400,
      data: {
        type: parsed.type,
        amount: parseInt(parsed.amount, 10) || null,
        currency: parsed.currency,
        debit_account: parsed.debitAccount,
        credit_account: parsed.creditAccount,
        execute_by: parsed.executeBy,
        status: 'failed',
        status_reason: validation.statusReason,
        status_code: validation.statusCode,
        accounts: responseAccounts,
      },
    };
  }

  // Check if should execute immediately or pending
  const executeImmediate = shouldExecuteImmediately(parsed.executeBy);

  if (!executeImmediate) {
    // Pending transaction
    const debitAcc = accounts.find((acc) => acc.id === parsed.debitAccount);
    const creditAcc = accounts.find((acc) => acc.id === parsed.creditAccount);

    const responseAccounts = [];
    accounts.forEach((acc) => {
      if (acc.id === parsed.debitAccount || acc.id === parsed.creditAccount) {
        responseAccounts.push({
          id: acc.id,
          balance: acc.balance,
          balance_before: acc.balance,
          currency: acc.currency.toUpperCase(),
        });
      }
    });

    return {
      httpStatus: 200,
      data: {
        type: parsed.type,
        amount: parseInt(parsed.amount, 10),
        currency: parsed.currency,
        debit_account: parsed.debitAccount,
        credit_account: parsed.creditAccount,
        execute_by: parsed.executeBy,
        status: 'pending',
        status_reason: STATUS_CODES.AP02,
        status_code: 'AP02',
        accounts: responseAccounts,
      },
    };
  }

  // Execute transaction
  const result = executeTransaction(parsed, accounts);

  const responseAccounts = [];
  accounts.forEach((acc) => {
    if (acc.id === parsed.debitAccount || acc.id === parsed.creditAccount) {
      if (acc.id === parsed.debitAccount) {
        responseAccounts.push({
          id: result.debitAcc.id,
          balance: result.debitAcc.balance,
          balance_before: result.debitAcc.balance_before,
          currency: result.debitAcc.currency,
        });
      } else {
        responseAccounts.push({
          id: result.creditAcc.id,
          balance: result.creditAcc.balance,
          balance_before: result.creditAcc.balance_before,
          currency: result.creditAcc.currency,
        });
      }
    }
  });

  return {
    httpStatus: 200,
    data: {
      type: parsed.type,
      amount: parseInt(parsed.amount, 10),
      currency: parsed.currency,
      debit_account: parsed.debitAccount,
      credit_account: parsed.creditAccount,
      execute_by: parsed.executeBy,
      status: 'successful',
      status_reason: STATUS_CODES.AP00,
      status_code: 'AP00',
      accounts: responseAccounts,
    },
  };
}

module.exports = paymentInstructionsService;
