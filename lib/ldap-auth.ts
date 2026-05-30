import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import type { Client, ClientOptions, Entry } from "ldapts";

export type AuthProvider = "local" | "ldap" | "hybrid";

type LdapUser = {
  dn: string;
  bindId?: string;
  email?: string;
  name?: string;
};

type LdapConfig = {
  authMethod: "node" | "command";
  url: string;
  baseDn?: string;
  bindDn?: string;
  bindPassword?: string;
  userDnTemplate?: string;
  userBindAttribute?: string;
  userFilter: string;
  emailAttribute: string;
  nameAttribute: string;
  connectTimeoutMs: number;
  timeoutMs: number;
  tlsRejectUnauthorized: boolean;
};

const DEFAULT_LDAP_USER_FILTER = "(mail={{email}})";
const DEFAULT_LDAP_EMAIL_ATTRIBUTE = "mail";
const DEFAULT_LDAP_NAME_ATTRIBUTE = "displayName";
const DEFAULT_LDAP_TIMEOUT_MS = 5000;
const execFileAsync = promisify(execFile);

const nodeRequire = createRequire(__filename);

type LdaptsModule = {
  Client: new (options: ClientOptions) => Client;
};

function loadLdapts(): LdaptsModule {
  return nodeRequire("ldapts") as LdaptsModule;
}

function logLdapDebug(message: string, details?: Record<string, string>): void {
  if (process.env.LDAP_DEBUG !== "true") {
    return;
  }

  console.info("LDAP debug:", message, details ?? {});
}

export function getAuthProvider(): AuthProvider {
  const provider = process.env.AUTH_PROVIDER?.trim().toLowerCase();

  if (provider === "ldap" || provider === "hybrid") {
    return provider;
  }

  return "local";
}

function getLdapConfig(): LdapConfig | null {
  const url = process.env.LDAP_URL?.trim();

  if (!url) {
    return null;
  }

  return {
    authMethod: process.env.LDAP_AUTH_METHOD === "command" ? "command" : "node",
    url,
    baseDn: optionalEnv("LDAP_BASE_DN"),
    bindDn: optionalEnv("LDAP_BIND_DN"),
    bindPassword: optionalEnv("LDAP_BIND_PASSWORD"),
    userDnTemplate: optionalEnv("LDAP_USER_DN_TEMPLATE"),
    userBindAttribute: optionalEnv("LDAP_USER_BIND_ATTRIBUTE"),
    userFilter: process.env.LDAP_USER_FILTER?.trim() || DEFAULT_LDAP_USER_FILTER,
    emailAttribute:
      process.env.LDAP_EMAIL_ATTRIBUTE?.trim() || DEFAULT_LDAP_EMAIL_ATTRIBUTE,
    nameAttribute:
      process.env.LDAP_NAME_ATTRIBUTE?.trim() || DEFAULT_LDAP_NAME_ATTRIBUTE,
    connectTimeoutMs: readPositiveInt(
      "LDAP_CONNECT_TIMEOUT_MS",
      DEFAULT_LDAP_TIMEOUT_MS,
    ),
    timeoutMs: readPositiveInt("LDAP_TIMEOUT_MS", DEFAULT_LDAP_TIMEOUT_MS),
    tlsRejectUnauthorized: process.env.LDAP_TLS_REJECT_UNAUTHORIZED !== "false",
  };
}

async function withPasswordFile<T>(
  password: string | undefined,
  callback: (passwordFile: string) => Promise<T>,
): Promise<T> {
  const passwordDirectory = await mkdtemp(join(tmpdir(), "nobino-ldap-"));
  const passwordFile = join(passwordDirectory, "password");

  await writeFile(passwordFile, password ?? "", { mode: 0o600 });

  try {
    return await callback(passwordFile);
  } finally {
    await rm(passwordDirectory, { force: true, recursive: true });
  }
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();

  return value || undefined;
}

function readPositiveInt(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);

  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function escapeLdapFilterValue(value: string): string {
  return value.replace(/[\0()*\\]/g, (character) => {
    const hex = character.charCodeAt(0).toString(16).padStart(2, "0");

    return `\\${hex}`;
  });
}

