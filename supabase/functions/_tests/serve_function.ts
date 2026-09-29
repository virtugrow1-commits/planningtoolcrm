// Runs one edge function on a fixed port for the e2e tests.
// Usage: deno run -A serve_function.ts <function-name> <port>
const [name, portStr] = Deno.args;
const port = Number(portStr);
// Supabase provides EdgeRuntime.waitUntil; locally we just let the promise run.
(globalThis as any).EdgeRuntime = { waitUntil: (p: Promise<unknown>) => { p.catch((e) => console.error('waitUntil', e)); } };
const origServe = Deno.serve.bind(Deno);
(Deno as any).serve = (a: any, b?: any) => {
  const handler = typeof a === 'function' ? a : (b ?? a.handler);
  return origServe({ port, hostname: '127.0.0.1', onListen: () => console.log(`${name} on ${port}`) }, handler);
};
await import(new URL(`../${name}/index.ts`, import.meta.url).href);
