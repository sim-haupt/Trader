const fs = require("fs");
const path = require("path");
require("dotenv").config();
const prisma = require("../src/config/prisma");

function splitSqlStatements(sql) {
  const statements = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let dollarQuoteTag = null;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (!inSingleQuote && !inDoubleQuote && char === "$") {
      const rest = sql.slice(index);
      const match = rest.match(/^\$[A-Za-z0-9_]*\$/);

      if (match) {
        const tag = match[0];

        if (dollarQuoteTag === tag) {
          current += tag;
          index += tag.length - 1;
          dollarQuoteTag = null;
          continue;
        }

        if (!dollarQuoteTag) {
          dollarQuoteTag = tag;
          current += tag;
          index += tag.length - 1;
          continue;
        }
      }
    }

    if (!dollarQuoteTag && !inDoubleQuote && char === "'" && next !== "'") {
      inSingleQuote = !inSingleQuote;
    } else if (!dollarQuoteTag && !inSingleQuote && char === '"') {
      inDoubleQuote = !inDoubleQuote;
    }

    current += char;

    if (!dollarQuoteTag && !inSingleQuote && !inDoubleQuote && char === ";") {
      const statement = current.trim();
      if (statement) {
        statements.push(statement);
      }
      current = "";
    }
  }

  const trailing = current.trim();
  if (trailing) {
    statements.push(trailing);
  }

  return statements;
}

async function main() {
  const filePath = path.join(process.cwd(), "prisma", "manual", "20260711_add_tax_reports.sql");
  const sql = fs.readFileSync(filePath, "utf8");
  const statements = splitSqlStatements(sql);

  console.log(`Applying ${statements.length} SQL statements from ${filePath}`);

  for (let index = 0; index < statements.length; index += 1) {
    await prisma.$executeRawUnsafe(statements[index]);
    console.log(`Applied ${index + 1}/${statements.length}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