function escapeLdapDnValue(value: string): string {
  return value.replace(
    /(^ | $|["#+,;<>\\=])/g,
    (character) =>
      `\\${character.charCodeAt(0).toString(16).padStart(2, "0")}`,
  );
}

function getLoginParts(email: string): { email: string; username: string } {
  const normalizedEmail = email.trim().toLowerCase();
  const username = normalizedEmail.split("@")[0] ?? normalizedEmail;

  return { email: normalizedEmail, username };
}

function renderFilterTemplate(template: string, email: string): string {
  const login = getLoginParts(email);

  return template
    .replaceAll("{{email}}", escapeLdapFilterValue(login.email))
    .replaceAll("{{login}}", escapeLdapFilterValue(login.email))
    .replaceAll("{{username}}", escapeLdapFilterValue(login.username));
}

function renderDnTemplate(template: string, email: string): string {
  const login = getLoginParts(email);

  return template
    .replaceAll("{{email}}", escapeLdapDnValue(login.email))
    .replaceAll("{{login}}", escapeLdapDnValue(login.email))
    .replaceAll("{{username}}", escapeLdapDnValue(login.username));
}

function createClient(config: LdapConfig): Client {
  const { Client: LdapClient } = loadLdapts();

  return new LdapClient({
    url: config.url,
    connectTimeout: config.connectTimeoutMs,
    strictDN: false,
    timeout: config.timeoutMs,
    tlsOptions: {
      rejectUnauthorized: config.tlsRejectUnauthorized,
    },
  });
}

async function bindSearchUser(
  client: Client,
  config: LdapConfig,
): Promise<void> {
  if (!config.bindDn) {
    logLdapDebug("using anonymous search bind");
    return;
  }

  logLdapDebug("binding search account", { bindDn: config.bindDn });
  await client.bind(config.bindDn, config.bindPassword ?? "");
}

async function safeUnbind(client: Client): Promise<void> {
  if (!client.isConnected) {
    return;
  }

  try {
    await client.unbind();
  } catch (error) {
    console.warn("LDAP unbind failed after authentication step", error);
  }
}

function getStringAttribute(
  entry: Entry,
  attributeName: string,
): string | undefined {
  const value = entry[attributeName];

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }

  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }

  if (Array.isArray(value) && Buffer.isBuffer(value[0])) {
    return value[0].toString("utf8");
  }

  return undefined;
}

async function findLdapUser(
  client: Client,
  config: LdapConfig,
  email: string,
): Promise<LdapUser | null> {
  if (config.userDnTemplate) {
    logLdapDebug("using direct user DN template");
    return { dn: renderDnTemplate(config.userDnTemplate, email) };
  }

  if (!config.baseDn) {
    throw new Error("LDAP_BASE_DN is required when LDAP_USER_DN_TEMPLATE is not set");
  }

  await bindSearchUser(client, config);

  logLdapDebug("searching user", {
    baseDn: config.baseDn,
    filter: renderFilterTemplate(config.userFilter, email),
  });

  const result = await client.search(config.baseDn, {
    scope: "sub",
    sizeLimit: 2,
    filter: renderFilterTemplate(config.userFilter, email),
    attributes: [
      config.emailAttribute,
      config.nameAttribute,
      config.userBindAttribute,
    ].filter((attribute): attribute is string => Boolean(attribute)),
  });

  if (result.searchEntries.length !== 1) {
    logLdapDebug("user search did not return exactly one entry", {
      count: String(result.searchEntries.length),
    });
    return null;
  }

  const [entry] = result.searchEntries;

  return {
    dn: entry.dn,
    bindId: config.userBindAttribute
      ? getStringAttribute(entry, config.userBindAttribute)
      : undefined,
    email: getStringAttribute(entry, config.emailAttribute),
    name: getStringAttribute(entry, config.nameAttribute),
  };
}

function unfoldLdif(output: string): string[] {
  const lines: string[] = [];

  for (const line of output.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) {
      continue;
    }

    if (line.startsWith(" ") && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
      continue;
    }

    lines.push(line);
  }

  return lines;
}

function parseLdifValue(line: string): [string, string] | null {
  const separatorIndex = line.indexOf(":");

  if (separatorIndex < 1) {
    return null;
  }

  const name = line.slice(0, separatorIndex);
  const marker = line.slice(separatorIndex, separatorIndex + 2);
  const rawValue =
    marker === "::"
      ? line.slice(separatorIndex + 2).trimStart()
      : line.slice(separatorIndex + 1).trimStart();
  const value =
    marker === "::"
      ? Buffer.from(rawValue, "base64").toString("utf8")
      : rawValue;

  return [name, value];
}

