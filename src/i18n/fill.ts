// No imports on purpose: the lib files (assessment, materialProgress) use this
// without pulling React or Supabase in.
export type Vars = Record<string, string | number>;
export type Translate = (text: string, vars?: Vars) => string;

// "Hello, {name}" + { name: 'Ana' } -> "Hello, Ana"
export function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole));
}

// English as it is: the default for code that is not given a translator.
export const plain: Translate = (text, vars) => fill(text, vars);
