# Payment Instruction Parser - Interview Prep Guide

## Project Overview

**What we built:** A REST API that parses payment instructions in natural language format and executes financial transactions.

**Tech Stack:**
- Node.js with Express (via custom template)
- No database required (stateless API)
- Deployed on Render

**Time to Complete:** ~2-3 hours

---

## Table of Contents
1. [Architecture & Project Structure](#architecture--project-structure)
2. [How We Used the Template](#how-we-used-the-template)
3. [The Parser Implementation](#the-parser-implementation)
4. [Validation Logic](#validation-logic)
5. [Transaction Execution](#transaction-execution)
6. [Testing Strategy](#testing-strategy)
7. [Deployment Process](#deployment-process)
8. [Key Challenges & Solutions](#key-challenges--solutions)
9. [Interview Questions & Answers](#interview-questions--answers)

---

## Architecture & Project Structure

### The Template Structure (What We Got)
```
myassessmentapp/
├── core/                    # Core utilities (logging, validation, server)
├── endpoints/               # API route handlers
│   └── onboarding/
│       └── login.js         # Example endpoint
├── services/                # Business logic
│   └── onboarding/
│       └── login.js         # Example service
├── models/                  # Database models (not used in our project)
├── middlewares/             # Express middlewares
├── app.js                   # Main application setup
├── bootstrap.js             # Application bootstrap (loads secrets, starts app)
├── package.json             # Dependencies
└── Procfile                 # Deployment configuration
```

### What We Added
```
endpoints/onboarding/
└── payment-instructions.js  # NEW: Our API endpoint handler

services/onboarding/
└── payment-instructions.js  # NEW: Our parser & business logic

test-payment.js              # NEW: Test suite
.env                         # NEW: Environment configuration
```

**Key Point:** We followed the template's convention of separating **endpoint handlers** (routing) from **services** (business logic).

---

## How We Used the Template

### 1. Understanding the Template Pattern

The template uses a **modular architecture**:

**Endpoint Handler** (`endpoints/onboarding/payment-instructions.js`):
```javascript
const { createHandler } = require('@app-core/server');
const paymentInstructionsService = require('@app/services/onboarding/payment-instructions');

module.exports = createHandler({
  path: '/payment-instructions',
  method: 'post',
  middlewares: [],  // No auth required for this assessment
  async handler(rc, helpers) {
    const payload = rc.body;  // rc = request context
    const response = await paymentInstructionsService(payload);

    return {
      status: response.httpStatus || helpers.http_statuses.HTTP_200_OK,
      data: response.data,
    };
  },
});
```

**Why this pattern?**
- **Separation of Concerns:** Routing logic separate from business logic
- **Testability:** Can test services independently without HTTP layer
- **Reusability:** Services can be called from multiple endpoints
- **Consistency:** All endpoints follow the same pattern

### 2. The Template's Auto-Discovery System

The template automatically discovers and registers endpoints:

In `app.js`:
```javascript
const ENDPOINT_CONFIGS = [
  { path: './endpoints/onboarding/' }
];

// Automatically loads all files in the directory
function setupEndpointHandlers(basePath) {
  const dirs = fs.readdirSync(basePath);
  dirs.forEach((file) => {
    const handler = require(`${basePath}${file}`);
    server.addHandler(handler);  // Registers the endpoint
  });
}
```

**What this means:** We just had to drop our file in `endpoints/onboarding/` and it was automatically registered!

### 3. Making Database/Redis Optional

The template expected MongoDB and Redis, but we didn't need them. Here's how we fixed it:

**Original code in `app.js`:**
```javascript
createConnection({ uri: process.env.MONGODB_URI });
createQueue();
```

**Our fix:**
```javascript
// Only create DB connection if URI is provided
if (process.env.MONGODB_URI) {
  createConnection({ uri: process.env.MONGODB_URI });
}

// Only create queue if Redis URL is provided
if (process.env.REDIS_URL) {
  createQueue();
}
```

**Why this matters:** Makes the app deployable without external dependencies.

### 4. Fixing AWS Secrets Manager

The template tried to load secrets from AWS in production, causing deployment failures.

**Original issue in `bootstrap.js`:**
```javascript
if (process.env.USE_SECRETS_MANAGER) {
  await loadSecretsToEnv({
    optional: process.env.NODE_ENV !== 'production',  // ❌ Fails in production
  });
}
```

**Our fix:**
```javascript
if (process.env.USE_SECRETS_MANAGER === 'true') {  // Only if explicitly set
  await loadSecretsToEnv({
    optional: false,
  });
}
```

**Key Learning:** Always check environment variables with strict equality for booleans stored as strings.

---

## The Parser Implementation

### Challenge: No Regular Expressions Allowed

**Constraint:** Must parse instructions using only string manipulation methods like `.split()`, `.indexOf()`, `.substring()`, etc.

### The Two Instruction Formats

**Format 1 - DEBIT:**
```
DEBIT [amount] [currency] FROM ACCOUNT [account_id] FOR CREDIT TO ACCOUNT [account_id] [ON [date]]
```

**Format 2 - CREDIT:**
```
CREDIT [amount] [currency] TO ACCOUNT [account_id] FOR DEBIT FROM ACCOUNT [account_id] [ON [date]]
```

**Important:** Both formats do the same thing—money moves from debit account to credit account. The only difference is the keyword order.

### Parsing Strategy

#### Step 1: Normalize the Input
```javascript
// Remove extra whitespace
const normalized = instruction.trim().split(' ').filter(word => word.length > 0).join(' ');
const upper = normalized.toUpperCase();  // For case-insensitive keyword matching
```

**Why?** Users might add extra spaces like: `DEBIT  100   USD` (multiple spaces)

#### Step 2: Identify Instruction Type
```javascript
let type = null;
if (upper.indexOf('DEBIT') === 0) {
  type = 'DEBIT';
} else if (upper.indexOf('CREDIT') === 0) {
  type = 'CREDIT';
} else {
  return { error: true, statusCode: 'SY01', statusReason: 'Missing required keyword' };
}
```

**Why indexOf instead of startsWith?** To avoid any modern JS methods that might internally use regex.

#### Step 3: Find Keyword Positions
```javascript
const debitPos = upper.indexOf('DEBIT');
const fromPos = upper.indexOf('FROM');
const accountPos1 = upper.indexOf('ACCOUNT', fromPos);
const forPos = upper.indexOf('FOR');
const creditPos = upper.indexOf('CREDIT', forPos);
const toPos = upper.indexOf('TO', creditPos);
const accountPos2 = upper.indexOf('ACCOUNT', toPos);
const onPos = upper.indexOf('ON', accountPos2);
```

**Key Technique:** Pass a starting position to `indexOf()` to find keywords in sequence.

Example: `upper.indexOf('ACCOUNT', fromPos)` finds the first ACCOUNT after FROM.

#### Step 4: Validate Keyword Order
```javascript
if (!(debitPos < fromPos && fromPos < accountPos1 && accountPos1 < forPos)) {
  throw new Error('Invalid keyword order');
}
```

**Why this matters:** Ensures instructions follow the exact format.

#### Step 5: Extract Values
```javascript
// Extract amount and currency (between DEBIT and FROM)
const amountCurrencyPart = instruction.substring(debitPos + 5, fromPos).trim();
const tokens = amountCurrencyPart.split(' ').filter(t => t.length > 0);

if (tokens.length !== 2) {
  throw new Error('Invalid format: expected amount and currency after DEBIT');
}

const amount = tokens[0];        // "100"
const currency = tokens[1].toUpperCase();  // "USD"

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
```

**Key Points:**
- `debitPos + 5` skips the word "DEBIT" (5 characters)
- `accountPos1 + 7` skips "ACCOUNT" (7 characters)
- We preserve the original casing for account IDs (they're case-sensitive)
- Currency is always uppercased in the response

### Why This Approach Works

1. **No Regex:** Pure string methods
2. **Flexible:** Handles multiple spaces, case variations
3. **Precise:** Validates exact keyword order
4. **Maintainable:** Easy to debug by checking positions

---

## Validation Logic

### The Validation Pipeline

We validate in this order:

1. **Amount Validation** (AM01)
2. **Currency Validation** (CU02)
3. **Account ID Format** (AC04)
4. **Accounts Are Different** (AC02)
5. **Account Exists** (AC03)
6. **Currency Match** (CU01)
7. **Sufficient Funds** (AC01)
8. **Date Format** (DT01)

### 1. Amount Validation (AM01)

```javascript
// Check for decimal or negative
if (!parsed.amount || parsed.amount.indexOf('.') !== -1 || parsed.amount.indexOf('-') !== -1) {
  return { error: true, statusCode: 'AM01', statusReason: 'Amount must be a positive integer' };
}

// Parse and validate
const amountNum = parseInt(parsed.amount, 10);
if (isNaN(amountNum) || amountNum <= 0 || parsed.amount !== String(amountNum)) {
  return { error: true, statusCode: 'AM01', statusReason: 'Amount must be a positive integer' };
}
```

**Why the extra check?** `parsed.amount !== String(amountNum)` catches cases like:
- `"00100"` → parses to `100` but isn't equal to `"100"`
- `"100abc"` → parses to `100` but has extra characters

### 2. Currency Validation (CU02)

```javascript
const SUPPORTED_CURRENCIES = ['NGN', 'USD', 'GBP', 'GHS'];

if (!SUPPORTED_CURRENCIES.includes(parsed.currency)) {
  return {
    error: true,
    statusCode: 'CU02',
    statusReason: 'Unsupported currency. Only NGN, USD, GBP, and GHS are supported',
  };
}
```

**Simple and effective:** Array includes check.

### 3. Account ID Format Validation (AC04)

```javascript
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
```

**Why not regex?** Manual character-by-character validation. Allowed: letters, numbers, `-`, `.`, `@`

### 4. Same Account Check (AC02)

```javascript
if (parsed.debitAccount === parsed.creditAccount) {
  return {
    error: true,
    statusCode: 'AC02',
    statusReason: 'Debit and credit accounts cannot be the same',
  };
}
```

**Business Rule:** Can't transfer money to the same account.

### 5. Account Existence (AC03)

```javascript
const debitAcc = accounts.find(acc => acc.id === parsed.debitAccount);
const creditAcc = accounts.find(acc => acc.id === parsed.creditAccount);

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
```

**Note:** We provide specific error messages (which account is missing).

### 6. Currency Match (CU01)

```javascript
if (debitAcc.currency.toUpperCase() !== parsed.currency) {
  return {
    error: true,
    statusCode: 'CU01',
    statusReason: 'Account currency mismatch',
  };
}

if (creditAcc.currency.toUpperCase() !== parsed.currency) {
  return {
    error: true,
    statusCode: 'CU01',
    statusReason: 'Account currency mismatch',
  };
}
```

**Business Rule:** Both accounts must use the same currency as the instruction.

### 7. Sufficient Funds (AC01)

```javascript
if (debitAcc.balance < amountNum) {
  return {
    error: true,
    statusCode: 'AC01',
    statusReason: `Insufficient funds in account ${parsed.debitAccount}: has ${debitAcc.balance} ${parsed.currency}, needs ${amountNum} ${parsed.currency}`,
  };
}
```

**Helpful Error:** We tell the user exactly how much they have vs. need.

### 8. Date Validation (DT01)

```javascript
function validateDate(dateStr) {
  if (!dateStr || dateStr.length !== 10) {
    return { error: true, statusCode: 'DT01', statusReason: 'Invalid date format. Expected YYYY-MM-DD' };
  }

  // Check format manually (no regex)
  if (dateStr[4] !== '-' || dateStr[7] !== '-') {
    return { error: true, statusCode: 'DT01', statusReason: 'Invalid date format. Expected YYYY-MM-DD' };
  }

  const year = dateStr.substring(0, 4);
  const month = dateStr.substring(5, 7);
  const day = dateStr.substring(8, 10);

  // Validate parts are numbers
  for (let i = 0; i < year.length; i++) {
    if (year[i] < '0' || year[i] > '9') {
      return { error: true, statusCode: 'DT01', statusReason: 'Invalid date format. Expected YYYY-MM-DD' };
    }
  }
  // ... repeat for month and day

  // Validate date is valid
  const date = new Date(dateStr + 'T00:00:00.000Z');
  if (isNaN(date.getTime())) {
    return { error: true, statusCode: 'DT01', statusReason: 'Invalid date' };
  }

  return { error: false, date };
}
```

**Key Technique:** Validate format manually, then use `Date` object to check if it's a real date (catches Feb 30, etc.)

---

## Transaction Execution

### Understanding Debit vs Credit

**Accounting Terms:**
- **Debit Account:** The account **losing** money (source)
- **Credit Account:** The account **gaining** money (destination)

**Both formats do the same thing:**

```
DEBIT 100 USD FROM ACCOUNT A FOR CREDIT TO ACCOUNT B
  → A loses 100 (debit), B gains 100 (credit)

CREDIT 100 USD TO ACCOUNT B FOR DEBIT FROM ACCOUNT A
  → A loses 100 (debit), B gains 100 (credit)
```

### Immediate vs Pending Execution

```javascript
function shouldExecuteImmediately(executeBy) {
  if (!executeBy) {
    return true;  // No date specified, execute now
  }

  const dateValidation = validateDate(executeBy);
  if (dateValidation.error) {
    return false;
  }

  const targetDate = dateValidation.date;
  const now = new Date();

  // Compare dates only (ignore time) in UTC
  const nowDateOnly = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const targetDateOnly = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()));

  return targetDateOnly <= nowDateOnly;
}
```

**Business Rules:**
- No date or past date → Execute immediately (AP00)
- Future date → Mark as pending (AP02), don't update balances

### Executing the Transaction

```javascript
function executeTransaction(parsed, accounts) {
  const amountNum = parseInt(parsed.amount, 10);
  const debitAcc = accounts.find(acc => acc.id === parsed.debitAccount);
  const creditAcc = accounts.find(acc => acc.id === parsed.creditAccount);

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
```

**Key Points:**
- Store `balance_before` for audit trail
- Debit decreases, credit increases
- Always uppercase currency in response

### Response Format

**Success Response:**
```json
{
  "type": "DEBIT",
  "amount": 30,
  "currency": "USD",
  "debit_account": "a",
  "credit_account": "b",
  "execute_by": null,
  "status": "successful",
  "status_reason": "Transaction executed successfully",
  "status_code": "AP00",
  "accounts": [
    {
      "id": "a",
      "balance": 200,
      "balance_before": 230,
      "currency": "USD"
    },
    {
      "id": "b",
      "balance": 330,
      "balance_before": 300,
      "currency": "USD"
    }
  ]
}
```

**Error Response:**
```json
{
  "type": "DEBIT",
  "amount": 500,
  "currency": "USD",
  "debit_account": "a",
  "credit_account": "b",
  "execute_by": null,
  "status": "failed",
  "status_reason": "Insufficient funds in account a: has 100 USD, needs 500 USD",
  "status_code": "AC01",
  "accounts": [
    {
      "id": "a",
      "balance": 100,
      "balance_before": 100,
      "currency": "USD"
    },
    {
      "id": "b",
      "balance": 500,
      "balance_before": 500,
      "currency": "USD"
    }
  ]
}
```

**Unparseable Instruction Response:**
```json
{
  "type": null,
  "amount": null,
  "currency": null,
  "debit_account": null,
  "credit_account": null,
  "execute_by": null,
  "status": "failed",
  "status_reason": "Malformed instruction: unable to parse keywords",
  "status_code": "SY03",
  "accounts": []
}
```

### Account Order in Response

**Requirement:** Maintain the original order from the request.

```javascript
const responseAccounts = [];

// Iterate through original accounts array
accounts.forEach(acc => {
  if (acc.id === parsed.debitAccount || acc.id === parsed.creditAccount) {
    responseAccounts.push({
      id: acc.id,
      balance: acc.balance,
      balance_before: acc.balance_before,
      currency: acc.currency.toUpperCase(),
    });
  }
});
```

**Example:**
- Request has accounts: `[b, a, c]`
- Transaction uses `a` and `b`
- Response must have: `[b, a]` (not `[a, b]`)

---

## Testing Strategy

### Local Testing

Created `test-payment.js` to verify all 12 test cases:

```javascript
const paymentInstructionsService = require('./services/onboarding/payment-instructions');

async function runTests() {
  // Test 1: Valid DEBIT
  const test1 = await paymentInstructionsService({
    accounts: [
      { id: 'N90394', balance: 1000, currency: 'USD' },
      { id: 'N9122', balance: 500, currency: 'USD' },
    ],
    instruction: 'DEBIT 500 USD FROM ACCOUNT N90394 FOR CREDIT TO ACCOUNT N9122',
  });
  console.log(JSON.stringify(test1.data, null, 2));

  // ... 11 more tests
}
```

**Run with:** `node test-payment.js`

### Test Coverage

✅ **Valid Cases:**
1. DEBIT format
2. CREDIT format with future date
3. Case insensitive keywords
4. Past date (immediate execution)

✅ **Error Cases:**
5. Currency mismatch (CU01)
6. Insufficient funds (AC01)
7. Unsupported currency (CU02)
8. Same account (AC02)
9. Negative amount (AM01)
10. Account not found (AC03)
11. Decimal amount (AM01)
12. Malformed instruction (SY03)

### Testing the Live API

```bash
curl -X POST https://myassessmentapp.onrender.com/payment-instructions \
  -H "Content-Type: application/json" \
  -d '{
    "accounts": [
      {"id": "a", "balance": 230, "currency": "USD"},
      {"id": "b", "balance": 300, "currency": "USD"}
    ],
    "instruction": "DEBIT 30 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT b"
  }'
```

---

## Deployment Process

### Platform: Render

**Why Render?**
- Free tier available
- Auto-deploys from GitHub
- Easy environment variable management
- Better for Node.js than Heroku's free tier removal

### Deployment Steps

1. **Push code to GitHub:**
```bash
git init
git add .
git commit -m "feat: implement payment instruction parser"
git remote add origin https://github.com/William9701/myassessmentapp.git
git push -u origin main
```

2. **Create Render Web Service:**
- Connect GitHub repository
- Set build command: `npm install`
- Set start command: `npm start`
- Leave environment variables empty (no DB needed)

3. **Fix Bootstrap Issue:**

Initial deployment failed because `bootstrap.js` tried to load AWS secrets in production.

**Fix:**
```javascript
// Changed from:
if (process.env.USE_SECRETS_MANAGER) {
  await loadSecretsToEnv({
    optional: process.env.NODE_ENV !== 'production',  // ❌ Fails
  });
}

// To:
if (process.env.USE_SECRETS_MANAGER === 'true') {  // ✅ Only if explicitly set
  await loadSecretsToEnv({
    optional: false,
  });
}
```

4. **Commit and redeploy:**
```bash
git add bootstrap.js
git commit -m "fix: disable AWS Secrets Manager for deployment"
git push
```

Render auto-detected the push and redeployed. ✅ Success!

### Environment Configuration

**On Render, we set:**
- `PORT` - Auto-set by Render
- `USE_SECRETS_MANAGER` - Left empty (defaults to falsy)
- `MONGODB_URI` - Left empty
- `REDIS_URL` - Left empty

**The app gracefully skips** MongoDB and Redis connections when these are empty.

---

## Key Challenges & Solutions

### Challenge 1: No Regex Allowed

**Problem:** How to parse complex instructions without regex?

**Solution:**
- Use `.indexOf()` with starting positions
- Validate keyword positions and order
- Extract substrings based on keyword positions
- Manual character validation for account IDs

**Key Learning:** String manipulation can be more explicit and easier to debug than regex.

### Challenge 2: Handling Multiple Spaces

**Problem:** Users might type `DEBIT  100   USD` (extra spaces)

**Solution:**
```javascript
const normalized = instruction.trim().split(' ').filter(word => word.length > 0).join(' ');
```

This collapses multiple spaces into single spaces.

### Challenge 3: Case Sensitivity

**Problem:** Keywords should be case-insensitive, but account IDs are case-sensitive.

**Solution:**
- Convert to uppercase for keyword matching: `const upper = normalized.toUpperCase()`
- Extract values from original string to preserve casing
- Uppercase currency in response (business requirement)

### Challenge 4: Parsing Both Formats

**Problem:** DEBIT and CREDIT formats have different keyword orders.

**Solution:**
- Separate parsing functions: `parseDebitInstruction()` and `parseCreditInstruction()`
- Each function knows its specific keyword order
- Both return the same structure

### Challenge 5: Date Comparison

**Problem:** Compare dates without time component, handle timezones.

**Solution:**
```javascript
const nowDateOnly = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
const targetDateOnly = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()));

return targetDateOnly <= nowDateOnly;
```

Use UTC to avoid timezone issues.

### Challenge 6: Template Dependencies

**Problem:** Template expected MongoDB and Redis, we didn't need them.

**Solution:** Conditional initialization:
```javascript
if (process.env.MONGODB_URI) {
  createConnection({ uri: process.env.MONGODB_URI });
}
```

### Challenge 7: AWS Secrets Manager in Production

**Problem:** Template tried to load AWS secrets, causing deployment failure.

**Solution:** Change condition from truthy check to strict equality:
```javascript
if (process.env.USE_SECRETS_MANAGER === 'true') {
  // Only runs if explicitly set to 'true'
}
```

### Challenge 8: Maintaining Account Order

**Problem:** Response must maintain original account order from request.

**Solution:**
```javascript
accounts.forEach(acc => {
  if (acc.id === parsed.debitAccount || acc.id === parsed.creditAccount) {
    responseAccounts.push(/* formatted account */);
  }
});
```

Iterate through original array, not the parsed accounts.

---

## Interview Questions & Answers

### General Questions

**Q: Walk me through the architecture of this project.**

**A:** "We built a REST API using a modular Node.js template. The architecture separates concerns into three layers:

1. **Endpoint handlers** - Handle HTTP routing, request/response formatting
2. **Services** - Contain business logic (parsing, validation, execution)
3. **Core utilities** - Reusable components like logging, server setup

The template auto-discovers endpoints, so we just dropped our file in `endpoints/onboarding/` and it was automatically registered. This follows a convention-over-configuration approach that makes adding new endpoints very fast."

---

**Q: Why did you separate the endpoint from the service?**

**A:** "Three main reasons:

1. **Testability** - I can unit test the parsing logic without spinning up an HTTP server
2. **Reusability** - The parser service could be called from multiple endpoints, background jobs, or even CLI tools
3. **Maintainability** - Business logic changes don't affect routing, and vice versa

For example, if we wanted to add authentication, we'd only modify the endpoint handler's middlewares array, not touch the service at all."

---

**Q: How did you handle the 'no regex' constraint?**

**A:** "I used a position-based parsing strategy:

1. Find keyword positions using `.indexOf()` with starting positions
2. Validate the positions are in the correct order
3. Extract values using `.substring()` based on those positions

For example:
```javascript
const fromPos = upper.indexOf('FROM');
const accountPos = upper.indexOf('ACCOUNT', fromPos);  // Start searching after FROM
const debitAccount = instruction.substring(accountPos + 7, forPos).trim();
```

This approach is actually more explicit than regex and easier to debug. When something breaks, I can console.log the positions and see exactly where parsing failed."

---

**Q: How did you handle validation?**

**A:** "I implemented a validation pipeline with 8 different checks, each returning a specific error code:

1. **Syntax validation** (AM01, AC04, DT01, SY01-03) - Done during or after parsing
2. **Business rule validation** (AC01-03, CU01-02) - Done with the account data

The key was to provide helpful error messages. For example, instead of just 'Insufficient funds', I return: 'Insufficient funds in account a: has 100 USD, needs 500 USD'.

I also had to handle the order of validation carefully. For instance, I validate that accounts exist before checking their balances, otherwise the code would crash."

---

**Q: Explain the difference between DEBIT and CREDIT formats.**

**A:** "Both formats execute the same transaction—money moves from one account to another. The difference is just the phrasing:

- **DEBIT format**: Emphasizes the source → `DEBIT 100 USD FROM ACCOUNT A FOR CREDIT TO ACCOUNT B`
- **CREDIT format**: Emphasizes the destination → `CREDIT 100 USD TO ACCOUNT B FOR DEBIT FROM ACCOUNT A`

In both cases, Account A loses money (debit) and Account B gains money (credit). This follows standard accounting terminology where:
- **Debit** = decrease in liability/increase in asset (money leaving)
- **Credit** = increase in liability/decrease in asset (money arriving)

In the response, I include a `type` field that reflects which keyword was used, but the `debit_account` and `credit_account` fields always identify the correct accounts regardless of format."

---

**Q: How do you handle date-based execution?**

**A:** "There are three scenarios:

1. **No date provided** → Execute immediately (AP00)
2. **Past date** → Execute immediately (AP00)
3. **Future date** → Mark as pending (AP02), don't modify balances

The tricky part was comparing dates without considering time:

```javascript
const nowDateOnly = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
const targetDateOnly = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()));
```

I use UTC to avoid timezone issues. This ensures that '2025-11-10' is consistently compared regardless of server location."

---

### Technical Deep-Dive Questions

**Q: Show me how you validate account IDs without regex.**

**A:** "I iterate through each character and check if it's in the allowed set:

```javascript
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
```

The allowed characters are: letters, numbers, hyphen, period, and at-sign. This validates IDs like `'acc-001'`, `'user@bank'`, `'N90394'`."

---

**Q: How do you ensure amount is a positive integer?**

**A:** "Multiple checks:

```javascript
// 1. Check for decimal point or negative sign in the string
if (parsed.amount.indexOf('.') !== -1 || parsed.amount.indexOf('-') !== -1) {
  return { error: true, statusCode: 'AM01' };
}

// 2. Parse and validate
const amountNum = parseInt(parsed.amount, 10);
if (isNaN(amountNum) || amountNum <= 0) {
  return { error: true, statusCode: 'AM01' };
}

// 3. Ensure the parsed number matches the original string
if (parsed.amount !== String(amountNum)) {
  return { error: true, statusCode: 'AM01' };
}
```

The third check is crucial. It catches edge cases like:
- `'00100'` → parses to 100, but `'00100' !== '100'`
- `'100abc'` → parses to 100, but `'100abc' !== '100'`
- `'100.00'` → parses to 100, but `'100.00' !== '100'` (though we caught it in step 1)"

---

**Q: How did you test this?**

**A:** "Three-level testing approach:

1. **Unit Testing**: Created `test-payment.js` that calls the service directly with 12 test cases covering all validation rules and success scenarios.

2. **Local Integration Testing**: Ran the server locally and used curl to test the full HTTP flow.

3. **Production Testing**: After deployment, tested the live endpoint on Render.

I didn't use a framework like Mocha because the assessment was time-sensitive, but in a production environment I'd add:
- Automated tests in CI/CD
- Property-based testing for parsing edge cases
- Load testing for concurrent transactions"

---

**Q: How would you handle concurrent requests to the same account?**

**A:** "Currently, the API is stateless—account data comes in the request. But if this were connected to a database, I'd need to handle race conditions.

**Options:**

1. **Optimistic Locking**: Use a version field, fail if version changed
```javascript
UPDATE accounts
SET balance = balance - 100, version = version + 1
WHERE id = 'a' AND version = 5
```

2. **Pessimistic Locking**: Lock the row during transaction
```javascript
SELECT * FROM accounts WHERE id = 'a' FOR UPDATE
```

3. **Database Transactions**: Use ACID transactions
```javascript
BEGIN TRANSACTION;
UPDATE accounts SET balance = balance - 100 WHERE id = 'a';
UPDATE accounts SET balance = balance + 100 WHERE id = 'b';
COMMIT;
```

For this stateless assessment, it's not an issue, but I'd implement option 3 (transactions) in production for consistency."

---

**Q: What would you do differently if you had more time?**

**A:** "Several improvements:

1. **Error Recovery**: Add partial success handling - if debit succeeds but credit fails, rollback
2. **Audit Logging**: Log every transaction attempt with timestamp, IP, full request
3. **Rate Limiting**: Prevent abuse with per-IP or per-account rate limits
4. **Input Sanitization**: Escape special characters in account IDs for logging
5. **Monitoring**: Add metrics for transaction success rate, average processing time
6. **Validation Enhancement**: Add account balance overflow checks (max safe integer)
7. **Parser Improvements**: Support currency symbols ($, £, ₦) alongside codes
8. **Test Coverage**: Add property-based tests to find edge cases automatically
9. **Documentation**: OpenAPI/Swagger spec for the endpoint
10. **Idempotency**: Add request IDs to prevent duplicate submissions"

---

**Q: Walk me through a specific challenge you faced.**

**A:** "The biggest challenge was deployment. The template expected AWS Secrets Manager, which caused failures on Render.

**The Problem:**
```javascript
if (process.env.USE_SECRETS_MANAGER) {
  await loadSecretsToEnv({
    optional: process.env.NODE_ENV !== 'production',  // ❌
  });
}
```

When `NODE_ENV=production` (Render's default), `optional` became `false`, so the app crashed trying to load AWS credentials.

**My Solution:**
```javascript
if (process.env.USE_SECRETS_MANAGER === 'true') {  // ✅
  // Only runs if explicitly set to 'true'
}
```

I changed from a truthy check to strict equality. Now it only runs if explicitly enabled.

**Key Learning:** When dealing with environment variables, always use strict equality for boolean checks because env vars are strings. `process.env.USE_SECRETS_MANAGER` could be `'false'` (string), which is truthy!"

---

### Behavioral Questions

**Q: How did you approach this project?**

**A:** "I followed a systematic approach:

1. **Requirements Analysis** (30 mins): Read the spec multiple times, identified the two instruction formats, listed all validation rules

2. **Template Understanding** (30 mins): Explored the template structure, understood the endpoint/service pattern, identified dependencies

3. **Core Implementation** (60 mins):
   - Implemented the parser without regex
   - Added validation with all status codes
   - Built transaction execution logic

4. **Testing** (30 mins): Created comprehensive test suite, verified all 12 test cases

5. **Deployment** (30 mins): Fixed template dependencies, deployed to Render, verified production

The key was not rushing into code. Spending time understanding the template patterns saved me from fighting against the framework."

---

**Q: What would you do if you had to add a new currency?**

**A:** "Simple change in one place:

```javascript
// Before
const SUPPORTED_CURRENCIES = ['NGN', 'USD', 'GBP', 'GHS'];

// After
const SUPPORTED_CURRENCIES = ['NGN', 'USD', 'GBP', 'GHS', 'EUR'];
```

That's the beauty of centralizing configuration. However, in a production system, I'd:

1. Move this to a database table or config file
2. Add currency metadata (symbol, decimal places, exchange rates)
3. Create an admin endpoint to manage currencies
4. Add validation for currency-specific rules (some currencies don't use decimals)"

---

**Q: How would you scale this to millions of transactions?**

**A:** "Several strategies:

1. **Horizontal Scaling**: Deploy multiple instances behind a load balancer (Render supports this)

2. **Caching**: Cache account lookups if accounts were in a database:
```javascript
const account = await redis.get(`account:${id}`) || await db.getAccount(id);
```

3. **Async Processing**: Queue transactions for background processing:
```javascript
// API just validates and queues
await queue.add('process-transaction', { accounts, instruction });
return { status: 'queued', transactionId: 'xxx' };
```

4. **Database Optimization**:
   - Index on account IDs
   - Partition by currency or date
   - Read replicas for balance queries

5. **Monitoring**: Track bottlenecks with APM tools (New Relic, Datadog)

For 1M+ transactions/day, I'd also add:
- Message queue (RabbitMQ/SQS) for reliability
- Event sourcing for audit trail
- CQRS pattern (separate read/write models)"

---

## Key Takeaways

1. **Follow the Template Pattern**: Don't fight the framework, understand and use its conventions
2. **Separation of Concerns**: Keep HTTP logic separate from business logic
3. **No Regex Doesn't Mean Complex**: Position-based parsing is explicit and debuggable
4. **Validation is Critical**: Multiple layers of validation prevent bad data from flowing through
5. **Test Thoroughly**: Cover both success and error cases
6. **Deploy Early**: Find deployment issues early, not at the last minute
7. **Read Error Messages**: The AWS Secrets Manager error led me straight to the fix
8. **Document Decisions**: Keep notes on why you made certain choices

---

## Common Pitfalls to Avoid

❌ **Using regex accidentally**: Methods like `.split(/\s+/)` or `.replace(/\s+/, ' ')` use regex
✅ **Use**: `.split(' ')` and manual filtering

❌ **Forgetting case sensitivity**: Keywords are case-insensitive, account IDs are case-sensitive
✅ **Parse with uppercase, extract from original**

❌ **Wrong account order in response**: Must maintain request order
✅ **Iterate through original accounts array**

❌ **Not handling extra spaces**: `"DEBIT  100   USD"`
✅ **Normalize whitespace first**

❌ **Truthy checks on env vars**: `if (process.env.FLAG)` where FLAG="false"
✅ **Strict equality**: `if (process.env.FLAG === 'true')`

❌ **Modifying balances for pending transactions**: Future-dated transactions shouldn't execute
✅ **Check date before modifying balances**

❌ **Vague error messages**: "Invalid input"
✅ **Specific messages**: "Insufficient funds in account a: has 100 USD, needs 500 USD"

---

## Final Notes

This project demonstrates:
- ✅ Following existing patterns and conventions
- ✅ Working with constraints (no regex)
- ✅ Comprehensive validation
- ✅ Clear error handling
- ✅ Thorough testing
- ✅ Production deployment
- ✅ Problem-solving (AWS Secrets Manager fix)

**Time to Complete**: ~2-3 hours
**Lines of Code**: ~500 lines (service), ~20 lines (endpoint)
**Test Coverage**: 12 test cases, all passing
**Production Status**: ✅ Live and working

**Live Endpoint**: https://myassessmentapp.onrender.com/payment-instructions

---

*Good luck with your interview! Review this guide, run the code locally, test the live endpoint, and you'll be well-prepared to discuss every aspect of the project.*