function parseLdifEntries(output: string): Array<Record<string, string>> {
  const entries: Array<Record<string, string>> = [];
  let current: Record<string, string> | null = null;

  for (const line of unfoldLdif(output)) {
    if (line.startsWith("ref:")) {
      continue;
    }

    const parsed = parseLdifValue(line);

    if (!parsed) {
      continue;
    }

    const [name, value] = parsed;

    if (name === "dn") {
      current = { dn: value };
      entries.push(current);
      continue;
    }

    if (current && current[name] === undefined) {
      current[name] = value;
    }
  }

  return entries;
}

async function execLdapCommand(
  command: "ldapsearch" | "ldapwhoami",
  args: string[],
): Promise<string> {
  const { stdout } = await execFileAsync(command, args, {
    timeout: DEFAULT_LDAP_TIMEOUT_MS + 5000,
    maxBuffer: 1024 * 1024,
  });

  return stdout;
}

async function findLdapUserWithCommand(
  config: LdapConfig,
  email: string,
): Promise<LdapUser | null> {
  if (config.userDnTemplate) {
    logLdapDebug("using direct user DN template");
    return { dn: renderDnTemplate(config.userDnTemplate, email) };
  }

  if (!config.baseDn) {
    throw new Error("LDAP_BASE_DN is required when LDAP_USER_DN_TEMPLATE is not set");
  }

  const filter = renderFilterTemplate(config.userFilter, email);

  logLdapDebug("searching user with ldapsearch", {
    baseDn: config.baseDn,
    filter,
  });

  return withPasswordFile(config.bindPassword, async (passwordFile) => {
    const args = [
      "-LLL",
      "-x",
      "-H",
      config.url,
      "-D",
      config.bindDn ?? "",
      "-y",
      passwordFile,
      "-b",
      config.baseDn ?? "",
      filter,
      config.emailAttribute,
      config.nameAttribute,
      config.userBindAttribute ?? "dn",
    ];

    const output = await execLdapCommand("ldapsearch", args);
    const entries = parseLdifEntries(output);

    if (entries.length !== 1) {
      logLdapDebug("ldapsearch did not return exactly one entry", {
        count: String(entries.length),
      });
      return null;
    }

    const [entry] = entries;

    return {
      dn: entry.dn,
      bindId: config.userBindAttribute
        ? entry[config.userBindAttribute]
        : undefined,
      email: entry[config.emailAttribute],
      name: entry[config.nameAttribute],
    };
  });
}

async function authenticateLdapUserWithCommand(
  config: LdapConfig,
  email: string,
  password: string,
): Promise<LdapUser | null> {
  const user = await findLdapUserWithCommand(config, email);

  if (!user) {
    return null;
  }

  const userBindId = user.bindId ?? user.dn;

  logLdapDebug("binding login user with ldapwhoami", { bindId: userBindId });

  await withPasswordFile(password, async (passwordFile) => {
    await execLdapCommand("ldapwhoami", [
      "-x",
      "-H",
      config.url,
      "-D",
      userBindId,
      "-y",
      passwordFile,
    ]);
  });

  return user;
}

function isInvalidCredentialsError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "InvalidCredentialsError" || error.message === "Invalid Credentials")
  );
}

export async function authenticateLdapUser(
  email: string,
  password: string,
): Promise<LdapUser | null> {
  const config = getLdapConfig();

  if (!config) {
    throw new Error("LDAP_URL is required when AUTH_PROVIDER uses LDAP");
  }

  if (config.authMethod === "command") {
    try {
      return await authenticateLdapUserWithCommand(config, email, password);
    } catch (error) {
      console.error("LDAP command authentication failed", error);
      return null;
    }
  }

  const searchClient = createClient(config);

  try {
    const user = await findLdapUser(searchClient, config, email);

    if (!user) {
      return null;
    }

    await safeUnbind(searchClient);

    const userClient = createClient(config);
    const userBindId = user.bindId ?? user.dn;

    logLdapDebug("binding login user", { bindId: userBindId });

    try {
      await userClient.bind(userBindId, password);
    } finally {
      await safeUnbind(userClient);
    }

    return user;
  } catch (error) {
    if (isInvalidCredentialsError(error)) {
      return null;
    }

    console.error("LDAP authentication failed", error);
    return null;
  } finally {
    await safeUnbind(searchClient);
  }
}
